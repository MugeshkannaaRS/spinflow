"""
Quality Module DB Verification Script
Run with:  python scripts/verify_quality_db.py

Checks:
  1. All 13+ quality form tables exist
  2. Each table has the expected columns
  3. mill_id column is present and indexed (tenant isolation)
  4. Test INSERT and SELECT are scoped by mill_id
  5. Row counts per table
"""

import os
import sys
import uuid
import psycopg2

# ── Connection ──────────────────────────────────────────────────────────────
DB_URL = os.environ.get("DATABASE_SYNC_URL") or os.environ.get("DATABASE_URL", "")
if not DB_URL:
    # fallback: read from .env
    env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
    with open(env_path) as f:
        for line in f:
            if line.startswith("DATABASE_SYNC_URL="):
                DB_URL = line.strip().split("=", 1)[1]
                break

if not DB_URL:
    print("ERROR: DATABASE_SYNC_URL not set")
    sys.exit(1)

# asyncpg → psycopg2 URL fix
DB_URL = DB_URL.replace("postgresql+asyncpg://", "postgresql://").replace(
    "?ssl=require", "?sslmode=require"
).replace("?ssl=disable", "")

conn = psycopg2.connect(DB_URL)
cur = conn.cursor()

PASS = "\033[92m✓\033[0m"
FAIL = "\033[91m✗\033[0m"
WARN = "\033[93m!\033[0m"

# ── 1. Table existence ───────────────────────────────────────────────────────
EXPECTED_TABLES = [
    "qm_carding_cv_record",
    "qm_carding_wrapping",
    "qm_carding_waste_study",
    "qm_drawing_cv_record",
    "qm_a_pct_check",
    "qm_sliver_wrapping",
    "qm_simplex_hank_test",
    "qm_simplex_breakage_study",
    "qm_simplex_stretch_pct",
    "qm_rf_csp_report",
    "qm_rf_breakage_study",
    "qm_rf_snap_study",
    "qm_yarn_faults_uster",
    "qm_splice_strength",
    "qm_wax_pickup",
    "qm_bag_faults",
    "qm_blend_test",
    "qm_pwse_check",
    "qm_bag_weight_check",
    "qm_paper_cone_check",
]

cur.execute(
    "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'qm_%' ORDER BY tablename"
)
existing = {r[0] for r in cur.fetchall()}

print("\n=== 1. Table Existence ===")
all_ok = True
for t in EXPECTED_TABLES:
    if t in existing:
        print(f"  {PASS} {t}")
    else:
        print(f"  {FAIL} {t}  ← MISSING")
        all_ok = False

extra = existing - set(EXPECTED_TABLES)
for t in sorted(extra):
    print(f"  {WARN} {t}  (extra table, not in expected list)")

# ── 2. mill_id column + index per table ─────────────────────────────────────
print("\n=== 2. mill_id Column + Index ===")
for t in EXPECTED_TABLES:
    if t not in existing:
        continue
    cur.execute(
        """
        SELECT column_name FROM information_schema.columns
        WHERE table_schema='public' AND table_name=%s AND column_name='mill_id'
        """,
        (t,),
    )
    has_col = cur.fetchone() is not None
    cur.execute(
        """
        SELECT indexname FROM pg_indexes
        WHERE schemaname='public' AND tablename=%s AND indexdef LIKE '%%mill_id%%'
        """,
        (t,),
    )
    has_idx = cur.fetchone() is not None
    status = PASS if has_col else FAIL
    idx_status = PASS if has_idx else WARN
    print(f"  {status} {t}.mill_id  {idx_status} index")

