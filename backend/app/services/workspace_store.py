import gzip
import os
import re
import shutil
import subprocess
import tempfile
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Optional

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.db import session_scope
from app.models.records import (
    IngestionBatchRecord,
    PipelineArtifactRecord,
    PipelineRunRecord,
    WorkspaceFileRecord,
    WorkspaceRecord,
)
from app.models.schemas import (
    ActiveStageUpdateRequest,
    AnalysisAssayType,
    FastqReadPreview,
    IngestionLaneSummaryResponse,
    IngestionLanePreviewResponse,
    IngestionStatus,
    IngestionSummaryResponse,
    PipelineStageId,
    ReadLayout,
    ReadPair,
    ReferencePreset,
    SampledReadStats,
    SampleLane,
    LocalFileRegistrationRequest,
    WorkspaceCreateRequest,
    WorkspaceFileFormat,
    WorkspaceFileResponse,
    WorkspaceFileRole,
    WorkspaceFileStatus,
    WorkspaceAnalysisProfileResponse,
    WorkspaceAnalysisProfileUpdateRequest,
    WorkspaceResponse,
)
from app.runtime import get_alignment_run_root, get_batch_canonical_root, is_path_within_app_data

READ_PAIR_PATTERN = re.compile(
    r"(?:^|[_\-.])(R[12])(?:[_\-.]|$)"
    r"|(?<=[_\-.])([12])(?=\.(?:fastq|fq)(?:\.gz)?$)",
    re.IGNORECASE,
)
UNDERSCORE_PAIR_SUFFIX_PATTERN = re.compile(r"[_\-.][12]$")
SEPARATOR_PATTERN = re.compile(r"[_\-.]+")
LANE_SPLIT_TOKEN_PATTERN = re.compile(r"^(?:L\d{3}|\d{3})$", re.IGNORECASE)
COMPRESSED_FASTQ_SUFFIXES = (".fastq.gz", ".fq.gz")
FASTQ_SUFFIXES = COMPRESSED_FASTQ_SUFFIXES + (".fastq", ".fq")
BAM_SUFFIXES = (".bam",)
CRAM_SUFFIXES = (".cram",)
PREVIEW_READ_LIMIT = 8
LANES = (SampleLane.TUMOR, SampleLane.NORMAL)


@dataclass
class LaneValidationResult:
    file_format: Optional[WorkspaceFileFormat]
    sample_stem: Optional[str]
    missing_pairs: list[ReadPair]
    blocking_issues: list[str]
    read_layout: Optional[ReadLayout] = None


class LanePreviewUnavailableError(RuntimeError):
    pass


