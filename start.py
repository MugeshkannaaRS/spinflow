import os
import subprocess
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).parent / "backend"
sys.path.insert(0, str(BACKEND_DIR))

import uvicorn


def run_migrations() -> None:
    """Apply pending Alembic migrations before the app starts.

    The deploy path previously had no migration step, so new migrations
    (e.g. 066_maintenance_dept_map) were never applied and endpoints
    reading new tables returned 500s. Migrations are idempotent (guarded
    with inspector checks), so running upgrade on every boot is safe.
    A failure is logged but does not block startup — the app can still
    serve everything that doesn't depend on the newest migration.
    """
    try:
        result = subprocess.run(
            [sys.executable, "-m", "alembic", "upgrade", "head"],
            cwd=str(BACKEND_DIR),
            capture_output=True,
            text=True,
            timeout=300,
        )
        if result.returncode == 0:
            print("[start] alembic upgrade head: OK", flush=True)
        else:
            print(
                f"[start] alembic upgrade head FAILED (rc={result.returncode}):\n"
                f"{result.stdout[-2000:]}\n{result.stderr[-2000:]}",
                flush=True,
            )
    except Exception as exc:  # noqa: BLE001 — never block boot on migration errors
        print(f"[start] alembic upgrade head raised: {exc}", flush=True)


if __name__ == "__main__":
    run_migrations()
    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=port,
        workers=1,
        loop="asyncio",
    )
