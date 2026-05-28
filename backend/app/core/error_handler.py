import enum
import logging
import re
from typing import Any, Optional, List, Dict
from datetime import datetime, timezone

from fastapi import FastAPI, Request, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

logger = logging.getLogger("spinflow")


_ALLOWED_ORIGINS_CACHE: Optional[List[str]] = None
_ALLOWED_ORIGIN_REGEX_CACHE: Optional[re.Pattern] = None


def _is_origin_allowed(origin: str) -> bool:
    global _ALLOWED_ORIGINS_CACHE, _ALLOWED_ORIGIN_REGEX_CACHE
    from app.core.config import settings
    if _ALLOWED_ORIGINS_CACHE is None:
        _ALLOWED_ORIGINS_CACHE = settings.parsed_cors_origins
    if _ALLOWED_ORIGIN_REGEX_CACHE is None:
        raw = getattr(settings, "CORS_ORIGIN_REGEX", None)
        if raw:
            _ALLOWED_ORIGIN_REGEX_CACHE = re.compile(raw)
    if origin in _ALLOWED_ORIGINS_CACHE:
        return True
    if _ALLOWED_ORIGIN_REGEX_CACHE and _ALLOWED_ORIGIN_REGEX_CACHE.fullmatch(origin):
        return True
    return False


def _cors_headers(request: Request) -> dict:
    origin = request.headers.get("origin")
    if origin and _is_origin_allowed(origin):
        return {"Access-Control-Allow-Origin": origin, "Vary": "Origin"}
    return {}


class ErrorCode(str, enum.Enum):
    # Auth
    INVALID_CREDENTIALS = "INVALID_CREDENTIALS"
    ACCOUNT_LOCKED = "ACCOUNT_LOCKED"
    TOKEN_EXPIRED = "TOKEN_EXPIRED"
    TOKEN_INVALID = "TOKEN_INVALID"
    INSUFFICIENT_PERMISSIONS = "INSUFFICIENT_PERMISSIONS"
    OTP_INVALID = "OTP_INVALID"
    OTP_EXPIRED = "OTP_EXPIRED"

    # Validation
    VALIDATION_ERROR = "VALIDATION_ERROR"
    MISSING_FIELD = "MISSING_FIELD"
    INVALID_VALUE = "INVALID_VALUE"

    # Resources
    NOT_FOUND = "NOT_FOUND"
    ALREADY_EXISTS = "ALREADY_EXISTS"
    CONFLICT = "CONFLICT"

    # Business rules
    MACHINE_IN_BREAKDOWN = "MACHINE_IN_BREAKDOWN"
    DUPLICATE_ENTRY = "DUPLICATE_ENTRY"
    INSUFFICIENT_STOCK = "INSUFFICIENT_STOCK"
    INVALID_STATE_TRANSITION = "INVALID_STATE_TRANSITION"
    QUALITY_NOT_APPROVED = "QUALITY_NOT_APPROVED"
    EWAY_BILL_REQUIRED = "EWAY_BILL_REQUIRED"
    QR_SIGNATURE_INVALID = "QR_SIGNATURE_INVALID"
    QR_EXPIRED = "QR_EXPIRED"

    # System
    INTERNAL_ERROR = "INTERNAL_ERROR"
    DATABASE_ERROR = "DATABASE_ERROR"
    EMAIL_ERROR = "EMAIL_ERROR"
    RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED"


class SpinFlowException(Exception):
    def __init__(
        self,
        status_code: int,
        code: ErrorCode,
        message: str,
        detail: Any = None,
    ):
        self.status_code = status_code
        self.code = code
        self.message = message
        self.detail = detail
        super().__init__(message)

    @classmethod
    def not_found(cls, entity: str) -> "SpinFlowException":
        return cls(
            status_code=404,
            code=ErrorCode.NOT_FOUND,
            message=f"{entity} not found",
        )

    @classmethod
    def conflict(cls, message: str, code: ErrorCode = ErrorCode.CONFLICT) -> "SpinFlowException":
        return cls(
            status_code=409,
            code=code,
            message=message,
        )

    @classmethod
    def bad_request(cls, message: str, code: ErrorCode = ErrorCode.INVALID_VALUE) -> "SpinFlowException":
        return cls(
            status_code=400,
            code=code,
            message=message,
        )

    @classmethod
    def forbidden(cls, message: str) -> "SpinFlowException":
        return cls(
            status_code=403,
            code=ErrorCode.INSUFFICIENT_PERMISSIONS,
            message=message,
        )


def _build_error_response(
    request: Request,
    code: str,
    message: str,
    detail: Any = None,
    status_code: int = 500,
) -> JSONResponse:
    headers = _cors_headers(request)
    return JSONResponse(
        status_code=status_code,
        content={
            "error": True,
            "code": code,
            "message": message,
            "detail": detail,
            "path": request.url.path,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
        headers=headers,
    )


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(SpinFlowException)
    async def spinflow_exception_handler(request: Request, exc: SpinFlowException):
        return _build_error_response(
            request=request,
            code=exc.code.value,
            message=exc.message,
            detail=exc.detail,
            status_code=exc.status_code,
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        details: List[Dict[str, str]] = []
        missing_fields: List[str] = []
        for err in exc.errors():
            field = ".".join(str(loc) for loc in err.get("loc", []))
            msg = err.get("msg", "")
            err_type = err.get("type", "")
            if err_type == "missing":
                missing_fields.append(field)
            else:
                details.append({"field": field, "message": msg})
        message = "Request validation failed"
        if missing_fields:
            fields_str = ", ".join(missing_fields)
            message = f"field(s) {fields_str} is required"
        return _build_error_response(
            request=request,
            code="VALIDATION_ERROR",
            message=message,
            detail=details if details else None,
            status_code=422,
        )

    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException):
        status_map = {
            401: ErrorCode.TOKEN_INVALID,
            403: ErrorCode.INSUFFICIENT_PERMISSIONS,
            404: ErrorCode.NOT_FOUND,
            409: ErrorCode.CONFLICT,
            429: ErrorCode.RATE_LIMIT_EXCEEDED,
        }
        code = status_map.get(exc.status_code, ErrorCode.INVALID_VALUE)
        return _build_error_response(
            request=request,
            code=code.value,
            message=str(exc.detail) if exc.detail else "HTTP error",
            detail=None,
            status_code=exc.status_code,
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        logger.exception("Unhandled exception")
        from app.core.config import settings
        return _build_error_response(
            request=request,
            code="INTERNAL_ERROR",
            message="An unexpected error occurred",
            detail=str(exc) if settings.DEBUG else None,
            status_code=500,
        )
