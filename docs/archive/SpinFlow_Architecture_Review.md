# SpinFlow ERP — Architecture Review & System Design Plan

**Prepared by:** SpinFlow CTO Office  
**Date:** 2026-06-10  
**Status:** Planning Phase — No Code  
**Scope:** Complete architecture challenge for a next-generation spinning mill ERP

---

## PREAMBLE — CTO's Honest Assessment

Your instinct is correct and rare. Most ERP vendors design around accounting modules, then bolt production on top. The result is software that accountants tolerate and shop-floor supervisors abandon within 90 days.

Your proposed spine — **Shift → Department → Machine → Lot → Count → Production → Quality → Packing → Dispatch** — is operationally sound. But it has three structural gaps that will cause real problems at scale:

1. **No Planning anchor** — production happens downstream of a customer order, not independently. Without a planning layer above Shift, you will have production without purpose.
2. **No Material anchor** — a Lot is born from cotton bales. Without tracing bale → mixing → lot, you cannot do real quality root-cause analysis.
3. **No Time anchor** — the shift is too coarse. You need Shift → Hour Block for live monitoring. Ring frame supervisors check every 2 hours. Auto cone supervisors check every hour. Your data model must reflect this.

These are not optional refinements. They are architectural corrections.

---

## 1. MISSING MODULES

### What You Have (Implied)
Production, Quality, Packing, Dispatch, Lot Tracking (LoTrac), Maintenance (partial), Stores (partial), HR/Payroll, Accounts (partial), Masters.

### What Is Missing or Incomplete

**Cotton Purchase & Bale Management** *(P0 — everything starts here)*
- Vendor management with variety-wise pricing history
- Purchase order against count/customer requirement
- Bale receipt with test results (micronaire, staple, trash%, moisture%)
- Bale lot allocation to mixing
- Bale consumption tracking (which bales went into which mixing → which lot)
- Without this, yarn quality traceability is a lie

**Mixing Management** *(P0 — connects purchase to production)*
- Mixing recipe creation (bale percentages by variety)
- Mixing lot number generation
- Bale tagging per mixing
- Mixing → Blow Room linkage
- Mixing change log (when recipe changes mid-production)

**Energy Monitoring** *(P1)*
- Unit consumption per department per shift
- Cost per kg of yarn (critical for pricing)
- Power factor tracking
- Transformer load monitoring
- Peak/off-peak consumption split
- Diesel consumption for generator sets

**Water & Humidity** *(P1 — critical for quality)*
- Relative humidity per department (yarn quality is humidity-dependent)
- Temperature logging
- Humidification plant uptime
- Correlation between humidity drops and end-breakage spikes

**Stores & Spare Parts** *(P1 — partially exists but incomplete)*
- Spare part catalog with machine mapping (which spare fits which machine model)
- Re-order level alerts
- Spare consumption per breakdown type
- Vendor-wise spare delivery lead time
- Annual Maintenance Contract (AMC) tracking

**Finance & Accounts** *(P1)*
- Cost center-wise P&L (production cost per kg by count)
- Customer-wise ledger
- Yarn sale invoice with HSN codes
- Cotton purchase GST input credit tracking
- Bank reconciliation
- TDS management
- Monthly MIS report (management information system)

**Transport & Logistics** *(P2)*
- Vehicle master (owned + hired)
- Trip planning and cost allocation
- Lorry receipt tracking
- Freight cost per delivery
- Vehicle maintenance schedule

**Customer & Order Management** *(P0 — you have parties but not orders)*
- Customer master with credit limit
- Count-wise order booking (e.g., Echotex: 500 bales of 30s combed)
- Delivery schedule commitment
- Order vs. actual production tracking
- Pending order dashboard
- Without this, production planning has no target

**Shift Management & Roster** *(P1)*
- 3-shift roster planning
- Employee-to-department-to-shift assignment
- Shift handover notes (digital)
- Overtime pre-approval workflow
- Absenteeism alert → auto-roster adjustment

**Visitor & Gate Management** *(P2)*
- Visitor log
- Vehicle entry/exit with material check
- Integration with dispatch gate pass

---

## 2. MISSING REGISTERS

Based on actual spinning mill operations, here are registers you have not yet captured:

### Blow Room
- **Bale Opening Register** — bales opened per shift, variety, weight
- **Mixing Lay-down Register** — arrangement of bales in mixing line
- **Cleaning Waste Register** — waste extracted at each beater stage
- **Production Register** — laps/slivers produced per shift

### Carding
- **Carding Production Register** — sliver weight (g/m), production (kg/shift), machine-wise
- **Can Change Register** — when and which cans were moved to drawing
- **Flat Waste Register** — flat strips waste % per machine
- **Grinding/Clothing Record** — last grinding date, wire condition per machine