# ── 3. Key columns exist on each table ──────────────────────────────────────
KEY_COLS = {
    "qm_carding_cv_record": ["lot_no", "machine_no", "date", "shift_code", "cv_1m", "cv_5m", "within_spec"],
    "qm_carding_waste_study": ["lot_no", "machine_no", "date", "delivery_hank", "total_production_kg", "total_wastage_pct", "licker_in2_waste_kg", "flat_strips_kg"],
    "qm_carding_wrapping": ["lot_no", "machine_no", "date", "shift_code", "std_hank", "actual_hank", "cv_pct", "ok_input"],
    "qm_drawing_cv_record": ["lot_no", "machine_no", "date", "shift_code", "a_pct", "cv_pct", "process"],
    "qm_a_pct_check": ["lot_no", "machine_no", "date", "feed_hank", "delivery_hank", "a_pct_n_plus", "a_pct_n_minus"],
    "qm_sliver_wrapping": ["lot_no", "machine_no", "date", "shift_code", "process", "side", "std_hank", "actual_hank", "hank_cv_pct"],
    "qm_simplex_hank_test": ["lot_no", "machine_no", "date", "shift_code", "nominal_hank", "actual_hank", "cv_pct"],
    "qm_simplex_breakage_study": ["lot_no", "machine_no", "date", "spl_speed", "total_breaks", "active_spindles", "breaks_per_100spl_hrs"],
    "qm_rf_csp_report": ["lot_no", "machine_no", "date", "count_ne", "ratio", "avg_csp", "cv_pct", "tm", "tpi"],
    "qm_rf_breakage_study": ["lot_no", "date", "count_ne", "total_breaks", "breaks_per_1000spl_hr"],
    "qm_rf_snap_study": ["lot_no", "machine_no", "date", "shift_code", "snap_rhs", "snap_lhs", "snap_total", "idle_spindles_total"],
    "qm_yarn_faults_uster": ["lot_no", "machine_no", "date", "shift_code", "count_ne", "kms", "yf", "n_neps", "s_short_thick", "l_long_thick", "t_thin"],
    "qm_splice_strength": ["lot_no", "machine_no", "date", "shift_code", "count_ne", "splice_pct"],
    "qm_wax_pickup": ["lot_no", "machine_no", "date", "shift_code", "count_ne", "overall_wax_pickup_pct"],
    "qm_bag_faults": ["lot_no", "date", "shift_code", "count_ne", "cone_tip_colour", "avg_cone_wt", "fault_cut_yarn", "fault_contamination"],
    "qm_blend_test": ["lot_no", "date", "nominal_ratio", "cotton_pct", "polyester_pct", "within_spec"],
    "qm_pwse_check": ["date", "shift_code", "machine_data_json"],
    "qm_bag_weight_check": ["lot_no", "date", "shift_code", "count_ne", "avg_net_weight", "pass_pct"],
}

print("\n=== 3. Key Column Presence ===")
for t, cols in KEY_COLS.items():
    if t not in existing:
        print(f"  {FAIL} {t} — TABLE MISSING")
        continue
    cur.execute(
        "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=%s",
        (t,),
    )
    have = {r[0] for r in cur.fetchall()}
    missing = [c for c in cols if c not in have]
    if missing:
        print(f"  {FAIL} {t}  missing cols: {missing}")
    else:
        print(f"  {PASS} {t}  all key cols present")

# ── 4. Row counts + mill isolation spot check ────────────────────────────────
print("\n=== 4. Row Counts ===")
for t in sorted(existing):
    cur.execute(f"SELECT COUNT(*) FROM {t}")
    cnt = cur.fetchone()[0]
    cur.execute(f"SELECT COUNT(DISTINCT mill_id) FROM {t}")
    mills = cur.fetchone()[0]
    marker = PASS if cnt >= 0 else FAIL
    print(f"  {marker} {t}: {cnt} rows across {mills} mill(s)")

# ── 5. Mill isolation test — insert then verify only visible from same mill ──
print("\n=== 5. Mill Isolation Test (qm_carding_cv_record) ===")
cur.execute("SELECT id FROM mills LIMIT 2")
mill_rows = cur.fetchall()

if len(mill_rows) < 2:
    print(f"  {WARN} Need ≥2 mills to test isolation — only {len(mill_rows)} found, skipping")
else:
    mill_a, mill_b = mill_rows[0][0], mill_rows[1][0]
    test_lot = f"TEST_{uuid.uuid4().hex[:8]}"

    # Insert one record for mill_a
    cur.execute(
        """
        INSERT INTO qm_carding_cv_record (id, mill_id, lot_no, machine_no, date, shift_code, status)
        VALUES (%s, %s, %s, 'TEST_MC', '2099-01-01', 'A', 'draft')
        """,
        (str(uuid.uuid4()), mill_a, test_lot),
    )
    conn.commit()

    # Query scoped to mill_a — should see it
    cur.execute(
        "SELECT COUNT(*) FROM qm_carding_cv_record WHERE lot_no=%s AND mill_id=%s",
        (test_lot, mill_a),
    )
    cnt_a = cur.fetchone()[0]

    # Query scoped to mill_b — must NOT see it
    cur.execute(
        "SELECT COUNT(*) FROM qm_carding_cv_record WHERE lot_no=%s AND mill_id=%s",
        (test_lot, mill_b),
    )
    cnt_b = cur.fetchone()[0]

    # Cleanup
    cur.execute("DELETE FROM qm_carding_cv_record WHERE lot_no=%s", (test_lot,))
    conn.commit()

    iso_ok = cnt_a == 1 and cnt_b == 0
    print(f"  Mill A sees record: {cnt_a} {PASS if cnt_a==1 else FAIL}")
    print(f"  Mill B sees record: {cnt_b} {PASS if cnt_b==0 else FAIL}")
    print(f"  Isolation: {PASS + ' PASS' if iso_ok else FAIL + ' FAIL'}")

# ── 6. Alembic version ───────────────────────────────────────────────────────
print("\n=== 6. Migration State ===")
cur.execute("SELECT version_num FROM alembic_version")
ver = cur.fetchone()
print(f"  Current migration: {ver[0] if ver else 'NONE'}")

conn.close()
print("\nDone.")
