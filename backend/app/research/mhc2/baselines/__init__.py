"""Adapters for external MHC-II prediction tools used as benchmark baselines.

Each adapter implements the ``BaselineModel`` interface so the benchmark
harness can score every tool against the same locked test set. Adapters
are thin wrappers around CLIs / Python packages -- the heavy lifting
(model weights, allele tables) stays in the third-party tool.

Tools scaffolded:

- ``netmhciipan``: NetMHCIIpan-4.3 / 4.3j. Free academic license required.
- ``mixmhc2pred``: MixMHC2pred-2.0. Open distribution.
- ``hlaiipred``: HLAIIPred 2025. Open source on GitHub.
- ``graph_pmhc``: Graph-pMHC. Non-commercial license, eval-only.

Each is *optional*: the harness reports which tools were actually
runnable on the host and which were skipped due to missing binaries.
"""

from __future__ import annotations

from app.research.mhc2.baselines.base import BaselineModel, BaselinePrediction


__all__ = ["BaselineModel", "BaselinePrediction"]
