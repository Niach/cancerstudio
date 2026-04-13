from fastapi import APIRouter

from app.services.tool_preflight import (
    STROBEALIGN_INDEX_MEMORY_BYTES,
    read_available_memory_bytes,
    read_total_memory_bytes,
)

router = APIRouter(prefix="/api/system", tags=["system"])


@router.get("/memory")
async def get_system_memory() -> dict[str, int | None]:
    return {
        "available_bytes": read_available_memory_bytes(),
        "total_bytes": read_total_memory_bytes(),
        "threshold_bytes": STROBEALIGN_INDEX_MEMORY_BYTES,
    }
