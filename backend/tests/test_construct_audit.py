"""Verify the stage-8 audit trail is derived from real PipelineRunRecord +
IngestionBatchRecord timestamps instead of the old fixture template."""
from __future__ import annotations

import pytest

from app.db import init_db, session_scope
from app.models.records import (
    IngestionBatchRecord,
    PipelineArtifactRecord,
    PipelineRunRecord,
    WorkspaceFileRecord,
    WorkspaceRecord,
)
from app.services.construct_output import _build_audit_trail
from app.services.workspace_store import utc_now


class _StubOptions:
    def __init__(self, *, confirmed: bool = False, lambda_value: float = 0.65):
        self.confirmed = confirmed
        self.lambda_value = lambda_value
        self.signal = True
        self.mitd = True


class _StubSummary:
    def __init__(self, *, workspace_id: str, confirmed: bool):
        self.workspace_id = workspace_id
        self.options = _StubOptions(confirmed=confirmed)


@pytest.fixture(autouse=True)
def _clean_database():
    init_db()
    with session_scope() as session:
        for model in (
            PipelineArtifactRecord,
            PipelineRunRecord,
            WorkspaceFileRecord,
            IngestionBatchRecord,
            WorkspaceRecord,
        ):
            session.query(model).delete()
    yield
    with session_scope() as session:
        for model in (
            PipelineArtifactRecord,
            PipelineRunRecord,
            WorkspaceFileRecord,
            IngestionBatchRecord,
            WorkspaceRecord,
        ):
            session.query(model).delete()


def _create_workspace(workspace_id: str = "ws-audit") -> None:
    now = utc_now()
    with session_scope() as session:
        session.add(
            WorkspaceRecord(
                id=workspace_id,
                display_name="Audit Test",
                species="dog",
                active_stage="construct-output",
                created_at=now,
                updated_at=now,
            )
        )
        session.add(
            IngestionBatchRecord(
                id="batch-1",
                workspace_id=workspace_id,
                sample_lane="tumor",
                status="completed",
                created_at=now,
                updated_at=now,
            )
        )


def _complete_run(workspace_id: str, stage_id: str, run_id: str) -> None:
    now = utc_now()
    with session_scope() as session:
        session.add(
            PipelineRunRecord(
                id=run_id,
                workspace_id=workspace_id,
                stage_id=stage_id,
                status="completed",
                progress=100,
                created_at=now,
                updated_at=now,
                completed_at=now,
            )
        )


def test_audit_trail_reflects_completed_stages():
    _create_workspace()
    _complete_run("ws-audit", "alignment", "run-align")
    _complete_run("ws-audit", "annotation", "run-ann")

    trail = _build_audit_trail(
        "ws-audit",
        _StubSummary(workspace_id="ws-audit", confirmed=False),
        output_config={},
    )
    stages = [entry.stage for entry in trail]
    # Ingestion (01) from the batch record, alignment (02), annotation (04).
    # Variant calling (03) and neoantigen (05) were never run for this workspace.
    assert "01" in stages
    assert "02" in stages
    assert "04" in stages
    assert "03" not in stages
    assert "05" not in stages


def test_audit_trail_adds_confirm_entry_when_confirmed():
    _create_workspace()
    trail = _build_audit_trail(
        "ws-audit",
        _StubSummary(workspace_id="ws-audit", confirmed=True),
        output_config={},
    )
    confirm = [e for e in trail if e.stage == "07"]
    assert len(confirm) == 1
    assert "λ=0.65" in confirm[0].what
    assert confirm[0].kind == "human"


def test_audit_trail_adds_release_entry_when_released():
    _create_workspace()
    trail = _build_audit_trail(
        "ws-audit",
        _StubSummary(workspace_id="ws-audit", confirmed=True),
        output_config={
            "released": True,
            "released_at": "04-20 10:30 UTC",
            "selected_cmo": "trilink",
        },
    )
    release = [e for e in trail if e.stage == "08"]
    assert len(release) == 1
    assert "trilink" in release[0].what
