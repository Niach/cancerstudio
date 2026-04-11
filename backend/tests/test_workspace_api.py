import gzip
from pathlib import Path

import httpx
import pytest
from sqlalchemy import delete

from app.db import init_db, session_scope
from app.main import app
from app.models.records import (
    IngestionBatchRecord,
    PipelineArtifactRecord,
    PipelineRunRecord,
    WorkspaceFileRecord,
    WorkspaceRecord,
)
from app.services import alignment as alignment_service
from app.services import workspace_store
from app.models.schemas import AlignmentArtifactKind, AlignmentLaneMetricsResponse, SampleLane


def write_gz_fastq(path: Path, header: str, sequence: str) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(path, "wt", encoding="utf-8") as handle:
        handle.write(f"@{header}\n{sequence}\n+\n{'!' * len(sequence)}\n")
    return path


@pytest.fixture(autouse=True)
def clean_database():
    init_db()
    with session_scope() as session:
        session.execute(delete(PipelineArtifactRecord))
        session.execute(delete(PipelineRunRecord))
        session.execute(delete(WorkspaceFileRecord))
        session.execute(delete(IngestionBatchRecord))
        session.execute(delete(WorkspaceRecord))
    yield
    with session_scope() as session:
        session.execute(delete(PipelineArtifactRecord))
        session.execute(delete(PipelineRunRecord))
        session.execute(delete(WorkspaceFileRecord))
        session.execute(delete(IngestionBatchRecord))
        session.execute(delete(WorkspaceRecord))


@pytest.fixture
def queued_batches(monkeypatch: pytest.MonkeyPatch) -> list[tuple[str, str]]:
    batches: list[tuple[str, str]] = []
    monkeypatch.setattr(
        workspace_store,
        "enqueue_batch_normalization",
        lambda workspace_id, batch_id: batches.append((workspace_id, batch_id)),
    )
    return batches


@pytest.fixture
def queued_alignment_runs(monkeypatch: pytest.MonkeyPatch) -> list[tuple[str, str]]:
    runs: list[tuple[str, str]] = []
    monkeypatch.setattr(
        alignment_service,
        "enqueue_alignment_run",
        lambda workspace_id, run_id: runs.append((workspace_id, run_id)),
    )
    return runs


@pytest.fixture
async def client():
    async with app.router.lifespan_context(app):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://testserver",
            follow_redirects=True,
        ) as test_client:
            yield test_client


async def create_workspace(
    client: httpx.AsyncClient,
    *,
    name: str = "Rosie",
    species: str = "human",
) -> dict:
    response = await client.post(
        "/api/workspaces",
        json={"display_name": name, "species": species},
    )
    assert response.status_code == 201, response.text
    return response.json()


async def register_lane_paths(
    client: httpx.AsyncClient,
    workspace_id: str,
    sample_lane: str,
    paths: list[Path],
) -> dict:
    response = await client.post(
        f"/api/workspaces/{workspace_id}/ingestion/local-files",
        json={"sample_lane": sample_lane, "paths": [str(path) for path in paths]},
    )
    assert response.status_code == 200, response.text
    return response.json()


def run_next_normalization(
    queued_batches: list[tuple[str, str]],
) -> dict:
    workspace_id, batch_id = queued_batches.pop(0)
    return workspace_store.run_batch_normalization(
        workspace_id, batch_id
    ).model_dump(mode="json")


@pytest.mark.anyio
async def test_rejects_whitespace_only_workspace_names(client: httpx.AsyncClient):
    response = await client.post(
        "/api/workspaces",
        json={"display_name": "   ", "species": "dog"},
    )

    assert response.status_code == 400
    assert "cannot be empty" in response.text


@pytest.mark.anyio
async def test_local_file_registration_requires_real_paths(client: httpx.AsyncClient):
    workspace = await create_workspace(client)
    missing_path = Path("/tmp/this-file-does-not-exist.fastq.gz")

    response = await client.post(
        f"/api/workspaces/{workspace['id']}/ingestion/local-files",
        json={"sample_lane": "tumor", "paths": [str(missing_path)]},
    )

    assert response.status_code == 400
    assert "does not exist" in response.text


@pytest.mark.anyio
async def test_local_ingestion_reaches_alignment_ready(
    client: httpx.AsyncClient,
    queued_batches: list[tuple[str, str]],
    tmp_path: Path,
):
    workspace = await create_workspace(client)
    tumor_paths = [
      write_gz_fastq(tmp_path / "tumor_R1.fastq.gz", "tumor-r1", "ACGT"),
      write_gz_fastq(tmp_path / "tumor_R2.fastq.gz", "tumor-r2", "TGCA"),
    ]
    normal_paths = [
      write_gz_fastq(tmp_path / "normal_R1.fastq.gz", "normal-r1", "CCCC"),
      write_gz_fastq(tmp_path / "normal_R2.fastq.gz", "normal-r2", "GGGG"),
    ]

    pending = await register_lane_paths(client, workspace["id"], "tumor", tumor_paths)
    assert pending["ingestion"]["lanes"]["tumor"]["status"] == "normalizing"
    assert pending["ingestion"]["ready_for_alignment"] is False

    tumor_ready = run_next_normalization(queued_batches)
    assert tumor_ready["ingestion"]["lanes"]["tumor"]["status"] == "ready"
    assert tumor_ready["ingestion"]["ready_for_alignment"] is False

    await register_lane_paths(client, workspace["id"], "normal", normal_paths)
    ready = run_next_normalization(queued_batches)

    assert ready["ingestion"]["ready_for_alignment"] is True
    assert ready["ingestion"]["lanes"]["tumor"]["status"] == "ready"
    assert ready["ingestion"]["lanes"]["normal"]["status"] == "ready"

    source_files = [file for file in ready["files"] if file["file_role"] == "source"]
    canonical_files = [file for file in ready["files"] if file["file_role"] == "canonical"]
    assert all(file["source_path"] for file in source_files)
    assert all(file["managed_path"] for file in canonical_files)


