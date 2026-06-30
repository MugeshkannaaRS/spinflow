#!/usr/bin/env python3
"""
cleanup_single_mill.py — collapse SpinFlow to a single mill.

SpinFlow now serves ONE mill, but the database still contains ~200 mill IDs
left over from multi-tenant/demo seeding. This script keeps exactly one mill
and deletes every other mill plus all of its dependent rows, in FK-safe order.

It reuses the same dependency graph that DeletionService uses, but inverts the
predicate: instead of "delete mills in company X", it does "delete every mill
whose id != KEEP_MILL_ID".

SAFETY
------
* DRY-RUN BY DEFAULT. Without --apply it only PRINTS what would be deleted and
  rolls back. Nothing is changed.
* Wraps everything in a single transaction. On --apply, it commits only if no
  statement errored; any exception rolls the whole thing back.
* Refuses to run if it cannot positively identify exactly one mill to keep.

USAGE
-----
  # 1. See all mills + row counts, and which mill would be auto-kept:
  python scripts/cleanup_single_mill.py

  # 2. Keep a specific mill (recommended once you know the id):
  python scripts/cleanup_single_mill.py --keep <MILL_ID>

  # 3. Actually perform the deletion (after reviewing the dry-run):
  python scripts/cleanup_single_mill.py --keep <MILL_ID> --apply

  # Auto-detect the mill with the most data and keep it:
  python scripts/cleanup_single_mill.py --auto --apply

DATABASE_URL is read from the environment (sync psycopg2/sqlalchemy URL) or
falls back to DATABASE_SYNC_URL from backend/.env.
"""
import argparse
import os
import sys

try:
    import psycopg2
except ImportError:
    sys.exit("psycopg2 is required:  pip install psycopg2-binary")


# ── Dependency graph (mirrors DeletionService ordering: children first) ──────
#
# 1) Tables scoped DIRECTLY by mill_id.
MILL_ID_TABLES = [
    "import_mappings",            # (table may already be dropped by migration 063 — skipped if missing)
    "column_dropdown_options",
    "column_configs",
    "mill_record_values",
    "mill_custom_fields",
    "mill_masters",
    "stock_transfers",
    "stock_balance",
    "stock_ledger",
    "sales_orders",              # children sales_order_lines handled below first
    "monthly_payroll",
    "payroll_months",
    "payslip_entries",
    "spare_issues",
    "spares",
    "mill_settings",
    "master_routes",
    "master_vehicles",
    "yarn_counts",
    "warehouses",
    "inventory_bags",
    "shifts",
    "invoices",                  # children payments/gst handled below first
    "cotton_purchases",          # children bale_stock/grn handled below first
    "suppliers",
    "customers",
    "trips",                     # children trip_items/scan handled below first
    "lots",                      # children quality/dispatch/stock_movements below first
    "machines",                  # children production/maintenance below first
    "employees",                 # children attendance/leaves below first
    "master_departments",
]

