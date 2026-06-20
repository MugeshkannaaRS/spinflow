"""
Pilot Data Seeding Script
=========================
Generates realistic mill-scale data for pilot validation.

Usage:
    python -m backend.scripts.seed_pilot  [--force]

Target counts:
    1 Company, 3 Mills, 50 Users, 1000 Employees,
    10000 Production, 5000 Quality, 5000 Inventory,
    1000 Dispatch, 365-day Attendance, 12 Payroll periods,
    500 Customers, 500 Suppliers

Runs idempotently — skips if company already exists.
Use --force to drop and recreate.
"""

import argparse
import asyncio
import os
import random
import sys
import time
from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Any

from sqlalchemy import select, func, text

from app.core.security import hash_password
from app.db.session import async_session_factory
from app.models.dispatch import Dispatch
from app.models.hr import Attendance, Employee, MonthlyPayroll
from app.models.inventory import Lot, Warehouse
from app.models.masters import (
    Company, CompanyModule, Customer, Department, MasterVehicle, Mill, MillSettings,
    Route, YarnCount,
)
from app.models.payroll import PayrollMonth, PayslipEntry
from app.models.production import Machine, ProductionEntry, Shift
from app.models.quality import QualityApproval, QualityTest
from app.models.purchase import Supplier
from app.models.stock import StockLedger
from app.models.user import Role, User

# ── Configuration ───────────────────────────────────────────────────────────
TARGETS = {
    "mills": 3,
    "users": 50,
    "employees": 1000,
    "customers": 500,
    "suppliers": 500,
    "production_entries": 10000,
    "quality_tests": 5000,
    "quality_approvals": 2000,
    "stock_movements": 5000,
    "dispatch_records": 1000,
    "attendance_days": 365,
    "payroll_months": 12,
}

BATCH_SIZE = 500
COMPANY_NAME = "SpinFlow Pilot Mills Pvt Ltd"
COMPANY_CODE = "SF001"

ROLL_NAMES = [
    "SUPER_ADMIN", "MILL_OWNER", "GENERAL_MANAGER", "HR_MANAGER",
    "ACCOUNTANT", "PRODUCTION_MANAGER", "QUALITY_MANAGER",
    "DISPATCH_MANAGER", "STORE_MANAGER", "SUPERVISOR",
    "MACHINE_OPERATOR", "AUDITOR", "SECURITY_GATE",
]

FIRST_NAMES_MALE = [
    "Arun", "Balaji", "Chandran", "Dinesh", "Eswar", "Ganesh", "Harish",
    "Ilango", "Jayaram", "Karthik", "Logesh", "Mani", "Nataraj", "Prakash",
    "Rajesh", "Saravanan", "Thirumal", "Venkatesh", "Yogesh", "Akash",
    "Bharath", "Deepak", "Gokul", "Hariharan", "Kishore",
]
FIRST_NAMES_FEMALE = [
    "Anitha", "Bhavani", "Chitra", "Deepa", "Ezhil", "Geetha", "Hema",
    "Indira", "Jayanthi", "Kavitha", "Lakshmi", "Malathi", "Nalini",
    "Pavithra", "Revathi", "Selvi", "Thilaga", "Usha", "Vasanthi",
    "Yamuna", "Aishwarya", "Bhuvana", "Dhanalakshmi", "Gomathi",
]
LAST_NAMES = [
    "M", "K", "S", "R", "P", "T", "V", "N", "G", "C",
    "A", "B", "D", "E", "H", "J", "L", "Y",
]

DEPT_NAMES = [
    "Production", "Maintenance", "Admin", "Electrical", "Quality",
    "Store", "Civil", "HR", "Accounts", "Dispatch",
]
SECTION_NAMES = [
    "Blow Room", "Carding", "Drawing", "Simplex", "Ring Frame",
    "Finishing", "Packing", "Despatch", "Quality Lab", "Electrical",
    "Store", "Admin", "Civil", "Security", "IT", "MIS",
]
MACHINE_TYPES_MAP: dict[str, list[str]] = {
    "Blow Room": ["BL-01", "BL-02", "BL-03"],
    "Carding": ["CD-01", "CD-02", "CD-03", "CD-04", "CD-05", "CD-06"],
    "Drawing": ["DR-01", "DR-02", "DR-03", "DR-04"],
    "Simplex": ["SP-01", "SP-02", "SP-03"],
    "Ring Frame": [
        "RF-01", "RF-02", "RF-03", "RF-04", "RF-05", "RF-06",
        "RF-07", "RF-08", "RF-09", "RF-10", "RF-11", "RF-12",
    ],
    "Finishing": ["FN-01", "FN-02", "FN-03"],
    "Packing": ["PK-01", "PK-02"],
}
CITY_NAMES = [
    "Tiruppur", "Coimbatore", "Erode", "Salem", "Karur",
    "Dindigul", "Madurai", "Tirunelveli", "Chennai", "Bangalore",
]
STATE = "Tamil Nadu"

