from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, delete
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone

from app.db.session import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.ui_config import ColumnConfig, ColumnDropdownOption

router = APIRouter()


class ColumnConfigSchema(BaseModel):
    key: str
    label: str
    type: str = "text"
    is_visible: bool = True
    is_required: bool = False
    display_order: int = 0
    group_name: Optional[str] = None
    placeholder: Optional[str] = None
    help_text: Optional[str] = None
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    default_value: Optional[str] = None
    is_searchable: bool = True
    is_sortable: bool = True
    is_exportable: bool = True
    is_importable: bool = True
    dropdown_options: Optional[List[dict]] = None


class TableConfigResponse(BaseModel):
    table: str
    mill_id: str
    columns: List[ColumnConfigSchema]


class ColumnConfigUpdateRequest(BaseModel):
    columns: List[ColumnConfigSchema]


class DropdownOptionSchema(BaseModel):
    value: str
    label: str
    order: int = 0


class DropdownOptionsUpdateRequest(BaseModel):
    mill_id: str
    table_name: str
    column_key: str
    options: List[DropdownOptionSchema]


DEFAULT_CONFIGS: dict = {}


def _make_default(
    key: str,
    label: str,
    type: str = "text",
    is_required: bool = False,
    group_name: Optional[str] = None,
    placeholder: Optional[str] = None,
    help_text: Optional[str] = None,
    is_visible: bool = True,
    display_order: int = 0,
    min_value: Optional[float] = None,
    max_value: Optional[float] = None,
    default_value: Optional[str] = None,
    is_searchable: bool = True,
    is_sortable: bool = True,
    is_exportable: bool = True,
    is_importable: bool = True,
) -> ColumnConfigSchema:
    return ColumnConfigSchema(
        key=key,
        label=label,
        type=type,
        is_visible=is_visible,
        is_required=is_required,
        display_order=display_order,
        group_name=group_name,
        placeholder=placeholder,
        help_text=help_text,
        min_value=min_value,
        max_value=max_value,
        default_value=default_value,
        is_searchable=is_searchable,
        is_sortable=is_sortable,
        is_exportable=is_exportable,
        is_importable=is_importable,
    )


