# SpinFlow ERP — Architecture Addendum
## Based on Physical Register Analysis (AA Yarn Mills Limited)

**Prepared by:** SpinFlow CTO Office  
**Date:** 2026-06-10  
**Source:** 27 physical register photographs from actual mill operations  
**Purpose:** Corrections and additions to Architecture Review v1.0

---

## EXECUTIVE SUMMARY OF NEW FINDINGS

After reading every register photographed from AA Yarn Mills, eleven architectural decisions in v1.0 need to be revised or extended. These are not minor additions — several change core entity design.

---

## FINDING 1 — THE MILL RUNS MULTI-FIBRE BLENDED YARN

### What the registers show
Image 5 (Customer Order Tracker) and Image 8 (Ratio-wise Backside Production) confirm this mill produces blended yarn, not pure cotton:
- **CNC** = Combed Cotton (100%)
- **PC** = Polyester + Cotton (65:35, 80:20)
- **CNC 60/40** = Combed Cotton + something at 60:40
- **B2, B3** = different blend ratios tracked separately through Carding, Drawing, Simplex
- Colours tracked at lot level: "S.B Monk", "Red½moon", "N.Pink", "6Green+mon", "S.B Ston", "Red Solid"

### Impact on database design
The `lot_master` table in v1.0 has only `count_ne` and `mixing_lot_id`. This is insufficient.

**Revised lot_master additions:**
```
fiber_composition  JSONB   -- {"cotton": 60, "polyester": 40} or {"cotton": 65, "viscose": 35}
yarn_type          ENUM    -- carded / combed / compact / blended / pcblend
colour_code        VARCHAR -- "SB_MONK", "RED_HALF_MOON", "N_PINK", "NATURAL" etc.
colour_category    ENUM    -- natural / solid / melange / stripe
```

**New entity: fiber_type_master**
```
id, mill_id, fiber_code (CNC / PC / CV / NB etc.),
fiber_name (Combed Cotton / Polyester / Viscose / Nylon Blend),
density_g_per_cc, cost_per_kg, created_at
```

### Impact on production tracking
Every production entry must carry the blend ratio, because the same machine can run 60:40 today and 80:20 tomorrow on the same count. Efficiency and waste norms differ by ratio — not just by count.

---

## FINDING 2 — MIXING IS A LAYERED PHYSICAL SYSTEM, NOT JUST A RATIO

### What the register shows
The **Mixing Change Intimation Slip** (pink clipboard image) reveals the mixing is designed in layers:

| Layer | Material |
|---|---|
| Constant | (fixed base layer) |
| Cotton Pre Layer | cotton bales, specific count |
| Polyester Per Layer | polyester fibre |
| Black Viscose Per Layer | black viscose |
| White Viscose Per Layer | white viscose |

The slip captures: Blow Room Line No, Present Mixing, Proposed Mixing, Proposed Mixing Quantity.

This is a **formal workflow** — mixing changes require a written intimation slip that flows from Planning → Blow Room Supervisor → Quality → Production Manager. It is not a verbal instruction.

### New entity: mixing_recipe
```
id, mill_id, mixing_code, mixing_name,
blow_room_line_id,
layers: JSONB [
  { layer_seq: 1, material: "cotton_pre", fiber_type_id: X, bales_per_layer: 3, kg_per_layer: 180 },
  { layer_seq: 2, material: "polyester", fiber_type_id: Y, bales_per_layer: 2, kg_per_layer: 80 },
  ...
]
total_bales_per_mixing, total_kg,
status (active/superseded), created_by, approved_by
```

### New entity: mixing_change_log
```
id, mill_id, blow_room_line_id, shift_instance_id,
previous_mixing_id, proposed_mixing_id, proposed_qty_kg,
raised_by, approved_by, executed_at,
reason (count_change / lot_change / quality_hold / planned),
intimation_slip_number
```

### New entity: laydown_record (from Image 17)
```
id, mill_id, blow_room_line_id, shift_instance_id,
date, board_number, mixing_id,
cotton_suite_bales, poly_bales, ba_bales,
production_shift_a_kg, production_shift_b_kg,
apo_sign, dpo_sign, spo_sign
```

---

