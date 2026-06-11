"""
Wave 3A Pre-Flight Check
========================
Run this BEFORE applying migrations 023–026.
Every check must print PASS before proceeding.

Query semantics (critical):
  The new constraint is UNIQUE(mill_id, code) — NOT UNIQUE(code) globally.
  A code appearing in two different mills is FINE after migration.
  The duplicate check must therefore be per (mill_id, key), not per key alone.
  Wrong query: GROUP BY code HAVING COUNT(*) > 1          ← too strict, false positives
  Right query: GROUP BY mill_id, code HAVING COUNT(*) > 1 ← matches new constraint exactly

Usage:
    cd /Users/kannaa/millflow/backend
    source .venv/bin/activate
    python scripts/preflight_wave3a.py
"""

import asyncio
import sys

try:
    import asyncpg
except ImportError:
    print("ERROR: asyncpg not installed. Run: pip install asyncpg")
    sys.exit(1)

try:
    from app.core.config import settings
    DSN = settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")
except Exception:
    import os
    DSN = os.environ.get("DATABASE_URL", "").replace("postgresql+asyncpg://", "postgresql://")

if not DSN:
    print("ERROR: DATABASE_URL not set")
    sys.exit(1)

# ---------------------------------------------------------------------------
# Each entry: (label, sql, must_be_empty, description)
# must_be_empty=True  → any row returned means FAIL
# must_be_empty=False → informational, always print
# ---------------------------------------------------------------------------
CHECKS = [

    # ------------------------------------------------------------------ #
    # INFO — how many mills/companies currently exist                      #
    # ------------------------------------------------------------------ #
    (
        "INFO: mills / companies",
        """SELECT c.name AS company, m.code AS mill_code, m.id AS mill_id
           FROM mills m JOIN companies c ON c.id = m.company_id
           ORDER BY c.name, m.code""",
        False,
    ),
    (
        "INFO: current alembic HEAD",
        "SELECT version_num FROM alembic_version",
        False,
    ),

    # ================================================================== #
    # MIGRATION 023 — machines.code → UNIQUE(mill_id, code)              #
    # ================================================================== #
    (
        "023 machines: duplicate (mill_id, code) pairs within same mill",
        """SELECT mill_id, code, COUNT(*) AS n
           FROM machines
           GROUP BY mill_id, code
           HAVING COUNT(*) > 1""",
        True,
    ),
    (
        "023 machines: rows with NULL mill_id (cannot join composite unique)",
        "SELECT id, code FROM machines WHERE mill_id IS NULL",
        True,
    ),

    # ================================================================== #
    # MIGRATION 024a — shifts.code → UNIQUE(mill_id, code)               #
    # ================================================================== #
    (
        "024 shifts: duplicate (mill_id, code) pairs within same mill",
        """SELECT mill_id, code, COUNT(*) AS n
           FROM shifts
           GROUP BY mill_id, code
           HAVING COUNT(*) > 1""",
        True,
    ),
    (
        "024 shifts: rows with NULL mill_id",
        "SELECT id, code FROM shifts WHERE mill_id IS NULL",
        True,
    ),

    # ================================================================== #
    # MIGRATION 024b — warehouses.code → UNIQUE(mill_id, code)           #
    # ================================================================== #
    (
        "024 warehouses: duplicate (mill_id, code) pairs within same mill",
        """SELECT mill_id, code, COUNT(*) AS n
           FROM warehouses
           GROUP BY mill_id, code
           HAVING COUNT(*) > 1""",
        True,
    ),
    (
        "024 warehouses: rows with NULL mill_id",
        "SELECT id, code FROM warehouses WHERE mill_id IS NULL",
        True,
    ),

    # ================================================================== #
    # MIGRATION 025a — lots.lot_no → UNIQUE(mill_id, lot_no)             #
    # ================================================================== #
    (
        "025 lots: duplicate (mill_id, lot_no) pairs within same mill",
        """SELECT mill_id, lot_no, COUNT(*) AS n
           FROM lots
           GROUP BY mill_id, lot_no
           HAVING COUNT(*) > 1""",
        True,
    ),
    (
        "025 lots: rows with NULL mill_id",
        "SELECT id, lot_no FROM lots WHERE mill_id IS NULL",
        True,
    ),

    # ================================================================== #
    # MIGRATION 025b — sales_orders.so_no → UNIQUE(mill_id, so_no)       #
    # ================================================================== #
    (
        "025 sales_orders: duplicate (mill_id, so_no) pairs",
        """SELECT mill_id, so_no, COUNT(*) AS n
           FROM sales_orders
           GROUP BY mill_id, so_no
           HAVING COUNT(*) > 1""",
        True,
    ),
    (
        "025 sales_orders: rows with NULL mill_id",
        "SELECT id, so_no FROM sales_orders WHERE mill_id IS NULL",
        True,
    ),

    # ================================================================== #
    # MIGRATION 025c — stock_transfers.transfer_no → UNIQUE(mill_id, ..) #
    # ================================================================== #
    (
        "025 stock_transfers: duplicate (mill_id, transfer_no) pairs",
        """SELECT mill_id, transfer_no, COUNT(*) AS n
           FROM stock_transfers
           GROUP BY mill_id, transfer_no
           HAVING COUNT(*) > 1""",
        True,
    ),
    (
        "025 stock_transfers: rows with NULL mill_id",
        "SELECT id, transfer_no FROM stock_transfers WHERE mill_id IS NULL",
        True,
    ),

    # ================================================================== #
    # MIGRATION 025d — trips.trip_no → UNIQUE(mill_id, trip_no)          #
    # ================================================================== #
    (
        "025 trips: duplicate (mill_id, trip_no) pairs",
        """SELECT mill_id, trip_no, COUNT(*) AS n
           FROM trips
           GROUP BY mill_id, trip_no
           HAVING COUNT(*) > 1""",
        True,
    ),
    (
        "025 trips: rows with NULL mill_id",
        "SELECT id, trip_no FROM trips WHERE mill_id IS NULL",
        True,
    ),

    # ================================================================== #
    # MIGRATION 026 — mills.code → UNIQUE(company_id, code)              #
    # ================================================================== #
    (
        "026 mills: duplicate (company_id, code) pairs within same company",
        """SELECT company_id, code, COUNT(*) AS n
           FROM mills
           GROUP BY company_id, code
           HAVING COUNT(*) > 1""",
        True,
    ),
    (
        "026 mills: rows with NULL company_id",
        "SELECT id, code FROM mills WHERE company_id IS NULL",
        True,
    ),

    # ================================================================== #
    # NULL behaviour in PostgreSQL composite UNIQUE                        #
    # UNIQUE(mill_id, code) treats NULL as distinct from every other value #
    # so two rows with (NULL, 'RF-01') would NOT violate the constraint.  #
    # Above NULL-checks catch this and block migration until fixed.        #
    # ================================================================== #
]