PAIRED_OUTPUT_REQUIRED_ISSUE = (
    "Paired-end required. This lane must have canonical R1 and R2 before alignment."
)
ALIGNMENT_CONTAINER_PAIRED_OUTPUT_ISSUE = (
    "Paired-end required. BAM/CRAM normalization did not produce both R1 and R2 FASTQ outputs."
)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def isoformat(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat()


def default_reference_preset_for_species(species: str) -> ReferencePreset:
    normalized = species.lower()
    if normalized == "dog":
        return ReferencePreset.CANFAM4
    if normalized == "cat":
        return ReferencePreset.FELCAT9
    return ReferencePreset.GRCH38


def serialize_analysis_profile(workspace: WorkspaceRecord) -> WorkspaceAnalysisProfileResponse:
    assay_type = (
        AnalysisAssayType(workspace.assay_type)
        if workspace.assay_type
        else None
    )
    reference_preset_value = (
        workspace.reference_preset or default_reference_preset_for_species(workspace.species).value
    )
    reference_preset = ReferencePreset(reference_preset_value)
    return WorkspaceAnalysisProfileResponse(
        assay_type=assay_type,
        reference_preset=reference_preset,
        reference_override=workspace.reference_override,
    )


def record_source_path(record: WorkspaceFileRecord) -> Optional[Path]:
    if record.source_path:
        return Path(record.source_path)
    if record.file_role == WorkspaceFileRole.SOURCE.value and record.storage_key:
        return Path(record.storage_key)
    return None


def record_managed_path(record: WorkspaceFileRecord) -> Optional[Path]:
    if record.local_path:
        return Path(record.local_path)
    if record.file_role == WorkspaceFileRole.CANONICAL.value and record.storage_key:
        return Path(record.storage_key)
    return None


def workspace_file_access_path(record: WorkspaceFileRecord) -> Path:
    source = record_source_path(record)
    if source is not None:
        return source
    managed = record_managed_path(record)
    if managed is not None:
        return managed
    raise FileNotFoundError(f"No usable path is available for {record.filename}")


def canonical_destination_path(
    workspace_id: str,
    batch_id: str,
    filename: str,
) -> Path:
    return get_batch_canonical_root(workspace_id, batch_id) / sanitize_filename(filename)


def managed_alignment_artifact_path(
    workspace_id: str,
    run_id: str,
    sample_lane: SampleLane,
    filename: str,
) -> Path:
    root = get_alignment_run_root(workspace_id, run_id) / sample_lane.value
    root.mkdir(parents=True, exist_ok=True)
    return root / sanitize_filename(filename)


def sanitize_filename(filename: str) -> str:
    name = Path(filename).name.strip()
    if not name:
        raise ValueError("Filename is required")
    return name


def detect_format(filename: str) -> Optional[WorkspaceFileFormat]:
    lowered = filename.lower()
    if lowered.endswith(FASTQ_SUFFIXES):
        return WorkspaceFileFormat.FASTQ
    if lowered.endswith(BAM_SUFFIXES):
        return WorkspaceFileFormat.BAM
    if lowered.endswith(CRAM_SUFFIXES):
        return WorkspaceFileFormat.CRAM
    return None


def infer_read_pair(filename: str) -> ReadPair:
    match = READ_PAIR_PATTERN.search(filename)
    if not match:
        return ReadPair.UNKNOWN
    token = match.group(1) or match.group(2) or ""
    return ReadPair.R1 if token.upper().endswith("1") else ReadPair.R2


def is_compressed_fastq(filename: str) -> bool:
    return filename.lower().endswith(COMPRESSED_FASTQ_SUFFIXES)


def strip_known_suffix(filename: str) -> str:
    lowered = filename.lower()
    for suffix in FASTQ_SUFFIXES + BAM_SUFFIXES + CRAM_SUFFIXES:
        if lowered.endswith(suffix):
            return filename[: -len(suffix)]
    return filename


def normalize_fastq_sample_stem(filename: str) -> str:
    stem = strip_known_suffix(filename)
    stem = UNDERSCORE_PAIR_SUFFIX_PATTERN.sub("", stem)
    tokens = [token for token in SEPARATOR_PATTERN.split(stem) if token]
    filtered_tokens = [
        token
        for token in tokens
        if not READ_PAIR_PATTERN.fullmatch(token)
        and not LANE_SPLIT_TOKEN_PATTERN.fullmatch(token)
    ]
    return "_".join(filtered_tokens).lower()


def build_canonical_filename(sample_lane: SampleLane, read_pair: ReadPair) -> str:
    return f"{sample_lane.value}_{read_pair.value}.normalized.fastq.gz"


def get_workspace_query():
    return select(WorkspaceRecord).options(
        selectinload(WorkspaceRecord.files),
        selectinload(WorkspaceRecord.batches).selectinload(IngestionBatchRecord.files),
    )


def get_workspace_record(session, workspace_id: str) -> WorkspaceRecord:
    workspace = session.scalar(
        get_workspace_query().where(WorkspaceRecord.id == workspace_id)
    )
    if workspace is None:
        raise FileNotFoundError(f"Workspace {workspace_id} not found")
    return workspace


def get_batch_record(session, workspace_id: str, batch_id: str) -> IngestionBatchRecord:
    batch = session.scalar(
        select(IngestionBatchRecord)
        .options(
            selectinload(IngestionBatchRecord.workspace),
            selectinload(IngestionBatchRecord.files),
        )
        .where(
            IngestionBatchRecord.id == batch_id,
            IngestionBatchRecord.workspace_id == workspace_id,
        )
    )
    if batch is None:
        raise FileNotFoundError(f"Ingestion batch {batch_id} not found")
    return batch


def serialize_file(record: WorkspaceFileRecord) -> WorkspaceFileResponse:
    return WorkspaceFileResponse(
        id=record.id,
        batch_id=record.batch_id,
        source_file_id=record.source_file_id,
        sample_lane=SampleLane(record.sample_lane),
        filename=record.filename,
        format=WorkspaceFileFormat(record.format),
        file_role=WorkspaceFileRole(record.file_role),
        status=WorkspaceFileStatus(record.status),
        size_bytes=record.size_bytes,
        uploaded_at=isoformat(record.uploaded_at),
        read_pair=ReadPair(record.read_pair),
        source_path=str(record_source_path(record)) if record_source_path(record) else None,
        managed_path=str(record_managed_path(record)) if record_managed_path(record) else None,
        error=record.error,
    )


def latest_batch_for_lane(workspace: WorkspaceRecord, sample_lane: SampleLane) -> Optional[IngestionBatchRecord]:
    candidates = [
        batch
        for batch in workspace.batches
        if batch.sample_lane == sample_lane.value
    ]
    if not candidates:
        return None
    return sorted(
        candidates,
        key=lambda item: isoformat(item.created_at),
        reverse=True,
    )[0]


def issues_from_error_text(error_text: Optional[str]) -> list[str]:
    if not error_text:
        return []
    return [item.strip() for item in error_text.split(" | ") if item.strip()]


def validate_lane_files(files: Iterable[WorkspaceFileRecord]) -> LaneValidationResult:
    file_list = list(files)
    if not file_list:
        return LaneValidationResult(
            file_format=None,
            sample_stem=None,
            missing_pairs=[],
            blocking_issues=["Upload at least one sequencing file for this lane."],
            read_layout=None,
        )

    formats = {WorkspaceFileFormat(file.format) for file in file_list}
    if len(formats) != 1:
        return LaneValidationResult(
            file_format=None,
            sample_stem=None,
            missing_pairs=[],
            blocking_issues=[
                "Each lane must contain one format family only: FASTQ or a single BAM/CRAM file.",
            ],
            read_layout=None,
        )

    file_format = next(iter(formats))
    if file_format in {WorkspaceFileFormat.BAM, WorkspaceFileFormat.CRAM}:
        if len(file_list) != 1:
            return LaneValidationResult(
                file_format=file_format,
                sample_stem=None,
                missing_pairs=[],
                blocking_issues=["Upload exactly one BAM or CRAM file for a lane."],
                read_layout=None,
            )
        return LaneValidationResult(
            file_format=file_format,
            sample_stem=strip_known_suffix(file_list[0].filename).lower(),
            missing_pairs=[],
            blocking_issues=[],
            read_layout=None,
        )

    # FASTQ: decide layout from read-pair markers
    r1_files = [f for f in file_list if ReadPair(f.read_pair) == ReadPair.R1]
    r2_files = [f for f in file_list if ReadPair(f.read_pair) == ReadPair.R2]
    unknown_files = [f for f in file_list if ReadPair(f.read_pair) == ReadPair.UNKNOWN]

    has_r1 = bool(r1_files)
    has_r2 = bool(r2_files)
    has_unknown = bool(unknown_files)

    blocking_issues: list[str] = []
    read_layout: Optional[ReadLayout] = None

    if has_r1 and has_r2 and not has_unknown:
        read_layout = ReadLayout.PAIRED
    elif has_r1 and not has_r2 and not has_unknown:
        blocking_issues.append(
            "Paired-end required. Add the matching R2 file before continuing."
        )
    elif has_unknown and not has_r1 and not has_r2:
        blocking_issues.append(
            "Paired-end required. Filenames don't encode R1/R2 — rename with "
            "_R1_/_R2_ markers."
        )
    elif has_r2 and not has_r1:
        blocking_issues.append(
            "R2 files need matching R1 files. Add the R1 file or drop the R2 files."
        )
    elif has_unknown and (has_r1 or has_r2):
        unnamed_preview = ", ".join(sorted(f.filename for f in unknown_files)[:3])
        blocking_issues.append(
            "Cannot mix R1/R2-marked files with files that don't encode a read pair: "
            f"{unnamed_preview}. Use consistent naming across the lane."
        )
    else:
        blocking_issues.append(
            "Paired-end required. Could not determine R1/R2 from the uploaded files."
        )

    stems = {normalize_fastq_sample_stem(file.filename) for file in file_list}
    stems.discard("")
    if len(stems) > 1:
        blocking_issues.append(
            "FASTQ files in a lane must resolve to exactly one sample family."
        )

    return LaneValidationResult(
        file_format=file_format,
        sample_stem=next(iter(stems), None),
        missing_pairs=[],
        blocking_issues=blocking_issues,
        read_layout=read_layout,
    )


def summarize_batch(batch: Optional[IngestionBatchRecord], sample_lane: SampleLane) -> IngestionLaneSummaryResponse:
    if batch is None:
        return IngestionLaneSummaryResponse(sample_lane=sample_lane)

    source_files = [
        file
        for file in batch.files
        if file.file_role == WorkspaceFileRole.SOURCE.value
    ]
    canonical_files = [
        file
        for file in batch.files
        if file.file_role == WorkspaceFileRole.CANONICAL.value
        and file.status == WorkspaceFileStatus.READY.value
    ]
    ready_pairs = {ReadPair(file.read_pair) for file in canonical_files}

    read_layout: Optional[ReadLayout] = None
    if ReadPair.R1 in ready_pairs or ReadPair.R2 in ready_pairs:
        read_layout = ReadLayout.PAIRED
    elif ReadPair.SE in ready_pairs:
        read_layout = ReadLayout.SINGLE
    else:
        source_validation = validate_lane_files(source_files)
        read_layout = source_validation.read_layout

    missing_pairs: list[ReadPair] = []
    if canonical_files:
        if ReadPair.R1 not in ready_pairs:
            missing_pairs.append(ReadPair.R1)
        if ReadPair.R2 not in ready_pairs:
            missing_pairs.append(ReadPair.R2)

    blocking_issues = issues_from_error_text(batch.error)
    blocking_issues.extend(
        file.error
        for file in source_files
        if file.error
    )

    status = IngestionStatus(batch.status)
    has_paired_outputs = ready_pairs >= {ReadPair.R1, ReadPair.R2}
    has_stale_single_output = ReadPair.SE in ready_pairs and not has_paired_outputs

    if canonical_files and not has_paired_outputs:
        status = IngestionStatus.FAILED
        issue = (
            ALIGNMENT_CONTAINER_PAIRED_OUTPUT_ISSUE
            if has_stale_single_output
            else PAIRED_OUTPUT_REQUIRED_ISSUE
        )
        if issue not in blocking_issues:
            blocking_issues.append(issue)

    if (
        status == IngestionStatus.FAILED
        and not missing_pairs
        and any("paired-end required" in issue.lower() for issue in blocking_issues)
    ):
        missing_pairs = [ReadPair.R1, ReadPair.R2]

    ready_for_alignment = status == IngestionStatus.READY and has_paired_outputs

    return IngestionLaneSummaryResponse(
        active_batch_id=batch.id,
        sample_lane=sample_lane,
        status=status,
        ready_for_alignment=ready_for_alignment,
        source_file_count=len(source_files),
        canonical_file_count=len(canonical_files),
        missing_pairs=missing_pairs,
        blocking_issues=blocking_issues,
        read_layout=read_layout,
        updated_at=isoformat(batch.updated_at),
    )


def summarize_workspace_ingestion(workspace: WorkspaceRecord) -> IngestionSummaryResponse:
    lane_summaries: dict[SampleLane, IngestionLaneSummaryResponse] = {}

    for sample_lane in LANES:
        batch = latest_batch_for_lane(workspace, sample_lane)
        lane_summaries[sample_lane] = summarize_batch(batch, sample_lane)

    ready_for_alignment = all(
        lane_summaries[sample_lane].ready_for_alignment for sample_lane in LANES
    )
    statuses = {lane_summaries[sample_lane].status for sample_lane in LANES}

    if ready_for_alignment:
        overall_status = IngestionStatus.READY
    elif IngestionStatus.FAILED in statuses:
        overall_status = IngestionStatus.FAILED
    elif IngestionStatus.NORMALIZING in statuses:
        overall_status = IngestionStatus.NORMALIZING
    elif IngestionStatus.UPLOADED in statuses:
        overall_status = IngestionStatus.UPLOADED
    elif all(status == IngestionStatus.EMPTY for status in statuses):
        overall_status = IngestionStatus.EMPTY
    else:
        overall_status = IngestionStatus.UPLOADED

    return IngestionSummaryResponse(
        status=overall_status,
        ready_for_alignment=ready_for_alignment,
        lanes=lane_summaries,
    )


def ready_canonical_files_for_batch(
    batch: IngestionBatchRecord,
) -> dict[ReadPair, WorkspaceFileRecord]:
    return {
        ReadPair(file.read_pair): file
        for file in batch.files
        if file.file_role == WorkspaceFileRole.CANONICAL.value
        and file.status == WorkspaceFileStatus.READY.value
        and ReadPair(file.read_pair) in {ReadPair.R1, ReadPair.R2, ReadPair.SE}
    }


def build_fastq_read_preview(header: str, sequence: str, quality: str) -> FastqReadPreview:
    gc_count = sum(1 for base in sequence.upper() if base in {"G", "C"})
    length = len(sequence)
    gc_percent = round((gc_count / length) * 100, 2) if length else 0.0
    mean_quality = (
        round(sum(max(ord(char) - 33, 0) for char in quality) / len(quality), 2)
        if quality
        else 0.0
    )

    return FastqReadPreview(
        header=header,
        sequence=sequence,
        quality=quality,
        length=length,
        gc_percent=gc_percent,
        mean_quality=mean_quality,
    )


def sample_canonical_fastq_reads(source_file: WorkspaceFileRecord) -> list[FastqReadPreview]:
    try:
        managed_path = workspace_file_access_path(source_file)
        with gzip.open(managed_path, "rt", encoding="utf-8") as text_stream:
            reads: list[FastqReadPreview] = []
            for _ in range(PREVIEW_READ_LIMIT):
                header = text_stream.readline()
                if not header:
                    break

                sequence = text_stream.readline()
                separator = text_stream.readline()
                quality = text_stream.readline()
                if not sequence or not separator or not quality:
                    raise ValueError(
                        f"Malformed canonical FASTQ preview for {source_file.filename}: incomplete record."
                    )

                header = header.rstrip("\r\n")
                sequence = sequence.rstrip("\r\n")
                separator = separator.rstrip("\r\n")
                quality = quality.rstrip("\r\n")

                if not header.startswith("@"):
                    raise ValueError(
                        f"Malformed canonical FASTQ preview for {source_file.filename}: invalid header."
                    )
                if not separator.startswith("+"):
                    raise ValueError(
                        f"Malformed canonical FASTQ preview for {source_file.filename}: missing separator."
                    )
                if len(sequence) != len(quality):
                    raise ValueError(
                        f"Malformed canonical FASTQ preview for {source_file.filename}: sequence and quality lengths differ."
                    )

                reads.append(build_fastq_read_preview(header, sequence, quality))

            return reads
    except FileNotFoundError:
        raise
    except UnicodeDecodeError as error:
        raise ValueError(
            f"Unable to decode canonical FASTQ preview for {source_file.filename}: {error}"
        ) from error
    except OSError as error:
        raise ValueError(
            f"Unable to read canonical FASTQ preview for {source_file.filename}: {error}"
        ) from error


def calculate_sampled_read_stats(
    reads_by_pair: dict[ReadPair, list[FastqReadPreview]],
) -> SampledReadStats:
    all_reads = [
        read
        for read_pair in (ReadPair.R1, ReadPair.R2, ReadPair.SE)
        for read in reads_by_pair.get(read_pair, [])
    ]
    if not all_reads:
        return SampledReadStats(
            sampled_read_count=0,
            average_read_length=0.0,
            sampled_gc_percent=0.0,
        )

    total_bases = sum(read.length for read in all_reads)
    total_gc_bases = sum((read.gc_percent / 100) * read.length for read in all_reads)

    return SampledReadStats(
        sampled_read_count=len(all_reads),
        average_read_length=round(total_bases / len(all_reads), 2),
        sampled_gc_percent=round((total_gc_bases / total_bases) * 100, 2)
        if total_bases
        else 0.0,
    )


def load_ingestion_lane_preview(
    workspace_id: str,
    sample_lane: SampleLane,
) -> IngestionLanePreviewResponse:
    with session_scope() as session:
        workspace = get_workspace_record(session, workspace_id)
        lane_summary = summarize_workspace_ingestion(workspace).lanes[sample_lane]
        if lane_summary.status != IngestionStatus.READY or not lane_summary.active_batch_id:
            raise LanePreviewUnavailableError(
                "Sequence preview becomes available after canonical FASTQ is ready."
            )

        batch = get_batch_record(session, workspace_id, lane_summary.active_batch_id)
        canonical_files = ready_canonical_files_for_batch(batch)

        if ReadPair.SE in canonical_files:
            read_layout = ReadLayout.SINGLE
            reads = {
                ReadPair.SE: sample_canonical_fastq_reads(canonical_files[ReadPair.SE]),
            }
        elif ReadPair.R1 in canonical_files and ReadPair.R2 in canonical_files:
            read_layout = ReadLayout.PAIRED
            reads = {
                ReadPair.R1: sample_canonical_fastq_reads(canonical_files[ReadPair.R1]),
                ReadPair.R2: sample_canonical_fastq_reads(canonical_files[ReadPair.R2]),
            }
        else:
            raise FileNotFoundError(
                "Canonical FASTQ preview requires ready canonical files for "
                f"{sample_lane.value} lane."
            )

        return IngestionLanePreviewResponse(
            workspace_id=workspace.id,
            sample_lane=sample_lane,
            batch_id=batch.id,
            read_layout=read_layout,
            reads=reads,
            stats=calculate_sampled_read_stats(reads),
        )


def serialize_workspace(workspace: WorkspaceRecord) -> WorkspaceResponse:
    ordered_files = sorted(
        workspace.files,
        key=lambda file: isoformat(file.uploaded_at),
        reverse=True,
    )

    return WorkspaceResponse(
        id=workspace.id,
        display_name=workspace.display_name,
        species=workspace.species,
        analysis_profile=serialize_analysis_profile(workspace),
        active_stage=workspace.active_stage,
        created_at=isoformat(workspace.created_at),
        updated_at=isoformat(workspace.updated_at),
        ingestion=summarize_workspace_ingestion(workspace),
        files=[serialize_file(file) for file in ordered_files],
    )


def list_workspaces() -> list[WorkspaceResponse]:
    with session_scope() as session:
        workspaces = session.scalars(get_workspace_query()).all()
        ordered = sorted(
            workspaces,
            key=lambda item: isoformat(item.updated_at),
            reverse=True,
        )
        return [serialize_workspace(workspace) for workspace in ordered]


def load_workspace(workspace_id: str) -> WorkspaceResponse:
    with session_scope() as session:
        return serialize_workspace(get_workspace_record(session, workspace_id))


def create_workspace(request: WorkspaceCreateRequest) -> WorkspaceResponse:
    display_name = request.display_name.strip()
    if not display_name:
        raise ValueError("Workspace name cannot be empty")

    timestamp = utc_now()
    with session_scope() as session:
        workspace = WorkspaceRecord(
            id=str(uuid.uuid4()),
            display_name=display_name,
            species=request.species.value,
            assay_type=None,
            reference_preset=default_reference_preset_for_species(request.species.value).value,
            reference_override=None,
            active_stage=PipelineStageId.INGESTION.value,
            created_at=timestamp,
            updated_at=timestamp,
        )
        session.add(workspace)
        session.flush()
        session.refresh(workspace)
        return serialize_workspace(workspace)


def update_workspace_active_stage(
    workspace_id: str, request: ActiveStageUpdateRequest
) -> WorkspaceResponse:
    with session_scope() as session:
        workspace = get_workspace_record(session, workspace_id)
        workspace.active_stage = request.active_stage.value
        workspace.updated_at = utc_now()
        session.add(workspace)
        session.flush()
        return serialize_workspace(workspace)


def update_workspace_analysis_profile(
    workspace_id: str, request: WorkspaceAnalysisProfileUpdateRequest
) -> WorkspaceResponse:
    with session_scope() as session:
        workspace = get_workspace_record(session, workspace_id)
        workspace.assay_type = request.assay_type.value
        workspace.reference_preset = (
            request.reference_preset.value
            if request.reference_preset is not None
            else default_reference_preset_for_species(workspace.species).value
        )
        workspace.reference_override = request.reference_override or None
        workspace.updated_at = utc_now()
        session.add(workspace)
        session.flush()
        return serialize_workspace(workspace)


def register_local_lane_files(
    workspace_id: str,
    request: LocalFileRegistrationRequest,
) -> WorkspaceResponse:
    if not request.paths:
        raise ValueError("Pick at least one local sequencing file.")

    timestamp = utc_now()
    normalized_paths: list[Path] = []
    for raw_path in request.paths:
        candidate = Path(raw_path).expanduser()
        if not candidate.exists():
            raise ValueError(f"Local file does not exist: {candidate}")
        if not candidate.is_file():
            raise ValueError(f"Expected a file path, but got: {candidate}")
        normalized_paths.append(candidate.resolve())

    created_batch_id: Optional[str] = None
    with session_scope() as session:
        workspace = get_workspace_record(session, workspace_id)
        batch = IngestionBatchRecord(
            id=str(uuid.uuid4()),
            workspace_id=workspace.id,
            sample_lane=request.sample_lane.value,
            sample_stem=None,
            status=IngestionStatus.NORMALIZING.value,
            error=None,
            created_at=timestamp,
            updated_at=timestamp,
        )
        session.add(batch)
        workspace.batches.append(batch)

        for file_path in normalized_paths:
            filename = sanitize_filename(file_path.name)
            file_format = detect_format(filename)
            if file_format is None:
                raise ValueError(
                    f"Unsupported file type for {filename}. Accepted inputs are FASTQ, BAM, and CRAM."
                )
            size_bytes = file_path.stat().st_size
            if size_bytes <= 0:
                raise ValueError(f"{filename} is empty")

            source_record = WorkspaceFileRecord(
                id=str(uuid.uuid4()),
                workspace_id=workspace.id,
                batch_id=batch.id,
                source_file_id=None,
                sample_lane=request.sample_lane.value,
                filename=filename,
                format=file_format.value,
                file_role=WorkspaceFileRole.SOURCE.value,
                status=WorkspaceFileStatus.NORMALIZING.value,
                read_pair=infer_read_pair(filename).value,
                storage_key=str(file_path),
                source_path=str(file_path),
                local_path=None,
                size_bytes=size_bytes,
                uploaded_at=timestamp,
                error=None,
            )
            session.add(source_record)
            workspace.files.append(source_record)
            batch.files.append(source_record)

        validation = validate_lane_files(batch.files)
        if validation.blocking_issues:
            raise ValueError(" | ".join(validation.blocking_issues))

        batch.sample_stem = validation.sample_stem
        created_batch_id = batch.id
        workspace.updated_at = timestamp
        session.add(batch)
        session.add(workspace)
        session.flush()
        response = serialize_workspace(workspace)

    if created_batch_id is None:
        raise RuntimeError("Local file registration did not create a batch")
    enqueue_batch_normalization(workspace_id, created_batch_id)
    return response


def create_canonical_record(
    session,
    *,
    workspace: WorkspaceRecord,
    batch: IngestionBatchRecord,
    source_file_id: Optional[str],
    filename: str,
    read_pair: ReadPair,
    size_bytes: int,
    local_path: str,
) -> WorkspaceFileRecord:
    existing = session.scalar(
        select(WorkspaceFileRecord).where(
            WorkspaceFileRecord.batch_id == batch.id,
            WorkspaceFileRecord.file_role == WorkspaceFileRole.CANONICAL.value,
            WorkspaceFileRecord.sample_lane == batch.sample_lane,
            WorkspaceFileRecord.read_pair == read_pair.value,
        )
    )
    if existing is not None:
        existing.filename = filename
        existing.size_bytes = size_bytes
        existing.storage_key = local_path
        existing.local_path = local_path
        existing.source_path = None
        existing.status = WorkspaceFileStatus.READY.value
        existing.error = None
        existing.uploaded_at = utc_now()
        session.add(existing)
        return existing

    canonical = WorkspaceFileRecord(
        id=str(uuid.uuid4()),
        workspace_id=workspace.id,
        batch_id=batch.id,
        source_file_id=source_file_id,
        sample_lane=batch.sample_lane,
        filename=filename,
        format=WorkspaceFileFormat.FASTQ.value,
        file_role=WorkspaceFileRole.CANONICAL.value,
        status=WorkspaceFileStatus.READY.value,
        read_pair=read_pair.value,
        storage_key=local_path,
        source_path=None,
        local_path=local_path,
        size_bytes=size_bytes,
        uploaded_at=utc_now(),
        error=None,
    )
    session.add(canonical)
    batch.files.append(canonical)
    workspace.files.append(canonical)
    return canonical


def batch_status_from_files(batch: IngestionBatchRecord) -> IngestionStatus:
    source_files = [
        file
        for file in batch.files
        if file.file_role == WorkspaceFileRole.SOURCE.value
    ]
    canonical_files = [
        file
        for file in batch.files
        if file.file_role == WorkspaceFileRole.CANONICAL.value
    ]

    if not source_files and not canonical_files:
        return IngestionStatus.EMPTY
    if batch.error or any(file.status == WorkspaceFileStatus.FAILED.value for file in source_files):
        return IngestionStatus.FAILED

    ready_pairs = {
        ReadPair(file.read_pair)
        for file in canonical_files
        if file.status == WorkspaceFileStatus.READY.value
    }
    if ready_pairs >= {ReadPair.R1, ReadPair.R2}:
        return IngestionStatus.READY
    if any(file.status == WorkspaceFileStatus.NORMALIZING.value for file in source_files):
        return IngestionStatus.NORMALIZING
    return IngestionStatus.UPLOADED


def refresh_batch_status(batch: IngestionBatchRecord) -> None:
    batch.status = batch_status_from_files(batch).value
    batch.updated_at = utc_now()
    batch.workspace.updated_at = batch.updated_at


def mark_batch_failed(workspace_id: str, batch_id: str, error_message: str) -> None:
    with session_scope() as session:
        batch = get_batch_record(session, workspace_id, batch_id)
        batch.error = error_message
        batch.status = IngestionStatus.FAILED.value
        batch.updated_at = utc_now()
        batch.workspace.updated_at = batch.updated_at
        for file in batch.files:
            if file.file_role == WorkspaceFileRole.SOURCE.value:
                file.status = WorkspaceFileStatus.FAILED.value
                file.error = error_message
                session.add(file)
        session.add(batch)


def enqueue_batch_normalization(workspace_id: str, batch_id: str) -> None:
    from app.services import background

    try:
        background.submit(run_batch_normalization, workspace_id, batch_id)
    except Exception as error:
        mark_batch_failed(workspace_id, batch_id, f"Unable to queue normalization: {error}")


def reset_workspace_ingestion(workspace_id: str) -> WorkspaceResponse:
    managed_deletions: set[Path] = set()

    with session_scope() as session:
        workspace = get_workspace_record(session, workspace_id)

        for workspace_file in workspace.files:
            managed_path = record_managed_path(workspace_file)
            if managed_path is not None and is_path_within_app_data(managed_path):
                managed_deletions.add(managed_path)

        for pipeline_run in list(workspace.pipeline_runs):
            for artifact in pipeline_run.artifacts:
                artifact_path = Path(artifact.local_path or artifact.storage_key)
                if artifact_path.exists() and is_path_within_app_data(artifact_path):
                    managed_deletions.add(artifact_path)
            session.delete(pipeline_run)

        for batch in list(workspace.batches):
            session.delete(batch)

        workspace.active_stage = PipelineStageId.INGESTION.value
        workspace.assay_type = None
        workspace.reference_preset = default_reference_preset_for_species(workspace.species).value
        workspace.reference_override = None
        workspace.updated_at = utc_now()
        session.add(workspace)
        session.flush()
        session.expire(workspace, ["batches", "files"])
        response = serialize_workspace(get_workspace_record(session, workspace_id))

    for path in sorted(managed_deletions, reverse=True):
        try:
            if path.is_file():
                path.unlink(missing_ok=True)
            elif path.is_dir():
                shutil.rmtree(path, ignore_errors=True)
        except Exception:
            pass

    return response


def run_samtools_fastq(
    source_path: Path,
    r1_path: Path,
    r2_path: Path,
    se_path: Path,
    is_cram: bool,
) -> None:
    reference_path = os.getenv("SAMTOOLS_REFERENCE_FASTA")
    collated_path = source_path.parent / f"{source_path.name}.collated.bam"

    collate_command = [
        "samtools",
        "collate",
        "-u",
        "-o",
        str(collated_path),
    ]
    if is_cram and reference_path:
        collate_command.extend(["--reference", reference_path])
    collate_command.append(str(source_path))
    subprocess.run(collate_command, check=True, capture_output=True, text=True)

    command = [
        "samtools",
        "fastq",
        "-1",
        str(r1_path),
        "-2",
        str(r2_path),
        "-0",
        str(se_path),
        "-s",
        "/dev/null",
        "-n",
    ]

    command.append(str(collated_path))
    subprocess.run(command, check=True, capture_output=True, text=True)


def merge_fastq_lane(
    session,
    *,
    workspace: WorkspaceRecord,
    batch: IngestionBatchRecord,
    source_files: list[WorkspaceFileRecord],
    temp_dir: Path,
    read_layout: ReadLayout,
) -> None:
    if read_layout == ReadLayout.SINGLE:
        grouped_files: dict[ReadPair, list[WorkspaceFileRecord]] = {
            ReadPair.SE: sorted(source_files, key=lambda item: item.filename.lower()),
        }
    else:
        grouped_files = {
            ReadPair.R1: sorted(
                [file for file in source_files if ReadPair(file.read_pair) == ReadPair.R1],
                key=lambda item: item.filename.lower(),
            ),
            ReadPair.R2: sorted(
                [file for file in source_files if ReadPair(file.read_pair) == ReadPair.R2],
                key=lambda item: item.filename.lower(),
            ),
        }

    for read_pair, read_pair_files in grouped_files.items():
        if not read_pair_files:
            continue
        canonical_filename = build_canonical_filename(SampleLane(batch.sample_lane), read_pair)
        canonical_path = temp_dir / canonical_filename
        with gzip.open(canonical_path, "wb") as destination_handle:
            for source_file in read_pair_files:
                source_path = workspace_file_access_path(source_file)
                open_source = gzip.open if is_compressed_fastq(source_file.filename) else open
                with open_source(source_path, "rb") as source_handle:
                    shutil.copyfileobj(source_handle, destination_handle)

        final_path = canonical_destination_path(workspace.id, batch.id, canonical_filename)
        final_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(canonical_path, final_path)
        create_canonical_record(
            session,
            workspace=workspace,
            batch=batch,
            source_file_id=read_pair_files[0].id,
            filename=canonical_filename,
            read_pair=read_pair,
            size_bytes=final_path.stat().st_size,
            local_path=str(final_path),
        )

    for source_file in source_files:
        source_file.status = WorkspaceFileStatus.READY.value
        source_file.error = None
        session.add(source_file)


def normalize_alignment_container(
    session,
    *,
    workspace: WorkspaceRecord,
    batch: IngestionBatchRecord,
    source_file: WorkspaceFileRecord,
    temp_dir: Path,
) -> None:
    source_path = workspace_file_access_path(source_file)

    r1_fastq_path = temp_dir / f"{source_file.id}-R1.fastq"
    r2_fastq_path = temp_dir / f"{source_file.id}-R2.fastq"
    se_fastq_path = temp_dir / f"{source_file.id}-SE.fastq"
    run_samtools_fastq(
        source_path,
        r1_fastq_path,
        r2_fastq_path,
        se_fastq_path,
        is_cram=source_file.format == WorkspaceFileFormat.CRAM.value,
    )

    def non_empty(path: Path) -> bool:
        return path.exists() and path.stat().st_size > 0

    r1_ok = non_empty(r1_fastq_path)
    r2_ok = non_empty(r2_fastq_path)
    se_ok = non_empty(se_fastq_path)

    if r1_ok and r2_ok:
        outputs: list[tuple[ReadPair, Path]] = [
            (ReadPair.R1, r1_fastq_path),
            (ReadPair.R2, r2_fastq_path),
        ]
    else:
        raise RuntimeError(ALIGNMENT_CONTAINER_PAIRED_OUTPUT_ISSUE)

    for read_pair, plain_path in outputs:
        canonical_filename = build_canonical_filename(SampleLane(batch.sample_lane), read_pair)
        canonical_path = temp_dir / canonical_filename
        with plain_path.open("rb") as source_handle, gzip.open(canonical_path, "wb") as destination_handle:
            shutil.copyfileobj(source_handle, destination_handle)
        final_path = canonical_destination_path(workspace.id, batch.id, canonical_filename)
        final_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(canonical_path, final_path)
        create_canonical_record(
            session,
            workspace=workspace,
            batch=batch,
            source_file_id=source_file.id,
            filename=canonical_filename,
            read_pair=read_pair,
            size_bytes=final_path.stat().st_size,
            local_path=str(final_path),
        )

    source_file.status = WorkspaceFileStatus.READY.value
    source_file.error = None
    session.add(source_file)


def run_batch_normalization(workspace_id: str, batch_id: str) -> WorkspaceResponse:
    try:
        with session_scope() as session:
            batch = get_batch_record(session, workspace_id, batch_id)
            workspace = batch.workspace
            batch.error = None
            batch.status = IngestionStatus.NORMALIZING.value
            batch.updated_at = utc_now()
            workspace.updated_at = batch.updated_at
            session.add(batch)

            source_files = [
                file for file in batch.files if file.file_role == WorkspaceFileRole.SOURCE.value
            ]

            validation = validate_lane_files(source_files)
            if validation.blocking_issues:
                raise RuntimeError(" | ".join(validation.blocking_issues))

            with tempfile.TemporaryDirectory(prefix=f"workspace-batch-{batch.id}-") as temp_dir_name:
                temp_dir = Path(temp_dir_name)
                if validation.file_format == WorkspaceFileFormat.FASTQ:
                    merge_fastq_lane(
                        session,
                        workspace=workspace,
                        batch=batch,
                        source_files=source_files,
                        temp_dir=temp_dir,
                        read_layout=validation.read_layout or ReadLayout.PAIRED,
                    )
                elif validation.file_format in {WorkspaceFileFormat.BAM, WorkspaceFileFormat.CRAM}:
                    normalize_alignment_container(
                        session,
                        workspace=workspace,
                        batch=batch,
                        source_file=source_files[0],
                        temp_dir=temp_dir,
                    )
                else:
                    raise RuntimeError("Unsupported lane format")

            refresh_batch_status(batch)
            session.add(batch)
            session.flush()
            return serialize_workspace(workspace)
    except Exception as error:
        mark_batch_failed(workspace_id, batch_id, str(error))
        raise