# 2) Child tables that must be deleted BEFORE their mill-scoped parent.
#    Each: (child_table, subquery deleting where parent belongs to a non-kept mill)
CHILD_DELETES = [
    # employee children
    ("attendance",              "employee_id IN (SELECT id FROM employees WHERE mill_id <> %(keep)s)"),
    ("leaves",                  "employee_id IN (SELECT id FROM employees WHERE mill_id <> %(keep)s)"),
    ("employee_shifts",         "employee_id IN (SELECT id FROM employees WHERE mill_id <> %(keep)s)"),
    ("employee_custom_values",  "employee_id IN (SELECT id FROM employees WHERE mill_id <> %(keep)s)"),
    # trip children
    ("trip_scan_logs",          "trip_id IN (SELECT id FROM trips WHERE mill_id <> %(keep)s)"),
    ("trip_items",              "trip_id IN (SELECT id FROM trips WHERE mill_id <> %(keep)s)"),
    # sales children
    ("sales_order_lines",       "so_id IN (SELECT id FROM sales_orders WHERE mill_id <> %(keep)s)"),
    # lot children
    ("stock_movements",         "lot_id IN (SELECT id FROM lots WHERE mill_id <> %(keep)s)"),
    ("quality_approvals",       "lot_id IN (SELECT id FROM lots WHERE mill_id <> %(keep)s)"),
    ("lab_reports",             "lot_id IN (SELECT id FROM lots WHERE mill_id <> %(keep)s)"),
    ("quality_tests",           "lot_id IN (SELECT id FROM lots WHERE mill_id <> %(keep)s)"),
    ("dispatch_items",          "dispatch_id IN (SELECT id FROM dispatches WHERE lot_id IN (SELECT id FROM lots WHERE mill_id <> %(keep)s))"),
    ("dispatches",              "lot_id IN (SELECT id FROM lots WHERE mill_id <> %(keep)s)"),
    # machine children (machines are scoped by code, joined to mill_id)
    ("production_entries",      "machine_code IN (SELECT code FROM machines WHERE mill_id <> %(keep)s)"),
    ("downtime_logs",           "machine_code IN (SELECT code FROM machines WHERE mill_id <> %(keep)s)"),
    ("maintenance_logs",        "machine_code IN (SELECT code FROM machines WHERE mill_id <> %(keep)s)"),
    ("machine_parameters",      "machine_code IN (SELECT code FROM machines WHERE mill_id <> %(keep)s)"),
    # maintenance_schedule is now scoped by mill_id directly:
    ("maintenance_schedule",    "mill_id <> %(keep)s"),
    ("pm_entry_log",            "mill_id <> %(keep)s"),
    # cotton purchase children
    ("grn_entries",             "purchase_id IN (SELECT id FROM cotton_purchases WHERE mill_id <> %(keep)s)"),
    ("bale_stock",              "purchase_id IN (SELECT id FROM cotton_purchases WHERE mill_id <> %(keep)s)"),
    # invoice children
    ("payments",                "invoice_id IN (SELECT id FROM invoices WHERE mill_id <> %(keep)s)"),
    ("gst_entries",             "invoice_id IN (SELECT id FROM invoices WHERE mill_id <> %(keep)s)"),
    # audit logs for users of other mills
    ("audit_logs",              "user_id IN (SELECT id FROM users WHERE mill_id <> %(keep)s AND mill_id IS NOT NULL)"),
    # user sessions for users of other mills
    ("user_sessions",           "user_id IN (SELECT id FROM users WHERE mill_id <> %(keep)s AND mill_id IS NOT NULL)"),
]

# 3) Users tied to a non-kept mill (kept last among data; company-level users
#    with mill_id IS NULL are preserved).
USER_DELETE = ("users", "mill_id <> %(keep)s AND mill_id IS NOT NULL")

# 4) Finally the mills themselves.
MILL_DELETE = ("mills", "id <> %(keep)s")


def get_db_url() -> str:
    url = os.environ.get("DATABASE_URL") or os.environ.get("DATABASE_SYNC_URL")
    if not url:
        # Try backend/.env
        env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
        if os.path.exists(env_path):
            for line in open(env_path):
                if line.startswith("DATABASE_SYNC_URL="):
                    url = line.split("=", 1)[1].strip()
                    break
    if not url:
        sys.exit("No DATABASE_URL / DATABASE_SYNC_URL found.")
    # psycopg2 wants a plain postgresql:// URL (strip asyncpg driver + ssl param tweaks)
    url = url.replace("postgresql+asyncpg://", "postgresql://").replace("postgresql+psycopg2://", "postgresql://")
    return url


def table_exists(cur, table: str) -> bool:
    cur.execute("SELECT to_regclass(%s)", (f"public.{table}",))
    return cur.fetchone()[0] is not None


