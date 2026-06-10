# SpinFlow — Production Module Plan v3
## Based on: DATALOG Device Photos + ERP Book1.xlsx (5 sheets)

---

## 1. DATALOG Device — What It Is

The physical keypad (brand: DATALOG) sits at every Ring Frame machine. The operator punches a **numeric stop code** when a machine stops, and the device logs time-stamped stoppages. The screen shows **Prdn. / RPM / %** — live production, spindle RPM, and efficiency.

This is the **source of truth** for downtime. SpinFlow must import DATALOG exports OR replicate the same code system for manual entry.

---

## 2. DATALOG Stop Code Master List (Complete)

Extracted exactly from photos:

### General Codes — All Departments
| Code | Name |
|------|------|
| 1 | Normal (machine running) |
| 2 | Doff |
| 8 | Power Fail |
| 9 | Misc |
| 11 | Maintenance [Electrical] |
| 12 | Maintenance [Mechanical] |
| 13 | Electrical-Repair |
| 14 | Mechanical-Repair |
| 15 | Count Change |
| 16 | PS (REB) |
| 17 | PS (GEN) |
| 18 | QC |
| 19 | Lot Change |
| 20 | Sample |
| 21 | Cot Change |
| 22 | Planned Stop |
| 23 | Modification [Electrical] |
| 24 | Modification [Mechanical] |
| 25 | Modernisation |
| 26 | Roof Clean (A.C) |
| 27 | Excess Stock |
| 28 | QC Wheel Change |
| 29 | Air Pressure Down |
| 36 | General Clean |
| 39 | OHTC-Electrical |
| 40 | OHTC-Mechanical |
| 41 | Electrical & Mechanical Repair |

### Spinning-Specific (Ring Frame)
| Code | Name |
|------|------|
| 30 | BSS/RSI |
| 31 | Ring Traveller Change |
| 32 | Spacer Change |
| 38 | Link Coner Problem |

### Simplex-Specific
| Code | Name |
|------|------|
| 32 | Spacer Change |
| 33 | Sliver Shortage |
| 34 | Block Change |

### Drawing-Specific
| Code | Name |
|------|------|
| 33 | Sliver Shortage |
| 34 | Block Change |

### Comber & Unilap
| Code | Name |
|------|------|
| 33 | Sliver Shortage |
| 35 | Filter Jam |

### Carding
| Code | Name |
|------|------|
| 37 | Blow Room Maintenance |
| 38 | Filter Jam |

---

## 3. Department Taxonomy (Corrected from Excel)

The Excel reveals the **exact department grouping** used in the mill:

```
Back Process
├── Mixing
├── Blow Room
├── Carding
├── BD   ← Breaker Drawing (NOT "Blow Down")
├── FD   ← Finisher Drawing (NOT "Frame Draw")
└── Simplex

Spinning
└── Ring Frame

Finishing
├── Link Coner
├── Autoconer
├── YCP   ← Yarn Conditioning Plant
└── Packing
```

### Machine Code Prefixes
| Code | Department |
|------|------------|
| BR_  | Blow Room (e.g. BR_001) |
| CD_  | Carding (e.g. CD_002) |
| BD_  | Breaker Drawing (e.g. BD_001, BD_002) |
| FD_  | Finisher Drawing (e.g. FD_001, FD_002) |
| SMX_ | Simplex (e.g. SMX) |
| RF_  | Ring Frame |
| LC_  | Link Coner |
| AC_  | Autoconer |
| YCP_ | Yarn Conditioning Plant |
| PK_  | Packing |

---

## 4. Production Entry Form — Exact Field Structure

From the PRODUCTION ENTRY sheet, each department block has these columns:

