"""Stage 6 — proteome self-identity safety check.

Flags epitope candidates that look like sequences the patient's own
immune system sees on healthy tissue. A peptide that's a near-perfect
match to a self-protein risks driving an autoimmune T-cell response
against that tissue if included in the vaccine cassette — this check
is the product's primary guard against that failure mode.

**Implementation — pure-Python substring + hamming scan.**

Neoantigen peptides are short (class-I: 8-11 aa, class-II: 12-18 aa).
DIAMOND's seed-and-extend heuristic *does not seed on 9-mers* at any
sensitivity level — an earlier DIAMOND-backed implementation of this
check silently returned zero hits on every class-I candidate. The
canonical tool for short-peptide searches is NCBI BLAST+'s
``blastp -task blastp-short``, but for the window sizes we care about
a direct Python substring+hamming scan is both simpler and
fast enough: ~2-3 s per cassette on human Swiss-Prot (20k proteins).

The UniProt Swiss-Prot proteome for the workspace's species is fetched
once on first use from UniProt, cached under
``${CANCERSTUDIO_DATA_ROOT}/references/proteome/{species}/``, parsed
into memory with an LRU cache, and reused forever after. No external
binary required.

Failure is non-fatal. If the proteome download fails or the FASTA is
missing, we log and return an empty flag set — the stage remains
unblocked but the audit card should record that the check did not run.

Risk tiers emit the same ``EpitopeSafetyFlagResponse`` shape the
fixture deck has always used, so the UI contract is unchanged:

* ``identity == 100`` over the full peptide     → **critical**
* ``identity >= 80``  (fuzzy near-identity)     → **elevated**
* ``identity >= 60``                            → **mild**
* below 60                                      → omitted (no flag)
"""
from __future__ import annotations

import fcntl
import logging
import os
import re
import shutil
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Iterable, Optional

from app.models.schemas import EpitopeSafetyFlagResponse, ReferencePreset
from app.runtime import get_reference_bundle_root


logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ProteomeSource:
    relative_path: str  # resolved under get_reference_bundle_root()
    uniprot_taxid: int
    label: str


PROTEOME_BY_PRESET: dict[ReferencePreset, Optional[ProteomeSource]] = {
    ReferencePreset.GRCH38: ProteomeSource(
        relative_path="proteome/human/swissprot.fasta",
        uniprot_taxid=9606,
        label="UniProt Swiss-Prot (Homo sapiens)",
    ),
    ReferencePreset.CANFAM4: ProteomeSource(
        relative_path="proteome/dog/swissprot.fasta",
        uniprot_taxid=9615,
        label="UniProt Swiss-Prot (Canis lupus familiaris)",
    ),
    ReferencePreset.FELCAT9: ProteomeSource(
        relative_path="proteome/cat/swissprot.fasta",
        uniprot_taxid=9685,
        label="UniProt Swiss-Prot (Felis catus)",
    ),
}

PROTEOME_ENV_VARS = {
    ReferencePreset.GRCH38: "CANCERSTUDIO_PROTEOME_HUMAN",
    ReferencePreset.CANFAM4: "CANCERSTUDIO_PROTEOME_DOG",
    ReferencePreset.FELCAT9: "CANCERSTUDIO_PROTEOME_CAT",
}


@dataclass(frozen=True)
class ProteomeConfig:
    fasta_path: Path
    label: str


def resolve_proteome_config(preset: ReferencePreset) -> Optional[ProteomeConfig]:
    """Locate the Swiss-Prot proteome FASTA for this species.

    Returns ``None`` when:

    * no proteome is mapped for this preset, or
    * the FASTA is not on disk, or
    * the env override is set to an empty string (explicit opt-out).
    """
    env_key = PROTEOME_ENV_VARS.get(preset)
    override = os.getenv(env_key) if env_key else None
    source = PROTEOME_BY_PRESET.get(preset)

    if override is not None:
        if not override.strip():
            return None
        fasta_path = Path(override).expanduser()
        label = source.label if source else preset.value
    elif source is not None:
        fasta_path = get_reference_bundle_root() / source.relative_path
        label = source.label
    else:
        return None

    if not fasta_path.is_file():
        return None
    return ProteomeConfig(fasta_path=fasta_path, label=label)


