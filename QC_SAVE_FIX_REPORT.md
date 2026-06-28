# Quality "Failed to save" — Root Cause & System-Wide Fix

## What was happening
The Quality forms (Daily Sliver Wrapping, Drawing CV, A% Check, and ~56 other QC
tables) rejected saves with a red **"Failed to save"** toast whenever a form left
a field like **Lot No**, **Machine No**, or **Shift** blank.

## Root cause
Almost every quality table defined `lot_no`, `machine_no`, `shift_code`, and
`line_no` as **NOT NULL with no default**. The generic save endpoint
(`_v2_create`) passes the form's values straight to an INSERT, so a blank field
became a SQL `null value in column ... violates not-null constraint` error. The
frontend then showed a generic toast that hid the real reason.

A secondary bug: the shared wrapping dialog sent the computed CV% under the key
`cv_pct`, but the Sliver Wrapping table's column is named `hank_cv_pct`, so the
calculated CV% silently failed to persist on that form.

## The fix (4 layers)

1. **Schema relaxed (models + migration).** `lot_no`, `machine_no`, `shift_code`,
   `line_no` are now nullable across all 56 QC tables (126 columns). A QC sample
   can be recorded before a lot/machine/shift is assigned. Structural columns
   (`date`, foreign keys, financial fields) were left required on purpose.
   - Code: `backend/app/models/quality_forms.py`
   - Migration: `backend/alembic/versions/057_relax_qc_form_columns_nullable.py`
     (idempotent — skips any table/column not present in a given DB; safe down-grade)

2. **Backend save guard.** New `_coerce_payload()` in
   `backend/app/api/v1/quality_forms.py` runs on every v2 create **and** update:
   - drops unknown keys (e.g. `custom_fields`, mismatched `cv_pct`) instead of crashing
   - converts empty strings `""` → `NULL`
   - coerces numeric strings (`"34.90"` → `34.9`); un-parseable values become `NULL`
     rather than aborting the insert
   - `_v2_update` now has the same try/rollback + clear-error handling `_v2_create` had

3. **Real error messages.** New `saveErrorMessage()` helper in
   `src/routes/_app.quality.tsx` replaces all six generic "Failed to save" toasts.
   It surfaces the actual FastAPI `detail`, formats 422 validation arrays, and
   distinguishes 401 / 403 / network errors — so you never again see a blank reason.

4. **CV% key fix.** The wrapping dialog now sends CV% under both `cv_pct` and
   `hank_cv_pct`; the backend keeps whichever column the target model actually has.

## How to apply

```bash
# 1. Run the migration (staging first)
cd backend
alembic upgrade head        # applies revision 057

# 2. Deploy backend + frontend as usual (Render)
```

## How to verify

### Automated smoke test (fastest)
Hits every quality form endpoint with a minimal (date-only) and a full payload.
A clean run = no QC table rejects a save.

```bash
cd backend
BASE_URL=https://<your-staging-api> TOKEN=<jwt> \
  python scripts/qa_quality_save_smoke.py
```

Expect: every line `[PASS]`, exit code 0.

### Manual checklist
For each tab below: open **Add record**, fill **only the date**, click **Save record**.
It should save (no red toast). Then re-open, fill all fields, save again.

- [ ] Carding → CV Record
- [ ] Carding → Waste Study
- [ ] Carding → Wrapping
- [ ] Drawing → CV Record
- [ ] Drawing → A% Check
- [ ] Drawing → Daily Sliver Wrapping (BD/FD)  ← the form from the screenshot
- [ ] Simplex → Hank Test
- [ ] Simplex → Breakage Study
- [ ] Simplex → Stretch %
- [ ] Ring Frame → CSP Report
- [ ] Ring Frame → Breakage Study
- [ ] Ring Frame → Snap Study
- [ ] Auto Coner → Yarn Faults
- [ ] Auto Coner → Splice Strength
- [ ] Auto Coner → Wax Pickup
- [ ] Auto Coner → Bag Faults
- [ ] Packing → Blend Test
- [ ] Packing → PWSE Check
- [ ] Packing → Bag Weight
- [ ] Packing → Paper Cone

Then confirm the calculated **CV%** now saves and displays on the Sliver Wrapping record.

## Scope note
This fix covers the Quality module, where the failure occurred. The same
NOT-NULL-without-default pattern exists in a few non-form tables
(`dispatch_items.lot_no`, `cotton_purchases.supplier_id`, etc.), but those are
**referential/financial** fields that *should* stay required — loosening them
would risk orphaned or incomplete records. If you also hit "Failed to save" in
Dispatch, Purchase, or Production, tell me and I'll apply the same guard there
with field-appropriate rules.
