"""
Seed script: insert all 41 DATALOG stop codes into datalog_stop_codes table.
Run once after migration 020:
  PYTHONPATH=backend python3 -m app.db.seed_datalog
"""
import asyncio
from sqlalchemy import text
from app.db.session import async_session_factory


DATALOG_CODES = [
    # (code, name, departments, category)
    # General — all departments
    (1,  "Normal",                      None,                              "normal"),
    (2,  "Doff",                         None,                              "planned"),
    (8,  "Power Fail",                   None,                              "utility"),
    (9,  "Misc",                         None,                              "misc"),
    (11, "Maintenance [Electrical]",     None,                              "breakdown_electrical"),
    (12, "Maintenance [Mechanical]",     None,                              "breakdown_mechanical"),
    (13, "Electrical Repair",            None,                              "breakdown_electrical"),
    (14, "Mechanical Repair",            None,                              "breakdown_mechanical"),
    (15, "Count Change",                 None,                              "production_change"),
    (16, "PS (REB)",                     None,                              "planned"),
    (17, "PS (GEN)",                     None,                              "planned"),
    (18, "QC",                           None,                              "quality"),
    (19, "Lot Change",                   None,                              "production_change"),
    (20, "Sample",                       None,                              "quality"),
    (21, "Cot Change",                   None,                              "planned"),
    (22, "Planned Stop",                 None,                              "planned"),
    (23, "Modification [Electrical]",    None,                              "breakdown_electrical"),
    (24, "Modification [Mechanical]",    None,                              "breakdown_mechanical"),
    (25, "Modernisation",                None,                              "planned"),
    (26, "Roof Clean (A.C)",             None,                              "planned"),
    (27, "Excess Stock",                 None,                              "planned"),
    (28, "QC Wheel Change",              None,                              "quality"),
    (29, "Air Pressure Down",            None,                              "utility"),
    (36, "General Clean",                None,                              "planned"),
    (39, "OHTC Electrical",              None,                              "breakdown_electrical"),
    (40, "OHTC Mechanical",              None,                              "breakdown_mechanical"),
    (41, "Electrical & Mechanical Repair", None,                            "breakdown_mechanical"),
    # Spinning (Ring Frame)
    (30, "BSS/RSI",                      ["ring_frame"],                    "breakdown_mechanical"),
    (31, "Ring Traveller Change",        ["ring_frame"],                    "planned"),
    (32, "Spacer Change",                ["ring_frame", "simplex"],         "planned"),
    (38, "Link Coner Problem",           ["ring_frame"],                    "breakdown_mechanical"),
    # Simplex
    (33, "Sliver Shortage",              ["simplex", "drawing", "comber"],  "production_change"),
    (34, "Block Change",                 ["simplex", "drawing"],            "planned"),
    # Comber & Unilap
    (35, "Filter Jam",                   ["comber", "carding"],             "breakdown_mechanical"),
    # Carding
    (37, "Blow Room Maintenance",        ["carding"],                       "planned"),
]


async def seed():
    import json as _json
    async with async_session_factory() as session:
        for code, name, departments, category in DATALOG_CODES:
            depts_json = _json.dumps(departments) if departments else None
            await session.execute(
                text("""
                    INSERT INTO datalog_stop_codes (code, name, departments, category, is_active)
                    VALUES (:code, :name, CAST(:departments AS jsonb), :category, TRUE)
                    ON CONFLICT (code) DO UPDATE
                        SET name        = EXCLUDED.name,
                            departments = EXCLUDED.departments,
                            category    = EXCLUDED.category
                """),
                {
                    "code": code,
                    "name": name,
                    "departments": depts_json,
                    "category": category,
                },
            )
        await session.commit()
        print(f"✅  Seeded {len(DATALOG_CODES)} DATALOG stop codes")


if __name__ == "__main__":
    asyncio.run(seed())
