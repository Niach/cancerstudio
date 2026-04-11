from contextlib import contextmanager
from pathlib import Path

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.runtime import get_local_sqlite_path as get_runtime_sqlite_path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent


class Base(DeclarativeBase):
    pass


def get_local_sqlite_path() -> Path:
    return get_runtime_sqlite_path()


def get_database_url() -> str:
    sqlite_path = get_local_sqlite_path()
    sqlite_path.parent.mkdir(parents=True, exist_ok=True)
    return f"sqlite:///{sqlite_path}"


def _create_engine():
    database_url = get_database_url()
    connect_args = {"check_same_thread": False} if database_url.startswith("sqlite") else {}
    return create_engine(
        database_url,
        future=True,
        pool_pre_ping=True,
        connect_args=connect_args,
    )


engine = _create_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


@contextmanager
def session_scope():
    session: Session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def init_db() -> None:
    from app.models.records import (
        IngestionBatchRecord,
        PipelineArtifactRecord,
        PipelineRunRecord,
        WorkspaceFileRecord,
        WorkspaceRecord,
    )

    _ = (
        WorkspaceRecord,
        IngestionBatchRecord,
        WorkspaceFileRecord,
        PipelineRunRecord,
        PipelineArtifactRecord,
    )
    Base.metadata.create_all(bind=engine)
    _ensure_schema_updates()


def _ensure_schema_updates() -> None:
    inspector = inspect(engine)

    _ensure_column(
        inspector,
        "ingestion_batches",
        "sample_lane",
        "VARCHAR(16) NOT NULL DEFAULT 'tumor'",
    )
    _ensure_column(
        inspector,
        "ingestion_batches",
        "sample_stem",
        "VARCHAR(255)",
    )
    _ensure_column(
        inspector,
        "workspace_files",
        "sample_lane",
        "VARCHAR(16) NOT NULL DEFAULT 'tumor'",
    )
    _ensure_column(
        inspector,
        "workspaces",
        "assay_type",
        "VARCHAR(16)",
    )
    _ensure_column(
        inspector,
        "workspaces",
        "reference_preset",
        "VARCHAR(32)",
    )
    _ensure_column(
        inspector,
        "workspaces",
        "reference_override",
        "VARCHAR(1024)",
    )
    _ensure_column(
        inspector,
        "workspace_files",
        "source_path",
        "VARCHAR(4096)",
    )
    _ensure_column(
        inspector,
        "workspace_files",
        "local_path",
        "VARCHAR(4096)",
    )
    _ensure_column(
        inspector,
        "pipeline_artifacts",
        "local_path",
        "VARCHAR(4096)",
    )
    _ensure_column(
        inspector,
        "pipeline_runs",
        "runtime_phase",
        "VARCHAR(64)",
    )


def _ensure_column(inspector, table_name: str, column_name: str, definition: str) -> None:
    if table_name not in inspector.get_table_names():
        return

    existing_columns = {column["name"] for column in inspector.get_columns(table_name)}
    if column_name in existing_columns:
        return

    with engine.begin() as connection:
        connection.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {definition}"))
