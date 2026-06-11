from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.testclient import TestClient

from app.api.v1.auth import _set_refresh_cookie
from app.core.config import settings


def test_default_cors_origins_include_production_render_frontend():
    assert "https://spinflow-f.onrender.com" in settings.parsed_cors_origins
    assert "https://spinflow.onrender.com" in settings.parsed_cors_origins


def test_render_frontend_preflight_is_allowed_by_default_config():
    app = FastAPI()
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.parsed_cors_origins,
        allow_origin_regex=settings.CORS_ORIGIN_REGEX,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.post("/api/v1/auth/login")
    async def login():
        return {"ok": True}

    client = TestClient(app)
    response = client.options(
        "/api/v1/auth/login",
        headers={
            "Origin": "https://spinflow-f.onrender.com",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type,authorization",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "https://spinflow-f.onrender.com"
    assert response.headers["access-control-allow-credentials"] == "true"
    assert "POST" in response.headers["access-control-allow-methods"]
    assert "content-type" in response.headers["access-control-allow-headers"].lower()
    assert "authorization" in response.headers["access-control-allow-headers"].lower()


def test_refresh_cookie_is_cross_site_compatible_outside_debug():
    saved_debug = settings.DEBUG
    saved_samesite = settings.REFRESH_COOKIE_SAMESITE
    settings.DEBUG = False
    settings.REFRESH_COOKIE_SAMESITE = ""
    try:
        response = Response()
        _set_refresh_cookie(response, "refresh-token")
        cookie = response.headers["set-cookie"]
    finally:
        settings.DEBUG = saved_debug
        settings.REFRESH_COOKIE_SAMESITE = saved_samesite

    assert "HttpOnly" in cookie
    assert "Secure" in cookie
    assert "SameSite=none" in cookie
    assert "Path=/api/v1/auth/refresh" in cookie


def test_refresh_cookie_uses_lax_for_debug_http_development():
    saved_debug = settings.DEBUG
    saved_samesite = settings.REFRESH_COOKIE_SAMESITE
    settings.DEBUG = True
    settings.REFRESH_COOKIE_SAMESITE = ""
    try:
        response = Response()
        _set_refresh_cookie(response, "refresh-token")
        cookie = response.headers["set-cookie"]
    finally:
        settings.DEBUG = saved_debug
        settings.REFRESH_COOKIE_SAMESITE = saved_samesite

    assert "SameSite=lax" in cookie
    assert "Secure" not in cookie
