from typing import Optional, List
from datetime import datetime, timezone
from sqlalchemy import select, func, and_, text
from app.services.base import BaseService
from app.models.payroll import PayrollMonth, PayslipEntry
from app.models.hr import Employee, Attendance
from app.models.masters import Mill
from app.core.error_handler import SpinFlowException

PF_EMPLOYEE_RATE = 0.12
PF_EMPLOYER_RATE = 0.13
ESIC_EMPLOYEE_RATE = 0.0075
ESIC_EMPLOYER_RATE = 0.0325
OT_MULTIPLIER = 1.5
WORKING_HOURS_PER_DAY = 8


class PayrollService(BaseService[PayrollMonth]):
    async def get_or_create_month(
        self, mill_id: str, month: int, year: int, creator_id: str
    ) -> PayrollMonth:
        result = await self.db.execute(
            select(PayrollMonth).where(
                and_(
                    PayrollMonth.mill_id == mill_id,
                    PayrollMonth.month == month,
                    PayrollMonth.year == year,
                )
            )
        )
        pm = result.scalar_one_or_none()
        if pm:
            return pm
        pm = PayrollMonth(
            mill_id=mill_id,
            month=month,
            year=year,
            status="draft",
            processed_by=creator_id,
        )
        self.db.add(pm)
        await self.db.flush()
        return pm

    async def process_payroll(
        self,
        mill_id: str,
        month: int,
        year: int,
        *,
        processor_id: str,
        processor_role: str,
    ) -> dict:
        pm = await self.get_or_create_month(mill_id, month, year, processor_id)
        if pm.status not in ("draft", "processing"):
            raise SpinFlowException.bad_request("Payroll already approved or paid")

        emp_result = await self.db.execute(
            select(Employee).where(
                and_(
                    Employee.mill_id == mill_id,
                    Employee.is_active == True,
                )
            )
        )
        employees = emp_result.scalars().all()

        date_prefix = f"{year}-{month:02d}"

        payslip_data = []
        for emp in employees:
            present_result = await self.db.execute(
                select(func.count()).select_from(
                    select(Attendance).where(
                        and_(
                            Attendance.employee_id == emp.id,
                            Attendance.status == "present",
                            Attendance.date.like(f"{date_prefix}%"),
                        )
                    ).subquery()
                )
            )
            present_days = present_result.scalar() or 0

            half_result = await self.db.execute(
                select(func.count()).select_from(
                    select(Attendance).where(
                        and_(
                            Attendance.employee_id == emp.id,
                            Attendance.status.in_(["half_day", "half-day"]),
                            Attendance.date.like(f"{date_prefix}%"),
                        )
                    ).subquery()
                )
            )
            half_days = half_result.scalar() or 0

            absent_result = await self.db.execute(
                select(func.count()).select_from(
                    select(Attendance).where(
                        and_(
                            Attendance.employee_id == emp.id,
                            Attendance.status == "absent",
                            Attendance.date.like(f"{date_prefix}%"),
                        )
                    ).subquery()
                )
            )
            absent_days = absent_result.scalar() or 0

            ot_result = await self.db.execute(
                select(func.coalesce(func.sum(Attendance.overtime_hours), 0)).where(
                    and_(
                        Attendance.employee_id == emp.id,
                        Attendance.date.like(f"{date_prefix}%"),
                    )
                )
            )
            ot_hours = float(ot_result.scalar() or 0)

            daily_wage = getattr(emp, "daily_wage", 0) or 0
            pf_enrolled = getattr(emp, "pf_enrolled", False) or False
            esic_enrolled = getattr(emp, "esic_enrolled", False) or False

            effective_days = present_days + (half_days * 0.5)
            basic_wage = round(daily_wage * effective_days, 2)
            overtime_amount = round(
                ot_hours * (daily_wage / WORKING_HOURS_PER_DAY) * OT_MULTIPLIER, 2
            )
            gross_wage = basic_wage + overtime_amount

            pf_employee = round(basic_wage * PF_EMPLOYEE_RATE, 2) if pf_enrolled else 0.0
            pf_employer = round(basic_wage * PF_EMPLOYER_RATE, 2) if pf_enrolled else 0.0
            esic_employee = round(gross_wage * ESIC_EMPLOYEE_RATE, 2) if esic_enrolled else 0.0
            esic_employer = round(gross_wage * ESIC_EMPLOYER_RATE, 2) if esic_enrolled else 0.0
            net_wage = round(gross_wage - pf_employee - esic_employee, 2)

            existing_result = await self.db.execute(
                select(PayslipEntry).where(
                    and_(
                        PayslipEntry.payroll_month_id == pm.id,
                        PayslipEntry.employee_id == emp.id,
                    )
                )
            )
            existing = existing_result.scalar_one_or_none()

            if existing:
                existing.present_days = present_days
                existing.absent_days = absent_days
                existing.half_days = half_days
                existing.overtime_hours = ot_hours
                existing.daily_wage = daily_wage
                existing.basic_wage = basic_wage
                existing.overtime_amount = overtime_amount
                existing.gross_wage = gross_wage
                existing.pf_employee = pf_employee
                existing.pf_employer = pf_employer
                existing.esic_employee = esic_employee
                existing.esic_employer = esic_employer
                existing.net_wage = net_wage
            else:
                entry = PayslipEntry(
                    payroll_month_id=pm.id,
                    employee_id=emp.id,
                    mill_id=mill_id,
                    month=month,
                    year=year,
                    present_days=present_days,
                    absent_days=absent_days,
                    half_days=half_days,
                    overtime_hours=ot_hours,
                    daily_wage=daily_wage,
                    basic_wage=basic_wage,
                    overtime_amount=overtime_amount,
                    gross_wage=gross_wage,
                    pf_employee=pf_employee,
                    pf_employer=pf_employer,
                    esic_employee=esic_employee,
                    esic_employer=esic_employer,
                    net_wage=net_wage,
                )
                self.db.add(entry)

            payslip_data.append({
                "employee_id": emp.id,
                "basic_wage": basic_wage,
                "gross_wage": gross_wage,
                "pf_employee": pf_employee,
                "pf_employer": pf_employer,
                "esic_employee": esic_employee,
                "esic_employer": esic_employer,
                "net_wage": net_wage,
            })

        await self.db.flush()

        count_result = await self.db.execute(
            select(func.count()).select_from(
                select(PayslipEntry).where(
                    PayslipEntry.payroll_month_id == pm.id
                ).subquery()
            )
        )
        total_employees = count_result.scalar() or 0

        totals_result = await self.db.execute(
            select(
                func.coalesce(func.sum(PayslipEntry.gross_wage), 0),
                func.coalesce(func.sum(PayslipEntry.pf_employee + PayslipEntry.esic_employee + PayslipEntry.other_deductions), 0),
                func.coalesce(func.sum(PayslipEntry.net_wage), 0),
                func.coalesce(func.sum(PayslipEntry.pf_employee + PayslipEntry.pf_employer), 0),
                func.coalesce(func.sum(PayslipEntry.esic_employee + PayslipEntry.esic_employer), 0),
            ).where(PayslipEntry.payroll_month_id == pm.id)
        )
        row = totals_result.one()
        total_gross = float(row[0] or 0)
        total_deductions = float(row[1] or 0)
        total_net = float(row[2] or 0)
        total_pf = float(row[3] or 0)
        total_esic = float(row[4] or 0)

        pm.total_employees = total_employees
        pm.total_gross = total_gross
        pm.total_deductions = total_deductions
        pm.total_net = total_net
        pm.total_pf = total_pf
        pm.total_esic = total_esic
        if pm.status == "draft":
            pm.status = "processing"
        pm.processed_by = processor_id
        await self.db.flush()

        await self._audit(
            action="process_payroll",
            entity="PayrollMonth",
            entity_id=pm.id,
            details=f"Processed payroll {month}/{year} for mill {mill_id}: {total_employees} employees, net ₹{total_net}",
        )

        return {
            "id": pm.id,
            "month": month,
            "year": year,
            "total_employees": total_employees,
            "total_gross": total_gross,
            "total_deductions": total_deductions,
            "total_net": total_net,
            "total_pf": total_pf,
            "total_esic": total_esic,
            "status": pm.status,
        }

    async def approve_payroll(
        self,
        payroll_month_id: str,
        *,
        approver_id: str,
        approver_role: str,
    ) -> dict:
        pm = await self.get_or_404(PayrollMonth, payroll_month_id)
        if pm.status != "processing":
            raise SpinFlowException.bad_request("Payroll must be in processing status to approve")
        if pm.processed_by == approver_id:
            raise SpinFlowException.forbidden("Cannot approve — you processed this payroll")
        pm.status = "approved"
        pm.approved_by = approver_id
        await self.db.flush()

        await self._audit(
            action="approve_payroll",
            entity="PayrollMonth",
            entity_id=pm.id,
            details=f"Payroll {pm.month}/{pm.year} approved by {approver_id}",
        )

        return {"id": pm.id, "status": pm.status, "total_net": pm.total_net}

    async def mark_paid(
        self,
        payroll_month_id: str,
        *,
        user_id: str,
    ) -> dict:
        pm = await self.get_or_404(PayrollMonth, payroll_month_id)
        if pm.status != "approved":
            raise SpinFlowException.bad_request("Payroll must be approved before marking paid")
        pm.status = "paid"
        pm.paid_at = datetime.now(timezone.utc)
        await self.db.flush()

        await self.db.execute(
            PayslipEntry.__table__.update().where(
                PayslipEntry.payroll_month_id == pm.id
            ).values(
                status="paid",
                paid_at=datetime.now(timezone.utc),
            )
        )
        await self.db.flush()

        return {"paid_count": pm.total_employees, "total_net": pm.total_net}

    async def get_payslips(
        self,
        payroll_month_id: str,
        department: Optional[str] = None,
    ) -> List[dict]:
        stmt = (
            select(
                PayslipEntry,
                Employee.name,
                Employee.code,
                Employee.department,
            )
            .join(Employee, PayslipEntry.employee_id == Employee.id)
            .where(PayslipEntry.payroll_month_id == payroll_month_id)
        )
        if department:
            stmt = stmt.where(Employee.department == department)
        result = await self.db.execute(stmt)
        rows = []
        for entry, emp_name, emp_code, dept in result.all():
            d = {c.name: getattr(entry, c.name) for c in entry.__table__.columns}
            d["employee_name"] = emp_name
            d["employee_code"] = emp_code
            d["department"] = dept
            rows.append(d)
        return rows

    async def get_employee_payslip(
        self,
        employee_id: str,
        month: int,
        year: int,
    ) -> dict:
        result = await self.db.execute(
            select(PayslipEntry).where(
                and_(
                    PayslipEntry.employee_id == employee_id,
                    PayslipEntry.month == month,
                    PayslipEntry.year == year,
                )
            )
        )
        entry = result.scalar_one_or_none()
        if not entry:
            raise SpinFlowException.not_found("PayslipEntry")
        emp_result = await self.db.execute(
            select(Employee).where(Employee.id == employee_id)
        )
        emp = emp_result.scalar_one_or_none()
        d = {c.name: getattr(entry, c.name) for c in entry.__table__.columns}
        d["employee_name"] = emp.name if emp else None
        d["employee_code"] = emp.code if emp else None
        d["department"] = emp.department if emp else None
        return d

    async def payroll_summary(self, mill_id: str, year: int) -> List[dict]:
        result = await self.db.execute(
            select(PayrollMonth)
            .where(
                and_(
                    PayrollMonth.mill_id == mill_id,
                    PayrollMonth.year == year,
                )
            )
            .order_by(PayrollMonth.month)
        )
        months = result.scalars().all()
        return [
            {
                "payroll_month_id": m.id,
                "month": m.month,
                "year": m.year,
                "total_employees": m.total_employees,
                "total_gross": float(m.total_gross or 0),
                "total_net": float(m.total_net or 0),
                "total_pf": float(m.total_pf or 0),
                "total_esic": float(m.total_esic or 0),
                "status": m.status,
            }
            for m in months
        ]