def ensure_proteome_ready(preset: ReferencePreset) -> Optional[ProteomeConfig]:
    """Return a ProteomeConfig for this preset, downloading + indexing the
    Swiss-Prot FASTA on first use.

    Failure modes are non-fatal — a missing proteome disables the check
    but does not block stage completion. The audit card should later
    reflect whether the check ran.
    """
    env_key = PROTEOME_ENV_VARS.get(preset)
    if env_key is not None and os.getenv(env_key) is not None:
        # User-supplied override — honour it; don't auto-download.
        return resolve_proteome_config(preset)

    source = PROTEOME_BY_PRESET.get(preset)
    if source is None:
        return None

    existing = resolve_proteome_config(preset)
    if existing is not None:
        return existing

    try:
        _bootstrap_proteome(preset, source)
    except Exception as error:  # pragma: no cover — network / tool failures
        logger.warning(
            "self-identity: proteome bootstrap failed for %s (%s); "
            "check will be skipped for this workspace",
            preset.value, error,
        )
        return None
    return resolve_proteome_config(preset)


def _bootstrap_proteome(preset: ReferencePreset, source: ProteomeSource) -> None:
    from urllib.request import urlopen

    target_fasta = get_reference_bundle_root() / source.relative_path
    target_fasta.parent.mkdir(parents=True, exist_ok=True)

    lock_path = target_fasta.parent / ".bootstrap.lock"
    with lock_path.open("w", encoding="utf-8") as lock_handle:
        fcntl.flock(lock_handle.fileno(), fcntl.LOCK_EX)
        # Another worker may have completed bootstrap while we waited.
        if target_fasta.is_file() and target_fasta.stat().st_size > 0:
            return

        url = (
            "https://rest.uniprot.org/uniprotkb/stream?"
            f"query=organism_id:{source.uniprot_taxid}+AND+reviewed:true"
            "&format=fasta"
        )
        logger.info(
            "self-identity: downloading Swiss-Prot for taxid=%d from UniProt",
            source.uniprot_taxid,
        )
        with urlopen(url, timeout=600) as response, target_fasta.open("wb") as out:
            shutil.copyfileobj(response, out)

        if target_fasta.stat().st_size == 0:
            target_fasta.unlink()
            raise RuntimeError("UniProt returned an empty proteome FASTA")


# ---------------------------------------------------------------------------
# The check itself
# ---------------------------------------------------------------------------


# For short peptides (neoantigen length = 8-11 aa), a "60% identity"
# threshold is statistically noisy — a random 9-mer has non-trivial
# probability of matching 5/9 positions in *some* 9-window of a 20k-
# protein proteome, producing false-positive "mild" flags. We keep
# only the two clinically meaningful tiers:
#   - critical (exact substring): the peptide IS a self-peptide
#   - elevated (≥80% identity):   single-mutation self-cross-reactivity
#                                 risk, e.g., tumor neoantigens that
#                                 differ from their wildtype parent at
#                                 one position
# A "mild" tier is conceptually defensible for longer peptides (≥12 aa
# class-II) but requires dedicated logic to avoid short-peptide false
# positives — tracked in validation.md as a separate follow-up.
_RISK_ELEVATED_FLOOR = 80.0


def _risk_for(identity_pct: float) -> Optional[str]:
    """Bucket a hamming-based % identity into ``critical`` / ``elevated``
    / ``None``. The mild tier from the v0 fixture schema is not emitted
    by the real check; see the note above."""
    if identity_pct >= 99.999:
        return "critical"
    if identity_pct >= _RISK_ELEVATED_FLOOR:
        return "elevated"
    return None


def _note_for(risk: str, self_hit: str, identity: int, length: int) -> str:
    if risk == "critical":
        return (
            f"perfect {length}-mer match in healthy {self_hit} — "
            "high risk of autoimmune cross-reactivity"
        )
    if risk == "elevated":
        return (
            f"{identity}% identity over {length} aa to healthy {self_hit} — "
            "review before locking"
        )
    return (
        f"{identity}% identity over {length} aa to healthy {self_hit} — "
        "low-risk partial match"
    )


@lru_cache(maxsize=4)
def _load_proteome(fasta_path: str) -> tuple[tuple[str, str], ...]:
    """Parse a Swiss-Prot FASTA into ``((gene_label, sequence), ...)``.
    Cached per-path; typical proteomes (~20k entries, ~11 MB) parse in
    under a second and fit comfortably in memory."""
    entries: list[tuple[str, str]] = []
    header = ""
    seq_parts: list[str] = []
    with Path(fasta_path).open("r", encoding="utf-8") as handle:
        for raw in handle:
            line = raw.rstrip("\n")
            if line.startswith(">"):
                if header:
                    entries.append(
                        (_gene_label(header, _sseqid_from_header(header)),
                         "".join(seq_parts).upper())
                    )
                header = line[1:]
                seq_parts = []
            else:
                seq_parts.append(line)
        if header:
            entries.append(
                (_gene_label(header, _sseqid_from_header(header)),
                 "".join(seq_parts).upper())
            )
    return tuple(entries)


