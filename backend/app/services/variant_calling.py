"""Variant calling stage service (GATK Mutect2).

Runs Mutect2 on the aligned tumor/normal BAMs, filters the raw calls with
FilterMutectCalls, and parses the resulting VCF into rich metrics for the UI
(per-chromosome counts, filter breakdown, VAF histogram, top variants).
Artifacts (somatic VCF, Tabix index, Mutect2 stats) are persisted under the
workspace's ``variant-calling/{run_id}`` directory and exposed via
PipelineArtifactRecord rows.
"""
from __future__ import annotations

import gzip
import json
import math
import os
import shutil
import statistics
import subprocess
import uuid
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Optional

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.db import session_scope
from app.runtime import get_variant_calling_run_root
from app.models.records import (
    PipelineArtifactRecord,
    PipelineRunRecord,
)
from app.models.schemas import (
    ChromosomeMetricsEntry,
    FilterBreakdownEntry,
    PipelineStageId,
    SampleLane,
    TopVariantEntry,
    VafHistogramBin,
    VariantCallingArtifactKind,
    VariantCallingArtifactResponse,
    VariantCallingMetricsResponse,
    VariantCallingRunResponse,
    VariantCallingRunStatus,
    VariantCallingRuntimePhase,
    VariantCallingStageStatus,
    VariantCallingStageSummaryResponse,
    VariantTypeKind,
)
from app.services.alignment import (
    AlignmentArtifactKind,
    build_alignment_stage_summary,
    get_latest_alignment_run,
    has_required_alignment_artifacts,
    resolve_reference_config,
)
from app.services.workspace_store import (
    get_workspace_record,
    isoformat,
    serialize_analysis_profile,
    utc_now,
)


VARIANT_CALLING_STAGE_ID = PipelineStageId.VARIANT_CALLING.value
NOT_ACTIONABLE_MESSAGE = (
    "Variant calling is visible here, but not available yet. Alignment is the current working step."
)

# VAF histogram uses 20 bins over [0, 1].
VAF_HISTOGRAM_BINS = 20
TOP_VARIANTS_LIMIT = 40
TRANSITION_PAIRS = {("A", "G"), ("G", "A"), ("C", "T"), ("T", "C")}


class VariantCallingArtifactNotFoundError(FileNotFoundError):
    pass


class VariantCallingCancelledError(Exception):
    """Raised when a variant calling run is cancelled via the cancel endpoint."""


@dataclass(frozen=True)
class VariantCallingArtifactDownload:
    filename: str
    local_path: Path
    content_type: Optional[str]


@dataclass
class VariantCallingInputs:
    workspace_id: str
    reference_fasta: Path
    reference_label: Optional[str]
    tumor_bam: Path
    normal_bam: Path
    run_dir: Path


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


