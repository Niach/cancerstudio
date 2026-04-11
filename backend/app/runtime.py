import os
import sys
from pathlib import Path


APP_NAME = "cancerstudio"


def _default_app_data_root() -> Path:
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / APP_NAME
    if sys.platform.startswith("win"):
        appdata = os.getenv("APPDATA")
        if appdata:
            return Path(appdata) / APP_NAME
    xdg_data_home = os.getenv("XDG_DATA_HOME")
    if xdg_data_home:
        return Path(xdg_data_home) / APP_NAME
    return Path.home() / ".local" / "share" / APP_NAME


def get_app_data_root() -> Path:
    configured = (
        os.getenv("CANCERSTUDIO_APP_DATA_DIR")
        or os.getenv("APP_DATA_ROOT")
        or os.getenv("LOCAL_APP_DATA_DIR")
    )
    root = Path(configured).expanduser() if configured else _default_app_data_root()
    root.mkdir(parents=True, exist_ok=True)
    return root.resolve()


def get_workspace_root(workspace_id: str) -> Path:
    root = get_app_data_root() / "workspaces" / workspace_id
    root.mkdir(parents=True, exist_ok=True)
    return root


def get_batch_root(workspace_id: str, batch_id: str) -> Path:
    root = get_workspace_root(workspace_id) / "batches" / batch_id
    root.mkdir(parents=True, exist_ok=True)
    return root


def get_batch_canonical_root(workspace_id: str, batch_id: str) -> Path:
    root = get_batch_root(workspace_id, batch_id) / "canonical"
    root.mkdir(parents=True, exist_ok=True)
    return root


def get_alignment_run_root(workspace_id: str, run_id: str) -> Path:
    root = get_workspace_root(workspace_id) / "alignment" / run_id
    root.mkdir(parents=True, exist_ok=True)
    return root


def get_reference_bundle_root() -> Path:
    configured = os.getenv("REFERENCE_BUNDLE_ROOT")
    root = Path(configured).expanduser() if configured else get_app_data_root() / "references"
    root.mkdir(parents=True, exist_ok=True)
    return root.resolve()


def get_local_sqlite_path() -> Path:
    configured = os.getenv("LOCAL_SQLITE_PATH")
    if configured:
        path = Path(configured).expanduser()
        if not path.is_absolute():
            path = (Path.cwd() / path).resolve()
    else:
        path = get_app_data_root() / "app.db"

    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def is_path_within_app_data(path: Path) -> bool:
    try:
        path.resolve().relative_to(get_app_data_root())
        return True
    except ValueError:
        return False
