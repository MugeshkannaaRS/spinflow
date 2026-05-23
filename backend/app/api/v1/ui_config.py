from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone

from app.db.session import get_db
from app.core.deps import get_current_user, require_module
from app.models.user import User
from app.models.ui_config import ColumnConfig

router = APIRouter()


class ColumnDef(BaseModel):
    key: str
    label: str
    visible: bool = True
    order: int = 0


class ColumnConfigResponse(BaseModel):
    id: Optional[str] = None
    mill_id: str
    module: str
    table_key: str
    columns: List[ColumnDef]
    updated_at: Optional[datetime] = None


class ColumnConfigUpdate(BaseModel):
    columns: List[ColumnDef]


DEFAULT_CONFIGS: dict[str, dict[str, list[ColumnDef]]] = {}


def _get_default_columns(module: str, table_key: str) -> list[ColumnDef]:
    defaults = {
        ("production", "machines"): [
            ColumnDef(key="code", label="Code", order=1),
            ColumnDef(key="department", label="Department", order=2),
            ColumnDef(key="status", label="Status", order=3),
            ColumnDef(key="targetKg", label="Target (kg)", order=4),
            ColumnDef(key="producedKg", label="Produced (kg)", order=5),
            ColumnDef(key="efficiency", label="Efficiency", order=6),
        ],
        ("production", "shifts"): [
            ColumnDef(key="date", label="Date", order=1),
            ColumnDef(key="shift", label="Shift", order=2),
            ColumnDef(key="machineCode", label="Machine", order=3),
            ColumnDef(key="department", label="Department", order=4),
            ColumnDef(key="operator", label="Operator", order=5),
            ColumnDef(key="count", label="Count", order=6),
            ColumnDef(key="producedKg", label="Produced", order=7),
            ColumnDef(key="wasteKg", label="Waste", order=8),
            ColumnDef(key="status", label="Status", order=9),
        ],
        ("production", "downtime"): [
            ColumnDef(key="machineCode", label="Machine", order=1),
            ColumnDef(key="reason", label="Reason", order=2),
            ColumnDef(key="startedAt", label="Started", order=3),
            ColumnDef(key="durationMin", label="Duration", order=4),
            ColumnDef(key="resolved", label="Resolved", order=5),
        ],
        ("hr", "attendance"): [
            ColumnDef(key="date", label="Date", order=1),
            ColumnDef(key="employee_name", label="Employee", order=2),
            ColumnDef(key="department", label="Department", order=3),
            ColumnDef(key="shift", label="Shift", order=4),
            ColumnDef(key="status", label="Status", order=5),
            ColumnDef(key="check_in", label="Check In", order=6),
            ColumnDef(key="check_out", label="Check Out", order=7),
        ],
        ("hr", "leaves"): [
            ColumnDef(key="employee_name", label="Employee", order=1),
            ColumnDef(key="department", label="Department", order=2),
            ColumnDef(key="from_date", label="From", order=3),
            ColumnDef(key="to_date", label="To", order=4),
            ColumnDef(key="leave_type", label="Type", order=5),
            ColumnDef(key="reason", label="Reason", order=6),
            ColumnDef(key="status", label="Status", order=7),
        ],
        ("hr", "employees"): [
            ColumnDef(key="code", label="Code", order=1),
            ColumnDef(key="name", label="Name", order=2),
            ColumnDef(key="department", label="Department", order=3),
            ColumnDef(key="role", label="Role", order=4),
            ColumnDef(key="phone", label="Phone", order=5),
            ColumnDef(key="is_active", label="Status", order=6),
        ],
        ("purchase", "purchases"): [
            ColumnDef(key="date", label="Date", order=1),
            ColumnDef(key="invoiceNo", label="Invoice", order=2),
            ColumnDef(key="supplier", label="Supplier", order=3),
            ColumnDef(key="bales", label="Bales", order=4),
            ColumnDef(key="netKg", label="Net (kg)", order=5),
            ColumnDef(key="ratePerKg", label="Rate/kg", order=6),
            ColumnDef(key="grade", label="Grade", order=7),
            ColumnDef(key="status", label="Status", order=8),
        ],
        ("purchase", "suppliers"): [
            ColumnDef(key="code", label="Code", order=1),
            ColumnDef(key="name", label="Name", order=2),
            ColumnDef(key="contact", label="Contact", order=3),
            ColumnDef(key="city", label="City", order=4),
            ColumnDef(key="grade", label="Grade", order=5),
            ColumnDef(key="status", label="Status", order=6),
        ],
        ("purchase", "grns"): [
            ColumnDef(key="date", label="Date", order=1),
            ColumnDef(key="grnNo", label="GRN No", order=2),
            ColumnDef(key="supplier", label="Supplier", order=3),
            ColumnDef(key="balesReceived", label="Bales", order=4),
            ColumnDef(key="netKg", label="Net (kg)", order=5),
            ColumnDef(key="status", label="Status", order=6),
        ],
        ("quality", "tests"): [
            ColumnDef(key="date", label="Date", order=1),
            ColumnDef(key="type", label="Type", order=2),
            ColumnDef(key="lotId", label="Lot", order=3),
            ColumnDef(key="result", label="Result", order=4),
            ColumnDef(key="standard", label="Standard", order=5),
            ColumnDef(key="status", label="Status", order=6),
        ],
        ("quality", "approvals"): [
            ColumnDef(key="lotNo", label="Lot No", order=1),
            ColumnDef(key="department", label="Department", order=2),
            ColumnDef(key="cspResult", label="CSP", order=3),
            ColumnDef(key="countResult", label="Count", order=4),
            ColumnDef(key="status", label="Status", order=5),
        ],
        ("quality", "rejections"): [
            ColumnDef(key="date", label="Date", order=1),
            ColumnDef(key="lotId", label="Lot", order=2),
            ColumnDef(key="category", label="Category", order=3),
            ColumnDef(key="quantityKg", label="Qty (kg)", order=4),
            ColumnDef(key="reason", label="Reason", order=5),
        ],
        ("dispatch", "orders"): [
            ColumnDef(key="dispatchNo", label="Dispatch No", order=1),
            ColumnDef(key="date", label="Date", order=2),
            ColumnDef(key="customer", label="Customer", order=3),
            ColumnDef(key="lotNo", label="Lot", order=4),
            ColumnDef(key="quantityKg", label="Qty (kg)", order=5),
            ColumnDef(key="vehicleNo", label="Vehicle", order=6),
            ColumnDef(key="status", label="Status", order=7),
        ],
        ("inventory", "lots"): [
            ColumnDef(key="lotNo", label="Lot No", order=1),
            ColumnDef(key="type", label="Type", order=2),
            ColumnDef(key="department", label="Department", order=3),
            ColumnDef(key="quantity", label="Qty", order=4),
            ColumnDef(key="location", label="Location", order=5),
            ColumnDef(key="grade", label="Grade", order=6),
            ColumnDef(key="age", label="Age", order=7),
            ColumnDef(key="status", label="Status", order=8),
        ],
        ("inventory", "transfers"): [
            ColumnDef(key="date", label="Date", order=1),
            ColumnDef(key="lotNo", label="Lot", order=2),
            ColumnDef(key="fromLocation", label="From", order=3),
            ColumnDef(key="toLocation", label="To", order=4),
            ColumnDef(key="quantity", label="Qty", order=5),
            ColumnDef(key="status", label="Status", order=6),
        ],
        ("accounts", "invoices"): [
            ColumnDef(key="invoiceNo", label="Invoice No", order=1),
            ColumnDef(key="date", label="Date", order=2),
            ColumnDef(key="customer", label="Customer", order=3),
            ColumnDef(key="amount", label="Amount", order=4),
            ColumnDef(key="gst", label="GST", order=5),
            ColumnDef(key="total", label="Total", order=6),
            ColumnDef(key="status", label="Status", order=7),
        ],
        ("accounts", "receivables"): [
            ColumnDef(key="customer", label="Customer", order=1),
            ColumnDef(key="invoiceNo", label="Invoice", order=2),
            ColumnDef(key="amount", label="Amount", order=3),
            ColumnDef(key="outstanding", label="Outstanding", order=4),
            ColumnDef(key="daysOverdue", label="Days", order=5),
            ColumnDef(key="status", label="Status", order=6),
        ],
    }
    return defaults.get((module, table_key), [
        ColumnDef(key="id", label="ID", order=1),
    ])


