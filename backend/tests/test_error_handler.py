from datetime import datetime
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from pydantic import BaseModel

from app.core.error_handler import SpinFlowException, ErrorCode, register_error_handlers
from app.core.config import settings


app = FastAPI()
register_error_handlers(app)


@app.get("/not-found")
async def not_found():
    raise SpinFlowException.not_found("Machine")


@app.get("/conflict")
async def conflict():
    raise SpinFlowException.conflict("Already exists", ErrorCode.DUPLICATE_ENTRY)


@app.get("/bad-request")
async def bad_request():
    raise SpinFlowException.bad_request("Invalid value")


@app.get("/http-404")
async def http_404():
    raise HTTPException(status_code=404, detail="not found")


@app.get("/http-422")
async def http_422():
    raise HTTPException(status_code=422)


class TestBody(BaseModel):
    name: str


@app.post("/validation")
async def validation(body: TestBody):
    return body


@app.get("/crash")
async def crash():
    raise RuntimeError("unexpected")


client = TestClient(app, raise_server_exceptions=False)


class TestErrorHandler:
    def _check_standard_shape(self, body: dict):
        assert "error" in body
        assert "code" in body
        assert "message" in body
        assert "detail" in body or body.get("detail") is None
        assert "path" in body
        assert "timestamp" in body

    def _assert_valid_iso_timestamp(self, ts: str):
        datetime.fromisoformat(ts)

    def test_not_found_returns_404(self):
        resp = client.get("/not-found")
        assert resp.status_code == 404
        body = resp.json()
        self._check_standard_shape(body)
        assert body["error"] is True
        assert body["code"] == "NOT_FOUND"

    def test_conflict_returns_409(self):
        resp = client.get("/conflict")
        assert resp.status_code == 409
        body = resp.json()
        self._check_standard_shape(body)
        assert body["code"] == "DUPLICATE_ENTRY"

    def test_bad_request_returns_400(self):
        resp = client.get("/bad-request")
        assert resp.status_code == 400
        body = resp.json()
        self._check_standard_shape(body)
        assert body["code"] == "INVALID_VALUE"

    def test_http_404_mapped_to_not_found(self):
        resp = client.get("/http-404")
        assert resp.status_code == 404
        body = resp.json()
        self._check_standard_shape(body)
        assert body["code"] == "NOT_FOUND"

    def test_crash_returns_500(self):
        saved = settings.DEBUG
        settings.DEBUG = False
        try:
            resp = client.get("/crash")
            assert resp.status_code == 500
            body = resp.json()
            self._check_standard_shape(body)
            assert body["code"] == "INTERNAL_ERROR"
            assert body["detail"] is None
        finally:
            settings.DEBUG = saved

    def test_timestamp_is_valid_iso(self):
        resp = client.get("/not-found")
        body = resp.json()
        self._assert_valid_iso_timestamp(body["timestamp"])

    def test_path_matches_request(self):
        resp = client.get("/not-found")
        body = resp.json()
        assert body["path"] == "/not-found"

        resp2 = client.get("/conflict")
        body2 = resp2.json()
        assert body2["path"] == "/conflict"

    def test_validation_error_422(self):
        resp = client.post("/validation", json={"name": 123})
        assert resp.status_code == 422
        body = resp.json()
        self._check_standard_shape(body)
        assert body["code"] == "VALIDATION_ERROR"
        assert body["detail"] is not None
        assert "message" in body["detail"][0]