def list_mills(cur):
    """Return [(mill_id, name, score)] ordered by data score desc."""
    cur.execute("SELECT id, COALESCE(name, '(unnamed)') FROM mills ORDER BY name")
    mills = cur.fetchall()
    scored = []
    for mid, name in mills:
        score = 0
        for tbl in ("machines", "employees", "maintenance_schedule", "lots", "production_entries"):
            if not table_exists(cur, tbl):
                continue
            col = "mill_id"
            if tbl == "production_entries":
                cur.execute(
                    "SELECT COUNT(*) FROM production_entries WHERE machine_code IN "
                    "(SELECT code FROM machines WHERE mill_id = %s)", (mid,))
            else:
                cur.execute(f"SELECT COUNT(*) FROM {tbl} WHERE {col} = %s", (mid,))
            score += cur.fetchone()[0]
        scored.append((mid, name, score))
    scored.sort(key=lambda r: r[2], reverse=True)
    return scored


def main():
    ap = argparse.ArgumentParser(description="Collapse SpinFlow to a single mill.")
    ap.add_argument("--keep", help="mill_id to keep")
    ap.add_argument("--auto", action="store_true", help="auto-keep the mill with the most data")
    ap.add_argument("--apply", action="store_true", help="actually delete (default is dry-run)")
    args = ap.parse_args()

    conn = psycopg2.connect(get_db_url())
    conn.autocommit = False
    cur = conn.cursor()

    keep = args.keep
    if keep:
        # Validate keep ID exists — fast check via single query
        cur.execute("SELECT id, COALESCE(name, '(unnamed)') FROM mills WHERE id = %s", (keep,))
        row = cur.fetchone()
        if not row:
            sys.exit(f"--keep {keep} is not an existing mill id. Aborting.")
        scored = [(keep, row[1], 0)]
        cur.execute("SELECT COUNT(*) FROM mills")
        mill_count = cur.fetchone()[0]
        print(f"Keep mill: {row[1]} ({keep}) — keeping 1 of {mill_count} mills.\n")
    else:
        print("=" * 70)
        scored = list_mills(cur)
        print(f"Found {len(scored)} mill(s). Top by data volume:")
        for mid, name, score in scored[:10]:
            print(f"  {score:>8} rows   {name:<30} {mid}")
        if len(scored) > 10:
            print(f"  … and {len(scored) - 10} more")
        print("=" * 70)
        if args.auto:
            if not scored:
                sys.exit("No mills found.")
            keep = scored[0][0]
            print(f"[--auto] Keeping mill with most data: {scored[0][1]} ({keep}, {scored[0][2]} rows)")
        if not keep:
            print("\nNo --keep given and --auto not set. This was a LISTING run only.")
            print("Re-run with  --keep <MILL_ID>  or  --auto  to plan a deletion.")
            conn.rollback()
            return

    if keep not in {m[0] for m in scored}:
        sys.exit(f"--keep {keep} is not an existing mill id. Aborting.")

    params = {"keep": keep}
    print(f"\nPlan: KEEP mill {keep}; DELETE the other {len(scored) - 1} mill(s) and dependents.\n")

    total = 0
    try:
        # Order: child tables first, then mill_id-scoped parents, then users, then mills.
        ordered = (
            CHILD_DELETES
            + [(t, "mill_id <> %(keep)s") for t in MILL_ID_TABLES]
            + [USER_DELETE, MILL_DELETE]
        )
        for tbl, where in ordered:
            if not table_exists(cur, tbl):
                print(f"  · {tbl:<26} (table missing — skipped)")
                continue
            cur.execute(f"SELECT COUNT(*) FROM {tbl} WHERE {where}", params)
            n = cur.fetchone()[0]
            if n == 0:
                continue
            if args.apply:
                cur.execute(f"DELETE FROM {tbl} WHERE {where}", params)
                print(f"  ✓ {tbl:<26} deleted {n}")
            else:
                print(f"  ~ {tbl:<26} would delete {n}")
            total += n

        if args.apply:
            conn.commit()
            print(f"\nDONE. Committed. Removed {total} rows across {len(scored) - 1} mills.")
        else:
            conn.rollback()
            print(f"\nDRY-RUN. {total} rows would be deleted. Nothing changed.")
            print("Re-run with --apply to execute.")
    except Exception as e:
        conn.rollback()
        print(f"\nERROR — rolled back, nothing changed: {e}")
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
