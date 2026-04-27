"""Base interface every benchmark baseline must implement."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Iterable, Sequence


@dataclass(frozen=True)
class BaselinePrediction:
    """One row of a baseline's output."""

    peptide: str
    allele: str
    score: float           # higher = more likely to bind / be presented
    rank_percent: float    # publishe %rank if the tool provides one, else NaN
    core: str | None = None
    offset: int | None = None


class BaselineModel(ABC):
    """Common interface for an external MHC-II prediction tool."""

    name: str = "abstract"

    @abstractmethod
    def is_available(self) -> tuple[bool, str]:
        """Returns ``(ok, message)``. ``ok=False`` -> harness skips this
        tool and includes ``message`` in the missing-tools report."""

    @abstractmethod
    def predict(
        self,
        pairs: Sequence[tuple[str, str]],
    ) -> list[BaselinePrediction]:
        """Score the given ``(peptide, allele)`` pairs. Output is aligned
        to the input order. May raise on tool-specific failures."""

    def supported_alleles(self) -> set[str] | None:
        """Optional override: return the subset of HLA-II alleles this
        tool can score (``None`` = score everything; harness will surface
        per-pair errors instead)."""
        return None
