import logging
from contextvars import ContextVar
from typing import Optional

# Context variable holding the active session ID for distributed log correlation
session_id_ctx: ContextVar[str] = ContextVar("session_id", default="-")

class SessionIdFilter(logging.Filter):
    """Injects current sessionId from context into every LogRecord."""
    def filter(self, record: logging.LogRecord) -> bool:
        record.sessionId = session_id_ctx.get()
        return True

def setup_logging(level: int = logging.INFO):
    """Configures structured, correlated logging for the Python microservice."""
    formatter = logging.Formatter(
        "%(asctime)s [%(levelname)s] [sessionId=%(sessionId)s] [%(name)s]: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    )
    handler = logging.StreamHandler()
    handler.setFormatter(formatter)
    handler.addFilter(SessionIdFilter())

    root_logger = logging.getLogger()
    root_logger.setLevel(level)
    root_logger.handlers.clear()
    root_logger.addHandler(handler)

def set_session_context(session_id: Optional[str]):
    """Sets the active session ID in context for all subsequent logs."""
    session_id_ctx.set(session_id or "-")

def get_session_context() -> str:
    return session_id_ctx.get()
