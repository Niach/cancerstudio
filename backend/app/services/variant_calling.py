"""Variant calling stage service (GATK Mutect2).

The stage is intentionally scaffolded today. The shipped product exposes a
read-only summary page after alignment passes QC, while the run/rerun API
returns a stable "stage_not_actionable" payload without creating run records.

The orchestration helpers below are kept as future scaffolding so the eventual
Mutect2 implementation can follow the same service shape as ``alignment.py``.
"""
from __future__ import annotations

import shutil
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.db import session_scope
from app.models.records import (
    PipelineArtifactRecord,
    PipelineRunRecord,
)
from app.models.schemas import (
    PipelineStageId,
    SampleLane,
    VariantCallingArtifactKind,
    VariantCallingArtifactResponse,
    VariantCallingMetricsResponse,
    VariantCallingRunResponse,
    VariantCallingRunStatus,
    VariantCallingRuntimePhase,
    VariantCallingStageStatus,
    VariantCallingStageSummaryResponse,
)
from app.services.alignment import (
    build_alignment_stage_summary,
    get_latest_alignment_run,
)
from app.services.workspace_store import (
    get_workspace_record,
    isoformat,
    utc_now,
)


VARIANT_CALLING_STAGE_ID = PipelineStageId.VARIANT_CALLING.value
NOT_IMPLEMENTED_MESSAGE = (
    "Mutect2 orchestration is scaffolded but not yet implemented."
)
NOT_ACTIONABLE_MESSAGE = (
    "Variant calling is visible here, but not available yet. Alignment is the current working step."
)


class VariantCallingArtifactNotFoundError(FileNotFoundError):
    pass


@dataclass(frozen=True)
class VariantCallingArtifactDownload:
    filename: str
    local_path: Path
    content_type: Optional[str]


# --------------------------------------------------------------------------- #
# Record access helpers
# --------------------------------------------------------------------------- #


def _variant_calling_run_query():
    return select(PipelineRunRecord).options(
        selectinload(PipelineRunRecord.artifacts),
        selectinload(PipelineRunRecord.workspace),
    )


def get_latest_variant_calling_run(
    session,
    workspace_id: str,
) -> Optional[PipelineRunRecord]:
    return session.scalar(
        _variant_calling_run_query()
        .where(
            PipelineRunRecord.workspace_id == workspace_id,
            PipelineRunRecord.stage_id == VARIANT_CALLING_STAGE_ID,
        )
        .order_by(PipelineRunRecord.created_at.desc())
    )


def get_variant_calling_run_record(
    session,
    workspace_id: str,
    run_id: str,
) -> PipelineRunRecord:
    run = session.scalar(
        _variant_calling_run_query().where(
            PipelineRunRecord.id == run_id,
            PipelineRunRecord.workspace_id == workspace_id,
            PipelineRunRecord.stage_id == VARIANT_CALLING_STAGE_ID,
        )
    )
    if run is None:
        raise FileNotFoundError(f"Variant calling run {run_id} not found")
    return run


def get_variant_calling_artifact_record(
    session,
    workspace_id: str,
    artifact_id: str,
) -> PipelineArtifactRecord:
    artifact = session.scalar(
        select(PipelineArtifactRecord).where(
            PipelineArtifactRecord.id == artifact_id,
            PipelineArtifactRecord.workspace_id == workspace_id,
            PipelineArtifactRecord.stage_id == VARIANT_CALLING_STAGE_ID,
        )
    )
    if artifact is None:
        raise VariantCallingArtifactNotFoundError(
            f"Variant calling artifact {artifact_id} not found"
        )
    return artifact


# --------------------------------------------------------------------------- #
# Serializers
# --------------------------------------------------------------------------- #


def _serialize_artifact(record: PipelineArtifactRecord) -> VariantCallingArtifactResponse:
    return VariantCallingArtifactResponse(
        id=record.id,
        artifact_kind=VariantCallingArtifactKind(record.artifact_kind),
        filename=record.filename,
        size_bytes=record.size_bytes,
        download_path=f"/api/workspaces/{record.workspace_id}/variant-calling/artifacts/{record.id}/download",
        local_path=record.local_path,
    )


