"""Reproduce the live /maintenance/day-plan 500 with production-shaped data.

Data profile captured from the AA mill1 live API (2026-07-02):
- 408 schedules across 7 departments, all last_done/next_due NULL,
  frequency_days from 1 to 3650, machine_count/manpower_count often NULL
- 138 machines whose machine_number/line_code are all NULL and whose
  machine_type holds serial numbers (Excel import artifacts)
- 8 dept manpower overrides (incl. machines NULL, shift_hours NULL)
- calendar: single weekly-off rule (weekday 4)
"""
import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.maintenance import (
    MaintenanceSchedule,
    MaintenanceDeptManpower,
    MillCalendar,
)
from app.models.production import Machine
from app.models.user import User

MILL = "809c6b3a-68b2-44f5-adb7-7ab85b66c680"

# (dept -> {"freq|machine_count|manpower_count": row_count}) — exact live combos
SCHED_COMBOS = {
    "Blowroom": {"7|2|3": 7, "180|2|3": 2, "365|2|3": 1, "1460|2|6": 2, "1825|2|6": 1,
                 "7|2|": 5, "365|2|": 1, "7|4|": 4, "30|4|3": 1, "365|4|2": 1,
                 "730|4|4": 1, "1460|4|6": 1, "7||": 5, "30||": 2, "365||": 1,
                 "365|2|4": 1, "90|2|3": 2, "30|2|2": 1, "90|2|2": 1},
    "Carding": {"1|24|3": 1, "1|24|1": 1, "7|24|1": 1, "7|24|2": 1, "30|24|3": 9,
                "90|24|3": 1, "180|24|3": 3, "365|24|3": 4, "730|24|3": 1,
                "1095|24|3": 1, "30|24|4": 2},
    "Card Room": {"10|3|1": 3, "30|3|1": 1, "365|3|1": 1, "6||": 1, "30||": 1,
                  "18||": 1, "365||": 2, "1||": 1, "10||": 1, "5||": 1,
                  "180|24|2": 7, "365|24|2": 1},
    "Draw Frame": {"1|7|1": 1, "15|7|5": 6, "60|7|2": 2, "180|7|5": 1, "365|7|5": 5,
                   "730|7|5": 1, "1825|7|5": 2, "90|6|1": 1, "365|6|2": 1,
                   "730|6|2": 1, "30|6|5": 1},
    "Simplex": {"30|9|6": 9, "60|9|4": 1, "90|9|2": 3, "90|9|4": 1, "180|9|4": 1,
                "180|9|2": 1, "365|9|2": 2, "365|9|4": 1, "730|9|4": 1,
                "365|9|5": 2, "30|9|5": 5, "730|9|5": 2, "1460|9|6": 1},
    "Ringframe": {"7|1|1": 8, "30|1|1": 2, "30|1|": 1, "365|1|2": 1, "1|1|1": 2,
                  "15|10|1": 2, "30|9|2": 2, "45|38|2": 1, "60|9|2": 1, "730||": 18,
                  "15||": 13, "30||": 46, "90||": 31, "180||": 57, "365||": 31,
                  "7||": 11, "240||": 2, "28||": 2, "45||": 4, "3650||": 3,
                  "1825||": 8, "1||": 3, "14||": 1},
    "Autoconer": {"1|8|1": 1, "15|8|1": 1, "30|8|1": 5, "90|8|2": 1, "180|8|1": 1,
                  "180|8|2": 1, "365|8|2": 2, "730|8|2": 2, "180|33|1": 1,
                  "180|33|2": 1, "365|33|2": 1, "1825|33|2": 1, "3650|33|2": 2},
}

MACHINE_DEPTS = {
    "Finishing": 37, "A/C Plant": 3, "Blow Room": 11, "Blow Room-A": 5,
    "Blow Room-B": 4, "Carding": 24, "D.S.C": 19, "Ring Frame": 35,
}

OVERRIDES = [
    ("AC Plant", 10, None), ("Autoconer", 23, 33), ("Blowroom", 8, 2),
    ("Card Room", 11, 24), ("Carding", 11, 24), ("Draw Frame", 6, 6),
    ("Ringframe", 77, 9), ("Simplex", 6, 9),
]


@pytest.fixture
async def maint_user(session: AsyncSession, roles: dict) -> User:
    user = User(
        id=str(uuid.uuid4()),
        name="Maint Owner",
        email=f"mo-{uuid.uuid4().hex[:8]}@test.com",
        password_hash="x",
        role_id=roles["prod_manager"].id,
        mill_id=MILL,
        is_active=True,
    )
    session.add(user)
    await session.flush()
    return user


async def _seed(session: AsyncSession):
    i = 0
    for dept, cnt in MACHINE_DEPTS.items():
        for k in range(cnt):
            i += 1
            session.add(Machine(
                id=str(uuid.uuid4()), mill_id=MILL,
                code=f"MC-{i:03d}", name=f"{dept} {k+1}",
                machine_type="1930-10-05T18:29:50.000Z" if k == 0 else f"168757 {k}",
                department=dept,
                machine_number=None, line_code=None,
            ))
    for dept, combos in SCHED_COMBOS.items():
        sl = 0
        for combo, n in combos.items():
            freq_s, mc_s, mp_s = combo.split("|")
            for _ in range(n):
                sl += 1
                session.add(MaintenanceSchedule(
                    id=str(uuid.uuid4()), mill_id=MILL,
                    machine_code=f"{dept[:4]}_unit", type="preventive",
                    frequency_days=int(freq_s),
                    description=f"{dept} task {sl}",
                    department=dept, is_active=True,
                    machine_count=int(mc_s) if mc_s else None,
                    manpower_count=int(mp_s) if mp_s else None,
                    sl_no=sl, machine_line_code=None,
                    lubricant_name=None, lubricant_quantity=None,
                    last_done=None, next_due=None,
                ))
    for dept, persons, machines in OVERRIDES:
        session.add(MaintenanceDeptManpower(
            id=str(uuid.uuid4()), mill_id=MILL, department=dept,
            persons=persons, machines=machines, shift_hours=None,
        ))
    session.add(MillCalendar(
        id=str(uuid.uuid4()), mill_id=MILL, date="WEEKLY",
        day_type="holiday", weekly_off=4, persons_on_leave=0, note="Weekly off",
    ))
    await session.flush()


async def test_day_plan_returns_200_with_live_shaped_data(client, session, maint_user):
    from app.core.deps import get_current_user
    from app.main import app as fastapi_app

    await _seed(session)
    fastapi_app.dependency_overrides[get_current_user] = lambda: maint_user
    try:
        r = await client.get(f"/api/v1/maintenance/day-plan?mill_id={MILL}&year=2026&month=7")
        assert r.status_code == 200, r.text[:1200]
        j = r.json()
        assert j["days_in_month"] == 31
        assert j["total_schedule_count"] == 408
        for d in j["days"]:
            if d["available_min"] > 0:
                assert d["total_est_min"] <= d["available_min"], (
                    f"day {d['day']} overloaded: {d['total_est_min']} > {d['available_min']}"
                )
            if d["holiday_note"] == "Weekly off":
                assert d["total_tasks"] == 0
    finally:
        fastapi_app.dependency_overrides.pop(get_current_user, None)
