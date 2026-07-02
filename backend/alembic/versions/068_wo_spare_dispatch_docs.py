"""work-order spare link, for_machine, and dispatch document fields

Adds (all nullable / additive — safe on existing rows):
  - work_order_items.spare_id, .spare_code   (link WO line to a stores Spare)
  - work_orders.for_machine                  (machine the WO is raised for)
  - dispatches: consignee_address, item_specification, material_description,
    grade, unit, pi_do_no, gross_weight_kg, tare_weight_kg, weight_serial,
    gate_pass_no, prepared_by, remarks         (Challan / Gate Pass / Weight Report)

Revision ID: 068_wo_spare_dispatch_docs
Revises: 067_cotton_import_work_order
Create Date: 2026-07-02
"""
from alembic import op
import sqlalchemy as sa


revision = "068_wo_spare_dispatch_docs"
down_revision = "067_cotton_import_work_order"
branch_labels = None
depends_on = None


def _cols(inspector, table):
    try:
        return {c["name"] for c in inspector.get_columns(table)}
    except Exception:
        return set()


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "work_order_items" in tables:
        cols = _cols(inspector, "work_order_items")
        if "spare_id" not in cols:
            op.add_column("work_order_items", sa.Column("spare_id", sa.String(length=36), nullable=True))
        if "spare_code" not in cols:
            op.add_column("work_order_items", sa.Column("spare_code", sa.String(length=50), nullable=True))

    if "work_orders" in tables:
        cols = _cols(inspector, "work_orders")
        if "for_machine" not in cols:
            op.add_column("work_orders", sa.Column("for_machine", sa.String(length=120), nullable=True))

    if "dispatches" in tables:
        cols = _cols(inspector, "dispatches")
        add = [
            ("consignee_address", sa.String(length=400)),
            ("item_specification", sa.String(length=200)),
            ("material_description", sa.String(length=200)),
            ("grade", sa.String(length=20)),
            ("unit", sa.String(length=20)),
            ("pi_do_no", sa.String(length=60)),
            ("gross_weight_kg", sa.Float()),
            ("tare_weight_kg", sa.Float()),
            ("weight_serial", sa.String(length=40)),
            ("gate_pass_no", sa.String(length=60)),
            ("prepared_by", sa.String(length=200)),
            ("remarks", sa.String(length=400)),
        ]
        for name, coltype in add:
            if name not in cols:
                op.add_column("dispatches", sa.Column(name, coltype, nullable=True))


def downgrade() -> None:
    for c in ("spare_id", "spare_code"):
        try: op.drop_column("work_order_items", c)
        except Exception: pass
    try: op.drop_column("work_orders", "for_machine")
    except Exception: pass
    for c in ("consignee_address", "item_specification", "material_description", "grade",
              "unit", "pi_do_no", "gross_weight_kg", "tare_weight_kg", "weight_serial",
              "gate_pass_no", "prepared_by", "remarks"):
        try: op.drop_column("dispatches", c)
        except Exception: pass