### Drawing
- **Drawing Production Register** — doubled sliver weight, production per machine
- **Sliver Rejection Register** — if sliver is off-spec, reason, disposal
- **Creel Change Register** — which cans fed into which draw frames

### Comber (if combed yarn)
- **Comber Noil Register** — noil % extracted (target 14–18% for combed)
- **Comber Production Register** — production per machine per shift
- **Lap Feed Register** — lap number fed to which comber

### Simplex
- **Simplex Production Register** — bobbins produced per machine per shift
- **Bobbin Change Register** — when full bobbins moved to ring frame
- **Speed Frame Stop Register** — stops, reason, duration

### Ring Frame *(you have this — but missing these sub-registers)*
- **Doffing Register** — doffing time per side per machine (affects efficiency)
- **Traveller Change Register** — when travellers changed per machine, type used
- **Ring Rail Register** — ring rail condition, last replacement
- **Yarn Tension Register** — tension per count (affects quality)
- **Spindle-wise Breakage Map** — which spindles break most (identifies worn spindles)

### Auto Cone *(you have this — but missing)*
- **Splicer Condition Register** — splicer test results per machine
- **Drum Groove Register** — drum condition, last replacement
- **Wax Consumption Register** — wax used per lot/count
- **Bobbin Transport System Log** — link coner → ring frame tracking

### Packing *(you have partial)*
- **Bag/Carton Stock Register** — packing material consumption
- **Label Register** — label printed vs applied vs dispatched
- **Rewinding Register** — cones sent for rewinding (rejected and re-wound)
- **Under/Over Weight Register** — cones outside ±0.05 kg tolerance

### Quality
- **Uster Test Register** — U%, CV%, IPI per lot per count
- **Strength Test Register** — CSP (count strength product), RKM
- **Yarn Appearance Register** — visual grading A/B/C
- **Count Verification Register** — actual count tested vs. declared count
- **Shade Variation Register** — for dyed yarn mills

### Maintenance
- **Lubrication Schedule Register** — which machine, which point, which oil, frequency
- **Vibration/Noise Log** — unusual sounds reported by operators
- **Belt/Tape Replacement Register** — apron, top roller, tape changes
- **Alignment Record** — after major breakdown, alignment check result
- **Insurance Inspection Register** — required for mill insurance compliance

### Stores
- **Material Inward Register** — with GRN number
- **Material Issue Register** — who took what, for which machine, approved by
- **Non-Moving Stock Register** — spares unused for >6 months
- **Scrap Disposal Register** — condemned spares/material disposal

### HR
- **Canteen Register** — meals consumed per shift (linked to cost)
- **Accident Register** — near-miss and injury log (legal compliance)
- **Training Register** — training attended, certified skills
- **Medical Register** — medical room visits, OT referrals

---

## 3. MISSING WORKFLOWS

These are not obvious from registers but are operationally critical:

### Production Workflows

**Reprocessing / Second Quality**
- Yarn that fails quality test but is not scrap
- Gets rewound, re-tested, downgraded to second quality
- Needs separate lot number, separate customer allocation
- Must reduce original lot's first-quality balance

**Lot Merging**
- Two small lots of same count + same quality level combined into one dispatch lot
- Happens when small balance lots accumulate
- Needs traceability: merged lot = lot A (320 kg) + lot B (180 kg)
- Quality certificate must reflect blend

**Lot Splitting**
- One production lot split for two customers
- Needs split traceability, separate quality certificates
- Common when one customer needs 200 kg and lot produced 500 kg

**Count Changeover**
- Ring frame changes from 30s to 40s
- Triggers: machine stop, traveller change, speed change, tension reset
- All subsequent production must carry new count
- Efficiency drops ~15–20% during changeover — must be captured separately

**Sample Lot**
- New customer requests yarn sample before main order
- Small quantity, needs separate traceability
- Result: approved/rejected/pending — feeds back into order confirmation

**Quality Hold**
- Lot fails quality test — physically segregated in packing area
- Cannot be dispatched
- Workflow: hold → investigation → retest → release/downgrade/reject
- Must track hold duration and reason

**Customer Complaint**
- After dispatch, customer raises complaint (shade, strength, weight, count)
- Needs: complaint receipt, lot traceability pull, internal investigation, corrective action
- Results: replacement dispatch / credit note / no action with evidence

**Return Yarn**
- Dispatched yarn returned by customer (rejected or excess)
- Receipt → inspection → restock / scrap / reprocess
- Must reverse dispatch entry, update stock

**Emergency / Rush Order**
- Customer needs urgent delivery
- Triggers re-sequencing of production plan
- Needs overrides on existing plan with approval workflow