@pytest.mark.anyio
async def test_alignment_run_persists_local_artifacts_and_unlocks_variant_stage(
    client: httpx.AsyncClient,
    queued_batches: list[tuple[str, str]],
    queued_alignment_runs: list[tuple[str, str]],
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
):
    workspace = await create_workspace(client)
    for lane in ("tumor", "normal"):
        await register_lane_paths(
            client,
            workspace["id"],
            lane,
            [
                write_gz_fastq(tmp_path / f"{lane}_R1.fastq.gz", f"{lane}-r1", "ACGT"),
                write_gz_fastq(tmp_path / f"{lane}_R2.fastq.gz", f"{lane}-r2", "TGCA"),
            ],
        )
        run_next_normalization(queued_batches)

    update_profile = await client.patch(
        f"/api/workspaces/{workspace['id']}/analysis-profile",
        json={"assay_type": "wgs"},
    )
    assert update_profile.status_code == 200, update_profile.text

    reference_path = tmp_path / "grch38.fa"
    reference_path.write_text(">chr1\nACGTACGTACGT\n", encoding="utf-8")
    monkeypatch.setattr(
        alignment_service,
        "ensure_reference_ready",
        lambda reference: reference_path,
    )

    def fake_execute_alignment_lane(
        *,
        workspace_display_name: str,
        workspace_id: str,
        sample_lane: SampleLane,
        reference_path: Path,
        r1_path: Path,
        r2_path: Path,
        working_dir: Path,
    ):
        bam_path = working_dir / f"{sample_lane.value}.aligned.bam"
        bai_path = working_dir / f"{sample_lane.value}.aligned.bam.bai"
        flagstat_path = working_dir / f"{sample_lane.value}.flagstat.txt"
        idxstats_path = working_dir / f"{sample_lane.value}.idxstats.txt"
        stats_path = working_dir / f"{sample_lane.value}.stats.txt"
        bam_path.write_text("bam", encoding="utf-8")
        bai_path.write_text("bai", encoding="utf-8")
        flagstat_path.write_text(
            "100 + 0 in total (QC-passed reads + QC-failed reads)\n"
            "95 + 0 mapped (95.00% : N/A)\n"
            "88 + 0 properly paired (88.00% : N/A)\n",
            encoding="utf-8",
        )
        idxstats_path.write_text("chr1\t12\t95\t0\n", encoding="utf-8")
        stats_path.write_text(
            "SN\traw total sequences:\t100\n"
            "SN\treads duplicated:\t20\n"
            "SN\tinsert size average:\t320\n",
            encoding="utf-8",
        )
        return alignment_service.LaneExecutionOutput(
            sample_lane=sample_lane,
            metrics=AlignmentLaneMetricsResponse(
                sample_lane=sample_lane,
                total_reads=100,
                mapped_reads=95,
                mapped_percent=95.0,
                properly_paired_percent=88.0,
                duplicate_percent=20.0,
                mean_insert_size=320.0,
            ),
            artifact_paths={
                AlignmentArtifactKind.BAM: bam_path,
                AlignmentArtifactKind.BAI: bai_path,
                AlignmentArtifactKind.FLAGSTAT: flagstat_path,
                AlignmentArtifactKind.IDXSTATS: idxstats_path,
                AlignmentArtifactKind.STATS: stats_path,
            },
            command_log=[f"fake align {sample_lane.value}"],
        )

    monkeypatch.setattr(
        alignment_service,
        "execute_alignment_lane",
        fake_execute_alignment_lane,
    )

    summary_response = await client.post(
        f"/api/workspaces/{workspace['id']}/alignment/run"
    )
    assert summary_response.status_code == 200, summary_response.text
    assert queued_alignment_runs

    queued_workspace_id, run_id = queued_alignment_runs.pop(0)
    alignment_service.run_alignment(queued_workspace_id, run_id)

    completed_response = await client.get(f"/api/workspaces/{workspace['id']}/alignment")
    assert completed_response.status_code == 200, completed_response.text
    completed = completed_response.json()

    assert completed["status"] == "completed"
    assert completed["ready_for_variant_calling"] is True
    assert len(completed["artifacts"]) == 10

    bam_artifact = next(
        artifact
        for artifact in completed["artifacts"]
        if artifact["artifact_kind"] == "bam" and artifact["sample_lane"] == "tumor"
    )
    download_response = await client.get(bam_artifact["download_path"])
    assert download_response.status_code == 200
    assert download_response.text == "bam"


@pytest.mark.anyio
async def test_reset_removes_managed_outputs_but_keeps_source_files(
    client: httpx.AsyncClient,
    queued_batches: list[tuple[str, str]],
    tmp_path: Path,
):
    workspace = await create_workspace(client)
    source_paths = [
        write_gz_fastq(tmp_path / "tumor_R1.fastq.gz", "tumor-r1", "AAAA"),
        write_gz_fastq(tmp_path / "tumor_R2.fastq.gz", "tumor-r2", "CCCC"),
    ]
    await register_lane_paths(client, workspace["id"], "tumor", source_paths)
    normalized = run_next_normalization(queued_batches)
    managed_paths = [
        Path(file["managed_path"])
        for file in normalized["files"]
        if file["managed_path"]
    ]
    assert managed_paths and all(path.exists() for path in managed_paths)

    reset_response = await client.delete(f"/api/workspaces/{workspace['id']}/ingestion")
    assert reset_response.status_code == 200, reset_response.text

    assert all(path.exists() for path in source_paths)
    assert all(not path.exists() for path in managed_paths)
