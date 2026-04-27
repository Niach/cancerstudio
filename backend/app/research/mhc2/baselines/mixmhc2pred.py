"""MixMHC2pred-2.0 baseline adapter.

MixMHC2pred is the Racle/Trans-Lab predictor (2023 version trained on
PXD034773). It ships as a standalone binary that takes a peptide list
and a comma-separated allele list and writes a TSV to stdout.

Install on the host (academic):

    https://github.com/GfellerLab/MixMHC2pred/releases

Set ``MIXMHC2PRED_BIN`` to the absolute path of the binary, or place
``MixMHC2pred`` on ``$PATH``. The adapter calls it once per unique allele
batch.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
from collections import defaultdict
from pathlib import Path
from typing import Sequence

from app.research.mhc2.baselines.base import BaselineModel, BaselinePrediction


class MixMHC2predAdapter(BaselineModel):
    name = "MixMHC2pred-2.0"

    def __init__(self, binary: str | None = None) -> None:
        self._binary = binary or os.environ.get("MIXMHC2PRED_BIN") or shutil.which("MixMHC2pred")

    def is_available(self) -> tuple[bool, str]:
        if not self._binary:
            return (False, "MixMHC2pred binary not found (set $MIXMHC2PRED_BIN or add to PATH)")
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
        # MixMHC2pred wants ALL peptides scored against a fixed allele
        # set per call. Group pairs by allele tuple so we minimize
        # invocations.
        grouped: dict[tuple[str, ...], list[int]] = defaultdict(list)
        for idx, (peptide, allele) in enumerate(pairs):
            grouped[(_to_mixmhc2pred_allele(allele),)].append(idx)

        out: list[BaselinePrediction | None] = [None] * len(pairs)
        with tempfile.TemporaryDirectory() as workdir:
            workpath = Path(workdir)
            for allele_set, indices in grouped.items():
                pep_file = workpath / "peptides.txt"
                pep_file.write_text(
                    "\n".join(pairs[i][0] for i in indices) + "\n",
                    encoding="utf-8",
                )
                out_file = workpath / "out.txt"
                cmd = [
                    self._binary,
                    "--input", str(pep_file),
                    "--output", str(out_file),
                    "--alleles", ",".join(allele_set),
                ]
                subprocess.run(cmd, check=True, capture_output=True)
                rows = _parse_mixmhc2pred_output(out_file)
                # Output is per-peptide with one column per allele score;
                # grouping above set len(allele_set) == 1 so the score
                # column is simply the first one matching ``allele_set[0]``.
                for idx, row in zip(indices, rows):
                    peptide, allele = pairs[idx]
                    out[idx] = BaselinePrediction(
                        peptide=peptide,
                        allele=allele,
                        score=row.get("score", float("nan")),
                        rank_percent=row.get("rank", float("nan")),
                        core=row.get("core"),
                        offset=row.get("offset"),
                    )
        return [item for item in out if item is not None]


def _to_mixmhc2pred_allele(allele: str) -> str:
    """MixMHC2pred uses ``DRB1_15_01`` style allele names without the HLA-
    prefix. Map our IPD-style ``HLA-DRB1*15:01`` accordingly."""
    body = allele.removeprefix("HLA-")
    parts = body.split("-")  # for DPA1*XX-DPB1*YY style concatenations
    return "__".join(part.replace("*", "_").replace(":", "_") for part in parts)


def _parse_mixmhc2pred_output(path: Path) -> list[dict]:
    """Parse the TSV MixMHC2pred writes. Columns of interest:
    ``Peptide``, ``Score_<allele>``, ``%Rank_<allele>``, ``BestAllele``,
    ``Core_<allele>``."""
    rows: list[dict] = []
    with path.open("r", encoding="utf-8") as fh:
        header_line: str | None = None
        for line in fh:
            line = line.rstrip("\n")
            if not line or line.startswith("#"):
                continue
            if header_line is None:
                header_line = line
                cols = line.split("\t")
                continue
            cells = line.split("\t")
            row = dict(zip(cols, cells))
            score = next((float(row[k]) for k in row if k.startswith("Score_")), float("nan"))
            rank = next((float(row[k]) for k in row if k.startswith("%Rank_")), float("nan"))
            core = next((row[k] for k in row if k.startswith("Core_")), None)
            rows.append({"score": score, "rank": rank, "core": core, "offset": None})
    return rows