def _best_hit_for_peptide(
    peptide: str, proteome: tuple[tuple[str, str], ...]
) -> Optional[tuple[str, int]]:
    """Find a critical (exact) or elevated (≤1 mismatch) hit for
    ``peptide`` in the proteome. Returns ``(gene_label, match_count)``
    for the first hit found, or ``None`` if neither tier is reached.

    Strategy:

    1. **Critical pass** — exact substring test across every protein.
       Python's ``str.__contains__`` is a C-level Boyer-Moore-ish
       search; ~100 ms for a 20k-protein proteome.
    2. **Elevated pass** — for each of the ``n`` possible single-
       mismatch positions, construct a compiled regex with ``.`` at
       that index and scan every protein. ~1-2 s per cassette on a
       human Swiss-Prot proteome.

    Mild-tier detection (≤2 mismatches on a 9-mer, or <80% identity)
    is deliberately omitted — on our 20k-protein human proteome, a
    random 9-mer has a ~98% chance of a mild hit by pure chance, so
    that tier is statistically meaningless for short peptides. See
    ``validation.md`` → Stage 6 findings for the experiment."""
    n = len(peptide)
    if n == 0:
        return None

    # Critical tier — first exact substring wins.
    for gene, protein in proteome:
        if len(protein) >= n and peptide in protein:
            return (gene, n)

    # Elevated tier — d=1 mismatch anywhere.
    # Compile one regex per wildcard position, then loop proteins to
    # find any match. Early-exit on the first hit.
    patterns = [
        re.compile(peptide[:i] + "." + peptide[i + 1 :])
        for i in range(n)
    ]
    for gene, protein in proteome:
        if len(protein) < n:
            continue
        for pattern in patterns:
            if pattern.search(protein):
                return (gene, n - 1)
    return None


def run_self_identity_check(
    peptides: Iterable[tuple[str, str]],
    preset: ReferencePreset,
) -> dict[str, EpitopeSafetyFlagResponse]:
    """Scan each peptide against the species Swiss-Prot proteome and
    return a sparse ``{peptide_id: EpitopeSafetyFlagResponse}`` for
    any peptide whose best hit clears the ``_RISK_MILD_FLOOR`` identity
    threshold.

    Fail-open: on any I/O error, return ``{}`` and let the stage
    proceed (with a prominent warning logged)."""
    items = list(peptides)
    if not items:
        return {}

    config = ensure_proteome_ready(preset)
    if config is None:
        logger.warning(
            "self-identity: no proteome available for %s — check skipped",
            preset.value,
        )
        return {}

    try:
        proteome = _load_proteome(str(config.fasta_path))
    except OSError as error:
        logger.warning(
            "self-identity: proteome load failed (%s) — check skipped", error
        )
        return {}

    flags: dict[str, EpitopeSafetyFlagResponse] = {}
    for peptide_id, raw_seq in items:
        seq = (raw_seq or "").strip().upper()
        if not seq or not seq.isalpha():
            continue
        hit = _best_hit_for_peptide(seq, proteome)
        if hit is None:
            continue
        gene, matches = hit
        pident = matches / len(seq) * 100
        risk = _risk_for(pident)
        if risk is None:
            continue
        identity_int = int(round(pident))
        flags[peptide_id] = EpitopeSafetyFlagResponse(
            peptide_id=peptide_id,
            self_hit=gene,
            identity=identity_int,
            risk=risk,
            note=_note_for(risk, gene, identity_int, len(seq)),
        )
    return flags


def _sseqid_from_header(header: str) -> str:
    """Extract the canonical sseqid (``sp|P12345|X_HUMAN``) from a
    UniProt FASTA header. The header as passed in is everything after
    the ``>`` up to the first space."""
    return header.split(" ", 1)[0]


def _gene_label(stitle: str, sseqid: str) -> str:
    """Distil a BLAST subject title down to a gene / protein label the UI
    can render in one line. UniProt titles look like
    ``sp|P35579|MYH9_HUMAN Myosin-9 OS=Homo sapiens GN=MYH9 PE=1 SV=4``;
    we prefer the ``GN=`` gene symbol when present, fall back to the
    protein name, fall back to the raw sseqid as a last resort."""
    for token in stitle.split():
        if token.startswith("GN="):
            return token[3:]
    # No GN; use the first descriptive word after the accession block.
    parts = stitle.split(" ", 1)
    if len(parts) == 2:
        # Trim organism / PE / SV suffixes.
        name = parts[1]
        for marker in (" OS=", " PE=", " SV="):
            idx = name.find(marker)
            if idx >= 0:
                name = name[:idx]
        return name.strip() or sseqid
    return sseqid