**Machine Trial / New Count Development**
- Testing new count on existing machine
- Trial production — not for sale
- Results: approved for production / machine modification needed / abandon

### Maintenance Workflows

**Breakdown → Repair → Quality Check → Restart**
- Machine down → maintenance team → spare issued from stores → repair → run 30 minutes → quality sample → restart approval
- Currently this loop is broken — restart happens without quality verification

**Preventive Maintenance Scheduling**
- Calendar-based (weekly/monthly/annual) per machine model
- Triggers work order before due date
- On completion: checklist sign-off, next schedule auto-set

**Annual Overhaul**
- Full disassembly, all wear parts replaced
- Takes machine offline 5–7 days
- Needs production plan adjustment for overhaul period
- Cost captured for asset register

**Insurance Survey Compliance**
- Annual inspection required by insurance company
- Checklist of mandatory maintenance tasks
- Non-compliance affects claim settlement

### Quality Workflows

**Incoming Cotton Testing**
- Before bales enter mixing, test sample per bale lot
- Result: accepted / accepted with condition / rejected
- Rejection: return to vendor or use at lower mix percentage

**In-Process Quality Patrol**
- Quality inspector walks floor every 2 hours
- Checks sliver weight, roving count, ring frame end breakage
- Records deviations, raises alerts

**Final Yarn Release**
- Packing complete → quality test → release certificate → dispatch permission
- No cone should leave without release

**Third-Party Testing**
- Samples sent to external lab (Uster, SITRA)
- Lab report uploaded, compared against internal test
- Discrepancy triggers investigation

### HR Workflows

**Operator Skill Matrix**
- Each operator certified for specific machine types
- Cannot be assigned to uncertified machine
- Tracks skill gaps, training needs

**Gratuity & Settlement**
- Long-service employees — gratuity calculation on exit
- Full-and-final settlement: pending salary + leave encashment + gratuity − advances

---

## 4. DATABASE DESIGN

### Core Architectural Principle

The database must be a **time-series of mill events** anchored to four universal dimensions:

```
Time (Shift + Hour Block)
  × Space (Mill → Department → Machine)
  × Material (Lot → Count → Cotton Variety)
  × Person (Employee → Role → Shift Assignment)
```

Every production, quality, maintenance, and dispatch record is an event at the intersection of these four dimensions.

### Entity Hierarchy

```
Company
  └── Mill
        ├── Department
        │     └── Machine
        │           ├── Machine Spec (model, spindles, speed)
        │           └── Machine State Log (running/stopped/breakdown)
        ├── Shift Definition (A/B/C with time boundaries)
        └── Shift Instance (actual shift on a date, with assigned employees)
```

### Material Traceability Spine

```
Cotton Bale (vendor, variety, test results)
  └── Mixing Recipe
        └── Mixing Lot
              └── Blow Room Production
                    └── Carding Production
                          └── Drawing Production
                                └── Combing Production (if combed)
                                      └── Simplex Production
                                            └── Ring Frame Lot
                                                  └── Auto Cone Lot
                                                        └── Packing Lot
                                                              └── Dispatch Lot
```

This is the **material genealogy tree**. Every quality failure can be traced back to a cotton bale.

### Key Entities & Relationships

**production_shift_log**
```
id, mill_id, department_id, machine_id, shift_instance_id,
hour_block (8AM/10AM/12PM/2PM/4PM/6PM/8PM/10PM/12AM/2AM/4AM/6AM),
lot_id, count_ne, production_kg, efficiency_pct,
running_spindles (RF only), end_breakages (RF only),
waste_kg, remarks, entered_by, verified_by, created_at
```

**breakdown_log**
```
id, mill_id, machine_id, shift_instance_id,
start_time, end_time, duration_minutes,
breakdown_category (mechanical/electrical/raw_material/power/end_breakage/other),
root_cause_detail, spare_parts_used (JSON array),
repaired_by, verified_by, production_loss_kg, created_at
```

**lot_master**
```
id, mill_id, lot_number (auto-generated), count_ne,
lot_type (ring/cone/packing/dispatch),
parent_lot_id (for split/cone lots),
mixing_lot_id, customer_order_id,
status (active/hold/completed/merged/split/scrapped),
total_planned_kg, total_actual_kg, created_at
```

**quality_test**
```
id, mill_id, lot_id, test_stage (blow_room/carding/ring/cone/packing/dispatch),
test_type (uster/strength/count/visual/cone_weight),
tested_by, test_date,
result_json (flexible — stores U%, CSP, IPI, weight, etc.),
verdict (pass/fail/hold/conditional_pass),
released_by, release_date
```

**customer_order**
```
id, mill_id, customer_id, order_number,
count_ne, yarn_type (carded/combed/compact),
quantity_kg, delivery_date, priority,
status (pending/in_production/partially_complete/complete/cancelled),
balance_kg (computed), created_at
```