DEFAULT_COLUMNS: dict[str, list[ColumnConfigSchema]] = {
    "hr_employees": [
        _make_default("sl_no", "Sl No", "number", display_order=1, group_name="Personal"),
        _make_default("employee_id", "Emp ID", "text", is_required=True, display_order=2, group_name="Personal"),
        _make_default("name", "Full Name", "text", is_required=True, display_order=3, group_name="Personal"),
        _make_default("gen", "Gender (Full)", "text", display_order=4, group_name="Personal"),
        _make_default("gender", "Gender", "dropdown", display_order=5, group_name="Personal"),
        _make_default("grade", "Grade", "number", display_order=6, group_name="Personal"),
        _make_default("designation", "Designation", "text", display_order=7, group_name="Job"),
        _make_default("section", "Section", "text", display_order=8, group_name="Job"),
        _make_default("department", "Department", "dropdown", is_required=True, display_order=9, group_name="Job"),
        _make_default("joining_date", "Joining Date", "date", display_order=10, group_name="Job"),
        _make_default("dob", "DOB", "date", display_order=11, group_name="Personal"),
        _make_default("age", "Age", "number", display_order=12, group_name="Personal"),
        _make_default("phone", "Phone", "phone", display_order=13, group_name="Personal"),
        _make_default("bank_account_no", "Bank A/C No", "text", display_order=14, group_name="Personal"),
        _make_default("basic", "Basic", "number", display_order=15, group_name="Salary"),
        _make_default("house_rent", "House Rent", "number", display_order=16, group_name="Salary"),
        _make_default("medical", "Medical", "number", display_order=17, group_name="Salary"),
        _make_default("conveyance", "Conveyance", "number", display_order=18, group_name="Salary"),
        _make_default("food_allowance", "Food Allow", "number", display_order=19, group_name="Salary"),
        _make_default("wages", "Wages", "number", display_order=20, group_name="Salary"),
        _make_default("increment", "Increment", "number", display_order=21, group_name="Salary"),
        _make_default("total_salary", "Total Salary", "number", display_order=22, group_name="Salary"),
        _make_default("mobile_bill", "Mobile Bill", "number", display_order=23, group_name="Salary"),
        _make_default("shift_benefit", "Shift Benefit", "number", display_order=24, group_name="Salary"),
        _make_default("days_of_month", "Days/Month", "number", display_order=25, group_name="Salary", default_value="30"),
        _make_default("is_active", "Status", "text", display_order=26, group_name="Personal"),
    ],
    "hr_attendance": [
        _make_default("date", "Date", "date", is_required=True, display_order=1),
        _make_default("employee", "Employee", "text", is_required=True, display_order=2),
        _make_default("department", "Department", "dropdown", display_order=3),
        _make_default("shift", "Shift", "dropdown", display_order=4),
        _make_default("status", "Status", "dropdown", display_order=5),
        _make_default("check_in", "Check In", "text", display_order=6),
        _make_default("check_out", "Check Out", "text", display_order=7),
    ],
    "hr_leaves": [
        _make_default("employee", "Employee", "text", is_required=True, display_order=1),
        _make_default("department", "Department", "dropdown", display_order=2),
        _make_default("from_date", "From", "date", is_required=True, display_order=3),
        _make_default("to_date", "To", "date", is_required=True, display_order=4),
        _make_default("type", "Type", "dropdown", is_required=True, display_order=5),
        _make_default("reason", "Reason", "text", display_order=6),
        _make_default("status", "Status", "dropdown", display_order=7),
    ],
    "hr_payroll": [
        _make_default("employee_id", "Emp ID", "text", display_order=1),
        _make_default("name", "Name", "text", display_order=2),
        _make_default("basic", "Basic", "number", display_order=3, group_name="Salary"),
        _make_default("payable_days", "Payable Days", "number", display_order=4, group_name="Salary"),
        _make_default("payable_salary", "Payable Salary", "number", display_order=5, group_name="Salary"),
        _make_default("ot_hours", "OT Hours", "number", display_order=6, group_name="Salary"),
        _make_default("ot_amount", "OT Amount", "number", display_order=7, group_name="Salary"),
        _make_default("attendance_bonus", "Att. Bonus", "number", display_order=8, group_name="Salary"),
        _make_default("arrear_others", "Arrear", "number", display_order=9, group_name="Salary"),
        _make_default("shift_amount", "Shift Amt", "number", display_order=10, group_name="Salary"),
        _make_default("roster_amount", "Roster Amt", "number", display_order=11, group_name="Salary"),
        _make_default("absent_deduction", "Absent Ded.", "number", display_order=12, group_name="Deductions"),
        _make_default("advance_deduction", "Adv. Ded.", "number", display_order=13, group_name="Deductions"),
        _make_default("tax_deduction", "Tax Ded.", "number", display_order=14, group_name="Deductions"),
        _make_default("net_payable", "Net Payable", "number", display_order=15, group_name="Summary"),
    ],
    "production_entries": [
        _make_default("date", "Date", "date", is_required=True, display_order=1),
        _make_default("shift", "Shift", "dropdown", is_required=True, display_order=2),
        _make_default("machine_code", "Machine", "dropdown", is_required=True, display_order=3),
        _make_default("department", "Department", "dropdown", is_required=True, display_order=4),
        _make_default("operator", "Operator", "text", display_order=5),
        _make_default("count", "Count/Yarn", "dropdown", display_order=6),
        _make_default("produced_kg", "Produced (kg)", "number", display_order=7),
        _make_default("waste_kg", "Waste (kg)", "number", display_order=8),
        _make_default("stoppage_mins", "Stoppage min", "number", display_order=9),
        _make_default("stoppage_reason", "Stoppage Reason", "text", display_order=10),
        _make_default("machine_status", "Status", "dropdown", display_order=11),
    ],
    "production_downtime": [
        _make_default("machine_code", "Machine", "text", display_order=1),
        _make_default("reason", "Reason", "text", display_order=2),
        _make_default("started_at", "Started", "date", display_order=3),
        _make_default("duration_min", "Duration", "number", display_order=4),
        _make_default("resolved", "Resolved", "boolean", display_order=5),
    ],
    "quality_tests": [
        _make_default("date", "Date", "date", is_required=True, display_order=1),
        _make_default("type", "Type", "dropdown", is_required=True, display_order=2),
        _make_default("lot_id", "Lot ID", "text", display_order=3),
        _make_default("machine_code", "Machine", "dropdown", display_order=4),
        _make_default("sample_ref", "Sample Ref", "text", display_order=5),
        _make_default("result", "Result", "number", display_order=6),
        _make_default("unit", "Unit", "text", display_order=7),
        _make_default("standard", "Standard", "number", display_order=8),
        _make_default("status", "Status", "dropdown", display_order=9),
        _make_default("tested_by", "Tested By", "text", display_order=10),
    ],
    "quality_approvals": [
        _make_default("lot_no", "Lot No", "text", display_order=1),
        _make_default("department", "Department", "dropdown", display_order=2),
        _make_default("produced_kg", "Produced (kg)", "number", display_order=3),
        _make_default("csp_result", "CSP", "number", display_order=4),
        _make_default("count_result", "Count", "number", display_order=5),
        _make_default("moisture_result", "Moisture", "number", display_order=6),
        _make_default("strength_result", "Strength", "number", display_order=7),
        _make_default("status", "Status", "dropdown", display_order=8),
    ],
    "inventory_lots": [
        _make_default("lot_no", "Lot No", "text", display_order=1),
        _make_default("type", "Type", "dropdown", display_order=2),
        _make_default("department", "Department", "dropdown", display_order=3),
        _make_default("quantity", "Quantity", "number", display_order=4),
        _make_default("unit", "Unit", "text", display_order=5),
        _make_default("location", "Location", "text", display_order=6),
        _make_default("grade", "Grade", "text", display_order=7),
        _make_default("produced_date", "Produced Date", "date", display_order=8),
        _make_default("age", "Age (d)", "number", display_order=9),
        _make_default("status", "Status", "dropdown", display_order=10),
    ],
    "inventory_warehouses": [
        _make_default("code", "Code", "text", display_order=1),
        _make_default("name", "Name", "text", display_order=2),
        _make_default("location", "Location", "text", display_order=3),
        _make_default("capacity_bags", "Capacity (bags)", "number", display_order=4),
        _make_default("is_active", "Status", "boolean", display_order=5),
    ],
    "dispatch_trips": [
        _make_default("trip_no", "Trip No", "text", display_order=1),
        _make_default("date", "Date", "date", is_required=True, display_order=2),
        _make_default("vehicle_no", "Vehicle", "text", display_order=3),
        _make_default("driver_name", "Driver", "text", display_order=4),
        _make_default("customer", "Customer", "text", display_order=5),
        _make_default("lot_no", "Lot", "text", display_order=6),
        _make_default("planned_weight_kg", "Planned (kg)", "number", display_order=7),
        _make_default("loaded_weight_kg", "Loaded (kg)", "number", display_order=8),
        _make_default("delivered_weight_kg", "Delivered (kg)", "number", display_order=9),
        _make_default("status", "Status", "dropdown", display_order=10),
    ],
    "dispatch_sales_orders": [
        _make_default("so_no", "Order No", "text", display_order=1),
        _make_default("customer", "Customer", "text", display_order=2),
        _make_default("order_date", "Date", "date", display_order=3),
        _make_default("delivery_date", "Delivery Date", "date", display_order=4),
        _make_default("yarn_count", "Count", "text", display_order=5),
        _make_default("total_bags", "Bags", "number", display_order=6),
        _make_default("total_weight_kg", "Qty (kg)", "number", display_order=7),
        _make_default("total_value", "Value", "number", display_order=8),
        _make_default("status", "Status", "dropdown", display_order=9),
    ],
    "stores_spares": [
        _make_default("code", "Code", "text", display_order=1),
        _make_default("name", "Name", "text", display_order=2),
        _make_default("category", "Category", "dropdown", display_order=3),
        _make_default("stock", "Stock", "number", display_order=4),
        _make_default("min_stock", "Min Stock", "number", display_order=5),
        _make_default("unit", "Unit", "text", display_order=6),
        _make_default("location", "Location", "text", display_order=7),
        _make_default("vendor", "Vendor", "text", display_order=8),
        _make_default("is_active", "Status", "boolean", display_order=9),
    ],
    "stores_issues": [
        _make_default("date", "Date", "date", is_required=True, display_order=1),
        _make_default("item_code", "Item Code", "text", display_order=2),
        _make_default("item_name", "Item Name", "text", display_order=3),
        _make_default("quantity", "Quantity", "number", display_order=4),
        _make_default("issued_to", "Issued To", "text", display_order=5),
        _make_default("department", "Department", "dropdown", display_order=6),
        _make_default("purpose", "Purpose", "text", display_order=7),
        _make_default("issued_by", "Issued By", "text", display_order=8),
    ],
    "maintenance_tasks": [
        _make_default("date", "Date", "date", is_required=True, display_order=1),
        _make_default("type", "Type", "dropdown", display_order=2),
        _make_default("machine_code", "Machine", "dropdown", display_order=3),
        _make_default("department", "Department", "dropdown", display_order=4),
        _make_default("description", "Description", "text", display_order=5),
        _make_default("technician", "Technician", "text", display_order=6),
        _make_default("status", "Status", "dropdown", display_order=7),
        _make_default("spare_used", "Spare Used", "text", display_order=8),
        _make_default("downtime_min", "Downtime (min)", "number", display_order=9),
    ],
    "maintenance_schedules": [
        _make_default("machine_code", "Machine", "text", display_order=1),
        _make_default("type", "Type", "dropdown", display_order=2),
        _make_default("frequency_days", "Frequency (days)", "number", display_order=3),
        _make_default("last_done", "Last Done", "date", display_order=4),
        _make_default("next_due", "Next Due", "date", display_order=5),
        _make_default("description", "Description", "text", display_order=6),
        _make_default("is_active", "Active", "boolean", display_order=7),
    ],
    "accounts_invoices": [
        _make_default("invoice_no", "Invoice No", "text", display_order=1),
        _make_default("date", "Date", "date", display_order=2),
        _make_default("customer", "Customer", "text", display_order=3),
        _make_default("type", "Type", "dropdown", display_order=4),
        _make_default("amount", "Amount", "number", display_order=5),
        _make_default("gst", "GST", "number", display_order=6),
        _make_default("total", "Total", "number", display_order=7),
        _make_default("status", "Status", "dropdown", display_order=8),
    ],
    "accounts_gst": [
        _make_default("month", "Month", "number", display_order=1),
        _make_default("year", "Year", "number", display_order=2),
        _make_default("output_cgst", "Output CGST", "number", display_order=3),
        _make_default("output_sgst", "Output SGST", "number", display_order=4),
        _make_default("output_igst", "Output IGST", "number", display_order=5),
        _make_default("input_total", "Input GST", "number", display_order=6),
        _make_default("net_payable", "Net Payable", "number", display_order=7),
    ],
    "masters_departments": [
        _make_default("code", "Code", "text", is_required=True, display_order=1),
        _make_default("name", "Name", "text", is_required=True, display_order=2),
        _make_default("department_type", "Type", "dropdown", display_order=3),
        _make_default("is_active", "Active", "boolean", display_order=4),
    ],
    "masters_machines": [
        _make_default("code", "Code", "text", is_required=True, display_order=1),
        _make_default("name", "Name", "text", display_order=2),
        _make_default("machine_type", "Type", "text", display_order=3),
        _make_default("department", "Department", "dropdown", is_required=True, display_order=4),
        _make_default("target_kg", "Target (kg)", "number", display_order=5),
        _make_default("spindles", "Spindles", "number", display_order=6),
        _make_default("current_status", "Status", "text", display_order=7),
        _make_default("is_active", "Active", "boolean", display_order=8),
    ],
    "masters_customers": [
        _make_default("code", "Code", "text", is_required=True, display_order=1),
        _make_default("name", "Name", "text", is_required=True, display_order=2),
        _make_default("gstin", "GSTIN", "text", display_order=3),
        _make_default("city", "City", "text", display_order=4),
        _make_default("phone", "Phone", "phone", display_order=5),
        _make_default("credit_limit", "Credit Limit", "number", display_order=6),
        _make_default("is_active", "Active", "boolean", display_order=7),
    ],
    "masters_vehicles": [
        _make_default("vehicle_no", "Vehicle No", "text", is_required=True, display_order=1),
        _make_default("vehicle_type", "Type", "dropdown", display_order=2),
        _make_default("capacity_kg", "Capacity (kg)", "number", display_order=3),
        _make_default("driver_name", "Driver", "text", display_order=4),
        _make_default("driver_phone", "Driver Phone", "phone", display_order=5),
        _make_default("is_active", "Active", "boolean", display_order=6),
    ],
    "masters_shifts": [
        _make_default("code", "Code", "text", is_required=True, display_order=1),
        _make_default("name", "Name", "text", display_order=2),
        _make_default("start_time", "Start Time", "text", display_order=3),
        _make_default("end_time", "End Time", "text", display_order=4),
    ],
    "masters_yarn_counts": [
        _make_default("count", "Count", "text", is_required=True, display_order=1),
        _make_default("count_value", "Value", "number", display_order=2),
        _make_default("blend", "Blend", "text", display_order=3),
        _make_default("standard_csp", "Std CSP", "number", display_order=4),
        _make_default("twist_per_meter", "Twist/m", "number", display_order=5),
        _make_default("is_active", "Active", "boolean", display_order=6),
    ],
}

