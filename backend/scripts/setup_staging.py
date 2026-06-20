"""
Staging environment setup script.

Usage:
    python backend/scripts/setup_staging.py          # full setup
    python backend/scripts/setup_staging.py --skip-seed  # schema only

Loads ENV from backend/.env.staging, runs Alembic migrations, then
optionally seeds demo data.
"""

import os
import sys
import subprocess
import argparse

DOTENV_PATH = os.path.join(os.path.dirname(__file__), "..", ".env.staging")


def load_env(path: str) -> None:
    try:
        from dotenv import load_dotenv
        loaded = load_dotenv(path)
        if not loaded:
            print(f"⚠  dotenv loaded nothing from {path}")
        else:
            print(f"✓  Loaded environment from {path}")
    except ImportError:
        print("ℹ  python-dotenv not installed — reading .env.staging directly")
        with open(path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    if v and not v.startswith("<"):
                        os.environ.setdefault(k, v)


def run_step(label: str, cmd: list[str]) -> bool:
    print(f"\n{'='*60}")
    print(f"  {label}")
    print(f"{'='*60}")
    try:
        result = subprocess.run(cmd, cwd=os.path.dirname(DOTENV_PATH), capture_output=True, text=True)
        if result.returncode == 0:
            print(f"✓  {label} — OK")
            if result.stdout:
                for line in result.stdout.strip().splitlines():
                    print(f"   {line}")
            return True
        else:
            print(f"✗  {label} — FAILED (exit code {result.returncode})")
            if result.stderr:
                for line in result.stderr.strip().splitlines():
                    print(f"   {line}")
            return False
    except FileNotFoundError as e:
        print(f"✗  {label} — command not found: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(description="Set up staging database")
    parser.add_argument("--skip-seed", action="store_true", help="Skip demo data seeding")
    args = parser.parse_args()

    if not os.path.exists(DOTENV_PATH):
        print(f"✗  {DOTENV_PATH} not found. Create it from .env.staging first.")
        sys.exit(1)

    load_env(DOTENV_PATH)

    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url:
        print("✗  DATABASE_URL is not set in environment or .env.staging")
        sys.exit(1)

    # Mask password in display
    safe_url = db_url.replace(db_url.split(":")[2].split("@")[0], "****")
    print(f"   Database: {safe_url[:60]}...")
    print(f"   Skip seed: {args.skip_seed}")

    # Step 1: Alembic upgrade
    ok = run_step("Running Alembic migrations (upgrade head)", ["alembic", "upgrade", "head"])
    if not ok:
        print("\n✗  Migrations failed. Check your DATABASE_URL and DB permissions.")
        sys.exit(1)

    if args.skip_seed:
        print(f"\n{'='*60}")
        print("  --skip-seed: demo data NOT seeded")
        print(f"{'='*60}")
    else:
        # Step 2: Seed demo data
        ok = run_step("Seeding demo data", [sys.executable, "scripts/seed_demo.py"])
        if not ok:
            print("\n⚠  Seeding failed (migrations succeeded). You can re-run with --skip-seed.")
            sys.exit(1)

    print(f"\n{'='*60}")
    print("  ✓  Staging setup complete!")
    print(f"{'='*60}")
    print(f"   Migrations:  {'✓' if ok else '✗'}")
    print(f"   Demo data:   {'✓' if not args.skip_seed else 'skipped'}")
    print(f"\n   Login: admin@mill.spinflow")
    print(f"   (password from SEED_ADMIN_PASSWORD or default)")


if __name__ == "__main__":
    main()
