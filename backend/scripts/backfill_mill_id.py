"""
Backfill null mill_id/company_id on rows created before migration 041.

Usage:
    python -m backend.scripts.backfill_mill_id                  # dry run
    python -m backend.scripts.backfill_mill_id --execute        # commit
"""

import argparse
import sys
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, text

# Load .env from backend/
env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(env_path)

import os

DATABASE_URL = os.environ.get("DATABASE_SYNC_URL")
if not DATABASE_URL:
    print("FATAL: DATABASE_SYNC_URL not found in backend/.env")
    sys.exit(1)


# ── Table definitions: (table, mill_id_from, company_id_from, join_sql, null_lot_ok) ─────

TABLES = [
    {
        "name": "dispatches",
        "join": """
            FROM dispatches d
            LEFT JOIN lots l ON d.lot_id = l.id
            LEFT JOIN mills m ON l.mill_id = m.id
            WHERE d.mill_id IS NULL
        """,
        "update_mill": """
            UPDATE dispatches d
            SET mill_id = l.mill_id
            FROM lots l
            WHERE d.lot_id = l.id
              AND d.mill_id IS NULL
              AND l.mill_id IS NOT NULL
        """,
        "update_company": """
            UPDATE dispatches d
            SET company_id = m.company_id
            FROM lots l
            JOIN mills m ON l.mill_id = m.id
            WHERE d.lot_id = l.id
              AND d.company_id IS NULL
              AND m.company_id IS NOT NULL
        """,
        "count_before": "SELECT COUNT(*) FROM dispatches WHERE mill_id IS NULL",
        "count_after": "SELECT COUNT(*) FROM dispatches WHERE mill_id IS NULL",
        # dispatches.lot_id is nullable → some rows have no lot, unresolvable
    },
    {
        "name": "quality_tests",
        "join": """
            FROM quality_tests t
            LEFT JOIN lots l ON t.lot_id = l.id
            LEFT JOIN mills m ON l.mill_id = m.id
            WHERE t.mill_id IS NULL
        """,
        "update_mill": """
            UPDATE quality_tests t
            SET mill_id = l.mill_id
            FROM lots l
            WHERE t.lot_id = l.id
              AND t.mill_id IS NULL
              AND l.mill_id IS NOT NULL
        """,
        "update_company": """
            UPDATE quality_tests t
            SET company_id = m.company_id
            FROM lots l
            JOIN mills m ON l.mill_id = m.id
            WHERE t.lot_id = l.id
              AND t.company_id IS NULL
              AND m.company_id IS NOT NULL
        """,
        "count_before": "SELECT COUNT(*) FROM quality_tests WHERE mill_id IS NULL",
        "count_after": "SELECT COUNT(*) FROM quality_tests WHERE mill_id IS NULL",
    },
    {
        "name": "lab_reports",
        "join": """
            FROM lab_reports r
            LEFT JOIN lots l ON r.lot_id = l.id
            LEFT JOIN mills m ON l.mill_id = m.id
            WHERE r.mill_id IS NULL
        """,
        "update_mill": """
            UPDATE lab_reports r
            SET mill_id = l.mill_id
            FROM lots l
            WHERE r.lot_id = l.id
              AND r.mill_id IS NULL
              AND l.mill_id IS NOT NULL
        """,
        "update_company": """
            UPDATE lab_reports r
            SET company_id = m.company_id
            FROM lots l
            JOIN mills m ON l.mill_id = m.id
            WHERE r.lot_id = l.id
              AND r.company_id IS NULL
              AND m.company_id IS NOT NULL
        """,
        "count_before": "SELECT COUNT(*) FROM lab_reports WHERE mill_id IS NULL",
        "count_after": "SELECT COUNT(*) FROM lab_reports WHERE mill_id IS NULL",
    },
    {
        "name": "quality_approvals",
        "join": """
            FROM quality_approvals a
            LEFT JOIN lots l ON a.lot_id = l.id
            LEFT JOIN mills m ON l.mill_id = m.id
            WHERE a.mill_id IS NULL
        """,
        "update_mill": """
            UPDATE quality_approvals a
            SET mill_id = l.mill_id
            FROM lots l
            WHERE a.lot_id = l.id
              AND a.mill_id IS NULL
              AND l.mill_id IS NOT NULL
        """,
        "update_company": """
            UPDATE quality_approvals a
            SET company_id = m.company_id
            FROM lots l
            JOIN mills m ON l.mill_id = m.id
            WHERE a.lot_id = l.id
              AND a.company_id IS NULL
              AND m.company_id IS NOT NULL
        """,
        "count_before": "SELECT COUNT(*) FROM quality_approvals WHERE mill_id IS NULL",
        "count_after": "SELECT COUNT(*) FROM quality_approvals WHERE mill_id IS NULL",
    },
    {
        "name": "cotton_bales",
        "join": """
            FROM cotton_bales b
            LEFT JOIN suppliers s ON b.supplier = s.name
            LEFT JOIN mills m ON s.mill_id = m.id
            WHERE b.mill_id IS NULL
        """,
        "update_mill": """
            UPDATE cotton_bales b
            SET mill_id = s.mill_id
            FROM suppliers s
            WHERE b.supplier = s.name
              AND b.mill_id IS NULL
              AND s.mill_id IS NOT NULL
        """,
        "update_company": """
            UPDATE cotton_bales b
            SET company_id = m.company_id
            FROM suppliers s
            JOIN mills m ON s.mill_id = m.id
            WHERE b.supplier = s.name
              AND b.company_id IS NULL
              AND m.company_id IS NOT NULL
        """,
        "count_before": "SELECT COUNT(*) FROM cotton_bales WHERE mill_id IS NULL",
        "count_after": "SELECT COUNT(*) FROM cotton_bales WHERE mill_id IS NULL",
        "fallback_single_mill": True,
    },
]


