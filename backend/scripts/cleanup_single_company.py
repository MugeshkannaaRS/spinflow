#!/usr/bin/env python3
"""
cleanup_single_company.py — collapse SpinFlow to a single company.

The DB still carries ~82 companies (mostly suspended demo tenants like
"Cauvery Spinning") from the multi-tenant seed. This keeps exactly one company
(the one that owns this mill) and deletes every other company plus its dependent
rows. Most company-scoped tables use ON DELETE CASCADE, so deleting the company
row removes its billing/subscription/module/governance/etc. rows automatically;
this script also clears the few non-cascade references first, in FK-safe order.

SAFETY
------
* DRY-RUN BY DEFAULT — without --apply it only prints what would be deleted and
  rolls back. Nothing changes.
* Single transaction; commits only on --apply with no error.
* Refuses to run unless the keep-company id is an existing company.

USAGE
-----
  # list companies + what would be deleted (dry-run):
  python scripts/cleanup_single_company.py --keep 4ddb3120-ab01-4c93-9e6c-de59d8df6330
  # actually delete:
  python scripts/cleanup_single_company.py --keep 4ddb3120-ab01-4c93-9e6c-de59d8df6330 --apply
  # auto-keep the company that owns the (single) mill:
  python scripts/cleanup_single_company.py --auto --apply
"""
import argparse
import os
import sys

try:
    import psycopg2
except ImportError:
    sys.exit("psycopg2 required:  pip install psycopg2-binary")


# Non-cascade / nullable references to clear before deleting the companies.
# (child_table, where-clause deleting rows whose company is being removed)
PRE_DELETE = [
    ("users",       "company_id <> %(keep)s AND company_id IS NOT NULL"),
    ("employees",   "company_id <> %(keep)s AND company_id IS NOT NULL"),
    ("dispatches",  "company_id <> %(keep)s AND company_id IS NOT NULL"),
    ("deletion_logs", "company_id <> %(keep)s"),
]

COMPANY_DELETE = ("companies", "id <> %(keep)s")


def get_db_url():
    url = os.environ.get("DATABASE_URL") or os.environ.get("DATABASE_SYNC_URL")
    if not url:
        env = os.path.join(os.path.dirname(__file__), "..", ".env")
        if os.path.exists(env):
            for line in open(env):
                if line.startswith("DATABASE_SYNC_URL="):
                    url = line.split("=", 1)[1].strip(); break
    if not url:
        sys.exit("No DATABASE_URL / DATABASE_SYNC_URL found.")
    return url.replace("postgresql+asyncpg://", "postgresql://").replace("postgresql+psycopg2://", "postgresql://")


def table_exists(cur, t):
    cur.execute("SELECT to_regclass(%s)", (f"public.{t}",))
    return cur.fetchone()[0] is not None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--keep", help="company id to keep")
    ap.add_argument("--auto", action="store_true", help="keep the company that owns the mill")
    ap.add_argument("--apply", action="store_true", help="actually delete (default: dry-run)")
    args = ap.parse_args()

    conn = psycopg2.connect(get_db_url()); conn.autocommit = False
    cur = conn.cursor()

    # list companies
    cur.execute("SELECT id, name, code, status, (SELECT count(*) FROM mills m WHERE m.company_id=c.id) FROM companies c ORDER BY status, name")
    rows = cur.fetchall()
    print("=" * 70)
    print(f"{len(rows)} companies:")
    for cid, name, code, status, mills in rows[:15]:
        print(f"  [{status:9}] mills={mills}  {name}  ({code})  {cid}")
    if len(rows) > 15:
        print(f"  … and {len(rows) - 15} more")
    print("=" * 70)

    keep = args.keep
    if not keep and args.auto:
        cur.execute("SELECT DISTINCT company_id FROM mills WHERE company_id IS NOT NULL")
        mill_companies = [r[0] for r in cur.fetchall()]
        if len(mill_companies) == 1:
            keep = mill_companies[0]
            print(f"[--auto] keeping the mill's company: {keep}")
        else:
            sys.exit(f"--auto needs exactly one mill-owning company; found {len(mill_companies)}. Use --keep.")
    if not keep:
        print("\nNo --keep / --auto given — listing only. Re-run with --keep <id> or --auto.")
        conn.rollback(); return
    if keep not in {r[0] for r in rows}:
        sys.exit(f"--keep {keep} is not an existing company id.")

    params = {"keep": keep}
    to_delete = len(rows) - 1
    print(f"\nPlan: KEEP company {keep}; DELETE the other {to_delete} companies (+ dependents).\n")

    total = 0
    try:
        for tbl, where in PRE_DELETE + [COMPANY_DELETE]:
            if not table_exists(cur, tbl):
                print(f"  · {tbl:<22} (missing — skipped)"); continue
            cur.execute(f"SELECT COUNT(*) FROM {tbl} WHERE {where}", params)
            n = cur.fetchone()[0]
            if n == 0:
                continue
            if args.apply:
                cur.execute(f"DELETE FROM {tbl} WHERE {where}", params)
                print(f"  ✓ {tbl:<22} deleted {n}")
            else:
                print(f"  ~ {tbl:<22} would delete {n}")
            total += n
        if args.apply:
            conn.commit()
            print(f"\nDONE. Committed. Removed {total} rows; {to_delete} companies gone.")
        else:
            conn.rollback()
            print(f"\nDRY-RUN. {total} rows would be deleted. Re-run with --apply.")
    except Exception as e:
        conn.rollback()
        print(f"\nERROR — rolled back, nothing changed: {e}")
        raise
    finally:
        cur.close(); conn.close()


if __name__ == "__main__":
    main()