def serialize_variant_calling_run(
    record: PipelineRunRecord,
) -> VariantCallingRunResponse:
    return VariantCallingRunResponse(
        id=record.id,
        status=VariantCallingRunStatus(record.status),
        progress=record.progress / 100,
        runtime_phase=(
            VariantCallingRuntimePhase(record.runtime_phase)
            if record.runtime_phase
            else None
        ),
        created_at=isoformat(record.created_at),
        updated_at=isoformat(record.updated_at),
        started_at=isoformat(record.started_at) if record.started_at else None,
        completed_at=isoformat(record.completed_at) if record.completed_at else None,
        blocking_reason=record.blocking_reason,
        error=record.error,
        command_log=record.command_log.splitlines() if record.command_log else [],
        metrics=None,
        artifacts=[_serialize_artifact(artifact) for artifact in record.artifacts],
    )


# --------------------------------------------------------------------------- #
# Stage summary
# --------------------------------------------------------------------------- #


def build_variant_calling_stage_summary(
    workspace,
    latest_alignment_run: Optional[PipelineRunRecord],
    latest_variant_calling_run: Optional[PipelineRunRecord],
) -> VariantCallingStageSummaryResponse:
    alignment_summary = build_alignment_stage_summary(workspace, latest_alignment_run)
    latest_response = (
        serialize_variant_calling_run(latest_variant_calling_run)
        if latest_variant_calling_run is not None
        else None
    )
    artifacts = latest_response.artifacts if latest_response else []

    if not alignment_summary.ready_for_variant_calling:
        return VariantCallingStageSummaryResponse(
            workspace_id=workspace.id,
            status=VariantCallingStageStatus.BLOCKED,
            blocking_reason=alignment_summary.blocking_reason
            or "Finish alignment before calling variants.",
            ready_for_annotation=False,
            latest_run=latest_response,
            artifacts=artifacts,
        )

    if latest_variant_calling_run is None:
        return VariantCallingStageSummaryResponse(
            workspace_id=workspace.id,
            status=VariantCallingStageStatus.SCAFFOLDED,
            blocking_reason=NOT_ACTIONABLE_MESSAGE,
            ready_for_annotation=False,
            latest_run=None,
            artifacts=[],
        )

    if latest_variant_calling_run.status in {
        VariantCallingRunStatus.PENDING.value,
        VariantCallingRunStatus.RUNNING.value,
    }:
        return VariantCallingStageSummaryResponse(
            workspace_id=workspace.id,
            status=VariantCallingStageStatus.RUNNING,
            blocking_reason=None,
            ready_for_annotation=False,
            latest_run=latest_response,
            artifacts=artifacts,
        )

    if latest_variant_calling_run.status == VariantCallingRunStatus.FAILED.value:
        return VariantCallingStageSummaryResponse(
            workspace_id=workspace.id,
            status=VariantCallingStageStatus.SCAFFOLDED,
            blocking_reason=NOT_ACTIONABLE_MESSAGE,
            ready_for_annotation=False,
            latest_run=latest_response,
            artifacts=artifacts,
        )

    return VariantCallingStageSummaryResponse(
        workspace_id=workspace.id,
        status=VariantCallingStageStatus.SCAFFOLDED,
        blocking_reason=NOT_ACTIONABLE_MESSAGE,
        ready_for_annotation=False,
        latest_run=latest_response,
        artifacts=artifacts,
    )


def load_variant_calling_stage_summary(
    workspace_id: str,
) -> VariantCallingStageSummaryResponse:
    with session_scope() as session:
        workspace = get_workspace_record(session, workspace_id)
        latest_alignment = get_latest_alignment_run(session, workspace_id)
        latest_variant = get_latest_variant_calling_run(session, workspace_id)
        return build_variant_calling_stage_summary(
            workspace, latest_alignment, latest_variant
        )


# --------------------------------------------------------------------------- #
# Run orchestration
# --------------------------------------------------------------------------- #


