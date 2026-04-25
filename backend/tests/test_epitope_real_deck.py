"""Verify stage 6 builds its candidate deck from stage-5's pVACseq top
candidates when they are available, keeps the fixture fallback only for
demo workspaces without a real run, and blocks malformed real run output."""
from __future__ import annotations

from contextlib import contextmanager
from types import SimpleNamespace

import pytest

from app.models.schemas import (
    EpitopeStageStatus,
    NeoantigenRunResponse,
    NeoantigenRunStatus,
    NeoantigenMetricsResponse,
    NeoantigenStageStatus,
    NeoantigenStageSummaryResponse,
    TopCandidate,
)
from app.services import epitope_selection


def _stub_neoantigen(
    monkeypatch: pytest.MonkeyPatch,
    top: list[TopCandidate] | None,
    *,
    has_run: bool = True,
) -> None:
    metrics = (
        NeoantigenMetricsResponse(top=top) if top is not None else None
    )
    latest = (
        NeoantigenRunResponse(
            id="run-1",
            status=NeoantigenRunStatus.COMPLETED,
            progress=1.0,
            created_at="2026-04-20T10:00:00Z",
            updated_at="2026-04-20T10:30:00Z",
            metrics=metrics,
        )
        if has_run
        else None
    )
    summary = NeoantigenStageSummaryResponse(
        workspace_id="ws-test",
        status=NeoantigenStageStatus.COMPLETED,
        blocking_reason=None,
        ready_for_epitope_selection=True,
        latest_run=latest,
    )
    monkeypatch.setattr(
        epitope_selection, "load_neoantigen_stage_summary", lambda _wid: summary
    )


def _stub_workspace(monkeypatch: pytest.MonkeyPatch) -> None:
    @contextmanager
    def fake_session_scope():
        yield object()

    monkeypatch.setattr(epitope_selection, "session_scope", fake_session_scope)
    monkeypatch.setattr(
        epitope_selection,
        "get_workspace_record",
        lambda _session, _wid: SimpleNamespace(species="dog", epitope_config=None),
    )


def _top(seq: str, gene: str, allele: str, ic50: float, mhc: str = "I") -> TopCandidate:
    return TopCandidate.model_validate(
        {
            "seq": seq,
            "gene": gene,
            "mut": "p.Arg175His",
            "length": len(seq),
            "class": mhc,
            "allele": allele,
            "ic50": ic50,
            "vaf": 0.32,
            "tpm": 55.0,
            "cancer_gene": True,
        }
    )


def test_real_deck_built_from_top_candidates(monkeypatch, tmp_path):
    # Standalone test of the pure function — no DB, no workspace.
    top = [
        _top("HFSQAIRRL", "TP53", "DLA-88*034:01", 14.0),
        _top("NIIQLLFMGH", "KIT", "DLA-88*508:01", 22.0),
        _top("LPNSVLGAK", "BRAF", "DLA-12*01:01", 39.0),
        _top("AKVLDERTLHCTAM", "TP53", "DLA-DRB1*015:01", 64.0, mhc="II"),
    ]
    candidates, alleles, default_picks = epitope_selection._deck_from_top(top)

    assert len(candidates) == 4
    assert all(c.id.startswith("rd") for c in candidates)
    genes = {c.gene for c in candidates}
    assert {"TP53", "KIT", "BRAF"} <= genes
    # Allele chips get colors from the palette, in first-seen order.
    assert len(alleles) == 4
    assert {a.id for a in alleles} == {c.allele_id for c in candidates}
    # Default picks should include distinct genes across class-I strong hits
    # plus at least one class-II for T-cell help.
    pick_candidates = [c for c in candidates if c.id in default_picks]
    pick_classes = {p.mhc_class for p in pick_candidates}
    assert "II" in pick_classes, f"need a class II pick, got {pick_classes}"
    pick_genes = [p.gene for p in pick_candidates if p.mhc_class == "I"]
    assert len(pick_genes) == len(set(pick_genes)), "class-I picks should span distinct genes"


def test_real_deck_allele_class_inference():
    # Quick white-box test of the class-I/II split.
    assert epitope_selection._allele_class("DLA-88*034:01") == "I"
    assert epitope_selection._allele_class("DLA-DRB1*015:01") == "II"
    assert epitope_selection._allele_class("DLA-DQB1*008:01") == "II"
    assert epitope_selection._allele_class("HLA-A*02:01") == "I"


def test_tier_boundary():
    assert epitope_selection._tier_for(99.0) == "strong"
    assert epitope_selection._tier_for(100.0) == "moderate"
    assert epitope_selection._tier_for(1500.0) == "moderate"


def test_stage6_demo_fixture_fallback_requires_no_real_run(monkeypatch):
    _stub_neoantigen(monkeypatch, top=None, has_run=False)
    _stub_workspace(monkeypatch)

    summary = epitope_selection.load_epitope_stage_summary("ws-test")

    assert summary.status in {EpitopeStageStatus.SCAFFOLDED, EpitopeStageStatus.COMPLETED}
    assert summary.candidates
    assert summary.blocking_reason is None


def test_stage6_blocks_completed_run_without_metrics(monkeypatch):
    _stub_neoantigen(monkeypatch, top=None, has_run=True)
    _stub_workspace(monkeypatch)

    summary = epitope_selection.load_epitope_stage_summary("ws-test")

    assert summary.status == EpitopeStageStatus.BLOCKED
    assert summary.candidates == []
    assert "metrics" in (summary.blocking_reason or "")


def test_stage6_blocks_completed_run_with_empty_top_candidates(monkeypatch):
    _stub_neoantigen(monkeypatch, top=[], has_run=True)
    _stub_workspace(monkeypatch)

    summary = epitope_selection.load_epitope_stage_summary("ws-test")

    assert summary.status == EpitopeStageStatus.BLOCKED
    assert summary.candidates == []
    assert "candidate peptides" in (summary.blocking_reason or "")