**production_plan**
```
id, mill_id, customer_order_id,
department_id, machine_id,
planned_start, planned_end,
count_ne, planned_kg,
status (planned/running/complete/delayed),
actual_kg, variance_kg
```

**maintenance_work_order**
```
id, mill_id, machine_id, work_order_type (breakdown/preventive/overhaul),
raised_by, raised_at, priority (critical/high/medium/low),
assigned_to, started_at, completed_at,
root_cause, action_taken,
spares_consumed (JSON), downtime_minutes,
quality_check_required (bool), quality_checked_by
```

**cotton_bale**
```
id, mill_id, purchase_order_id, vendor_id,
bale_number, variety (Shankar6/MCU5/J34/HD324),
weight_kg, staple_mm, micronaire, trash_pct, moisture_pct,
test_verdict (accepted/conditional/rejected),
mixing_lot_id (null until allocated), allocated_kg
```

### Database Design Principles

1. **Never hard-delete** — use `status` + `deleted_at` on all tables. Mill data is audit-critical.
2. **Lot number format**: `{MILL_CODE}-{YEAR}{MONTH}-{COUNT}S-{SEQ}` e.g., `SPF-2606-30S-0047`
3. **All production quantities in kg** — do not mix units. Convert spindles/bobbins/cones at the source.
4. **All timestamps UTC** — display in IST at the frontend.
5. **Shift instance is a first-class entity** — not just a foreign key. It carries: date, shift code, supervisor, employees assigned.
6. **JSON for test results** — quality test parameters vary by stage. Use `result_json` with a schema validator per `test_type`.
7. **Versioned plans** — production plans can be revised. Store revision history.

---

## 5. PRODUCTION PLANNING ENGINE

### Planning Hierarchy

```
Level 1: Annual Sales Plan (Director)
  → Count-wise, customer-wise annual target

Level 2: Monthly Production Plan (GM / Production Manager)
  → Machine-wise, count-wise, shift-wise monthly target
  → Derived from: order book + machine capacity + maintenance calendar

Level 3: Weekly Dispatch Plan (Dispatch Manager)
  → Which lots to complete and dispatch this week

Level 4: Daily Shift Plan (Shift Incharge)
  → Which machine runs which count, which lot, target kg

Level 5: Live Actuals (Supervisor → System)
  → Entered every 2 hours
```

### Core Planning Logic

**Step 1 — Capacity Calculation**
```
Available Capacity (kg/shift) per machine =
  (Spindles × Efficiency% × Shift Hours × 60) / (TPI × 840 × Count_Ne × 2.2046)
```
This is the physics of yarn production. Planning engine must solve for available machine-count combinations.

**Step 2 — Order-to-Plan Conversion**
- Sort orders by delivery date (earliest first), then priority flag
- For each order: calculate production batches needed
- Each batch becomes a production plan record linked to a machine

**Step 3 — Machine Allocation Rules**
- Machine must be certified for count (ring frames have count range e.g. 20s–40s)
- Machine must not be in planned maintenance window
- Machine currently running a lot must finish that lot before count change (unless emergency)
- Prefer machines already set up for that count (avoids changeover loss)

**Step 4 — Alerts & Exceptions**
- Delay alert: if current production pace will miss delivery date → flag to Production Manager
- Shortfall alert: if order quantity exceeds available capacity in window → escalate to GM
- Machine gap: if machine has idle time, suggest fill-in work order

### Plan Revision Workflow
```
Original Plan → actual deviates >10% → system flags → 
Production Manager reviews → approves revision or escalates →
Revised plan saved with version number and reason
```

---

## 6. MAINTENANCE STRATEGY

### Three-Tier Maintenance Architecture

**Tier 1 — Reactive (Breakdown)**
- Machine stops → supervisor enters breakdown log (category, start time)
- System auto-creates maintenance work order (critical priority)
- Maintenance team receives notification
- Spare parts checked against stores → issued
- Repair done → restart checklist → quality sample run → sign-off
- KPI: Mean Time To Repair (MTTR) per machine model

**Tier 2 — Preventive (Schedule-Based)**
- Every machine model has a maintenance master calendar:
  - Daily: blow, clean, oil check
  - Weekly: belt tension, bearing check, traveller change
  - Monthly: ring rail check, spindle alignment, motor check
  - Annual: full overhaul
- System auto-raises work orders 3 days before due
- Completion triggers next schedule calculation
- KPI: PM Compliance % (actual PM done / scheduled PM)