def create_variant_calling_run(
    workspace_id: str,
) -> VariantCallingStageSummaryResponse:
    created_run_id: Optional[str] = None
    with session_scope() as session:
        workspace = get_workspace_record(session, workspace_id)
        latest_alignment = get_latest_alignment_run(session, workspace_id)
        latest_variant = get_latest_variant_calling_run(session, workspace_id)

        if latest_variant and latest_variant.status in {
            VariantCallingRunStatus.PENDING.value,
            VariantCallingRunStatus.RUNNING.value,
        }:
            raise ValueError("Variant calling is already running for this workspace.")

        stage_summary = build_variant_calling_stage_summary(
            workspace, latest_alignment, latest_variant
        )
        if stage_summary.status == VariantCallingStageStatus.BLOCKED:
            raise ValueError(
                stage_summary.blocking_reason or "Variant calling is blocked."
            )

        timestamp = utc_now()
        run = PipelineRunRecord(
            id=str(uuid.uuid4()),
            workspace_id=workspace.id,
            stage_id=VARIANT_CALLING_STAGE_ID,
            status=VariantCallingRunStatus.PENDING.value,
            progress=0,
            qc_verdict=None,
            assay_type=None,
            reference_preset=None,
            reference_override=None,
            reference_label=None,
            reference_path=None,
            runtime_phase=VariantCallingRuntimePhase.PREPARING_REFERENCE.value,
            command_log=None,
            result_payload=None,
            blocking_reason=None,
            error=None,
            created_at=timestamp,
            updated_at=timestamp,
            started_at=None,
            completed_at=None,
        )
        session.add(run)
        workspace.updated_at = timestamp
        session.add(workspace)
        session.flush()
        created_run_id = run.id
        summary = build_variant_calling_stage_summary(
            workspace, latest_alignment, run
        )

    if created_run_id is None:
        raise RuntimeError("Variant calling run creation did not produce an id")

    enqueue_variant_calling_run(workspace_id, created_run_id)
    return summary


def rerun_variant_calling(
    workspace_id: str,
) -> VariantCallingStageSummaryResponse:
    return create_variant_calling_run(workspace_id)


def mark_variant_calling_run_failed(
    workspace_id: str,
    run_id: str,
    error_message: str,
) -> None:
    with session_scope() as session:
        run = get_variant_calling_run_record(session, workspace_id, run_id)
        run.status = VariantCallingRunStatus.FAILED.value
        run.progress = 100
        run.error = error_message
        run.blocking_reason = error_message
        run.runtime_phase = None
        run.updated_at = utc_now()
        run.completed_at = run.updated_at
        run.workspace.updated_at = run.updated_at
        session.add(run)
        session.add(run.workspace)


def enqueue_variant_calling_run(
    workspace_id: str,
    run_id: str,
) -> None:
    from app.services import background

    try:
        background.submit(run_variant_calling, workspace_id, run_id)
    except Exception as error:
        mark_variant_calling_run_failed(
            workspace_id,
            run_id,
            f"Unable to queue variant calling: {error}",
        )


def start_variant_calling_run(workspace_id: str, run_id: str) -> None:
    """Mark the run as running and validate alignment inputs are present.

    Returns nothing; mutates the run record in-place. Raises if alignment
    artifacts can't be resolved.
    """
    with session_scope() as session:
        workspace = get_workspace_record(session, workspace_id)
        run = get_variant_calling_run_record(session, workspace_id, run_id)
        latest_alignment = get_latest_alignment_run(session, workspace_id)
        if latest_alignment is None or not has_required_alignment_artifacts(latest_alignment):
            raise RuntimeError(
                "Alignment outputs are no longer ready."
            )
        run.status = VariantCallingRunStatus.RUNNING.value
        run.progress = 5
        run.runtime_phase = VariantCallingRuntimePhase.PREPARING_REFERENCE.value
        run.started_at = utc_now()
        run.updated_at = run.started_at
        run.error = None
        run.blocking_reason = None
        workspace.updated_at = run.updated_at
        session.add(run)
        session.add(workspace)


def run_variant_calling(
    workspace_id: str,
    run_id: str,
) -> None:
    """Mutect2 orchestration — scaffold only.

    Validates alignment is ready, then raises NotImplementedError with a clear
    marker so the UI transitions to FAILED with the scaffolding message.
    """
    try:
        start_variant_calling_run(workspace_id, run_id)
        raise NotImplementedError(NOT_IMPLEMENTED_MESSAGE)
    except Exception as error:
        mark_variant_calling_run_failed(workspace_id, run_id, str(error))


def load_variant_calling_artifact_download(
    workspace_id: str,
    artifact_id: str,
) -> VariantCallingArtifactDownload:
    with session_scope() as session:
        artifact = get_variant_calling_artifact_record(session, workspace_id, artifact_id)
        return VariantCallingArtifactDownload(
            filename=artifact.filename,
            local_path=Path(artifact.local_path or artifact.storage_key),
            content_type=artifact.content_type,
        )
