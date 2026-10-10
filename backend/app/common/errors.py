"""Error API dengan bentuk { "error": { code, message, fields? } } (sama dengan MockServer)."""

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str, fields: dict[str, str] | None = None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.fields = {k: v for k, v in (fields or {}).items() if v} or None


def fail(status: int, code: str, message: str, fields: dict[str, str] | None = None) -> ApiError:
    return ApiError(status, code, message, fields)


def not_found(what: str = "Resource") -> ApiError:
    return ApiError(404, "NOT_FOUND", f"{what} not found.")


def forbidden(message: str = "You do not have permission to do this.") -> ApiError:
    return ApiError(403, "FORBIDDEN", message)


def conflict(code: str, message: str, fields: dict[str, str] | None = None) -> ApiError:
    return ApiError(409, code, message, fields)


def assert_valid(fields: dict[str, str], message: str = "Please fix the highlighted fields.") -> None:
    """Lempar 400 VALIDATION bila ada pesan error pada salah satu field."""
    errors = {k: v for k, v in fields.items() if v}
    if errors:
        raise ApiError(400, "VALIDATION", message, errors)


def _body(code: str, message: str, fields: dict[str, str] | None = None) -> dict:
    error: dict = {"code": code, "message": message}
    if fields:
        error["fields"] = fields
    return {"error": error}


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def api_error(_: Request, exc: ApiError):
        return JSONResponse(status_code=exc.status, content=_body(exc.code, exc.message, exc.fields))

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, exc: RequestValidationError):
        fields: dict[str, str] = {}
        for err in exc.errors():
            loc = [str(p) for p in err.get("loc", ()) if p not in ("body", "query", "path")]
            fields.setdefault(".".join(loc) or "body", err.get("msg", "Invalid value."))
        return JSONResponse(
            status_code=400, content=_body("VALIDATION", "Please fix the highlighted fields.", fields)
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_error(_: Request, exc: StarletteHTTPException):
        codes = {401: "UNAUTHENTICATED", 403: "FORBIDDEN", 404: "NOT_FOUND", 405: "METHOD_NOT_ALLOWED"}
        return JSONResponse(
            status_code=exc.status_code,
            content=_body(codes.get(exc.status_code, f"HTTP_{exc.status_code}"), str(exc.detail)),
            headers=getattr(exc, "headers", None),
        )