**Tier 3 — Predictive (Data-Driven)**
- **End breakage rate trend**: if RF end breakages increase >20% over 3 shifts → flag for inspection
- **Efficiency decline trend**: if machine efficiency drops >5% over 1 week → flag
- **Breakdown frequency**: machine with >3 breakdowns/week → flag for root cause analysis
- **Vibration/noise log patterns**: correlate with next breakdown type
- This tier starts as rule-based, evolves to ML after 12 months of data

### Spare Parts Intelligence
```
Spare Master
  ├── Part Number, Description, Supplier
  ├── Machine Models (many-to-many — which machines use this part)
  ├── Reorder Level, Reorder Quantity
  ├── Average Lead Time (days)
  └── Consumption History (breakdowns per month → auto-adjust reorder)
```

**Critical Insight**: Spinning mills carry 200–500 spare SKUs. The biggest inventory risk is not stockout — it is obsolete stock when machines are replaced. The system should flag when a spare's associated machines are decommissioned.

---

## 7. QUALITY STRATEGY

### Quality Gates — Full Flow

```
Gate 1 — Cotton Incoming
  Test: HVI (micronaire, staple, strength, elongation, colour)
  Pass/Fail: accept / conditional / reject
  Action: mixing recipe adjustment if conditional

Gate 2 — Blow Room / Carding
  Test: Web evenness visual, trash count
  Frequency: Every 2 hours, one machine sampled
  Pass/Fail: adjust beater speed, cleaning intensity

Gate 3 — Drawing
  Test: Sliver weight (g/meter) ± 2%
  Frequency: Each shift, per machine
  Action: adjust draft, stop machine if out of range

Gate 4 — Comber (if combed)
  Test: Noil % (14–18%), sliver CV%
  Frequency: 4 times per shift
  Action: adjust feed, change combing ratio

Gate 5 — Simplex / Ring Frame
  Test: Roving count, yarn count (Ne), TPI, elongation
  Frequency: Per lot start, then every 4 hours
  Action: adjust spindle speed, tension, traveller type

Gate 6 — Auto Cone
  Test: Splice quality, yarn appearance, hairiness
  Frequency: Per shift per machine, random cone sample
  Action: re-splice settings, replace waxing disc

Gate 7 — Packing (Final)
  Test: Uster (U%, IPI, H), CSP, count, cone weight
  Frequency: 3 cones per lot (or per 100 kg, whichever is more)
  Pass → Release → Dispatch
  Fail → Hold → Investigation → Retest or Downgrade

Gate 8 — Dispatch
  Test: Visual check — bag condition, label accuracy, cone count per bag
  Weight verification (gross weight ± 0.5 kg)
  Action: reject bag if out of spec
```

### Quality Certificate Structure
```
Quality Certificate per Lot:
  - Lot number, count, customer
  - Test results (Gate 7 data)
  - Tested by, released by
  - Date of release
  - Certificate number (sequential, mill-wise)
```

### Quality Analytics
- Count-wise defect trend (which count has highest IPI over last 30 days)
- Machine-wise quality correlation (which RF produces most hold lots)
- Cotton variety vs. quality outcome correlation
- Seasonal patterns (humidity → quality impact)

---

## 8. REAL-TIME SHOP FLOOR MONITORING

### Honest Assessment: Don't Over-Engineer Phase 1

Full IoT integration requires ₹15–30L capex per mill (PLCs, sensors, gateways). Most mills are not ready. Design a **3-phase approach**:

### Phase 1 — Supervisor-Driven Digital Entry (Now)
- Replace paper registers with mobile/tablet app
- Supervisor enters data at machine every 2 hours (matches current habit)
- Offline-capable (sync when WiFi available — factory WiFi is patchy)
- Voice-to-text for remarks field (reduces entry friction)
- Photo attachment for breakdown (supervisor clicks photo of damaged part)

### Phase 2 — Semi-Automated (6–12 months)
- **Production counters** on ring frame and auto cone (low cost, ₹2,000–5,000 per machine)
  - Pulse counter on doffing mechanism → counts bobbins/doffs
  - Auto-calculates production estimate vs. supervisor entry
  - Discrepancy flag if difference >5%
- **Barcode/QR on lot cards** — scan instead of type lot number
- **Cone weight scale integration** — digital scale sends weight directly to system
- **Shift login via biometric** — employee clocks in → shift record auto-created

### Phase 3 — Full IoT (12–24 months, for tech-forward mills)
- **PLC integration** (Toyota, Rieter, LMW ring frames have PLC outputs)
  - Spindle speed, end breakage count, efficiency → direct feed
  - Requires OPC-UA or Modbus gateway (₹40,000–₹1,20,000 per machine line)
- **Energy meters** on department distribution panels → real-time kWh
- **Humidity/temperature sensors** in departments → correlated with quality data
- **Camera-based quality** (experimental): yarn appearance scoring via CV
- **RFID on bales** → auto tracking through mixing and blow room