## FINDING 3 — PRODUCTION IS MEASURED BY METER READINGS, NOT ESTIMATED

### What the registers show
**Ring Frame (Images 25, 27)** — Each machine has an **Opening meter (O/m)** and **Closing meter (C/m)** in 6-digit numbers representing spindle revolution counters. Examples:
- RF-95: O/m = 1,060,069 → C/m = 1,060,069 (diff = 0 → machine stopped all shift)
- RF-96: O/m = 1,742,211 → C/m = 1,742,310 (diff = 99)
- RF-106: O/m = 83,847 → C/m = 83,847 (same)

Production kg = (C/m − O/m) × count_factor where count_factor depends on count Ne.

**Simplex (Image 20)** — Has **OPENING** and **CLOSING** bobbin counts per machine. Production = (Closing − Opening) × Hank × weight_per_hank.

### Impact on database
The `production_shift_log` in v1.0 stores only `production_kg` (manually calculated). This allows data manipulation. The source of truth should be the meter readings.

**Revised production_shift_log additions:**
```
-- For Ring Frame
opening_meter_reading   BIGINT   -- actual counter reading at shift start
closing_meter_reading   BIGINT   -- actual counter reading at shift end
spindle_meters          BIGINT   -- computed: closing - opening
production_kg_computed  NUMERIC  -- system calculated from spindle_meters + count
production_kg_actual    NUMERIC  -- supervisor-entered (manual override with reason)
variance_kg             NUMERIC  -- computed - actual (flags data quality issues)

-- For Simplex
opening_bobbins   INT
closing_bobbins   INT
hank_value        NUMERIC   -- count setting on machine
```

**Business rule:** If `production_kg_actual` differs from `production_kg_computed` by more than 5%, system flags for shift incharge review. This detects both errors and manipulation.

---

## FINDING 4 — PLANNED STOPS ARE A SEPARATE CATEGORY FROM BREAKDOWNS

### What the register shows
**Stoppage Information Register (Image 18)** shows stops like:
- "Flat Grinding" — 30 min planned stop for flat wire grinding on carding
- "O.C Waste Collect" — 40 min stop for over-course waste collection
- "Flats Gass" — possibly flat gauge check

These are **planned operational stops** — not machine failures. They recur regularly and their duration can be predicted. The current breakdown_log treats all stops as failures.

### Revised stop categorisation
```
stop_type ENUM:
  breakdown_mechanical    -- M/P — unexpected, unplanned
  breakdown_electrical    -- E/P — unexpected, unplanned  
  breakdown_power_failure -- Power cuts, EB failure
  breakdown_end_breakage  -- yarn break causing full stop
  planned_maintenance     -- flat grinding, traveller change
  planned_waste_collect   -- OC waste collection, sweep
  planned_count_change    -- machine being reset for new count
  planned_lot_change      -- machine being reset for new lot
  utility_failure         -- compressor, humidification (cross-cutting)
```

### New entity: utility_breakdown_log
From Image 1 — "Compressor Break: 6:40–7:20, 10:50–11:40, 1:10–1:40"

A compressor breakdown is NOT a machine breakdown. It stops all autocone machines simultaneously. The current model would create 11 separate breakdown records (one per machine) — which is wrong.

```
id, mill_id, utility_type (compressor / eb_power / humidification / air / water),
shift_instance_id, department_affected,
start_time, end_time, duration_minutes,
total_machines_affected INT,
total_production_loss_kg NUMERIC,
reported_by, repaired_by, remarks
```

When a utility breakdown is logged, the system auto-attributes production loss across all affected machines — supervisors should not need to enter machine-by-machine.

---

## FINDING 5 — THE MACHINE HIERARCHY IS SECTION → LINE → MACHINE

### What the registers show
**Section-wise Summary (Image 6)** uses: Line A-1, A-2, A-3, A-4, B-1, B-2, B-3, B-4 within each department.

**Ring Frame Count Change Register (Image 22)** shows: L-No (Line Number) A-03 had 18 running + 5 stopped = 23 total. A-04 had 03 running + 22 stopped = 25 total.

**Stoppage Register (Image 18)** uses section numbers 46, 47, 48, 49, 50 — these appear to be carding section numbers (Carding sections grouped by machine range).