def _parse_metrics(payload: Optional[str]) -> Optional[VariantCallingMetricsResponse]:
    if not payload:
        return None
    try:
        data = json.loads(payload)
    except (TypeError, ValueError):
        return None
    metrics = data.get("metrics") if isinstance(data, dict) else None
    if not isinstance(metrics, dict):
        return None
    try:
        return VariantCallingMetricsResponse.model_validate(metrics)
    except Exception:
        return None


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
        metrics=_parse_metrics(record.result_payload),
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
            blocking_reason=None,
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
            status=VariantCallingStageStatus.FAILED,
            blocking_reason=latest_variant_calling_run.blocking_reason,
            ready_for_annotation=False,
            latest_run=latest_response,
            artifacts=artifacts,
        )

    return VariantCallingStageSummaryResponse(
        workspace_id=workspace.id,
        status=VariantCallingStageStatus.COMPLETED,
        blocking_reason=None,
        ready_for_annotation=True,
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

        analysis_profile = serialize_analysis_profile(workspace)
        reference = resolve_reference_config(workspace.species, analysis_profile)

        timestamp = utc_now()
        run = PipelineRunRecord(
            id=str(uuid.uuid4()),
            workspace_id=workspace.id,
            stage_id=VARIANT_CALLING_STAGE_ID,
            status=VariantCallingRunStatus.PENDING.value,
            progress=0,
            qc_verdict=None,
            assay_type=analysis_profile.assay_type.value if analysis_profile.assay_type else None,
            reference_preset=analysis_profile.reference_preset.value if analysis_profile.reference_preset else None,
            reference_override=analysis_profile.reference_override,
            reference_label=reference.label,
            reference_path=str(reference.fasta_path),
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


def cancel_variant_calling_run(
    workspace_id: str, run_id: str
) -> VariantCallingStageSummaryResponse:
    with session_scope() as session:
        run = get_variant_calling_run_record(session, workspace_id, run_id)
        if run.status not in {
            VariantCallingRunStatus.PENDING.value,
            VariantCallingRunStatus.RUNNING.value,
        }:
            return load_variant_calling_stage_summary(workspace_id)
        run.status = VariantCallingRunStatus.FAILED.value
        run.progress = 0
        run.runtime_phase = None
        run.blocking_reason = "Stopped by user."
        run.error = "Stopped by user."
        run.updated_at = utc_now()
        run.completed_at = run.updated_at
        run.workspace.updated_at = run.updated_at
        session.add(run)
        session.add(run.workspace)

    try:
        run_dir = get_variant_calling_run_root(workspace_id, run_id)
        if run_dir.exists():
            shutil.rmtree(run_dir, ignore_errors=True)
    except Exception:
        pass

    return load_variant_calling_stage_summary(workspace_id)


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


def update_variant_calling_progress(
    workspace_id: str,
    run_id: str,
    progress: int,
    runtime_phase: Optional[VariantCallingRuntimePhase] = None,
) -> None:
    with session_scope() as session:
        run = get_variant_calling_run_record(session, workspace_id, run_id)
        if run.status not in {
            VariantCallingRunStatus.PENDING.value,
            VariantCallingRunStatus.RUNNING.value,
        }:
            return
        run.progress = progress
        if runtime_phase is not None:
            run.runtime_phase = runtime_phase.value
        run.updated_at = utc_now()
        run.workspace.updated_at = run.updated_at
        session.add(run)
        session.add(run.workspace)


def start_variant_calling_run(workspace_id: str, run_id: str) -> VariantCallingInputs:
    """Mark run as running, validate inputs, return the paths the worker needs."""
    with session_scope() as session:
        workspace = get_workspace_record(session, workspace_id)
        run = get_variant_calling_run_record(session, workspace_id, run_id)
        latest_alignment = get_latest_alignment_run(session, workspace_id)
        if latest_alignment is None or not has_required_alignment_artifacts(latest_alignment):
            raise RuntimeError(
                "Alignment outputs are no longer ready."
            )

        tumor_bam = _lane_bam_path(latest_alignment, SampleLane.TUMOR)
        normal_bam = _lane_bam_path(latest_alignment, SampleLane.NORMAL)
        if tumor_bam is None or normal_bam is None:
            raise RuntimeError(
                "Aligned BAM files are missing; rerun alignment first."
            )

        reference_path_str = run.reference_path
        if not reference_path_str:
            raise RuntimeError("Variant calling run is missing a reference path.")
        reference_path = Path(reference_path_str)
        reference_label = run.reference_label

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

    run_dir = get_variant_calling_run_root(workspace_id, run_id)
    return VariantCallingInputs(
        workspace_id=workspace_id,
        reference_fasta=reference_path,
        reference_label=reference_label,
        tumor_bam=tumor_bam,
        normal_bam=normal_bam,
        run_dir=run_dir,
    )


def _lane_bam_path(run: PipelineRunRecord, lane: SampleLane) -> Optional[Path]:
    for artifact in run.artifacts:
        if (
            artifact.sample_lane == lane.value
            and artifact.artifact_kind == AlignmentArtifactKind.BAM.value
        ):
            candidate = Path(artifact.local_path or artifact.storage_key)
            if candidate.exists():
                return candidate
    return None


# --------------------------------------------------------------------------- #
# Mutect2 orchestration
# --------------------------------------------------------------------------- #


def _gatk_binary() -> str:
    return os.getenv("GATK_BINARY", "gatk")


def _samtools_binary() -> str:
    return os.getenv("SAMTOOLS_BINARY", "samtools")


def _run_subprocess(command: list[str], *, cwd: Optional[Path] = None) -> subprocess.CompletedProcess:
    return subprocess.run(
        command,
        check=True,
        capture_output=True,
        text=True,
        cwd=cwd,
    )


def ensure_reference_companions(reference_path: Path) -> list[str]:
    """Guarantee the reference has ``.fai`` and ``.dict`` sidecars required by GATK.

    Returns the list of commands that were actually executed so they can be
    recorded in the run's command log.
    """
    commands: list[str] = []

    fai_path = reference_path.with_name(reference_path.name + ".fai")
    if not fai_path.exists():
        cmd = [_samtools_binary(), "faidx", str(reference_path)]
        _run_subprocess(cmd)
        commands.append(" ".join(cmd))

    dict_path = reference_path.with_suffix(".dict")
    if not dict_path.exists():
        cmd = [
            _gatk_binary(),
            "CreateSequenceDictionary",
            "-R",
            str(reference_path),
            "-O",
            str(dict_path),
        ]
        _run_subprocess(cmd)
        commands.append(" ".join(cmd))

    return commands


def read_bam_sample_name(bam_path: Path) -> Optional[str]:
    """Extract the ``SM`` tag from the BAM header's first @RG line.

    Mutect2 needs the sample name present inside the BAM, not the file name.
    Returns ``None`` if no ``@RG`` is present.
    """
    result = _run_subprocess([_samtools_binary(), "view", "-H", str(bam_path)])
    for line in result.stdout.splitlines():
        if not line.startswith("@RG"):
            continue
        for field in line.split("\t")[1:]:
            if field.startswith("SM:"):
                return field[3:]
    return None


def ensure_bam_index(bam_path: Path) -> Optional[str]:
    bai_candidate_a = bam_path.with_suffix(bam_path.suffix + ".bai")
    bai_candidate_b = bam_path.with_suffix(".bai")
    if bai_candidate_a.exists() or bai_candidate_b.exists():
        return None
    cmd = [_samtools_binary(), "index", str(bam_path)]
    _run_subprocess(cmd)
    return " ".join(cmd)


def run_mutect2_pipeline(
    inputs: VariantCallingInputs,
    *,
    on_progress: callable,  # type: ignore[valid-type]
    command_log: list[str],
) -> tuple[Path, Path, Path, Optional[str], Optional[str]]:
    """Run Mutect2 + FilterMutectCalls. Returns paths to the filtered VCF,
    its Tabix index, the Mutect2 stats file, and the resolved tumor/normal
    sample names.
    """
    reference = inputs.reference_fasta
    run_dir = inputs.run_dir
    run_dir.mkdir(parents=True, exist_ok=True)

    on_progress(8, VariantCallingRuntimePhase.PREPARING_REFERENCE)
    command_log.extend(ensure_reference_companions(reference))

    bai_tumor = ensure_bam_index(inputs.tumor_bam)
    if bai_tumor:
        command_log.append(bai_tumor)
    bai_normal = ensure_bam_index(inputs.normal_bam)
    if bai_normal:
        command_log.append(bai_normal)

    tumor_sample = read_bam_sample_name(inputs.tumor_bam)
    normal_sample = read_bam_sample_name(inputs.normal_bam)

    raw_vcf = run_dir / "somatic.raw.vcf.gz"
    filtered_vcf = run_dir / "somatic.filtered.vcf.gz"
    mutect_stats = run_dir / "somatic.raw.vcf.gz.stats"

    on_progress(15, VariantCallingRuntimePhase.CALLING)
    mutect_cmd: list[str] = [
        _gatk_binary(),
        "Mutect2",
        "-R",
        str(reference),
        "-I",
        str(inputs.tumor_bam),
        "-I",
        str(inputs.normal_bam),
    ]
    if normal_sample:
        mutect_cmd.extend(["-normal", normal_sample])
    mutect_cmd.extend(["-O", str(raw_vcf)])
    command_log.append(" ".join(mutect_cmd))
    _run_subprocess(mutect_cmd)

    on_progress(70, VariantCallingRuntimePhase.FILTERING)
    filter_cmd = [
        _gatk_binary(),
        "FilterMutectCalls",
        "-R",
        str(reference),
        "-V",
        str(raw_vcf),
        "-O",
        str(filtered_vcf),
    ]
    command_log.append(" ".join(filter_cmd))
    _run_subprocess(filter_cmd)

    on_progress(85, VariantCallingRuntimePhase.FINALIZING)
    return filtered_vcf, filtered_vcf.with_suffix(filtered_vcf.suffix + ".tbi"), mutect_stats, tumor_sample, normal_sample


# --------------------------------------------------------------------------- #
# VCF parsing & metrics
# --------------------------------------------------------------------------- #


@dataclass
class ParsedVariant:
    chromosome: str
    position: int
    ref: str
    alt: str
    filter_value: str
    is_pass: bool
    variant_type: VariantTypeKind
    tumor_vaf: Optional[float]
    tumor_depth: Optional[int]
    normal_depth: Optional[int]


def _classify_variant(ref: str, alt: str) -> VariantTypeKind:
    if len(ref) == 1 and len(alt) == 1:
        return VariantTypeKind.SNV
    if len(ref) == len(alt) and len(ref) > 1:
        return VariantTypeKind.MNV
    if len(ref) < len(alt):
        return VariantTypeKind.INSERTION
    return VariantTypeKind.DELETION


def _open_vcf(vcf_path: Path):
    if vcf_path.suffix == ".gz":
        return gzip.open(vcf_path, "rt", encoding="utf-8")
    return vcf_path.open("r", encoding="utf-8")


def _chromosome_lengths_from_fai(reference_path: Path) -> dict[str, int]:
    """Read ``{ref}.fai`` and return a mapping of contig → length.

    A karyogram visualization needs these up-front; we read them from the
    sidecar index the backend ensured exists.
    """
    lengths: dict[str, int] = {}
    fai_path = reference_path.with_name(reference_path.name + ".fai")
    try:
        with fai_path.open("r", encoding="utf-8") as handle:
            for line in handle:
                parts = line.rstrip("\n").split("\t")
                if len(parts) >= 2:
                    try:
                        lengths[parts[0]] = int(parts[1])
                    except ValueError:
                        continue
    except OSError:
        return {}
    return lengths


def _parse_sample_columns(format_field: str, sample_fields: list[str]) -> list[dict[str, str]]:
    keys = format_field.split(":")
    parsed: list[dict[str, str]] = []
    for sample in sample_fields:
        values = sample.split(":")
        parsed.append({key: values[i] if i < len(values) else "" for i, key in enumerate(keys)})
    return parsed


def _compute_vaf(ad_field: str) -> Optional[float]:
    if not ad_field or ad_field == "." or "," not in ad_field:
        return None
    tokens = ad_field.split(",")
    try:
        values = [int(t) for t in tokens if t and t != "."]
    except ValueError:
        return None
    if len(values) < 2:
        return None
    total = sum(values)
    if total <= 0:
        return None
    alt_support = sum(values[1:])
    return alt_support / total


def _compute_depth(dp_field: str, ad_field: str) -> Optional[int]:
    if dp_field and dp_field != ".":
        try:
            return int(dp_field)
        except ValueError:
            pass
    if ad_field and "," in ad_field:
        try:
            return sum(int(t) for t in ad_field.split(",") if t and t != ".")
        except ValueError:
            return None
    return None


def _iter_vcf_records(vcf_path: Path, tumor_sample: Optional[str], normal_sample: Optional[str]) -> Iterable[ParsedVariant]:
    with _open_vcf(vcf_path) as handle:
        sample_names: list[str] = []
        for line in handle:
            if line.startswith("##"):
                continue
            if line.startswith("#CHROM"):
                header_cols = line.rstrip("\n").split("\t")
                sample_names = header_cols[9:]
                continue
            if not line.strip():
                continue
            cols = line.rstrip("\n").split("\t")
            if len(cols) < 8:
                continue
            chrom = cols[0]
            try:
                pos = int(cols[1])
            except ValueError:
                continue
            ref = cols[3]
            alt_field = cols[4]
            filter_value = cols[6] or "."

            format_field = cols[8] if len(cols) > 8 else ""
            sample_fields = cols[9:] if len(cols) > 9 else []
            parsed_samples: list[dict[str, str]] = []
            if format_field and sample_fields:
                parsed_samples = _parse_sample_columns(format_field, sample_fields)

            tumor_idx = normal_idx = None
            if tumor_sample and tumor_sample in sample_names:
                tumor_idx = sample_names.index(tumor_sample)
            if normal_sample and normal_sample in sample_names:
                normal_idx = sample_names.index(normal_sample)
            # Fall back to heuristic: first sample = tumor, second = normal,
            # unless only one sample is present.
            if tumor_idx is None and parsed_samples:
                tumor_idx = 0
            if normal_idx is None and len(parsed_samples) > 1:
                normal_idx = 1 if (tumor_idx != 1) else 0

            tumor_sample_data = (
                parsed_samples[tumor_idx]
                if tumor_idx is not None and tumor_idx < len(parsed_samples)
                else None
            )
            normal_sample_data = (
                parsed_samples[normal_idx]
                if normal_idx is not None and normal_idx < len(parsed_samples)
                else None
            )

            tumor_vaf = None
            tumor_depth = None
            if tumor_sample_data:
                if "AF" in tumor_sample_data and tumor_sample_data["AF"] and tumor_sample_data["AF"] != ".":
                    try:
                        tumor_vaf = float(tumor_sample_data["AF"].split(",")[0])
                    except ValueError:
                        tumor_vaf = None
                if tumor_vaf is None:
                    tumor_vaf = _compute_vaf(tumor_sample_data.get("AD", ""))
                tumor_depth = _compute_depth(
                    tumor_sample_data.get("DP", ""),
                    tumor_sample_data.get("AD", ""),
                )

            normal_depth = None
            if normal_sample_data:
                normal_depth = _compute_depth(
                    normal_sample_data.get("DP", ""),
                    normal_sample_data.get("AD", ""),
                )

            is_pass = filter_value in {"PASS", "."}

            for alt_single in alt_field.split(","):
                if alt_single in ("", "."):
                    continue
                yield ParsedVariant(
                    chromosome=chrom,
                    position=pos,
                    ref=ref.upper(),
                    alt=alt_single.upper(),
                    filter_value=filter_value,
                    is_pass=is_pass,
                    variant_type=_classify_variant(ref, alt_single),
                    tumor_vaf=tumor_vaf,
                    tumor_depth=tumor_depth,
                    normal_depth=normal_depth,
                )


def compute_variant_metrics(
    vcf_path: Path,
    reference_path: Path,
    *,
    tumor_sample: Optional[str],
    normal_sample: Optional[str],
    reference_label: Optional[str],
) -> VariantCallingMetricsResponse:
    per_chrom_counts: dict[str, dict[str, int]] = defaultdict(
        lambda: {"total": 0, "pass": 0, "snv": 0, "indel": 0}
    )
    filter_counts: dict[str, int] = defaultdict(int)
    vaf_values: list[float] = []
    tumor_depths: list[int] = []
    normal_depths: list[int] = []
    top_candidates: list[ParsedVariant] = []

    total = snv = indel = insertions = deletions = mnv = pass_count = 0
    pass_snv = pass_indel = transitions = transversions = 0

    for variant in _iter_vcf_records(vcf_path, tumor_sample, normal_sample):
        total += 1
        chrom_bucket = per_chrom_counts[variant.chromosome]
        chrom_bucket["total"] += 1

        if variant.variant_type == VariantTypeKind.SNV:
            snv += 1
            chrom_bucket["snv"] += 1
            pair = (variant.ref, variant.alt)
            if pair in TRANSITION_PAIRS:
                transitions += 1
            elif variant.ref in {"A", "C", "G", "T"} and variant.alt in {"A", "C", "G", "T"}:
                transversions += 1
        else:
            indel += 1
            chrom_bucket["indel"] += 1
            if variant.variant_type == VariantTypeKind.INSERTION:
                insertions += 1
            elif variant.variant_type == VariantTypeKind.DELETION:
                deletions += 1
            else:
                mnv += 1

        if variant.is_pass:
            pass_count += 1
            chrom_bucket["pass"] += 1
            if variant.variant_type == VariantTypeKind.SNV:
                pass_snv += 1
            else:
                pass_indel += 1

        filter_counts[variant.filter_value] += 1

        if variant.tumor_vaf is not None:
            vaf_values.append(variant.tumor_vaf)
        if variant.tumor_depth is not None:
            tumor_depths.append(variant.tumor_depth)
        if variant.normal_depth is not None:
            normal_depths.append(variant.normal_depth)

        if variant.is_pass:
            top_candidates.append(variant)

    chrom_lengths = _chromosome_lengths_from_fai(reference_path)
    per_chromosome = [
        ChromosomeMetricsEntry(
            chromosome=chrom,
            length=chrom_lengths.get(chrom, 0),
            total=bucket["total"],
            pass_count=bucket["pass"],
            snv_count=bucket["snv"],
            indel_count=bucket["indel"],
        )
        for chrom, bucket in per_chrom_counts.items()
    ]
    per_chromosome.sort(key=lambda entry: _chromosome_sort_key(entry.chromosome))

    filter_breakdown = [
        FilterBreakdownEntry(
            name=name,
            count=count,
            is_pass=name in {"PASS", "."},
        )
        for name, count in sorted(filter_counts.items(), key=lambda item: (-item[1], item[0]))
    ]

    # VAF histogram: 20 bins over [0, 1].
    histogram = []
    if vaf_values:
        bin_width = 1.0 / VAF_HISTOGRAM_BINS
        for i in range(VAF_HISTOGRAM_BINS):
            start = i * bin_width
            end = start + bin_width
            if i == VAF_HISTOGRAM_BINS - 1:
                count = sum(1 for v in vaf_values if v >= start and v <= end + 1e-9)
            else:
                count = sum(1 for v in vaf_values if v >= start and v < end)
            histogram.append(
                VafHistogramBin(bin_start=round(start, 4), bin_end=round(end, 4), count=count)
            )

    top_candidates.sort(
        key=lambda v: (v.tumor_vaf if v.tumor_vaf is not None else -1.0),
        reverse=True,
    )
    top_variants = [
        TopVariantEntry(
            chromosome=v.chromosome,
            position=v.position,
            ref=v.ref,
            alt=v.alt,
            variant_type=v.variant_type,
            filter=v.filter_value,
            is_pass=v.is_pass,
            tumor_vaf=v.tumor_vaf,
            tumor_depth=v.tumor_depth,
            normal_depth=v.normal_depth,
        )
        for v in top_candidates[:TOP_VARIANTS_LIMIT]
    ]

    ti_tv = (transitions / transversions) if transversions > 0 else None

    return VariantCallingMetricsResponse(
        total_variants=total,
        snv_count=snv,
        indel_count=indel,
        insertion_count=insertions,
        deletion_count=deletions,
        mnv_count=mnv,
        pass_count=pass_count,
        pass_snv_count=pass_snv,
        pass_indel_count=pass_indel,
        ti_tv_ratio=round(ti_tv, 3) if ti_tv is not None else None,
        transitions=transitions,
        transversions=transversions,
        mean_vaf=round(statistics.fmean(vaf_values), 4) if vaf_values else None,
        median_vaf=round(statistics.median(vaf_values), 4) if vaf_values else None,
        tumor_mean_depth=round(statistics.fmean(tumor_depths), 1) if tumor_depths else None,
        normal_mean_depth=round(statistics.fmean(normal_depths), 1) if normal_depths else None,
        tumor_sample=tumor_sample,
        normal_sample=normal_sample,
        reference_label=reference_label,
        per_chromosome=per_chromosome,
        filter_breakdown=filter_breakdown,
        vaf_histogram=histogram,
        top_variants=top_variants,
    )


def _chromosome_sort_key(chromosome: str) -> tuple[int, int, str]:
    """Sort contigs the way karyogram viewers expect: 1…22, X, Y, MT, then others alphabetical."""
    stripped = chromosome[3:] if chromosome.lower().startswith("chr") else chromosome
    if stripped.isdigit():
        return (0, int(stripped), chromosome)
    lowered = stripped.lower()
    special_order = {"x": 100, "y": 101, "m": 102, "mt": 102}
    if lowered in special_order:
        return (1, special_order[lowered], chromosome)
    return (2, 0, chromosome)


# --------------------------------------------------------------------------- #
# Persistence
# --------------------------------------------------------------------------- #


def _artifact_content_type(kind: VariantCallingArtifactKind) -> str:
    if kind == VariantCallingArtifactKind.STATS:
        return "text/plain"
    return "application/octet-stream"


def persist_variant_calling_success(
    workspace_id: str,
    run_id: str,
    *,
    filtered_vcf: Path,
    tbi_path: Path,
    mutect_stats: Path,
    metrics: VariantCallingMetricsResponse,
    command_log: list[str],
) -> None:
    artifacts: list[PipelineArtifactRecord] = []
    timestamp = utc_now()

    def _record(path: Path, kind: VariantCallingArtifactKind) -> None:
        if not path.exists():
            return
        artifacts.append(
            PipelineArtifactRecord(
                id=str(uuid.uuid4()),
                run_id=run_id,
                workspace_id=workspace_id,
                stage_id=VARIANT_CALLING_STAGE_ID,
                artifact_kind=kind.value,
                sample_lane=None,
                filename=path.name,
                storage_key=str(path),
                local_path=str(path),
                content_type=_artifact_content_type(kind),
                size_bytes=path.stat().st_size,
                created_at=timestamp,
            )
        )

    _record(filtered_vcf, VariantCallingArtifactKind.VCF)
    _record(tbi_path, VariantCallingArtifactKind.VCF_INDEX)
    _record(mutect_stats, VariantCallingArtifactKind.STATS)

    result_payload = json.dumps({"metrics": metrics.model_dump(mode="json")})
    command_log_text = "\n".join(command_log)

    with session_scope() as session:
        run = get_variant_calling_run_record(session, workspace_id, run_id)
        for artifact in artifacts:
            session.add(artifact)
            run.artifacts.append(artifact)
        run.status = VariantCallingRunStatus.COMPLETED.value
        run.progress = 100
        run.runtime_phase = None
        run.result_payload = result_payload
        run.command_log = command_log_text
        run.error = None
        run.blocking_reason = None
        run.updated_at = utc_now()
        run.completed_at = run.updated_at
        run.workspace.updated_at = run.updated_at
        session.add(run)
        session.add(run.workspace)


# --------------------------------------------------------------------------- #
# Worker entry point
# --------------------------------------------------------------------------- #


def run_variant_calling(
    workspace_id: str,
    run_id: str,
) -> None:
    command_log: list[str] = []
    try:
        inputs = start_variant_calling_run(workspace_id, run_id)

        def progress_cb(progress: int, phase: Optional[VariantCallingRuntimePhase] = None) -> None:
            update_variant_calling_progress(workspace_id, run_id, progress, phase)

        filtered_vcf, tbi_path, mutect_stats, tumor_sample, normal_sample = run_mutect2_pipeline(
            inputs,
            on_progress=progress_cb,
            command_log=command_log,
        )

        progress_cb(90, VariantCallingRuntimePhase.FINALIZING)
        metrics = compute_variant_metrics(
            filtered_vcf,
            inputs.reference_fasta,
            tumor_sample=tumor_sample,
            normal_sample=normal_sample,
            reference_label=inputs.reference_label,
        )

        persist_variant_calling_success(
            workspace_id,
            run_id,
            filtered_vcf=filtered_vcf,
            tbi_path=tbi_path,
            mutect_stats=mutect_stats,
            metrics=metrics,
            command_log=command_log,
        )
    except subprocess.CalledProcessError as error:
        stderr_tail = (error.stderr or "").splitlines()[-20:]
        message = " | ".join(stderr_tail) if stderr_tail else str(error)
        mark_variant_calling_run_failed(
            workspace_id,
            run_id,
            f"{' '.join(error.cmd[:3])} failed: {message}",
        )
    except Exception as error:  # pragma: no cover - defensive
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
