#!/usr/bin/env python3
"""
QA smoke test: prove every Quality v2 form endpoint accepts a save without
hard-failing, even with only a date supplied (the scenario that produced the
"Failed to save" toast).

Usage:
    BASE_URL=https://your-staging-api  TOKEN=<jwt>  python scripts/qa_quality_save_smoke.py

It POSTs a minimal payload to each /api/v1/quality/v2/<slug> endpoint and
reports PASS (2xx) / FAIL (non-2xx) per endpoint. A clean run means no table
in the Quality module rejects a save.
"""
import os
import sys
import json
import datetime
import urllib.request
import urllib.error

BASE = os.environ.get("BASE_URL", "http://localhost:8000").rstrip("/")
TOKEN = os.environ.get("TOKEN", "")
TODAY = datetime.date.today().isoformat()

# Mirrors _V2_MODEL_MAP slugs in app/api/v1/quality_forms.py
SLUGS = [
    "carding/cv-record", "carding/waste-study", "carding/wrapping",
    "drawing/cv-record", "drawing/a-pct", "drawing/sliver-wrapping",
    "simplex/hank-test", "simplex/breakage-study", "simplex/stretch-pct",
    "ring-frame/csp-report", "ring-frame/breakage-study", "ring-frame/snap-study",
    "auto-coner/yarn-faults", "auto-coner/splice-strength", "auto-coner/wax-pickup",
    "auto-coner/bag-faults",
    "packing/blend-test", "packing/pwse-check", "packing/bag-weight",
    "packing/paper-cone",
]

# Minimal payload — ONLY a date. This is the worst case: every other field blank.
MINIMAL = {"date": TODAY, "remarks": "QA smoke — minimal payload"}

# A fuller payload to confirm normal entries also save.
FULL = {
    "date": TODAY, "shift_code": "NIGHT", "lot_no": "QA-LOT-001",
    "machine_no": "QA-MC-01", "remarks": "QA smoke — full payload",
}


def post(slug, payload):
    url = f"{BASE}/api/v1/quality/v2/{slug}"
    data = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=data, method="POST")
    req.add_header("Content-Type", "application/json")
    if TOKEN:
        req.add_header("Authorization", f"Bearer {TOKEN}")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, r.read().decode()[:200]
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:300]
    except Exception as e:  # noqa: BLE001
        return 0, str(e)


def main():
    if not TOKEN:
        print("WARNING: no TOKEN set — requests will likely 401.\n")
    passed = failed = 0
    for slug in SLUGS:
        for label, payload in (("minimal", MINIMAL), ("full", FULL)):
            status, body = post(slug, payload)
            ok = 200 <= status < 300
            mark = "PASS" if ok else "FAIL"
            if ok:
                passed += 1
            else:
                failed += 1
            print(f"[{mark}] {status:>3}  {slug:28} ({label})"
                  + ("" if ok else f"  -> {body}"))
    print(f"\n{passed} passed, {failed} failed, {len(SLUGS) * 2} total")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