ALL_TABLES = list(DEFAULT_COLUMNS.keys())


def _get_default_columns(table_name: str) -> list[ColumnConfigSchema]:
    return DEFAULT_COLUMNS.get(table_name, [
        _make_default("id", "ID", "text", display_order=1),
    ])


def _build_column_response(col_defs: list[dict], dropdown_map: dict) -> list[ColumnConfigSchema]:
    result = []
    for c in col_defs:
        opts = dropdown_map.get(c.get("key", ""))
        result.append(ColumnConfigSchema(
            key=c.get("key", ""),
            label=c.get("label", ""),
            type=c.get("type", "text"),
            is_visible=c.get("is_visible", True),
            is_required=c.get("is_required", False),
            display_order=c.get("display_order", 0),
            group_name=c.get("group_name"),
            placeholder=c.get("placeholder"),
            help_text=c.get("help_text"),
            min_value=c.get("min_value"),
            max_value=c.get("max_value"),
            default_value=c.get("default_value"),
            is_searchable=c.get("is_searchable", True),
            is_sortable=c.get("is_sortable", True),
            is_exportable=c.get("is_exportable", True),
            is_importable=c.get("is_importable", True),
            dropdown_options=opts,
        ))
    return result


@router.get("/ui-config/columns", response_model=TableConfigResponse)
async def get_column_config(
    table: str = Query(..., description="Table name e.g. hr_employees"),
    mill_id: Optional[str] = Query(None, description="Mill ID (super_admin only)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not table or not table.strip():
        raise HTTPException(
            status_code=400,
            detail="table parameter is required and cannot be empty"
        )
    role_name = current_user.role_rel.code if current_user.role_rel else ""
    effective_mill_id = mill_id
    if role_name != "SUPER_ADMIN":
        effective_mill_id = current_user.mill_id
    if not effective_mill_id:
        effective_mill_id = "default"

    result = await db.execute(
        select(ColumnConfig).where(
            ColumnConfig.mill_id == effective_mill_id,
            ColumnConfig.table_key == table,
        ).order_by(ColumnConfig.updated_at.desc())
    )
    config = result.scalars().first()

    defaults = _get_default_columns(table)

    if not config:
        return TableConfigResponse(
            table=table,
            mill_id=effective_mill_id,
            columns=defaults,
        )

    import json
    try:
        parsed = json.loads(config.columns)
    except (json.JSONDecodeError, TypeError):
        parsed = []

    # Build dropdown options map
    do_result = await db.execute(
        select(ColumnDropdownOption).where(
            ColumnDropdownOption.mill_id == effective_mill_id,
            ColumnDropdownOption.table_name == table,
            ColumnDropdownOption.is_active == True,
        ).order_by(ColumnDropdownOption.display_order)
    )
    dropdown_rows = do_result.scalars().all()
    dropdown_map: dict = {}
    for d in dropdown_rows:
        if d.column_key not in dropdown_map:
            dropdown_map[d.column_key] = []
        dropdown_map[d.column_key].append({
            "value": d.option_value,
            "label": d.option_label,
        })

    columns = _build_column_response(parsed, dropdown_map)

    return TableConfigResponse(
        table=table,
        mill_id=effective_mill_id,
        columns=columns,
    )


@router.get("/ui-config/columns/all", response_model=dict)
async def get_all_column_configs(
    mill_id: str = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    role_name = current_user.role_rel.code if current_user.role_rel else ""
    if role_name != "SUPER_ADMIN":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="SUPER_ADMIN only")

    result = {}
    for table in ALL_TABLES:
        config_result = await db.execute(
            select(ColumnConfig).where(
                ColumnConfig.mill_id == mill_id,
                ColumnConfig.table_key == table,
            ).order_by(ColumnConfig.updated_at.desc())
        )
        config = config_result.scalars().first()

        defaults = _get_default_columns(table)

        if not config:
            result[table] = [d.model_dump() for d in defaults]
        else:
            import json
            try:
                parsed = json.loads(config.columns)
                result[table] = _build_column_response(parsed, {})
            except (json.JSONDecodeError, TypeError):
                result[table] = [d.model_dump() for d in defaults]

    return {
        "mill_id": mill_id,
        "tables": result,
    }


@router.put("/ui-config/columns", response_model=TableConfigResponse)
async def update_column_config(
    req: ColumnConfigUpdateRequest,
    table: str = Query(...),
    mill_id: str = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    role_name = current_user.role_rel.code if current_user.role_rel else ""
    if role_name not in ("SUPER_ADMIN",):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="SUPER_ADMIN only")

    result = await db.execute(
        select(ColumnConfig).where(
            ColumnConfig.mill_id == mill_id,
            ColumnConfig.table_key == table,
        ).order_by(ColumnConfig.updated_at.desc())
    )
    config = result.scalars().first()

    import json
    col_dicts = []
    for c in req.columns:
        d = c.model_dump()
        d.pop("dropdown_options", None)
        col_dicts.append(d)

    serialized = json.dumps(col_dicts)

    if config:
        config.columns = serialized
        config.updated_by = current_user.name
    else:
        config = ColumnConfig(
            mill_id=mill_id,
            module=table.split("_")[0] if "_" in table else table,
            table_key=table,
            columns=serialized,
            updated_by=current_user.name,
        )
        db.add(config)
    await db.flush()

    defaults = _get_default_columns(table)
    if config:
        try:
            parsed = json.loads(config.columns)
            columns = _build_column_response(parsed, {})
        except (json.JSONDecodeError, TypeError):
            columns = defaults
    else:
        columns = defaults

    return TableConfigResponse(
        table=table,
        mill_id=mill_id,
        columns=columns,
    )


@router.get("/ui-config/dropdown-options", response_model=dict)
async def get_dropdown_options(
    table: str = Query(...),
    column: str = Query(...),
    mill_id: str = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ColumnDropdownOption).where(
            ColumnDropdownOption.mill_id == mill_id,
            ColumnDropdownOption.table_name == table,
            ColumnDropdownOption.column_key == column,
            ColumnDropdownOption.is_active == True,
        ).order_by(ColumnDropdownOption.display_order)
    )
    options = result.scalars().all()
    return {
        "mill_id": mill_id,
        "table_name": table,
        "column_key": column,
        "options": [
            {"value": o.option_value, "label": o.option_label, "order": o.display_order}
            for o in options
        ],
    }


@router.put("/ui-config/dropdown-options", response_model=dict)
async def update_dropdown_options(
    req: DropdownOptionsUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    role_name = current_user.role_rel.code if current_user.role_rel else ""
    if role_name not in ("SUPER_ADMIN",):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="SUPER_ADMIN only")

    await db.execute(
        delete(ColumnDropdownOption).where(
            ColumnDropdownOption.mill_id == req.mill_id,
            ColumnDropdownOption.table_name == req.table_name,
            ColumnDropdownOption.column_key == req.column_key,
        )
    )

    for opt in req.options:
        new_opt = ColumnDropdownOption(
            mill_id=req.mill_id,
            table_name=req.table_name,
            column_key=req.column_key,
            option_value=opt.value,
            option_label=opt.label,
            display_order=opt.order,
            is_active=True,
        )
        db.add(new_opt)

    await db.flush()

    return {"message": "Dropdown options updated", "count": len(req.options)}


@router.get("/ui-config/tables", response_model=list)
async def list_available_tables():
    return [
        {"key": t, "label": t.replace("_", " ").title()}
        for t in ALL_TABLES
    ]
