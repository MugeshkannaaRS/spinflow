"""
Pre-deployment validation script.

Usage:
    python backend/scripts/deploy_check.py           # full check
    python backend/scripts/deploy_check.py --quick   # skip DB autogenerate diff (fast)

Exits with code 0 if all checks pass, 1 otherwise.
Run this BEFORE deploying to staging/production.
"""

import os
import sys
import argparse
import subprocess
from pathlib import Path


def check(label: str, condition: bool, failures = None) -> None:
    if condition:
        print(f"  ✓ {label}")
    else:
        print(f"  ✗ {label}")
        if failures is not None:
            failures.append(label)


_failures: list[str] = []


def main() -> int:
    parser = argparse.ArgumentParser(description="SpinFlow pre-deployment validation")
    parser.add_argument("--quick", action="store_true", help="Skip DB autogenerate diff (no live DB needed)")
    args, _ = parser.parse_known_args()

    print("SpinFlow ERP — Pre-Deployment Validation")
    if args.quick:
        print("  (quick mode — skipping DB autogenerate diff)")
    print()

    # ── 1. Required env vars ────────────────────────────────────────────
    print("Required environment variables:")
    required_vars = [
        "DATABASE_URL",
        "DATABASE_SYNC_URL",
        "SECRET_KEY",
        "REFRESH_SECRET_KEY",
        "REDIS_URL",
        "QR_SECRET_KEY",
    ]
    for var in required_vars:
        val = os.getenv(var, "")
        ok = bool(val) and val not in ("", "your-", "change-me")
        if not ok:
            _failures.append(f"Missing or placeholder: {var}")
        print(f"  {'✓' if ok else '✗'} {var} {'(set)' if ok else '(missing/placeholder)'}")

    # ── 2. Secret key length ────────────────────────────────────────────
    print("\nSecret key strength:")
    sk = os.getenv("SECRET_KEY", "")
    ok = len(sk) >= 32
    if not ok:
        _failures.append(f"SECRET_KEY too short ({len(sk)} chars, min 32)")
    print(f"  {'✓' if ok else '✗'} SECRET_KEY length: {len(sk)} chars {'(≥32)' if ok else '(<32)'}")

    # ── 3. Alembic migration check ─────────────────────────────────────
    print("\nAlembic migration check:")
    try:
        from alembic.config import Config as AlembicConfig
        from alembic.script import ScriptDirectory
        ini = Path(__file__).parent.parent / "alembic.ini"
        cfg = AlembicConfig(str(ini))
        script = ScriptDirectory.from_config(cfg)
        head = script.get_current_head()
        print(f"  ✓ Alembic config loads — head revision: {head}")
        if not args.quick:
            # Full autogenerate diff against live DB (slow — needs DATABASE_URL)
            from alembic import command as alembic_command
            alembic_command.check(cfg)
            print("  ✓ No pending migrations detected")
        else:
            print("  ⏭  Skipped live DB diff (--quick mode)")
    except Exception as e:
        _failures.append(f"Alembic check failed: {e}")
        print(f"  ✗ Alembic check failed: {e}")

    # ── 4. App can import ───────────────────────────────────────────────
    print("\nApplication import check:")
    try:
        # Set a temp database URL for import check (won't actually connect)
        os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://u:p@localhost:5432/db")
        os.environ.setdefault("DATABASE_SYNC_URL", "postgresql://u:p@localhost:5432/db")
        from app.core.config import settings
        print(f"  ✓ App config loads (name={settings.APP_NAME})")
    except Exception as e:
        _failures.append(f"App import failed: {e}")
        print(f"  ✗ App import failed: {e}")

    # ── 5. Python version ───────────────────────────────────────────────
    print("\nPython version:")
    py_version = sys.version
    major = sys.version_info.major
    minor = sys.version_info.minor
    ok = (major, minor) >= (3, 11)
    if not ok:
        _failures.append(f"Python {major}.{minor} is < 3.11")
    print(f"  {'✓' if ok else '✗'} Python {major}.{minor}.{sys.version_info.micro} {'(≥3.11)' if ok else '(<3.11 — upgrade needed)'}")

    # ── Summary ─────────────────────────────────────────────────────────
    print()
    if _failures:
        print(f"❌ {len(_failures)} check(s) FAILED:")
        for f in _failures:
            print(f"   • {f}")
        return 1
    else:
        print("✅ All checks PASSED — ready to deploy")
        return 0


if __name__ == "__main__":
    sys.exit(main())
