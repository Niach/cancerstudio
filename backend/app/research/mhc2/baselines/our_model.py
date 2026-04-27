"""Our own MHC-II model wrapped as a baseline.

Lets the harness score "our model" alongside the third-party baselines
through the same ``BaselineModel`` interface. Loads a checkpoint via
``predict.predict_pairs`` and returns one prediction per pair.
"""

from __future__ import annotations

from pathlib import Path
from typing import Sequence

from app.research.mhc2.baselines.base import BaselineModel, BaselinePrediction


class OurModelAdapter(BaselineModel):
    name = "cancerstudio-mhc2"

    def __init__(
        self,
        checkpoint: Path,
        pseudosequences: Path,
        *,
        device: str = "auto",
        batch_size: int = 64,
    ) -> None:
        self._checkpoint = Path(checkpoint)
        self._pseudosequences = Path(pseudosequences)
        self._device = device
        self._batch_size = batch_size

    def is_available(self) -> tuple[bool, str]:
        if not self._checkpoint.exists():
            return (False, f"checkpoint missing: {self._checkpoint}")
        if not self._pseudosequences.exists():
            return (False, f"pseudosequences missing: {self._pseudosequences}")
        try:
            import torch  # noqa: F401
        except ModuleNotFoundError:
            return (False, "torch not available")
        return (True, f"checkpoint {self._checkpoint.name}")

    def predict(self, pairs: Sequence[tuple[str, str]]) -> list[BaselinePrediction]:
        ok, msg = self.is_available()
        if not ok:
            raise RuntimeError(msg)
        from app.research.mhc2.predict import predict_pairs

        results = predict_pairs(
            checkpoint_path=self._checkpoint,
            pseudoseq_path=self._pseudosequences,
            pairs=list(pairs),
            device=self._device,
            batch_size=self._batch_size,
        )
        out: list[BaselinePrediction] = []
        for (peptide, allele), prediction in zip(pairs, results):
            out.append(
                BaselinePrediction(
                    peptide=peptide,
                    allele=allele,
                    score=float(prediction.score),
                    rank_percent=float("nan"),  # our model has no calibration yet
                    core=getattr(prediction, "core", None),
                    offset=getattr(prediction, "offset", None),
                )
            )
        return out
