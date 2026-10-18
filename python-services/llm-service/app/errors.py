"""Exception handling shared by all routes.

Expected failures are handled inside the routes (stub fallbacks, explicit
``HTTPException``s). This handler only covers genuinely unexpected errors so
they come back as a JSON ``{"detail": ...}`` 500 instead of a bare text body.
"""
import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)


def register_exception_handlers(app: FastAPI) -> None:
    """Attach the catch-all 500 handler to ``app``."""

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        logger.error("Unhandled error on %s %s: %r", request.method, request.url.path, exc)
        return JSONResponse(
            status_code=500,
            content={"detail": f"Internal server error ({type(exc).__name__}) while handling {request.url.path}"},
        )
