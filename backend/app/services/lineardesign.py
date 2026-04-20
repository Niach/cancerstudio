"""Stage 7 codon optimizer — thin adapter over LinearDesign's compiled
binary (Zhang et al., *Nature* 2023).

LinearDesign ships a Python-2 wrapper that we skip; we call the compiled
C++ binary ``LinearDesign_2D`` directly. The binary takes three positional
arguments (``<lambda> <verbose 0|1> <codon_usage_csv>``) and reads the
peptide from stdin. Output is plain text with a short progress banner
followed by three ``mRNA ...:``-prefixed lines.

This module exposes a single ``optimize(peptide, lambda_value, species)``
entry point that returns the real codon-optimized mRNA plus LinearDesign's
reported CAI and MFE. A per-species codon usage table is generated from
``python_codon_tables`` (pulled in as a DNAchisel transitive dep) the first
time each species is seen. Dog and cat fall back to mouse — the closest
mammalian proxy available in that package. Results are cached per
(peptide, λ, species) triple since the binary is deterministic.
"""
from __future__ import annotations

import os
import re
import subprocess
import tempfile
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Optional


LINEARDESIGN_BIN = os.environ.get(
    "CANCERSTUDIO_LINEARDESIGN_BIN", "/usr/local/bin/LinearDesign_2D"
)
# Legacy fallback — if set, overrides all per-species lookups.
LINEARDESIGN_CODON_TABLE_OVERRIDE = os.environ.get(
    "CANCERSTUDIO_LINEARDESIGN_CODON_TABLE"
)
# Default shipped with the LinearDesign repo. Used for humans and as a
# last-resort fallback if python_codon_tables is missing.
LINEARDESIGN_HUMAN_CSV = os.environ.get(
    "CANCERSTUDIO_LINEARDESIGN_HUMAN_CSV",
    "/opt/lineardesign/codon_usage_freq_table_human.csv",
)
LINEARDESIGN_TIMEOUT_SEC = float(
    os.environ.get("CANCERSTUDIO_LINEARDESIGN_TIMEOUT", "300")
)

# Species → python_codon_tables key. Dog (Canis familiaris) and cat (Felis
# catus) are not in python_codon_tables, so we fall back to mouse as the
# closest mammalian proxy available — a significant improvement over human
# for non-primate carnivores.
_SPECIES_TO_PCT_KEY = {
    "human": "h_sapiens_9606",
    "dog": "m_musculus_10090",
    "cat": "m_musculus_10090",
}


@dataclass(frozen=True)
class CodonOptResult:
    rna: str   # mRNA sequence (U-alphabet)
    dna: str   # Same sequence, T-alphabet — convenient for downstream DNA tools
    mfe: float  # kcal/mol — LinearDesign's own fold of the optimized mRNA
    cai: float  # 0.0 – 1.0 — CAI against the chosen codon usage table


class LinearDesignUnavailable(RuntimeError):
    """Raised when the binary or codon table cannot be found. Callers should
    catch this and fall back to naive reverse-translation."""


_PARSE_SEQ = re.compile(r"mRNA sequence:\s+([AUGC]+)")
_PARSE_MFE_CAI = re.compile(
    r"mRNA folding free energy:\s+(-?[\d.]+)\s+kcal/mol;\s+mRNA CAI:\s+([\d.]+)"
)


@lru_cache(maxsize=8)
def _codon_table_for(species: str) -> str:
    """Resolve ``species`` to a LinearDesign-compatible codon usage CSV path.
    Generates the CSV from ``python_codon_tables`` on first request for each
    species and caches it in a temp directory. Falls back to the shipped
    human CSV if the package isn't importable or the species key is missing."""
    if LINEARDESIGN_CODON_TABLE_OVERRIDE:
        return LINEARDESIGN_CODON_TABLE_OVERRIDE

    pct_key = _SPECIES_TO_PCT_KEY.get(species, _SPECIES_TO_PCT_KEY["human"])
    try:
        import python_codon_tables as pct  # type: ignore
    except ImportError:
        return LINEARDESIGN_HUMAN_CSV

    tmp_dir = Path(tempfile.gettempdir()) / "cancerstudio_codon_tables"
    tmp_dir.mkdir(exist_ok=True)
    out_path = tmp_dir / f"{pct_key}.csv"
    if out_path.exists():
        return str(out_path)

    try:
        table = pct.get_codons_table(pct_key)
    except Exception:
        return LINEARDESIGN_HUMAN_CSV

    lines = ["#,,"]
    for aa, codons in table.items():
        for codon, freq in sorted(codons.items()):
            rna = codon.replace("T", "U")
            lines.append(f"{rna},{aa},{freq}")
    out_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return str(out_path)


def is_available() -> bool:
    if not Path(LINEARDESIGN_BIN).exists():
        return False
    try:
        return Path(_codon_table_for("human")).exists()
    except Exception:
        return False


def availability_reason() -> Optional[str]:
    """Human-readable reason the binary is unavailable, or ``None`` if ready."""
    if not Path(LINEARDESIGN_BIN).exists():
        return f"LinearDesign binary missing at {LINEARDESIGN_BIN}"
    try:
        csv_path = _codon_table_for("human")
    except Exception as exc:  # pragma: no cover — defensive
        return f"codon usage table unavailable: {exc}"
    if not Path(csv_path).exists():
        return f"codon usage table missing at {csv_path}"
    return None


@lru_cache(maxsize=256)
def optimize(
    peptide_aa: str,
    *,
    lambda_value: float,
    species: str = "human",
) -> CodonOptResult:
    if not peptide_aa:
        return CodonOptResult(rna="", dna="", mfe=0.0, cai=0.0)
    reason = availability_reason()
    if reason:
        raise LinearDesignUnavailable(reason)

    codon_csv = _codon_table_for(species)
    # LinearDesign_2D loads LinearDesign_linux64.so via a relative path, so we
    # must invoke it from the LinearDesign checkout's root.
    bin_path = Path(LINEARDESIGN_BIN).resolve()
    work_dir = bin_path.parent.parent  # bin/ -> install root
    proc = subprocess.run(
        [str(bin_path), f"{lambda_value:.3f}", "0", codon_csv],
        input=peptide_aa,
        capture_output=True,
        text=True,
        timeout=LINEARDESIGN_TIMEOUT_SEC,
        cwd=str(work_dir),
    )
    if proc.returncode != 0:
        raise RuntimeError(
            f"LinearDesign exited {proc.returncode}. stderr:\n{proc.stderr[:500]}"
        )

    out = proc.stdout
    seq_match = _PARSE_SEQ.search(out)
    mfe_cai_match = _PARSE_MFE_CAI.search(out)
    if not seq_match or not mfe_cai_match:
        raise RuntimeError(
            f"LinearDesign output not parseable. First 500 chars:\n{out[:500]}"
        )

    rna = seq_match.group(1)
    dna = rna.replace("U", "T")
    mfe = float(mfe_cai_match.group(1))
    cai = float(mfe_cai_match.group(2))

    if len(dna) != len(peptide_aa) * 3:
        raise RuntimeError(
            f"LinearDesign returned {len(dna)} nt for {len(peptide_aa)} aa "
            f"(expected {len(peptide_aa) * 3})"
        )

    return CodonOptResult(rna=rna, dna=dna, mfe=mfe, cai=cai)
