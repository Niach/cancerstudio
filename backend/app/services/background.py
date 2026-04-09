import logging
from concurrent.futures import ThreadPoolExecutor

logger = logging.getLogger(__name__)

_pool = ThreadPoolExecutor(max_workers=2)


def submit(fn, *args):
    future = _pool.submit(fn, *args)
    future.add_done_callback(_log_exception)
    return future


def _log_exception(future):
    exc = future.exception()
    if exc is not None:
        logger.exception("Background task failed", exc_info=exc)


def shutdown():
    _pool.shutdown(wait=True)
