"""NetMHCIIpan-4.3 baseline adapter.

NetMHCIIpan is the DTU predictor and the de-facto industry baseline for
MHC class II. The 4.3 release supports DR / DP / DQ / mouse. License is
free for academic use but requires registration:

    https://services.healthtech.dtu.dk/services/NetMHCIIpan-4.3/

Install on the host, then set ``NETMHCIIPAN_BIN`` to the absolute path of
the wrapper script (typically ``netMHCIIpan-4.3/netMHCIIpan``). The
adapter shells out for each allele and parses the table NetMHCIIpan
writes.
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import tempfile
from collections import defaultdict
from pathlib import Path
from typing import Sequence

from app.research.mhc2.baselines.base import BaselineModel, BaselinePrediction


class NetMHCIIpanAdapter(BaselineModel):
    name = "NetMHCIIpan-4.3"

    def __init__(self, binary: str | None = None, *, length_default: int = 15) -> None:
        self._binary = (
            binary
            or os.environ.get("NETMHCIIPAN_BIN")
            or shutil.which("netMHCIIpan")
        )
        self._length_default = length_default

    def is_available(self) -> tuple[bool, str]:
        if not self._binary:
            return (False, "NetMHCIIpan binary not found (set $NETMHCIIPAN_BIN or add to PATH)")
        if not Path(self._binary).is_file():
            return (False, f"binary {self._binary} not found on disk")
        return (True, f"using {self._binary}")

    def predict(
        self,
        pairs: Sequence[tuple[str, str]],
    ) -> list[BaselinePrediction]:
        ok, msg = self.is_available()
        if not ok:
            raise RuntimeError(msg)
        grouped: dict[str, list[int]] = defaultdict(list)
        for idx, (peptide, allele) in enumerate(pairs):
            grouped[_to_netmhciipan_allele(allele)].append(idx)

        out: list[BaselinePrediction | None] = [None] * len(pairs)
        with tempfile.TemporaryDirectory() as workdir:
            workpath = Path(workdir)
            for nm_allele, indices in grouped.items():
                pep_file = workpath / "peptides.pep"
                pep_file.write_text(
                    "\n".join(pairs[i][0] for i in indices) + "\n",
                    encoding="utf-8",
                )
                cmd = [
                    self._binary,
                    "-a", nm_allele,
                    "-f", str(pep_file),
                    "-inptype", "1",  # peptide list mode
                    "-length", str(self._length_default),
                ]
                proc = subprocess.run(cmd, check=True, capture_output=True, text=True)
                rows = _parse_netmhciipan_output(proc.stdout)
                if len(rows) != len(indices):
                    raise RuntimeError(
                        f"NetMHCIIpan returned {len(rows)} rows for {len(indices)} peptides"
                    )
                for idx, row in zip(indices, rows):
                    peptide, allele = pairs[idx]
                    out[idx] = BaselinePrediction(
                        peptide=peptide,
                        allele=allele,
                        score=row["score"],
                        rank_percent=row["rank"],
                        core=row.get("core"),
                        offset=row.get("offset"),
                    )
        return [item for item in out if item is not None]


def _to_netmhciipan_allele(allele: str) -> str:
    """NetMHCIIpan uses e.g. ``DRB1_1501`` and ``HLA-DPA10103-DPB10101``."""
    body = allele.removeprefix("HLA-")
    if "*" in body:
        gene, digits = body.split("*", 1)
        digits = digits.replace(":", "")
        return f"{gene}_{digits}"
    return f"HLA-{body}"


_HEADER_LINE_RE = re.compile(r"^\s*Pos\s+MHC\s+Peptide", re.IGNORECASE)


def _parse_netmhciipan_output(stdout: str) -> list[dict]:
    """Parse the table NetMHCIIpan writes to stdout. The format has been
    stable across 4.0-4.3: a banner, a header line beginning with ``Pos``,
    then one row per peptide ending with ``Score_EL`` and ``%Rank_EL``."""
    lines = stdout.splitlines()
    header_idx = None
    for i, line in enumerate(lines):
        if _HEADER_LINE_RE.match(line):
            header_idx = i
            break
    if header_idx is None:
        return []
    header = re.split(r"\s+", lines[header_idx].strip())
    rows: list[dict] = []
    for line in lines[header_idx + 1 :]:
        if not line.strip() or line.startswith("---") or line.startswith("Number of"):
            continue
        cells = re.split(r"\s+", line.strip())
        if len(cells) < len(header):
            continue
        row = dict(zip(header, cells))
        try:
            score = float(row.get("Score_EL", row.get("Score", "nan")))
            rank = float(row.get("%Rank_EL", row.get("%Rank", "nan")))
        except ValueError:
            continue
        rows.append({
            "score": score,
            "rank": rank,
            "core": row.get("Core") or row.get("Of"),
            "offset": int(row["Pos"]) if row.get("Pos", "").isdigit() else None,
        })
    return rows
