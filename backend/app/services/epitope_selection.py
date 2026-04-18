"""Epitope selection stage service (pVACview curation).

Stage 6 is a curation surface on top of the stage-5 neoantigen output: the
user picks ~7 of the top peptides for the mRNA cassette. No subprocess
runs here — the "stage" is a persisted shortlist plus the deck of
candidates to choose from.

The candidate deck and safety flags are served from a fixture for now
(``backend/app/data/epitope_fixture.json``) so the UI is stable while
the pipeline from stages 1–5 matures. The stage is gated on
``readyForEpitopeSelection`` from the neoantigen summary.
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Iterable, Optional

from app.db import session_scope
from app.models.schemas import (
    EpitopeAlleleResponse,
    EpitopeCandidateResponse,
    EpitopeSafetyFlagResponse,
    EpitopeSelectionUpdate,
    EpitopeStageStatus,
    EpitopeStageSummaryResponse,
)
from app.services.neoantigen import load_neoantigen_stage_summary
from app.services.workspace_store import (
    get_workspace_record,
    load_workspace_epitope_config,
    store_workspace_epitope_config,
    utc_now,
)


FIXTURE_PATH = Path(__file__).resolve().parents[1] / "data" / "epitope_fixture.json"

MAX_SELECTION = 8


@lru_cache(maxsize=1)
def _fixture() -> dict:
    with FIXTURE_PATH.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _build_alleles() -> list[EpitopeAlleleResponse]:
    return [
        EpitopeAlleleResponse.model_validate(entry)
        for entry in _fixture()["alleles"]
    ]


def _build_candidates() -> list[EpitopeCandidateResponse]:
    return [
        EpitopeCandidateResponse.model_validate(entry)
        for entry in _fixture()["candidates"]
    ]


def _build_safety() -> dict[str, EpitopeSafetyFlagResponse]:
    return {
        peptide_id: EpitopeSafetyFlagResponse.model_validate(entry)
        for peptide_id, entry in _fixture()["safety"].items()
    }


def _default_picks() -> list[str]:
    return list(_fixture()["default_picks"])


def _goals_pass(selection: list[str], candidates: list[EpitopeCandidateResponse],
                safety: dict[str, EpitopeSafetyFlagResponse]) -> bool:
    if not selection:
        return False
    by_id = {c.id: c for c in candidates}
    picks = [by_id[p] for p in selection if p in by_id]
    if len(picks) < 6 or len(picks) > 8:
        return False
    if len({p.gene for p in picks}) < 5:
        return False
    if len({p.allele_id for p in picks}) < 3:
        return False
    if sum(1 for p in picks if p.mhc_class == "II") < 1:
        return False
    if not all(p.cancer_gene for p in picks):
        return False
    if any(safety.get(p.id) and safety[p.id].risk == "critical" for p in picks):
        return False
    return True


def _filtered_selection(
    raw: Iterable[str], candidates: list[EpitopeCandidateResponse]
) -> list[str]:
    valid = {c.id for c in candidates}
    seen: set[str] = set()
    out: list[str] = []
    for peptide_id in raw:
        if peptide_id in valid and peptide_id not in seen:
            seen.add(peptide_id)
            out.append(peptide_id)
            if len(out) >= MAX_SELECTION:
                break
    return out


def _blocked_summary(workspace_id: str, reason: str) -> EpitopeStageSummaryResponse:
    return EpitopeStageSummaryResponse(
        workspace_id=workspace_id,
        status=EpitopeStageStatus.BLOCKED,
        blocking_reason=reason,
        candidates=[],
        safety={},
        alleles=[],
        default_picks=[],
        selection=[],
        ready_for_construct_design=False,
    )


def load_epitope_stage_summary(workspace_id: str) -> EpitopeStageSummaryResponse:
    neoantigen_summary = load_neoantigen_stage_summary(workspace_id)
    if not neoantigen_summary.ready_for_epitope_selection:
        reason = (
            neoantigen_summary.blocking_reason
            or "Finish neoantigen prediction before curating the cassette."
        )
        return _blocked_summary(workspace_id, reason)

    candidates = _build_candidates()
    safety = _build_safety()
    alleles = _build_alleles()
    default_picks = _default_picks()

    with session_scope() as session:
        workspace = get_workspace_record(session, workspace_id)
        config = load_workspace_epitope_config(workspace)

    stored_selection = config.get("selection") if isinstance(config, dict) else None
    selection = _filtered_selection(stored_selection or [], candidates)
    if not selection:
        selection = _filtered_selection(default_picks, candidates)

    status = (
        EpitopeStageStatus.COMPLETED
        if _goals_pass(selection, candidates, safety)
        else EpitopeStageStatus.SCAFFOLDED
    )
    return EpitopeStageSummaryResponse(
        workspace_id=workspace_id,
        status=status,
        blocking_reason=None,
        candidates=candidates,
        safety=safety,
        alleles=alleles,
        default_picks=default_picks,
        selection=selection,
        ready_for_construct_design=status == EpitopeStageStatus.COMPLETED,
    )


def update_epitope_selection(
    workspace_id: str, payload: EpitopeSelectionUpdate
) -> EpitopeStageSummaryResponse:
    candidates = _build_candidates()
    selection = _filtered_selection(payload.peptide_ids, candidates)

    with session_scope() as session:
        workspace = get_workspace_record(session, workspace_id)
        existing = load_workspace_epitope_config(workspace)
        if not isinstance(existing, dict):
            existing = {}
        existing["selection"] = selection
        store_workspace_epitope_config(workspace, existing)
        workspace.updated_at = utc_now()
        session.add(workspace)

    return load_epitope_stage_summary(workspace_id)