### Data Pipeline Architecture (Phase 2–3)
```
Machine Sensor / PLC
  → Edge Gateway (Raspberry Pi / Industrial PC)
    → MQTT Broker
      → Message Queue (Redis Streams / Kafka lite)
        → Backend API (async write endpoint)
          → Database (time-series optimised table)
            → Dashboard (WebSocket real-time update)
```

---

## 9. DASHBOARD DESIGN

### Design Principle
Each role has ONE primary screen. If they need to navigate to find their critical number, the design has failed.

---

### Supervisor Dashboard (Department Level)
**Primary metric**: My machines running right now

```
┌─────────────────────────────────────────────┐
│  RING FRAME — Shift B — Karthik Supervisor  │
│  06:00 AM — 14:00 PM    [2h 15m remaining]  │
├─────────────────────────────────────────────┤
│  MACHINES     Running: 14 / 18              │
│  RF-01 ✅  RF-02 ✅  RF-03 🔴  RF-04 ✅     │
│  [RF-03 Breakdown — 45 min]                  │
├─────────────────────────────────────────────┤
│  PRODUCTION   Target: 820 kg  Actual: 610 kg│
│  Efficiency: 74%  ⚠ (target 85%)           │
├─────────────────────────────────────────────┤
│  BREAKAGES    Avg: 18/100 spindle-hrs       │
│  ⚠ RF-07: 34 breaks (high — check traveller)│
├─────────────────────────────────────────────┤
│  LOT STATUS   30s Lot 0047 → 68% complete   │
│  [Quick Entry] [Report Breakdown] [Handover] │
└─────────────────────────────────────────────┘
```

---

### Shift Incharge Dashboard (All Departments, This Shift)
**Primary metric**: All departments vs. target, right now

```
Section-wise production bar: Carding / Drawing / RF / AC / Packing
Current shift efficiency % per section
Active breakdowns count + oldest open breakdown
Lot completion status for all active lots
Pending quality holds that need decision
```

---

### Production Manager Dashboard (This Day + Week)
**Primary metric**: Are we on track to meet weekly dispatch commitment?

```
Today: Production actual vs. plan (kg and %)
This week: Order fulfillment % per customer
Active lot status (all lots in progress)
Machines with efficiency <80% for 3+ consecutive shifts
Planned maintenance coming up in next 7 days
Count changeover schedule
Pending customer orders with delivery date risk
```

---

### Mill Manager Dashboard (This Week + Month)
**Primary metric**: Plant OEE and cost per kg

```
OEE: Availability × Performance × Quality (the universal manufacturing KPI)
Production cost per kg (electricity + labour + cotton + maintenance)
Customer order book vs. capacity utilisation
Quality hold % (lots on hold / lots produced)
Maintenance cost trend
Waste % by department (target benchmarks shown)
Top 3 machines by downtime this month
```

---

### Director Dashboard (Month + Quarter)
**Primary metric**: Revenue, margin, and operational health

```
Revenue vs. plan (customer-wise)
Production output vs. capacity (utilisation %)
Quality rejection rate trend
Energy cost per kg trend
Cotton cost vs. yarn realisation (margin per count)
Customer-wise delivery performance (on-time %)
Head count productivity (kg per employee per month)
```

---

## 10. AI OPPORTUNITIES

### Tier A — Immediate Value (Rule-Based AI, 0–6 months)

**Predictive Maintenance — End Breakage Alert**
- Rule: If RF end breakages increase >20% over previous shift → alert supervisor
- Root cause suggestion: traveller wear / ring rail damage / humidity drop / raw material issue
- Implementation: simple threshold rules on shift_log data

**Lot Delay Predictor**
- Rule: If current production pace vs. planned pace → project completion date
- If projected date > delivery date → alert Production Manager
- Implementation: linear extrapolation on production plan vs. actuals

**Quality Anomaly Flag**
- Rule: If Gate 7 test result deviates from lot's historical pattern → hold recommendation
- Prevents accidentally releasing an out-spec lot

**Cotton Purchase Intelligence**
- Rule: Alert when micronaire of incoming bales is outside recipe specification range
- Prevents quality issues before they enter production

### Tier B — Medium-Term ML (6–18 months)

**Production Efficiency Prediction**
- Input: Machine age, last maintenance date, count being run, humidity, shift
- Output: Predicted efficiency % for next shift
- Value: Proactive maintenance scheduling before efficiency drops

**Waste Prediction**
- Input: Cotton variety mix, count, machine settings, humidity
- Output: Predicted waste % for this mixing
- Value: Adjust mixing recipe before production starts