### Revised machine hierarchy
```
Department (Carding / Drawing / Simplex / Ring Frame / Auto Cone / Packing)
  └── Line / Section  (A, B, C or numeric 01, 02...)
        └── Machine   (machine number within line)
```

**Revised machine table:**
```
id, mill_id, department_id,
line_code     VARCHAR  -- "A", "B", "01", "02" etc.
machine_number INT     -- number within line
full_code      VARCHAR -- computed: "RF-A-03" or "CD-46"
machine_model VARCHAR, specs JSONB,
total_spindles INT (for ring frame)
```

**Impact on dashboards:** Supervisor screen must show Line → Machine drill-down, not just flat machine list. Ring frame supervisor manages a LINE (A-side, B-side), not individual machines.

---

## FINDING 6 — WASTE HAS ITS OWN LIFECYCLE MODULE

### What the registers show
**Waste Stock Register (Image 10)** shows 8 distinct waste categories stored as bales:
- CNC(60/40) sliver + pneumafil → 06 bales = 684 kg
- PC(60/40) sliver + pneumafil → 03 bales = 385 kg
- CNC(40/40) sliver + pneumafil → 02 bales = 222 kg
- Blow Room loose cotton → 04 bales = 126 kg
- PC(60/50) sliver + pneumafil → 04 bales = 530 kg
- PC(65/35) sliver + pneumafil (recombed) → 01 bale = 175 kg
- Quality sample sliver → 01 bale = 405 kg
- CNC(71/29) sliver + pneumafil → 04 bales = 490 kg

**Wastage Transfer Register (Image 11)** tracks waste movement date-by-date with columns for different waste sub-types.

### New entity: waste_stock
```
id, mill_id, waste_category_id,
fiber_composition JSONB,   -- {"cotton": 60, "polyester": 40}
process_stage    ENUM      -- blow_room / carding / drawing / simplex / ring / cone
waste_sub_type   ENUM      -- sliver / pneumafil / sweep / hard_waste / soft_waste / sample
source_machine_range VARCHAR,
bale_count        INT,
weight_kg         NUMERIC,
as_of_date        DATE,
entered_by, created_at
```

### New entity: waste_transfer
```
id, mill_id, from_location (floor/store), to_location (store/sale/reprocess),
waste_category_id, bales_transferred INT, weight_kg NUMERIC,
transfer_date, approved_by, lorry_receipt_number,
buyer_name (if sold), rate_per_kg (if sold), amount NUMERIC
```

**Waste P&L:** Waste sold generates revenue. Waste reprocessed saves cotton cost. The system must compute monthly waste recovery value (bales sold × rate − collection cost) as a separate cost centre line item.

---

## FINDING 7 — AUTOCONE HAS A SPLICE QUALITY REGISTER

### What the register shows
**Image 24 (Autocone Speed Check)** — Per machine per shift:
- Avg speed: 18005 RPM (most machines), some at 18012, 18002, 18029
- D.zone: arrow symbols (checked/ok)
- Spec: arrow symbols
- B.Roll: values
- 4/S: 3–5 (splices per 4 sides?)
- R/s: 2–4 (reject splices per run?)
- n/bo: 5–9 (no-bobbin events per run?)

Total for the shift: 21,120 splices, 194 rejections = **0.68% splice rejection rate**

This is a quality patrol check done per machine per shift. The 0.68% rejection rate is a key KPI for autocone quality.

### New fields in autocone_production_log
```
splice_total         INT     -- total splices made this check period
splice_rejects       INT     -- rejected splices
splice_rejection_pct NUMERIC -- computed
no_bobbin_events     INT     -- times machine ran out of bobbin (supply issue from RF)
drum_speed_avg       INT     -- actual RPM recorded (vs. setpoint)
dzone_ok             BOOL    -- D-zone check passed
spec_ok              BOOL    -- specification check passed
```

**Alert rule:** If splice_rejection_pct > 1.0% on any machine → flag for splicer setting check. If no_bobbin_events > 10 per session → flag to ring frame for supply issue.

---

## FINDING 8 — CUSTOMER ORDER REGISTER HAS LIVE BALANCE TRACKING

### What Image 5 reveals
This is the most important management document in the mill — the live order tracking sheet. Fields confirmed:

| Column | Meaning | Example |
|---|---|---|
| Count | Yarn count | 12cvc, 22cvc, 30cvc |
| Lot | Production lot | PS-1741, P-1759K |
| Ratio | Blend % | 60:40 |
| C.T.C | Cotton Type + Colour | Fresh, S.B Monk, Red½moon, N.Pink |
| Target | Order quantity kg | 93, 369, 233 |
| Active | Produced to date | 26, 259, 233 |
| Due | Balance remaining | 67, 110, OK |
| JCP | Dispatch authorised? | Yes / No |
| Fonts | Font/Bag type? | Yes / No |
| Customer | Party name | Echotex, Topex, Subline |

"Due = OK" means the lot is complete and ready. "Due = NO" means JCP not cleared. There are also "PN" (Pending?) entries.

### Revised customer_order entity
```
id, mill_id, customer_id, order_number,
count_ne, fiber_type (CNC/PC/B2...), yarn_type (combed/carded),
blend_ratio JSONB,           -- {"cotton": 60, "polyester": 40}
colour_code VARCHAR,          -- "N_PINK", "RED_HALF_MOON", "NATURAL"
colour_name VARCHAR,          -- customer's colour description
quantity_kg NUMERIC,
delivery_date DATE,
jcp_cleared BOOL DEFAULT FALSE,   -- dispatch authorisation
jcp_cleared_by, jcp_cleared_at,
font_type VARCHAR,            -- bag/package specification
priority ENUM (normal/urgent/rush),
status, balance_kg (computed), created_at
```

### JCP — New Workflow Discovery
"JCP" (Job Completion Permission / or Quality Clearance Permission) appears to be a sign-off required before dispatch. The JCP column shows "Yes" or "No" per lot. This is a **quality release gate at the order level**, not just the lot level. A lot can pass quality but be held by JCP pending customer payment clearance or commercial terms.

**New entity: jcp_clearance**
```
id, mill_id, customer_order_id, lot_id,
jcp_type   ENUM  -- quality_release / commercial_clearance / both
raised_by, raised_at,
cleared_by, cleared_at,
hold_reason VARCHAR,
status      ENUM  -- pending / cleared / rejected
```

---

## FINDING 9 — BALE CONSUMPTION IS TRACKED MACHINE-WISE, NOT JUST LOT-WISE

### What Image 14 shows
Bale Process Register: Machine B2 45s cotton = New lot → total bales processed = 137,064 (running lot total). Sweep, Sliver (silver), BreSliver values per machine per shift. Running bale balance per machine.

This means the system must track:
- How many bales entered Blow Room per shift
- How many kg of each fiber type were consumed per machine per shift
- Running bale balance (remaining stock of opened bales)
- When a mixing "runs out" and new laydown is needed

### New entity: bale_consumption_log
```
id, mill_id, blow_room_line_id, shift_instance_id,
mixing_id, fiber_type_id,
bales_opened      INT,       -- bales torn open this shift
cotton_fed_kg     NUMERIC,   -- kg fed into machine
sweep_kg          NUMERIC,   -- sweep waste extracted
sliver_kg         NUMERIC,   -- sliver output
bre_sliver_kg     NUMERIC,   -- broken sliver waste
remaining_bales   INT,       -- running balance
entered_by, created_at
```

---

## FINDING 10 — MANPOWER IS A SHIFT-DEPARTMENT-ROLE HEADCOUNT

### What Image 13 shows
P/B-R/A manpower setup: **Foreman = 01, F/C = 01, Laydown man = 03, Bale process = 04, S.L.m/m = 04, Ring S.m.L = 03, Received = 01**. Total ~17 people listed with card numbers and names.

P/C-R/B: **Foreman = 01, Laydown man = 04, Bale PW = 03, BLS m/m = 05, S+P Received = 01**, Total = 11+.

This is not a general headcount — it's a **role-wise deployment** for that specific shift and department. The ERP must support role-slot planning: "This department on Shift B needs 3 laydown men" and check against actual deployment.

