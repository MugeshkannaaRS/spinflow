"""
Run: python backend/scripts/seed_demo.py
Seeds realistic demo data for Arafath Spinning Mills presentation
"""

import random
import asyncio
from datetime import datetime, timedelta, date
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import AsyncSessionLocal
from app.models.masters import Company, Mill, Department, Customer
from app.models.hr import Employee
from app.models.production import ProductionEntry
from app.models.user import User, Role

DEMO_DATA = {
    "company": "Arafath Textiles Pvt Ltd",
    "mill": "Arafath Spinning Unit 1",
    "location": "Tiruppur, Tamil Nadu",
    "total_employees": 422,
    "monthly_salary_bill": 5905971,
    "departments": ["Production", "Maintenance", "Admin", "Electrical", "Quality", "Store", "Civil"],
    "sections": ["Blow Room", "Carding", "Drawing", "Simplex", "Ring Frame", "Finishing", "Packing", "Despatch", "Quality", "Electrical", "Store", "Admin", "Civil", "Security", "IT", "MIS"],
    "shifts": [
        {"name": "A Shift", "start": "06:00", "end": "14:00"},
        {"name": "B Shift", "start": "14:00", "end": "22:00"},
        {"name": "C Shift", "start": "22:00", "end": "06:00"},
        {"name": "General", "start": "08:00", "end": "17:00"},
    ],
}

ALERTS = [
    {"type": "machine_down", "message": "Ring Frame #12 stopped — 2hrs 15min", "severity": "critical", "dept": "Production"},
    {"type": "low_stock", "message": "Cotton stock: 3.2 days remaining", "severity": "critical", "dept": "Store"},
    {"type": "payment_overdue", "message": "ABC Mills Pvt Ltd — ₹4.2L overdue (45 days)", "severity": "warning", "dept": "Accounts"},
    {"type": "lc_expiring", "message": "LC #2024-089 expires in 5 days — ₹18L", "severity": "warning", "dept": "Accounts"},
    {"type": "absent_spike", "message": "Ring Frame section — 8 absent today", "severity": "warning", "dept": "Production"},
]

CUSTOMERS = [
    {"name": "ABC Mills Pvt Ltd", "pending": 4200000, "days_overdue": 45},
    {"name": "Sri Kumaran Textiles", "pending": 3100000, "days_overdue": 22},
    {"name": "Tiruppur Exports Ltd", "pending": 2800000, "days_overdue": 15},
    {"name": "Coimbatore Yarn Co", "pending": 2700000, "days_overdue": 8},
]


async def seed():
    async with AsyncSessionLocal() as db:
        # Check if demo company exists
        result = await db.execute(select(Company).where(Company.name == DEMO_DATA["company"]))
        company = result.scalar_one_or_none()
        if company:
            print(f"Demo company '{DEMO_DATA['company']}' already exists, skipping.")
            return

        # Create company
        company = Company(
            code="ARA001",
            name=DEMO_DATA["company"],
            address="12, SIPCOT Industrial Complex",
            phone="0421-2345678",
            email="info@araffath.in",
            city="Tiruppur",
            state="Tamil Nadu",
            pincode="641604",
            is_active=True,
        )
        db.add(company)
        await db.flush()
        print(f"Created company: {company.name}")

        # Create mill
        mill = Mill(
            company_id=company.id,
            code="MILL001",
            name=DEMO_DATA["mill"],
            address="12, SIPCOT Industrial Complex",
            city="Tiruppur",
            state="Tamil Nadu",
            pincode="641604",
            phone="0421-2345678",
            email="mill1@araffath.in",
            is_active=True,
        )
        db.add(mill)
        await db.flush()
        print(f"Created mill: {mill.name}")

        # Create departments
        dept_map = {}
        for dept_name in DEMO_DATA["departments"]:
            dept = Department(
                mill_id=mill.id,
                code=dept_name[:10].upper(),
                name=dept_name,
                department_type="general",
                is_active=True,
            )
            db.add(dept)
            await db.flush()
            dept_map[dept_name] = dept
        print(f"Created {len(dept_map)} departments")

        # Get admin role
        role_result = await db.execute(select(Role).where(Role.code == "SUPER_ADMIN"))
        admin_role = role_result.scalar_one_or_none()

        # Create admin user if admin role exists
        if admin_role:
            from app.core.security import hash_password
            admin = User(
                name="Demo Admin",
                email="demo@araffath.in",
                password_hash=hash_password("Demo@1234"),
                role_id=admin_role.id,
                mill_id=mill.id,
                mill_name=mill.name,
                company_id=company.id,
                department="Admin",
                is_active=True,
            )
            db.add(admin)
            await db.flush()
            print(f"Created admin user: {admin.email} / Demo@1234")

        # Create customers
        for c in CUSTOMERS:
            cust = Customer(
                mill_id=mill.id,
                code=c["name"][:10].upper(),
                name=c["name"],
                city="Tiruppur",
                state="Tamil Nadu",
                is_active=True,
            )
            db.add(cust)
        await db.flush()
        print(f"Created {len(CUSTOMERS)} customers")

        # Create employees
        sections = DEMO_DATA["sections"]
        shifts = ["A Shift", "B Shift", "C Shift", "General"]
        departments = DEMO_DATA["departments"]

        employees = []
        for i in range(1, DEMO_DATA["total_employees"] + 1):
            dept = random.choice(departments)
            section = random.choice(sections)
            shift = random.choice(shifts)
            basic = random.randint(8000, 25000)
            wages = random.randint(2000, 8000)
            total_sal = basic + wages + random.randint(500, 2000)

            emp = Employee(
                code=f"EMP{i:04d}",
                name=f"Employee {i}",
                sl_no=i,
                employee_id=f"E{i:04d}",
                department=dept,
                section=section,
                shift=shift,
                designation=random.choice(["Operator", "Senior Operator", "Technician", "Supervisor", "Clerk"]),
                gender=random.choice(["Male", "Female"]),
                grade=random.randint(1, 10),
                basic=basic,
                wages=wages,
                total_salary=total_sal,
                is_active=True,
                mill_id=mill.id,
            )
            employees.append(emp)

        db.add_all(employees)
        await db.flush()
        print(f"Created {len(employees)} employees")

        # Generate 30 days of production data
        today = date.today()
        production_entries = []
        machine_codes = [f"RF{i}" for i in range(1, 53)]
        for day_offset in range(30):
            d = today - timedelta(days=day_offset)
            for mc in machine_codes[:6]:  # 6 machines per day
                produced = random.randint(4000, 5500)
                waste = round(random.uniform(3.2, 4.8), 1)
                entry = ProductionEntry(
                    date=d.isoformat(),
                    shift=random.choice(["A", "B", "C"]),
                    machine_code=mc,
                    department="Production",
                    produced_kg=produced,
                    waste_kg=waste,
                    stoppage_mins=random.randint(0, 45),
                    machine_status=random.choice(["running", "idle", "breakdown"]),
                    mill_id=mill.id,
                )
                production_entries.append(entry)

        db.add_all(production_entries)
        print(f"Created {len(production_entries)} production entries (30 days)")

        await db.commit()
        print("\n✅ Demo data seeded successfully!")
        print(f"   Company: {DEMO_DATA['company']}")
        print(f"   Mill: {DEMO_DATA['mill']}")
        print(f"   Employees: {DEMO_DATA['total_employees']}")
        print(f"   Production entries: {len(production_entries)}")
        print(f"   Login: demo@araffath.in / Demo@1234")


if __name__ == "__main__":
    asyncio.run(seed())