**Count Recommendation for Customer Orders**
- Input: Current machine load, pending orders, machine count-range capabilities
- Output: Optimal count allocation across machines to minimise changeover and maximise delivery compliance
- Value: Saves 2–4 hours of Production Manager planning daily

**Energy Optimisation**
- Input: Production plan + energy tariff schedule (peak/off-peak)
- Output: Shift loading recommendations to minimise energy cost
- Example: Run high-energy machines in off-peak hours

### Tier C — Advanced AI (18+ months)

**Yarn Quality Prediction Before Production Starts**
- Input: Cotton HVI data + mixing recipe + machine condition
- Output: Predicted Uster test results (U%, IPI)
- Value: Customer can be pre-informed if results will be marginal

**Computer Vision — Yarn Appearance**
- Camera on auto cone → image of yarn surface → defect detection
- Classifies: neps, thick places, thin places, fluff
- Reduces dependency on lab for appearance grading

**Customer Demand Forecasting**
- Based on historical order patterns per customer per count per season
- Feeds into production planning engine for proactive capacity reservation

---

## 11. ERP MISTAKES TO AVOID

### Mistakes That Cause Adoption Failure

**1. Too many mandatory fields**
Supervisors fill registers under time pressure. If your form has 20 mandatory fields and they only have 3 minutes before next machine check, they will abandon the system and continue with paper. Rule: Maximum 7 fields for any shift entry. Everything else optional.

**2. No offline mode**
Factory WiFi is unreliable. If the app shows "Cannot connect" and the supervisor cannot enter data, they write it on paper and never transfer it. The system gets blamed. Every mobile interface must work offline and sync later.

**3. Designing for accountants, not operators**
If the Production Manager's screen looks like a spreadsheet and the Supervisor's screen looks like an accounting module, operators will not use it. Supervisor screen must look like a machine dashboard, not a form.

**4. Forcing exact quantity entry before production is done**
Supervisors record partial production (e.g., 2-hourly). The system must accept partial, in-progress entries. Do not require a "close shift" step to make data visible.

**5. No acknowledgment feedback**
When a supervisor enters a breakdown, they need confirmation it was received. When quality raises a hold, maintenance needs a notification. Without closed-loop feedback, people stop trusting the system.

**6. Treating the shift as one block**
Management wants 2-hourly visibility. If the system only allows one entry per shift, it fails management's monitoring need. Always capture the hour block.

**7. Module-switching fatigue**
If a supervisor must navigate Production → then Maintenance → then Quality to handle a single breakdown event, they won't. A breakdown should trigger: production entry auto-paused + maintenance work order auto-created + quality hold auto-suggested, from one screen.

**8. No supervisor handover support**
The shift handover is one of the most critical moments in the mill. There is no formal digital handover in most ERPs. Design a handover screen: outgoing supervisor summarises open issues, incoming supervisor acknowledges. This creates accountability.

**9. Ignoring mobile/tablet form factor**
ERPs designed for desktop PCs fail on the shop floor where tablets and phones are used. Every operational screen must be mobile-first.

**10. Data migration afterthought**
Mills have years of paper registers. When switching to SpinFlow, someone must key in historical data (at minimum: machine master, lot history, customer balances). If migration is not planned and supported, the system starts with gaps and management loses trust on day one.

---

## 12. ULTIMATE ARCHITECTURE

### Design Philosophy: The Mill's Operating System

SpinFlow should not be an ERP with a production module. It should be the **mill's operating system** — the place where every event in the mill is recorded once, flows automatically to all stakeholders, and generates intelligence without anyone needing to compile reports manually.

### Architecture Stack Decision

```
Core Principle: Event-Driven Mill

Every mill event (shift entry, breakdown, quality result, lot move, dispatch) 
is a first-class event object. 
Events flow through the system and trigger downstream actions automatically.
```

**Backend Architecture**
```
FastAPI (async) — handles all API requests
  ├── Event Service — records all mill events
  ├── Planning Engine — converts orders to plans
  ├── Alert Engine — monitors thresholds, raises alerts
  ├── Quality Gate Service — validates lot release
  ├── Reporting Engine — on-demand and scheduled reports
  └── Notification Service — in-app + WhatsApp + SMS

PostgreSQL (Supabase) — primary relational store
Redis — session cache, real-time pub/sub, alert queue
```

**Frontend Architecture**
```
React 18 + TanStack Router
  ├── Role-based layout engine (each role gets its own home)
  ├── Mobile-first component library (shadcn/ui + Tailwind)
  ├── Offline-capable forms (IndexedDB queue + sync)
  ├── Real-time updates (WebSocket for live dashboards)
  └── PWA (installable on Android/iOS — no app store needed)
```

**Multi-Tenant Model**
```
Company → Mills → Departments
Each company sees only its data.
SUPER_ADMIN sees all companies (SpinFlow's own monitoring).
Billing per mill per month.
```