async def run():
    print(f"\nConnecting to DB …")
    try:
        conn = await asyncpg.connect(DSN, ssl="require" if "supabase" in DSN else None)
    except Exception as e:
        print(f"ERROR: Cannot connect: {e}")
        sys.exit(1)

    print("Connected.\n")
    print("=" * 70)

    failures = []
    for label, sql, must_be_empty in CHECKS:
        try:
            rows = await conn.fetch(sql)
        except Exception as e:
            print(f"[ERROR ] {label}")
            print(f"         SQL error: {e}")
            failures.append(label)
            continue

        if not must_be_empty:
            print(f"[INFO  ] {label}")
            for r in rows:
                print(f"         {dict(r)}")
        elif rows:
            print(f"[FAIL  ] {label}  ({len(rows)} row(s))")
            for r in rows[:5]:
                print(f"         {dict(r)}")
            if len(rows) > 5:
                print(f"         … and {len(rows) - 5} more")
            failures.append(label)
        else:
            print(f"[PASS  ] {label}")

    await conn.close()

    print("\n" + "=" * 70)
    if failures:
        print(f"\n❌  {len(failures)} check(s) FAILED:")
        for f in failures:
            print(f"     • {f}")
        print("\nFix all failures before running any migration.")
        sys.exit(1)
    else:
        print("\n✅  All checks PASSED.")
        print("    Safe to run migrations one at a time:")
        print()
        print("    alembic upgrade 023   # machines.code")
        print("    alembic current       # verify")
        print("    alembic upgrade 024   # shifts + warehouses")
        print("    alembic current")
        print("    alembic upgrade 025   # lots + so + transfer + trips")
        print("    alembic current")
        print("    alembic upgrade 026   # mills.code")
        print("    alembic current")


asyncio.run(run())