# ── Helpers ─────────────────────────────────────────────────────────────────

def random_name() -> str:
    gender = random.choice(["male", "female"])
    first = random.choice(FIRST_NAMES_MALE if gender == "male" else FIRST_NAMES_FEMALE)
    last = random.choice(LAST_NAMES)
    return f"{first} {last}"


def random_phone() -> str:
    return f"98{random.randint(10000000, 99999999)}"


def random_email(name: str, seq: int) -> str:
    slug = name.lower().replace(" ", ".")
    return f"{slug}.{seq}@mill.spinflow"


def random_date(start: date, end: date) -> date:
    return start + timedelta(days=random.randint(0, (end - start).days))


def batch(seq: list, size: int):
    for i in range(0, len(seq), size):
        yield seq[i:i + size]


# ── Main seeder ─────────────────────────────────────────────────────────────

class PilotSeeder:
    def __init__(self, force: bool = False):
        self.force = force
        self.stats: dict[str, int] = defaultdict(int)
        self.timings: dict[str, float] = {}
        self.mills: list[Mill] = []
        self.departments: dict[str, list[Department]] = {}
        self.warehouses: dict[str, list[Warehouse]] = {}
        self.machines: dict[str, list[Machine]] = {}
        self.shifts: list[Shift] = []
        self.roles: dict[str, Role] = {}
        self.users: dict[str, list[User]] = {}
        self.customers: dict[str, list[Customer]] = {}
        self.suppliers: dict[str, list[Supplier]] = {}
        self.employees: dict[str, list[Employee]] = {}
        self.lots: dict[str, list[Lot]] = {}
        self.yarn_counts: dict[str, list[YarnCount]] = {}
        self.routes_map: dict[str, list[Route]] = {}
        self.company: Company | None = None

    async def seed(self):
        start = time.time()
        async with async_session_factory() as db:
            # Check if already seeded
            existing = await db.execute(
                select(Company).where(Company.code == COMPANY_CODE)
            )
            self.company = existing.scalar_one_or_none()
            if self.company and not self.force:
                print(f"Company '{COMPANY_NAME}' already exists. Use --force to recreate.")
                return

            if self.company and self.force:
                await self._drop_all(db)

            # ── 1. Roles ────────────────────────────────────────────────
            t0 = time.time()
            roles_result = await db.execute(select(Role))
            for r in roles_result.scalars().all():
                self.roles[r.code] = r
            self.timings["load_roles"] = time.time() - t0
            print(f"  Loaded {len(self.roles)} roles")

            # ── 2. Company ──────────────────────────────────────────────
            t0 = time.time()
            self.company = Company(
                code=COMPANY_CODE, name=COMPANY_NAME,
                address="123, SIPCOT Industrial Complex", phone=random_phone(),
                email="pilot@spinflow.in",
                is_active=True, max_users=200,
            )
            db.add(self.company)
            await db.flush()
            self.timings["company"] = time.time() - t0
            self.stats["companies"] = 1
            print(f"  Created company: {self.company.name}")

            # ── 3. Mills ────────────────────────────────────────────────
            t0 = time.time()
            mill_names = [
                "SpinFlow Spinning Unit 1 — Tiruppur",
                "SpinFlow Spinning Unit 2 — Coimbatore",
                "SpinFlow Compact Mill — Erode",
            ]
            for i in range(TARGETS["mills"]):
                mill = Mill(
                    company_id=self.company.id,
                    code=f"SF-MILL-{i+1:03d}",
                    name=mill_names[i],
                    address=f"{i+1}, Industrial Estate", city=CITY_NAMES[i],
                    state=STATE, pincode=f"64160{i+1}",
                    phone=random_phone(), email=f"mill{i+1}@spinflow.in",
                    is_active=True,
                )
                db.add(mill)
                await db.flush()
                self.mills.append(mill)

                ms = MillSettings(mill_id=mill.id)
                db.add(ms)
            self.stats["mills"] = len(self.mills)
            self.timings["mills"] = time.time() - t0
            print(f"  Created {len(self.mills)} mills")

            # ── 4. Mill-level entities ──────────────────────────────────
            for mill in self.mills:
                await self._seed_mill_entities(db, mill)

            # ── 5. Users ────────────────────────────────────────────────
            t0 = time.time()
            await self._seed_users(db)
            self.timings["users"] = time.time() - t0

            # ── 6. Create admin user ─────────────────────────────────────
            admin_user = User(
                name="superadmin",
                email="admin@mill.spinflow",
                password_hash=hash_password(os.environ.get("SEED_ADMIN_PASSWORD", "Admin@1234")),
                role_id=self.roles["SUPER_ADMIN"].id,
                department="Management",
                mill_id=self.mills[0].id,
                mill_name=self.mills[0].name,
                company_id=self.company.id,
                is_active=True,
                must_change_password=False,
            )
            db.add(admin_user)
            await db.flush()
            self.users.setdefault("SUPER_ADMIN", []).append(admin_user)
            self.stats["users"] += 1

            # ── 7. Enable all company modules ───────────────────────────
            all_modules = [
                "dashboard", "production", "quality", "maintenance", "hr",
                "payroll", "purchase", "stores", "inventory", "dispatch",
                "lotrac", "accounts", "sales", "masters", "users", "reports",
            ]
            for mod in all_modules:
                db.add(CompanyModule(
                    company_id=self.company.id,
                    module_name=mod, is_enabled=True,
                    enabled_by=self.users.get("SUPER_ADMIN", [None])[0].id if self.users.get("SUPER_ADMIN") else None,
                ))
            self.stats["company_modules"] = len(all_modules)

            # ── 8. Customers ────────────────────────────────────────────
            t0 = time.time()
            await self._seed_customers(db)
            self.timings["customers"] = time.time() - t0

            # ── 9. Suppliers ────────────────────────────────────────────
            t0 = time.time()
            await self._seed_suppliers(db)
            self.timings["suppliers"] = time.time() - t0

            # ── 10. Employees ───────────────────────────────────────────
            t0 = time.time()
            await self._seed_employees(db)
            self.timings["employees"] = time.time() - t0

            # ── 11. Lot ─────────────────────────────────────────────────
            t0 = time.time()
            await self._seed_lots(db)
            self.timings["lots"] = time.time() - t0

            # ── 12. Production Entries ───────────────────────────────────
            t0 = time.time()
            await self._seed_production(db)
            self.timings["production"] = time.time() - t0

            # ── 13. Quality Records ──────────────────────────────────────
            t0 = time.time()
            await self._seed_quality(db)
            self.timings["quality"] = time.time() - t0

            # ── 14. Stock Movements ──────────────────────────────────────
            t0 = time.time()
            await self._seed_stock(db)
            self.timings["stock"] = time.time() - t0

            # ── 15. Attendance & Payroll ─────────────────────────────────
            t0 = time.time()
            await self._seed_attendance_and_payroll(db)
            self.timings["attendance_payroll"] = time.time() - t0

            # ── 16. Dispatch ─────────────────────────────────────────────
            t0 = time.time()
            await self._seed_dispatch(db)
            self.timings["dispatch"] = time.time() - t0

            await db.commit()
            self.timings["total"] = time.time() - start

        self._report()

    # ── Drop existing data ──────────────────────────────────────────────────

    async def _drop_all(self, db):
        print("  Dropping existing pilot data...")
        tables = [
            "stock_ledger", "stock_balance", "stock_movements", "inventory_bags",
            "trip_scan_logs", "trip_items", "trips",
            "dispatch_items", "dispatches",
            "payslip_entries", "payroll_months", "monthly_payroll",
            "attendance", "employee_shifts", "leaves",
            "quality_approvals", "lab_reports", "quality_tests",
            "production_entries", "downtime_logs",
            "sales_order_lines", "sales_orders",
            "stock_transfers",
            "document_attachments",
            "lots", "machines", "master_vehicles", "master_routes",
            "yarn_counts", "customers", "suppliers",
            "employee_custom_values", "employee_custom_fields",
            "employees",
            "company_modules", "user_sessions",
            "users",
            "mill_settings", "shifts", "warehouses", "master_departments",
            "mills",
            "companies",
        ]
        for table in tables:
            try:
                await db.execute(text(f"DELETE FROM {table}"))
            except Exception:
                pass
        await db.commit()
        print("  Done clearing.")

    # ── Mill-level entities ────────────────────────────────────────────────

    async def _seed_mill_entities(self, db, mill: Mill):
        # Departments
        depts = []
        for i, dn in enumerate(DEPT_NAMES):
            dept = Department(
                mill_id=mill.id, code=f"D{i:02d}",
                name=dn, department_type=dn.lower(), is_active=True,
            )
            db.add(dept)
            depts.append(dept)
        await db.flush()
        self.departments[str(mill.id)] = depts
        self.stats["departments"] += len(depts)

        # Warehouses
        whs = []
        for wh_name in ["Finished Goods", "Raw Material", "WIP Store"]:
            wh = Warehouse(
                code=f"WH-{mill.code[-3:]}-{wh_name[:3].upper()}",
                name=f"{wh_name} Warehouse",
                mill_id=mill.id, location=f"Block {wh_name[0]}",
                capacity_bags=10000, is_active=True,
            )
            db.add(wh)
            whs.append(wh)
        await db.flush()
        self.warehouses[str(mill.id)] = whs
        self.stats["warehouses"] += len(whs)

        # Shifts
        shift_data = [("A", "A Shift", "06:00", "14:00"), ("B", "B Shift", "14:00", "22:00"), ("C", "C Shift", "22:00", "06:00"), ("G", "General", "08:00", "17:00")]
        for code, name, start, end in shift_data:
            db.add(Shift(code=code, name=name, start_time=start, end_time=end, mill_id=mill.id))
        await db.flush()
        self.stats["shifts"] += len(shift_data)

        # Yarn Counts
        yc_list = [
            ("Ne 20", 20, "100% Cotton", 20.5, 12.0),
            ("Ne 30", 30, "100% Cotton", 18.0, 11.0),
            ("Ne 40", 40, "100% Cotton", 16.0, 10.5),
            ("Ne 40", 40, "Cotton/Poly 50:50", 16.5, 10.8),
            ("Ne 60", 60, "100% Cotton", 14.0, 9.5),
        ]
        ycs = []
        for count, val, blend, csp, u_pct in yc_list:
            yc = YarnCount(mill_id=mill.id, count=count, count_value=val, blend=blend, standard_csp=csp, standard_u_percent=u_pct, is_active=True)
            db.add(yc)
            ycs.append(yc)
        await db.flush()
        self.yarn_counts[str(mill.id)] = ycs
        self.stats["yarn_counts"] += len(ycs)

        # Machines
        mid_suffix = mill.code[-3:]
        machines = []
        for dept_name, mcodes in MACHINE_TYPES_MAP.items():
            dept_obj = next((d for d in depts if d.name == dept_name), depts[0])
            is_rf = dept_name == "Ring Frame"
            for code in mcodes:
                m = Machine(
                    code=f"M{mid_suffix}-{code}", name=f"{dept_name} {code}",
                    machine_type=dept_name, department=dept_name,
                    mill_id=mill.id, department_id=dept_obj.id,
                    spindles=random.randint(800, 1200) if is_rf else None,
                    target_kg=random.uniform(4000, 5500) if is_rf else random.uniform(1000, 3000),
                    status=True, current_status=random.choices(["running", "running", "running", "idle", "breakdown"], weights=[60, 20, 10, 5, 5])[0],
                )
                db.add(m)
                machines.append(m)
        await db.flush()
        self.machines[str(mill.id)] = machines
        self.stats["machines"] += len(machines)

        # Routes
        routes = []
        for j, dest in enumerate(CITY_NAMES[1:], 1):
            rt = Route(
                mill_id=mill.id, code=f"RT-{mill.code[-3:]}-{j:02d}",
                name=f"{mill.city} → {dest}", origin=mill.city or CITY_NAMES[0],
                destination=dest, distance_km=random.randint(50, 400),
                estimated_hours=random.uniform(1.5, 8.0), is_active=True,
            )
            db.add(rt)
            routes.append(rt)
        await db.flush()
        self.routes_map[str(mill.id)] = routes
        self.stats["routes"] += len(routes)

        # Vehicles
        vehicles = []
        for j in range(5):
            v = MasterVehicle(
                mill_id=mill.id,
                vehicle_no=f"TN{mid_suffix}{j:02d} {chr(65+j)}{random.randint(1000, 9999)}",
                vehicle_type=random.choice(["truck", "lorry", "mini_truck"]),
                make="Ashok Leyland", model="Dost",
                capacity_kg=random.choice([8000, 12000, 16000]),
                driver_name=random_name(), driver_phone=random_phone(),
                driver_license=f"DL-{random.randint(1000000000, 9999999999)}",
                is_active=True,
            )
            db.add(v)
            vehicles.append(v)
        await db.flush()
        self.stats["master_vehicles"] += len(vehicles)

    # ── Users ───────────────────────────────────────────────────────────────

    async def _seed_users(self, db):
        role_distribution: list[tuple[str, int]] = [
            ("SUPER_ADMIN", 1), ("MILL_OWNER", 3),
            ("GENERAL_MANAGER", 3), ("HR_MANAGER", 3),
            ("ACCOUNTANT", 6), ("PRODUCTION_MANAGER", 6),
            ("QUALITY_MANAGER", 3), ("DISPATCH_MANAGER", 3),
            ("STORE_MANAGER", 3), ("SUPERVISOR", 6),
            ("MACHINE_OPERATOR", 6), ("AUDITOR", 3),
            ("SECURITY_GATE", 4),
        ]
        idx = 0
        for role_code, count in role_distribution:
            role = self.roles.get(role_code)
            if not role:
                continue
            ulist = []
            for j in range(count):
                name = random_name()
                mill = self.mills[idx % len(self.mills)]
                idx += 1
                u = User(
                    name=name, email=random_email(name, idx),
                    password_hash=hash_password(os.environ.get("SEED_USER_PASSWORD", "Pilot@1234")),
                    role_id=role.id, department=random.choice(DEPT_NAMES),
                    mill_id=mill.id, mill_name=mill.name,
                    company_id=self.company.id,
                    phone=random_phone(), is_active=True,
                    must_change_password=False,
                )
                db.add(u)
                ulist.append(u)
                self.stats["users"] += 1
            await db.flush()
            self.users[role_code] = ulist

    # ── Customers ───────────────────────────────────────────────────────────

    async def _seed_customers(self, db):
        for i in range(TARGETS["customers"]):
            name = f"{random_name()} Textiles"
            mill = self.mills[i % len(self.mills)]
            c = Customer(
                mill_id=mill.id,
                code=f"CUST-{mill.code[-3:]}-{i+1:04d}",
                name=name, city=random.choice(CITY_NAMES),
                state=STATE, phone=random_phone(),
                email=f"cust{i+1}@example.com",
                contact_person=random_name(),
                credit_limit=random.choice([500000, 1000000, 2000000, 5000000]),
                payment_terms_days=random.choice([15, 30, 45, 60]),
                is_active=True,
            )
            db.add(c)
        await db.flush()
        # Load them
        result = await db.execute(select(Customer).where(Customer.mill_id.in_([m.id for m in self.mills])))
        for c in result.scalars().all():
            self.customers.setdefault(str(c.mill_id), []).append(c)
        self.stats["customers"] = TARGETS["customers"]

    # ── Suppliers ───────────────────────────────────────────────────────────

    async def _seed_suppliers(self, db):
        for i in range(TARGETS["suppliers"]):
            name = f"{random_name()} Cotton Co"
            mill = self.mills[i % len(self.mills)]
            s = Supplier(
                mill_id=mill.id,
                code=f"SUPP-{mill.code[-3:]}-{i+1:04d}",
                name=name, city=random.choice(CITY_NAMES),
                state=STATE, phone=random_phone(),
                email=f"supp{i+1}@example.com",
                contact_person=random_name(),
                status=True,
            )
            db.add(s)
        await db.flush()
        result = await db.execute(select(Supplier).where(Supplier.mill_id.in_([m.id for m in self.mills])))
        for s in result.scalars().all():
            self.suppliers.setdefault(str(s.mill_id), []).append(s)
        self.stats["suppliers"] = TARGETS["suppliers"]

    # ── Employees ───────────────────────────────────────────────────────────

    async def _seed_employees(self, db):
        emp_per_mill = TARGETS["employees"] // len(self.mills)
        for mill in self.mills:
            depts = self.departments.get(str(mill.id), [])
            batch_list = []
            for i in range(emp_per_mill):
                dept = random.choice(depts)
                gender = random.choice(["Male", "Female"])
                basic = random.randint(8000, 28000)
                wages = random.randint(2000, 8000)
                e = Employee(
                    mill_id=mill.id,
                    code=f"EMP-{mill.code[-3:]}-{i+1:04d}",
                    name=random_name(),
                    employee_id=f"E{mill.code[-3:]}{i+1:04d}",
                    gender=gender,
                    designation=random.choice(["Operator", "Senior Operator", "Technician", "Supervisor", "Clerk", "Manager"]),
                    department=dept.name,
                    department_name=dept.name,
                    section=random.choice(SECTION_NAMES),
                    shift=random.choice(["A", "B", "C", "General"]),
                    basic=basic,
                    wages=wages,
                    total_salary=basic + wages + random.randint(500, 2000),
                    daily_wage=basic / 26,
                    phone=random_phone(),
                    grade=str(random.randint(1, 10)),
                    is_active=True,
                )
                batch_list.append(e)
                self.stats["employees"] += 1
                if len(batch_list) >= BATCH_SIZE:
                    db.add_all(batch_list)
                    await db.flush()
                    batch_list = []
            db.add_all(batch_list)
            await db.flush()
        result = await db.execute(select(Employee))
        for e in result.scalars().all():
            self.employees.setdefault(str(e.mill_id), []).append(e)

    # ── Lot ────────────────────────────────────────────────────────────────

    async def _seed_lots(self, db):
        today = date.today()
        for mill in self.mills:
            lot_count = 100  # 100 lots per mill
            whs = self.warehouses.get(str(mill.id), [])
            ycs = self.yarn_counts.get(str(mill.id), [])
            batches = []
            for i in range(lot_count):
                yc = random.choice(ycs) if ycs else None
                produced_date = random_date(today - timedelta(days=180), today)
                lot = Lot(
                    mill_id=mill.id,
                    lot_no=f"L-{mill.code[-3:]}-{i+1:04d}",
                    type="yarn",
                    department="Production",
                    quantity=random.uniform(500, 5000),
                    unit="kg",
                    warehouse_id=random.choice(whs).id if whs else None,
                    grade=random.choice(["A", "A", "A", "B", "B", "C"]),
                    produced_date=produced_date.isoformat(),
                    status=random.choices(["in-stock", "in-stock", "in-stock", "partially-dispatched", "dispatched"], weights=[40, 30, 15, 10, 5])[0],
                    quality_status=random.choice(["approved", "approved", "approved", "pending", "rejected"]),
                )
                batches.append(lot)
            db.add_all(batches)
            await db.flush()
            result = await db.execute(
                select(Lot).where(Lot.mill_id == mill.id)
            )
            self.lots[str(mill.id)] = result.scalars().all()
            self.stats["lots"] += len(self.lots[str(mill.id)])

    # ── Production ──────────────────────────────────────────────────────────

    async def _seed_production(self, db):
        today = date.today()
        per_mill = TARGETS["production_entries"] // len(self.mills)
        for mill in self.mills:
            machines = self.machines.get(str(mill.id), [])
            if not machines:
                continue
            operators = self.employees.get(str(mill.id), [])
            batch_list = []
            for i in range(per_mill):
                m = random.choice(machines)
                d = today - timedelta(days=random.randint(0, 60))
                produced = random.uniform(2000, 6000)
                entry = ProductionEntry(
                    date=d.isoformat(),
                    shift=random.choice(["A", "B", "C"]),
                    machine_code=m.code,
                    department=m.department or "Production",
                    operator=random.choice(operators).name if operators else "Operator",
                    produced_kg=round(produced, 2),
                    waste_kg=round(random.uniform(1.0, 5.0), 2),
                    count=random.choice(["Ne 20", "Ne 30", "Ne 40", "Ne 60"]),
                    status=random.choices(["approved", "approved", "approved", "pending", "rejected"], weights=[50, 25, 10, 10, 5])[0],
                )
                batch_list.append(entry)
                if len(batch_list) >= BATCH_SIZE:
                    db.add_all(batch_list)
                    await db.flush()
                    batch_list = []
            db.add_all(batch_list)
            await db.flush()
            self.stats["production_entries"] += per_mill

    # ── Quality ─────────────────────────────────────────────────────────────

    async def _seed_quality(self, db):
        today = date.today()
        # Quality tests
        test_per_mill = TARGETS["quality_tests"] // len(self.mills)
        for mill in self.mills:
            lots = self.lots.get(str(mill.id), [])
            batch_list = []
            for i in range(test_per_mill):
                lot = random.choice(lots) if lots else None
                standard = random.choice([14.0, 16.0, 18.0, 20.0])
                result = standard + random.gauss(0, 0.8)
                qt = QualityTest(
                    date=(today - timedelta(days=random.randint(0, 60))).isoformat(),
                    type=random.choice(["CSP", "U%", "Strength", "Moisture"]),
                    lot_id=lot.id if lot else None,
                    lot_no=lot.lot_no if lot else None,
                    machine_code=random.choice(self.machines.get(str(mill.id), [])).code if self.machines.get(str(mill.id)) else None,
                    result=round(result, 2),
                    unit=random.choice(["CSP", "%", "g/tex"]),
                    standard=standard,
                    status="pass" if abs(result - standard) / standard < 0.05 else "fail",
                )
                batch_list.append(qt)
                self.stats["quality_tests"] += 1
                if len(batch_list) >= BATCH_SIZE:
                    db.add_all(batch_list)
                    await db.flush()
                    batch_list = []
            db.add_all(batch_list)
            await db.flush()

        # Quality Approvals
        app_per_mill = TARGETS["quality_approvals"] // len(self.mills)
        for mill in self.mills:
            lots = self.lots.get(str(mill.id), [])
            batch_list = []
            for i in range(app_per_mill):
                lot = random.choice(lots) if lots else None
                qa = QualityApproval(
                    lot_id=lot.id if lot else "00000000-0000-0000-0000-000000000000",
                    lot_no=lot.lot_no if lot else "UNKNOWN",
                    department=random.choice(DEPT_NAMES),
                    produced_kg=random.uniform(500, 5000),
                    sample_date=(today - timedelta(days=random.randint(0, 60))).isoformat(),
                    status=random.choice(["approved", "approved", "approved", "rejected", "pending"]),
                    remarks="Auto-seeded",
                )
                batch_list.append(qa)
                self.stats["quality_approvals"] += 1
            db.add_all(batch_list)
            await db.flush()

    # ── Stock ───────────────────────────────────────────────────────────────

    async def _seed_stock(self, db):
        per_mill = TARGETS["stock_movements"] // len(self.mills)
        today = date.today()
        for mill in self.mills:
            lots = self.lots.get(str(mill.id), [])
            whs = self.warehouses.get(str(mill.id), [])
            users = []
            for ulist in self.users.values():
                users.extend(ulist)
            mill_users = [u for u in users if str(u.mill_id) == str(mill.id)]
            if not whs or not mill_users:
                continue
            batch_list = []
            for i in range(per_mill):
                lot = random.choice(lots) if lots else None
                wh = random.choice(whs)
                user = random.choice(mill_users)
                qty = random.uniform(100, 2000)
                sm = StockLedger(
                    mill_id=mill.id,
                    lot_id=lot.id if lot else None,
                    warehouse_id=wh.id,
                    move_type=random.choice(["production_in", "transfer_in", "dispatch_out", "adjustment"]),
                    qty_in=qty if random.random() > 0.3 else 0,
                    qty_out=qty if random.random() <= 0.3 else 0,
                    weight_in_kg=qty if random.random() > 0.3 else 0,
                    weight_out_kg=qty if random.random() <= 0.3 else 0,
                    lot_no=lot.lot_no if lot else None,
                    warehouse_code=wh.code,
                    user_id=user.id,
                    created_at=datetime.now() - timedelta(days=random.randint(0, 60)),
                )
                batch_list.append(sm)
                self.stats["stock_movements"] += 1
                if len(batch_list) >= BATCH_SIZE:
                    db.add_all(batch_list)
                    await db.flush()
                    batch_list = []
            db.add_all(batch_list)
            await db.flush()

    # ── Attendance & Payroll ────────────────────────────────────────────────

    async def _seed_attendance_and_payroll(self, db):
        today = date.today()
        start_date = today - timedelta(days=TARGETS["attendance_days"])
        for mill in self.mills:
            employees = self.employees.get(str(mill.id), [])
            if not employees:
                continue
            # Attendance — one record per employee per day (sampled)
            attendance_rate = 0.85  # 85% present on average
            batch_list = []
            att_count = 0
            for emp in employees:
                for day_offset in range(TARGETS["attendance_days"]):
                    d = start_date + timedelta(days=day_offset)
                    if d > today:
                        break
                    present = random.random() < attendance_rate
                    status = "present" if present else "absent"
                    a = Attendance(
                        date=d.isoformat(),
                        employee_id=emp.id,
                        employee_name=emp.name,
                        department=emp.department,
                        shift=emp.shift or "General",
                        status=status,
                        check_in="06:15" if present and emp.shift in ("A", "General") else "14:15" if present else None,
                        check_out="14:00" if present and emp.shift in ("A", "General") else "22:00" if present else None,
                        overtime_hours=random.uniform(0, 2) if present and random.random() < 0.2 else 0,
                    )
                    batch_list.append(a)
                    att_count += 1
                    if len(batch_list) >= BATCH_SIZE:
                        db.add_all(batch_list)
                        await db.flush()
                        batch_list = []
            db.add_all(batch_list)
            await db.flush()
            self.stats["attendance"] += att_count

            # Payroll — 12 months
            users_list = []
            for ulist in self.users.values():
                users_list.extend(ulist)
            hr_users = [u for u in users_list if u.role_rel and u.role_rel.code in ("HR_MANAGER", "SUPER_ADMIN", "MILL_OWNER")]

            for month in range(1, TARGETS["payroll_months"] + 1):
                year = today.year if month <= today.month else today.year - 1
                if month > today.month:
                    continue  # Don't seed future months
                pm = PayrollMonth(
                    mill_id=mill.id,
                    month=month, year=year,
                    status="finalized" if (year < today.year or (year == today.year and month < today.month)) else "draft",
                    total_employees=len(employees),
                    total_net=sum(e.total_salary or 0 for e in employees),
                )
                db.add(pm)
                await db.flush()
                self.stats["payroll_months"] += 1

                # Payslip entries per employee
                ps_batch = []
                for emp in employees:
                    gross = float(emp.total_salary or 8000)
                    pf = gross * 0.12
                    esic = gross * 0.0075 if gross <= 21000 else 0
                    ps = PayslipEntry(
                        payroll_month_id=pm.id,
                        employee_id=emp.id,
                        mill_id=mill.id,
                        month=month, year=year,
                        present_days=random.randint(22, 26),
                        absent_days=random.randint(0, 4),
                        daily_wage=emp.daily_wage or gross / 26,
                        basic_wage=gross,
                        gross_wage=gross,
                        pf_employee=pf,
                        pf_employer=pf,
                        esic_employee=esic,
                        esic_employer=esic,
                        net_wage=gross - pf - esic,
                        status="paid" if pm.status == "finalized" else "pending",
                    )
                    ps_batch.append(ps)
                    self.stats["payslip_entries"] += 1
                    if len(ps_batch) >= BATCH_SIZE:
                        db.add_all(ps_batch)
                        await db.flush()
                        ps_batch = []
                db.add_all(ps_batch)
                await db.flush()

    # ── Dispatch ────────────────────────────────────────────────────────────

    async def _seed_dispatch(self, db):
        per_mill = TARGETS["dispatch_records"] // len(self.mills)
        today = date.today()
        for mill in self.mills:
            lots = self.lots.get(str(mill.id), [])
            customers = self.customers.get(str(mill.id), [])
            if not customers:
                continue
            batch_list = []
            for i in range(per_mill):
                lot = random.choice(lots) if lots else None
                cust = random.choice(customers)
                qty = random.uniform(500, 5000)
                d = Dispatch(
                    dispatch_no=f"DSP-{mill.code[-3:]}-{i+1:04d}",
                    date=(today - timedelta(days=random.randint(0, 60))).isoformat(),
                    customer=cust.name,
                    lot_id=lot.id if lot else None,
                    lot_no=lot.lot_no if lot else None,
                    quantity_kg=round(qty, 2),
                    vehicle_no=f"TN{random.randint(10, 99)} X{random.randint(1000, 9999)}",
                    total_bags=random.randint(10, 100),
                    total_weight_kg=round(qty, 2),
                    status=random.choice(["pending", "in-transit", "delivered", "delivered", "delivered"]),
                )
                batch_list.append(d)
                self.stats["dispatches"] += 1
            db.add_all(batch_list)
            await db.flush()

    # ── Report ──────────────────────────────────────────────────────────────

    def _report(self):
        print()
        print("=" * 60)
        print("PILOT SEED REPORT")
        print("=" * 60)
        print()
        print(f"{'Entity':<30} {'Count':>10} {'Time (s)':>10}")
        print("-" * 50)
        for key, count in sorted(self.stats.items()):
            t = self.timings.get(key, 0)
            print(f"{key:<30} {count:>10} {t:>10.2f}")
        print("-" * 50)
        total_count = sum(self.stats.values())
        total_time = self.timings.get("total", 0)
        print(f"{'TOTAL':<30} {total_count:>10} {total_time:>10.2f}")
        print()
        admin_pwd = os.environ.get("SEED_ADMIN_PASSWORD", "Admin@1234")
        user_pwd = os.environ.get("SEED_USER_PASSWORD", "Pilot@1234")
        print(f"Login with: admin@mill.spinflow / {admin_pwd}")
        print(f"Login with: any seeded user / {user_pwd}")


async def main():
    parser = argparse.ArgumentParser(description="Seed pilot data")
    parser.add_argument("--force", action="store_true", help="Drop existing pilot data first")
    args = parser.parse_args()

    print(f"SpinFlow ERP — Pilot Data Seeding")
    print(f"Targets: {', '.join(f'{k}={v}' for k, v in TARGETS.items())}")
    print(f"Force mode: {args.force}")
    print()

    seeder = PilotSeeder(force=args.force)
    await seeder.seed()


if __name__ == "__main__":
    asyncio.run(main())