### Module Architecture Map

```
CORE SPINE (build first — nothing works without these)
  1. Masters (machines, employees, counts, customers, vendors)
  2. Shift Management (shift instances, employee assignments)
  3. Lot Management (lot creation, status lifecycle, traceability)
  4. Cotton Purchase & Bale (the upstream anchor)

PRODUCTION LAYER (the daily operational heartbeat)
  5. Blow Room / Carding / Drawing / Simplex entry
  6. Ring Frame Production (2-hourly, breakdown, lot-wise)
  7. Auto Cone Production (hourly, efficiency, waste)
  8. Packing Production (lot completion, cone stock)

INTELLIGENCE LAYER (converts data into decisions)
  9. Quality Management (gate tests, holds, release)
  10. Maintenance Management (WO, PM calendar, spares)
  11. Production Planning (order → plan → actual tracking)
  12. Dashboard & Alerts (role-based, real-time)

BUSINESS LAYER (converts operations into financials)
  13. Dispatch & LoTrac (gate-pass, QR, delivery)
  14. Customer & Order Management
  15. Stores & Inventory
  16. HR & Payroll
  17. Finance & Accounts (cost per kg, invoicing, P&L)

INTELLIGENCE LAYER PHASE 2 (after 12 months of data)
  18. AI Alert Engine (predictive maintenance, quality forecast)
  19. Advanced Analytics (OEE, variance analysis, benchmarking)
  20. Third-Party Integrations (Uster lab systems, energy meters, PLC)
```

### What Makes This Different From Competitors

| Feature | Generic ERP | Textile ERP | SpinFlow |
|---|---|---|---|
| Designed around shift/machine | No | Partial | Yes |
| 2-hourly production capture | No | Rare | Yes |
| Full cotton → dispatch traceability | No | Partial | Yes |
| Mobile-first shop floor | No | No | Yes |
| Offline capability | No | No | Yes |
| AI-driven maintenance alerts | No | No | Phase 2 |
| Lot genealogy (which bale → which cone) | No | Rare | Yes |
| Role-based dashboards (14 roles) | No | 3–5 roles | Yes |
| WhatsApp / SMS notifications | No | No | Yes |
| Built for Indian mill compliance (GSTIN, ESI, PF) | Partial | Partial | Yes |

### Build Sequence (Recommended Priority)

```
Sprint 1–4:    Core Masters + Shift + Basic RF/AC Production Entry
Sprint 5–8:    Lot Management + Quality Gates + Breakdown Logging
Sprint 9–12:   Cotton Purchase + Packing + Dispatch + LoTrac
Sprint 13–16:  Planning Engine + HR + Payroll
Sprint 17–20:  Finance + Stores + Advanced Dashboards
Sprint 21–24:  AI Alerts + IoT Integration + Analytics
```

### The Competitive Moat

SAP and Oracle are too expensive and complex for mid-size spinning mills (5,000–30,000 spindles). Specialised textile ERPs (Texbase, Millmaster) are legacy desktop software with no mobile/cloud. SpinFlow's moat is:

1. **Built from actual registers** — not theoretical modules
2. **Mobile-first, offline-capable** — works on the shop floor
3. **End-to-end traceability** — from bale to dispatch in one system
4. **AI-ready architecture** — every data point collected becomes a training signal
5. **₹5,000–₹15,000/month pricing** — accessible to mills that SAP ignores

The mills that will pay first are not the biggest — they are the 50–200 crore turnover mills that have grown past paper registers but cannot afford SAP implementations. That is the initial market. Win 100 of them and you have a defensible base.

---

## SUMMARY OF CRITICAL GAPS (PRIORITY ORDER)

| Priority | Gap | Impact |
|---|---|---|
| P0 | Customer Order Management | No production planning possible without it |
| P0 | Cotton Bale + Mixing Module | No traceability, no quality root cause |
| P0 | 2-Hourly Production Entry (all depts) | Management visibility is blind |
| P1 | Quality Gate Service (all 8 gates) | Lots released without evidence |
| P1 | Maintenance Work Order + Spares | Breakdown loop not closed |
| P1 | Production Planning Engine | Production runs without target |
| P1 | Shift Handover Digital Record | Accountability gap between shifts |
| P2 | Energy Monitoring | Cost per kg calculation impossible |
| P2 | Humidity/Environment Logging | Quality correlation missing |
| P2 | AI Alert Engine (rule-based first) | Low effort, high supervisor value |

---

*This document represents the architectural foundation for SpinFlow's next phase. No code was written — this is purely a planning artifact to be reviewed, challenged, and approved before implementation begins.*

*Version 1.0 — For internal review*