### Per-Machine Row (all departments)
| Field | Description |
|-------|-------------|
| Sl no | Serial number (row index within department) |
| Mc Id | Machine code (e.g. CD_002, BD_001) |
| Lot no | Lot number (blank if no lot assigned) |
| Ratio | Fibre blend ratio for this lot |
| Target | Target production |
| Opening | Opening meter reading (spindle counter / bobbin count) |
| Closing | Closing meter reading |
| Production | Computed production (count/hank based) |
| KG | Production in kilograms |
| Effi% | Efficiency percentage |
| Remarks | Free text |

### Header Block (above the table, per department per shift)
| Field | Description |
|-------|-------------|
| Date | Entry date |
| Shift | A / B / C |
| Permanent / Running | Headcount type |
| PO/APO | Production Officer / Assistant Production Officer |
| Operator Number | Numeric ID |
| Operator Name | Name |
| Department | Carding / BD / FD / SMX etc. |

---

## 5. Waste Entry Form — Exact Field Structure

Separate form from production entry. Per-machine columns:

| Field | Description |
|-------|-------------|
| Sl no | Serial number |
| Mc Id | Machine code |
| Lot no | Lot number |
| Ratio | Blend ratio |
| Target | Target |
| Waste | Waste KG (only field different from production entry) |
| Remarks | Free text |

**Key insight:** Waste is entered on its OWN form, not as a column inside the production entry. The digital system must have a separate `WasteEntry` model.

---

## 6. Stoppage Form — Exact Field Structure

Per-row columns:

| Field | Description |
|-------|-------------|
| Section | Department/section code (not a serial number) |
| Mc Id | Machine code |
| From | Stop start time (HH:MM) |
| To | Stop end time (HH:MM) |
| Total min | Duration in minutes |
| Production loss | KG lost due to stoppage |
| Remarks | Free text (or DATALOG numeric code) |

**This maps directly to DATALOG exports.** The DATALOG device records From/To time + code number. The form has Remarks where the numeric stop code is written.

---

## 7. Mixing Change Slip — Exact Field Structure

The `mixing` sheet captures the **Mixing Change Intimation Slip**:

| Field | Description |
|-------|-------------|
| Sl no | Sequence number |
| Department / Mc ID | Machine receiving the mix change (e.g. BR_001) |
| Present Mixing | Current fibre mix (what's being used now) |
| Proposed Mixing | New fibre mix (what will be used) |
| Remarks | Reason / notes |

**Sub-rows per slip:**
- Cotton Lot
- Polyester Lot
- Others
- Viscose

**Meaning:** Each mixing change intimation slip has 4 fibre rows. For each fibre, supervisor writes current lot → new lot.

---

## 8. Manpower Form — Exact Field Structure

Two distinct sub-forms on the manpower sheet:

### Sub-form A: Individual Assignment (all departments)
| Field | Description |
|-------|-------------|
| Date | Date |
| Shift | A/B/C |
| PO/SPO | Production Officer / Senior PO |
| Department | Which dept |
| Sl no | Row number |
| Mc ID | Machine code |
| Operator_Id | Employee ID |
| Operator Name | Name |
| Category | Role category |
| Supervisor | Supervisor name |

**Category summary totals (right side):**
- Operator
- Ass. Operator
- Floor Cleaner

### Sub-form B: Ring Frame "Common Category" (machine range)
This is unique to Ring Frame — headcount is tracked by machine RANGE, not per individual machine:

| Field | Description |
|-------|-------------|
| Com. Category | Role name |
| Mc_id From | First machine in range (e.g. RF_001) |
| Mc_id To | Last machine in range (e.g. RF_024) |
| Total mcs | Count of machines in range |

**Roles tracked in Common Category:**
1. Line Man
2. Doffer
3. House Keeper
4. Pneumafil Collection
5. Floor Cleaner
6. Gripperman
7. Cope Carrier
8. Robo Doffer
9. Roving Carrier
10. Maintenance Assistant

---

## 9. Revised Data Model

### 9.1 New Table: `datalog_stop_codes`
```sql
CREATE TABLE datalog_stop_codes (
    code          INTEGER PRIMARY KEY,          -- numeric code (1–41)
    name          VARCHAR(100) NOT NULL,
    departments   JSONB,                        -- null = all depts; ["spinning","simplex"] = dept-specific
    category      VARCHAR(30),                  -- 'breakdown_electrical','breakdown_mechanical',
                                               -- 'planned','utility','production_change','quality'
    is_active     BOOLEAN DEFAULT TRUE
);
```

### 9.2 Updated: `downtime_logs` (stop_type → datalog_code)
New field: `datalog_code INTEGER` — the raw numeric code from DATALOG device.
Keep `stop_type VARCHAR(50)` as the category mapping (auto-derived from code).

### 9.3 New Table: `waste_entries`
Separate from `production_entries`. Per-machine per-shift waste record:
```sql
CREATE TABLE waste_entries (
    id              VARCHAR(36) PK,
    mill_id         VARCHAR(36),
    date            VARCHAR(10),
    shift           VARCHAR(1),
    department      VARCHAR(50),
    machine_code    VARCHAR(50),
    lot_no          VARCHAR(50),
    ratio           VARCHAR(50),    -- e.g. "60:40"
    target_kg       NUMERIC(10,3),
    waste_kg        NUMERIC(10,3),
    remarks         TEXT,
    operator_id     VARCHAR(36),
    entered_by      VARCHAR(200),
    created_at      TIMESTAMPTZ DEFAULT NOW()
)
```

### 9.4 Updated: `production_entries`
Add: `ratio VARCHAR(50)` — blend ratio at time of entry.
Add: `effi_pct NUMERIC(6,3)` — efficiency % (can be computed or entered).
Keep: `opening_meter`, `closing_meter`, `production_kg_computed`, `production_kg_actual`.

### 9.5 New Table: `rf_manpower_plan` (Ring Frame Common Category)
```sql
CREATE TABLE rf_manpower_plan (
    id              VARCHAR(36) PK,
    mill_id         VARCHAR(36),
    date            VARCHAR(10),
    shift           VARCHAR(1),
    category        VARCHAR(50),      -- 'line_man','doffer','house_keeper' etc.
    mc_id_from      VARCHAR(50),      -- RF_001
    mc_id_to        VARCHAR(50),      -- RF_024
    total_machines  INTEGER,
    headcount       INTEGER DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(mill_id, date, shift, category, mc_id_from, mc_id_to)
)
```

### 9.6 Updated: `shift_manpower_plan`
Add: `operator_id VARCHAR(36)`, `category VARCHAR(50)` — individual assignments.
Split into two tables:
- `shift_manpower_plan` — individual assignments (all depts)
- `rf_manpower_plan` — Ring Frame common category (machine range)

### 9.7 Updated: `mixing_change_log`
Add per-row sub-entries:
```sql
CREATE TABLE mixing_change_fibre_rows (
    id              VARCHAR(36) PK,
    change_log_id   VARCHAR(36) FK→mixing_change_log(id),
    fibre_type      VARCHAR(50),      -- 'cotton','polyester','viscose','others'
    present_lot     VARCHAR(100),
    proposed_lot    VARCHAR(100),
    remarks         TEXT
)
```

---

## 10. API Changes Required

### New endpoints:
1. `GET/POST /production/waste-entries` — separate waste entry CRUD
2. `GET/POST /production/datalog-stop-codes` — lookup table management
3. `POST /production/downtime` — accept `datalog_code` field, auto-map to `stop_type`
4. `GET/POST /production/rf-manpower` — Ring Frame common category manpower
5. `POST /mixing/change-log/{id}/fibre-rows` — add fibre rows to mixing change slip

### Updated endpoints:
- `POST /production/entries` — add `ratio` and `effi_pct` fields
- `POST /production/entries/bulk` — same additions
- `GET /production/page-init` — return `datalog_stop_codes` for dropdown

---

## 11. Migration 020 — Required Changes

```sql
-- Add datalog_code to downtime_logs
ALTER TABLE downtime_logs ADD COLUMN datalog_code INTEGER;
ALTER TABLE downtime_logs ADD COLUMN stop_from TIME;
ALTER TABLE downtime_logs ADD COLUMN stop_to TIME;

-- Add ratio + effi_pct to production_entries
ALTER TABLE production_entries ADD COLUMN ratio VARCHAR(50);
ALTER TABLE production_entries ADD COLUMN effi_pct NUMERIC(6,3);

-- New tables
CREATE TABLE datalog_stop_codes (...)
CREATE TABLE waste_entries (...)
CREATE TABLE rf_manpower_plan (...)
CREATE TABLE mixing_change_fibre_rows (...)
```

---

## 12. Revised Department Config

The app's left-nav sidebar structure should match exactly:

```
Production
├── Manpower
├── Production Entry
├── Waste Entry
└── Stoppage

Departments (left panel of each form):
  Back Process
  ├── Mixing
  ├── Blow Room
  ├── Carding
  ├── BD (Breaker Drawing)
  ├── FD (Finisher Drawing)
  └── Simplex

  Spinning
  └── Ring Frame

  Finishing
  ├── Link Coner
  ├── Autoconer
  ├── YCP
  └── Packing
```

---

## 13. Ring Frame Manpower Categories (Complete List)

For SpinFlow, these must be seeded as enum/lookup values:

| DB Value | Display Name |
|----------|-------------|
| line_man | Line Man |
| doffer | Doffer |
| house_keeper | House Keeper |
| pneumafil_collection | Pneumafil Collection |
| floor_cleaner | Floor Cleaner |
| gripperman | Gripperman |
| cope_carrier | Cope Carrier |
| robo_doffer | Robo Doffer |
| roving_carrier | Roving Carrier |
| maintenance_assi | Maintenance Assistant |

---

## 14. What to Build Next (Priority Order)

### P0 — Critical correctness fixes
1. **Migration 020**: Add `datalog_code` to `downtime_logs`, `ratio`+`effi_pct` to `production_entries`, create `waste_entries` + `datalog_stop_codes` + `rf_manpower_plan` + `mixing_change_fibre_rows`
2. **Seed `datalog_stop_codes`** with all 41 codes and their department mappings
3. **Waste Entry API**: `GET/POST /production/waste-entries` (separate from production entries)
4. **Stop code mapping**: `POST /production/downtime` accepts `datalog_code`, auto-derives `stop_type`

### P1 — Core forms
5. **React: Production Entry form** — matches Excel layout exactly (department panel + machine grid with Opening/Closing/KG/Effi%)
6. **React: Waste Entry form** — same layout but only Waste KG column
7. **React: Stoppage form** — Section/Mc Id/From/To/Total min/Production loss + DATALOG code picker
8. **React: Manpower form** — two sub-forms (individual + RF common category)

### P2 — Mixing
9. **Mixing Change Slip form** — with 4 fibre rows (Cotton/Polyester/Others/Viscose) per machine
10. **DATALOG import**: CSV/Excel upload that maps numeric codes to SpinFlow downtime logs

---

## 15. Key Corrections to Previous Architecture

| Previous Assumption | Actual (from Excel + Photos) |
|---------------------|------------------------------|
| stop_type = 9-value enum | stop_type = 41 DATALOG numeric codes, mapped to categories |
| BD = Blow Down | BD = Breaker Drawing |
| FD = frame something | FD = Finisher Drawing |
| waste_kg is column in production_entries | Waste is a SEPARATE daily form (waste_entries table) |
| Manpower = planned_count / actual_count per dept | Manpower has individual assignment + Ring Frame uses machine-range + 10 role categories |
| Mixing change has 4 columns | Mixing change has per-fibre-type rows (Cotton Lot, Polyester Lot, Viscose, Others) |
| No YCP department | YCP (Yarn Conditioning Plant) is a Finishing dept between Autoconer and Packing |
| PSI = Air Pressure | PS(REB) and PS(GEN) are separate codes (REB = Rubber, GEN = General) |