@router.get("/ui-config/columns", response_model=ColumnConfigResponse)
async def get_column_config(
    mill_id: str,
    module: str,
    table_key: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ColumnConfig).where(
            ColumnConfig.mill_id == mill_id,
            ColumnConfig.module == module,
            ColumnConfig.table_key == table_key,
        )
    )
    config = result.scalar_one_or_none()
    defaults = _get_default_columns(module, table_key)
    if not config:
        return ColumnConfigResponse(
            mill_id=mill_id,
            module=module,
            table_key=table_key,
            columns=defaults,
        )
    import json
    try:
        parsed = json.loads(config.columns)
        cols = [ColumnDef(**c) for c in parsed]
    except (json.JSONDecodeError, TypeError):
        cols = defaults
    return ColumnConfigResponse(
        id=config.id,
        mill_id=config.mill_id,
        module=config.module,
        table_key=config.table_key,
        columns=cols,
        updated_at=config.updated_at,
    )


@router.put("/ui-config/columns", response_model=ColumnConfigResponse)
async def update_column_config(
    mill_id: str,
    module: str,
    table_key: str,
    req: ColumnConfigUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("users", write=True)),
):
    if current_user.role not in ("SUPER_ADMIN", "MILL_OWNER"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only SUPER_ADMIN or MILL_OWNER can configure columns")
    result = await db.execute(
        select(ColumnConfig).where(
            ColumnConfig.mill_id == mill_id,
            ColumnConfig.module == module,
            ColumnConfig.table_key == table_key,
        )
    )
    config = result.scalar_one_or_none()
    import json
    serialized = json.dumps([c.model_dump() for c in req.columns])
    if config:
        config.columns = serialized
        config.updated_by = current_user.name
    else:
        config = ColumnConfig(
            mill_id=mill_id,
            module=module,
            table_key=table_key,
            columns=serialized,
            updated_by=current_user.name,
        )
        db.add(config)
    await db.flush()
    return ColumnConfigResponse(
        id=config.id,
        mill_id=config.mill_id,
        module=config.module,
        table_key=config.table_key,
        columns=req.columns,
        updated_at=config.updated_at,
    )


@router.get("/ui-config/columns/defaults")
async def get_default_columns(
    module: str,
    table_key: str,
):
    return _get_default_columns(module, table_key)