### New entity: shift_manpower_plan
```
id, mill_id, department_id, shift_instance_id,
role_type ENUM (foreman/floor_controller/laydown_man/bale_process/machine_operator/line_supervisor/received),
planned_count INT,
actual_count  INT,
employee_ids  UUID[]   -- actual employees deployed
shortfall     INT,     -- computed: planned - actual
entered_by, created_at
```

**Alert:** If actual < planned for any critical role (foreman, line supervisor) → flag to HR/Shift Incharge immediately.

---

## FINDING 11 — AUTOCONE BREAKDOWN SUMMARY IS COUNT-WISE, NOT JUST MACHINE-WISE

### What Image 23 shows
Breakdown analysis for autocone shift summary:

| Count | Ratio | Reason | Stop (min) | Loss (kg) |
|---|---|---|---|---|
| 16cvc | 60/40 | M/P | 310 | 209 |
| 16cvc | 60/40 | E/P | 180 | 87 |
| 16cvc | 60/40 | R.out | 390 | 270 |
| 16cvc | 60/40 | R.E.B | 180 | 120 |
| 24cvc | 60/40 | R.C | 40 | 19 |
| 24cvc | 60/40 | E/P | 60 | 30 |
| 30cvc | 60/40 | R.E.B | 180 | 50 |
| n n | n n | E/P | 785 | 269 |

"R.out" = Ring out (bobbin ran out — supply issue from ring frame). "R.E.B" = Ring End Breakage. "R.C" = Ring Creel (creel issue). These are autocone-specific breakdown reasons that depend on the count being run.

### Revised breakdown_reason taxonomy for Autocone
```
autocone_breakdown_reasons:
  machine_problem         -- M/P mechanical failure
  electrical_problem      -- E/P
  ring_out                -- R.out: no bobbin supply from ring frame
  ring_end_breakage       -- R.E.B: yarn breakage on the bobbin
  ring_creel_problem      -- R.C: creel/bobbin handling issue
  wax_run_out             -- waxing disc empty
  splicer_failure         -- splicer unit failure
  drum_problem            -- drum groove issue
  compressor_failure      -- utility (links to utility_breakdown_log)
  power_failure           -- EB failure
```

**Critical insight:** "R.out" (Ring out) events at autocone are a **signal about Ring Frame performance**. If Ring Frame is not supplying bobbins on time, autocone machines sit idle. The system should correlate R.out events at autocone with ring frame's doffing frequency on the linked machines. This is a cross-department dependency alert.

---

## FINDING 12 — RING FRAME PRODUCES A LINE-WISE SUMMARY

### What Image 26 shows
Ring Frame P/A-R/C summary:
- **Line 3**: Target 2662 kg, Achieve 2587 kg, Efficiency **97%**, Stop 300 min, Loss 75 kg
- **Line 4**: Target 120 kg, Achieve 117 kg, Efficiency **97%**, Stop 10 min, Loss 03 kg
- Breakdown by reason: M/P = 230 min / 58 kg loss, E/P = 80 min / 20 kg loss

This line-level summary is what the Production Manager reviews — not individual machine data. The dashboard must aggregate machine data to line level automatically.

### New computed view: ring_frame_line_summary
```
mill_id, shift_instance_id, department_id, line_code,
total_machines INT, running_machines INT, stopped_machines INT,
target_kg NUMERIC, actual_kg NUMERIC, efficiency_pct NUMERIC,
total_stop_minutes INT, total_production_loss_kg NUMERIC,
breakdown_by_reason JSONB  -- {"mechanical": {"minutes":230, "loss_kg":58}, "electrical": {...}}
```

This is a materialised/computed view, refreshed each time a production or breakdown entry is saved for that shift + line.

---

## FINDING 13 — HUMIDIFICATION IS MEASURED AS DUCT FEED RATES

### What Images 9 and 16 show
The "Microduft A/C" register tracks per department per shift:
- 40s cotton D1 (Draw Frame 1) = 135, 127, 132
- Cotton H/W (Humidification Water?) = 188
- Sweep = 132, 127
- Cotton Da2 (Draw Frame 2) = 268, 186

These values are likely **litres per hour** or **% relative humidity** readings from the humidification duct system feeding each machine zone. Tracked twice per shift.