def _run_single_mill_fallback(conn) -> int:
    """If there is exactly one mill in the DB, assign it to remaining null rows."""
    row = conn.execute(text("SELECT COUNT(*) FROM mills")).scalar()
    if row != 1:
        return 0
    mill_id = conn.execute(text("SELECT id FROM mills LIMIT 1")).scalar()
    company_id = conn.execute(text("SELECT company_id FROM mills LIMIT 1")).scalar()
    if not mill_id:
        return 0
    fixed = 0
    for tbl in ("cotton_bales",):
        r = conn.execute(text(
            f"UPDATE {tbl} SET mill_id = :mid, company_id = :cid "
            f"WHERE mill_id IS NULL"
        ), {"mid": mill_id, "cid": company_id})
        fixed += r.rowcount
    return fixed


def _count_rows(conn, sql: str) -> int:
    return conn.execute(text(sql)).scalar() or 0


def run(execute: bool) -> None:
    engine = create_engine(DATABASE_URL, pool_pre_ping=True)
    label = "EXECUTE" if execute else "DRY RUN"

    print(f"[{label}] Backfill mill_id — SpinFlow")
    print("─" * 50)

    results: list[dict] = []

    with engine.begin() as conn:
        for tbl in TABLES:
            name = tbl["name"]
            before = _count_rows(conn, tbl["count_before"])

            resolvable = 0
            remaining = 0

            if before > 0:
                if execute:
                    r = conn.execute(text(tbl["update_mill"]))
                    resolvable = r.rowcount
                    conn.execute(text(tbl["update_company"]))
                    remaining = _count_rows(conn, tbl["count_after"])
                else:
                    resolvable_sql = (
                        f"SELECT COUNT(*) {tbl['join']} AND l.mill_id IS NOT NULL"
                        if tbl["name"] != "cotton_bales"
                        else f"SELECT COUNT(*) {tbl['join']} AND s.mill_id IS NOT NULL"
                    )
                    resolvable = _count_rows(conn, resolvable_sql)
                    # Check single-mill fallback for cotton_bales in dry-run
                    if tbl.get("fallback_single_mill"):
                        mill_count = _count_rows(conn, "SELECT COUNT(*) FROM mills")
                        if mill_count == 1:
                            unresolvable_via_supplier = before - resolvable
                            resolvable += unresolvable_via_supplier
                    remaining = before - resolvable
            else:
                remaining = 0

            print(
                f"  {name:<20} {before:>5} rows with null mill_id"
                f"{'' if before == 0 else f' → {resolvable:>5} resolvable, {remaining:>5} unresolvable'}"
            )
            results.append({"name": name, "before": before, "resolved": resolvable, "remaining": remaining})

        # Single-mill fallback for unresolvable cotton_bales
        if execute:
            fallback_fixed = _run_single_mill_fallback(conn)
            if fallback_fixed:
                print(f"  [single-mill fallback] fixed {fallback_fixed} cotton_bales")
                for r in results:
                    if r["name"] == "cotton_bales":
                        r["remaining"] -= fallback_fixed
                        r["resolved"] += fallback_fixed
                        break

    # ── Summary ──────────────────────────────────────────────────────────
    print()
    print(f"[{label}] Summary")
    print("─" * 50)
    print(f"  {'Table':<20} {'Before':>8} {'Resolved':>10} {'Remaining':>10}")
    print(f"  {'─'*20} {'─'*8} {'─'*10} {'─'*10}")
    total_before = 0
    total_remaining = 0
    for r in results:
        print(f"  {r['name']:<20} {r['before']:>8} {r['resolved']:>10} {r['remaining']:>10}")
        total_before += r["before"]
        total_remaining += r["remaining"]

    print(f"  {'─'*20} {'─'*8} {'─'*10} {'─'*10}")
    print(f"  {'TOTAL':<20} {total_before:>8} {'':>10} {total_remaining:>10}")

    if total_remaining > 0:
        print()
        print(f"WARNING: {total_remaining} rows could not be resolved. Review manually.")
        print("These rows likely have no linked lot_id or supplier match.")
    else:
        print()
        print("All rows resolved successfully.")

    if not execute:
        print()
        print("Run with --execute to commit changes.")


def main():
    parser = argparse.ArgumentParser(description="Backfill null mill_id/company_id")
    parser.add_argument("--execute", action="store_true", help="Actually commit changes")
    args = parser.parse_args()
    run(execute=args.execute)


if __name__ == "__main__":
    main()