### New entity: humidification_log
```
id, mill_id, department_id, machine_zone VARCHAR,
shift_instance_id, reading_time (08:00/14:00/20:00/02:00),
rh_pct         NUMERIC,   -- relative humidity %
temperature_c  NUMERIC,   -- temperature
duct_flow      NUMERIC,   -- duct feed rate (if measured)
water_consumed_ltrs NUMERIC,
entered_by, created_at
```

**Alert rules:**
- If RH drops below department threshold → alert supervisor + maintenance (humidification plant check)
- If RH drop correlates with end breakage spike in same department → auto-link in quality root cause

---

## REVISED COMPLETE DATA FLOW

With all findings incorporated, the corrected production data flow is:

```
Cotton Bale Purchase (vendor, HVI test, variety, weight)
  ↓
Mixing Recipe (fiber layers: cotton/polyester/viscose, ratios, bales per layer)
  ↓
Laydown Record (blow room line, date, mixing code, fiber quantities)
  ↓
Bale Consumption Log (per shift, per machine, bales opened, cotton fed kg)
  ↓
Blow Room Production (laps/slivers produced, waste extracted)
  ↓
Carding Production (M/C, Ratio, Speed, Target, KG, EFF%, waste, ratio-wise split)
  ↓
Drawing Production (M/C, Ratio, Speed, Target, KG, EFF%)
  ↓
Comber Production (if combed — noil %, sliver CV%)
  ↓
Simplex Production (M/C, Ratio, Opening bobbin, Closing bobbin, Hank, KG, EFF%)
  ↓
Ring Frame Lot Creation (Lot No = auto-generated, Count, Blend, Colour, Customer Order)
  ↓
Ring Frame Production Log (per machine per 2hr, Opening/Closing meter, spindle meters, KG, EFF%, breakages)
  ↓
Ring Frame Line Summary (auto-aggregated: target vs actual vs efficiency per line)
  ↓
Autocone Production Log (per machine per hr: splices, rejects, no-bobbin events, efficiency, H/W%)
  + Utility Breakdown (compressor, EB — cross-cutting)
  + Autocone Speed Check (per shift: RPM, D.zone, splice rejection%)
  ↓
Packing Production Log (cone serial numbers, individual weights, lot completion)
  + Quality Gate (Uster test, CSP, cone weight check, JCP clearance)
  ↓
Dispatch (LoTrac: QR-coded bags, lorry receipt, customer signature)
```

Every node in this flow is a database table. Every transition is a logged event. Every entity carries: `mill_id, lot_id, mixing_id, fiber_composition, colour_code, shift_instance_id`.

---

## REVISED PRIORITY MATRIX

| Priority | Module / Feature | Source Evidence |
|---|---|---|
| P0 | Fiber type + blend ratio on all production tables | Images 5, 8 |
| P0 | Mixing recipe with layer system | Mixing Change Slip |
| P0 | Laydown record (blow room start of traceability) | Image 17 |
| P0 | Opening/Closing meter for Ring Frame | Images 25, 27 |
| P0 | Opening/Closing bobbin for Simplex | Image 20 |
| P0 | JCP clearance workflow | Image 5 |
| P0 | Machine hierarchy: Section → Line → Machine | Images 6, 22 |
| P1 | Utility breakdown (compressor, EB) — cross-cutting | Image 1 |
| P1 | Planned stops separate from breakdowns | Image 18 |
| P1 | Bale consumption log (machine-wise) | Image 14 |
| P1 | Waste stock lifecycle (bales, transfer, sale) | Images 10, 11 |
| P1 | Shift manpower deployment vs. plan | Image 13 |
| P1 | Splice quality KPI on autocone | Image 24 |
| P1 | Count+reason wise breakdown summary | Image 23 |
| P1 | Ring Frame line-wise summary (auto-aggregated) | Image 26 |
| P2 | Humidification log with quality correlation | Images 9, 16 |
| P2 | Lot colour/shade tracking | Image 5 |
| P2 | Customer lot live balance dashboard | Image 5 |
| P2 | Waste transfer and sale P&L | Image 11 |

---

## NEW REGISTERS TO BUILD IN SPINFLOW (from photos)

Based on direct evidence, these are the exact digital forms needed, mapped to their paper equivalents:

| Digital Form | Paper Register | Key Fields |
|---|---|---|
| AutoconeProductionEntry | Auto Cone Register (Image 1, 3) | M/C, Lot, Count, Drum Speed, Production, Efficiency, Hard Waste, H/W%, Compressor breaks |
| AutoconeHourlyCheck | 4-time monitoring (8/10/12/2) | M/C, Efficiency at each time block |
| AutoconeSpeedCheck | Image 24 | M/C, RPM, Splices, Rejects, No-bobbin |
| PackingConeWeightEntry | Image 4 | Lot, Count, Cone Serial No, Weight, Tolerance flag |
| PackingProductionEntry | Image 2 | Count, Lot, Type, A/E ratio, Previous stock, Today's packing, Balance |
| CustomerOrderLiveTracker | Image 5 | Count, Lot, Ratio, Colour, Target, Active, Due, JCP status, Customer |
| SectionWiseSummary | Image 6 | Dept × Line × Shift: Target, Achieve, Manpower |
| DailyProductionSummary | Image 7 | Finisher No, RF lot range, AC lot range, Packing lot range |
| RatioWiseBacksideProduction | Image 8 | Carding/Drawing/Simplex: Ratio × Shift × Production × Waste |
| WasteStockEntry | Image 10 | Fiber blend, Process stage, Sub-type, Bales, KG |
| WastageTransferEntry | Image 11 | Date, Source, Destination, Waste type, Bales, Weight |
| LotCottonConsumption | Image 12 | Back lot, Active lot, Cotton consumed (RF, Blow, H/W, total) |
| ShiftManpowerSetup | Image 13 | Dept, Shift, Role, Planned headcount, Actual headcount, Employee list |
| BaleProcessLog | Image 14 | Machine, Mixing, Old/New lot, Bales processed, Sweep, Silver, BreSliver |
| BaleAllocation | Image 15 | Machine, Cotton variety, Allocated kg, Balance kg |
| LaydownTimeRecord | Image 17 | Date, Shift, Board No, Mixing No, Ratios, Production per shift, sign-offs |
| StoppageInformation | Image 18 | Section, M/C, From-To time, Duration, KG loss, Reason |
| DrawingProductionRecord | Image 19 | M/C, Ratio, Speed, Target, KG, EFF%, Remarks |
| SimplexProductionRecord | Image 20 | M/C, Ratio, Target, Opening, Closing, Hank, KG, EFF%, Remarks |
| CardingProductionRecord | Image 21 | M/C, Ratio, Speed, Target, KG, EFF%, Remarks |
| RingFrameCountLotChange | Image 22 | Line, Run/Stop counts, M/C changes (From→To count/lot, reason) |
| AutoconeBreakdownSummary | Image 23 | Count, Ratio, Reason, Stop minutes, Loss KG |
| RingFrameMeterReading | Images 25, 27 | M/C, Count, Target, Opening meter, Closing meter, Variance, Rejection count |
| RingFrameLineSummary | Image 26 | Line, Target, Achieve, EFF%, Stop time, Loss KG, Reason-wise breakdown |
| HumidificationLog | Images 9, 16 | Dept, Machine zone, RH%, Temperature, Duct flow |
| MixingChangeSlip | Pink clipboard | Blow Room Line, Present mixing, Proposed mixing, Proposed qty, Layer system |

---

## CRITICAL ARCHITECTURAL CORRECTION

### The production measurement hierarchy at Ring Frame

**Wrong model (v1.0):**
```
Shift → Machine → Production KG (manually entered)
```

**Correct model (from registers):**
```
Shift
  └── Line (A-side / B-side)
        └── Machine
              └── Meter Reading (Opening / Closing)
                    → Spindle Meters (computed)
                    → Production KG (computed from spindle meters × count factor)
                    → Reported KG (supervisor manual entry)
                    → Variance (alert if >5%)
```

The spindle meter is the **ground truth**. The supervisor's reported number is a **verification**. When they diverge, the system must investigate, not silently accept the reported number.

This one change — storing meter readings instead of just final kg — transforms SpinFlow from a data entry tool into a manufacturing execution system with an audit trail.

---

*Addendum v1.0 — Incorporates findings from 27 physical register photographs*  
*To be merged with Architecture Review v1.0 before implementation planning begins*
