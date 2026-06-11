"""Fix globally-unique document numbers: lots, sales_orders, stock_transfers, trips

Problem:  Four tables carry globally-unique document numbers that must be scoped
          to their mill:

          lots.lot_no          — UNIQUE global (model inline unique=True)
          sales_orders.so_no   — UNIQUE global (migration 004 inline unique=True)
          stock_transfers.transfer_no — UNIQUE global (migration 004 inline unique=True)
          trips.trip_no        — UNIQUE global (migration 005 inline unique=True)

          All four tables already have mill_id NOT NULL, so no data backfill is
          required — only a constraint swap.

Safety:   Embedded pre-check aborts the transaction if any table has duplicate
          (mill_id, number) combinations — meaning the same document number was
          issued twice within the same mill, which would violate the new composite
          constraint and must be resolved first.

Revision ID: 025
Revises: 024
Create Date: 2026-06-11
"""
from typing import Sequence, Union
from alembic import op


revision: str = "025"
down_revision: Union[str, None] = "024"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Helper: shared DO-block template
_SAFETY_TMPL = """
    DO $$
    DECLARE dup_count INT;
    BEGIN
        SELECT COUNT(*) INTO dup_count
        FROM (
            SELECT {num_col}, mill_id
            FROM {table}
            GROUP BY {num_col}, mill_id
            HAVING COUNT(*) > 1
        ) t;
        IF dup_count > 0 THEN
            RAISE EXCEPTION
                'ABORT migration 025: % duplicate ({num_col}, mill_id) pairs in {table}.',
                dup_count;
        END IF;
    END; $$
"""

_EXIST_TMPL = """
    DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = '{cname}' AND conrelid = '{table}'::regclass
        ) THEN
            ALTER TABLE {table} ADD CONSTRAINT {cname} UNIQUE ({cols});
        END IF;
    END; $$
"""


def upgrade() -> None:
    # ================================================================== #
    #  LOTS — lot_no                                                       #
    # ================================================================== #
    op.execute(_SAFETY_TMPL.format(table="lots", num_col="lot_no"))

    # inline unique=True creates a constraint named lots_lot_no_key
    op.execute("ALTER TABLE lots DROP CONSTRAINT IF EXISTS lots_lot_no_key")
    op.execute("DROP INDEX IF EXISTS ix_lots_lot_no")

    op.execute(_EXIST_TMPL.format(
        table="lots", cname="uq_lots_mill_lot_no", cols="mill_id, lot_no"
    ))
    op.execute("CREATE INDEX IF NOT EXISTS ix_lots_lot_no ON lots (lot_no)")

    # ================================================================== #
    #  SALES ORDERS — so_no                                                #
    # ================================================================== #
    op.execute(_SAFETY_TMPL.format(table="sales_orders", num_col="so_no"))

    op.execute("ALTER TABLE sales_orders DROP CONSTRAINT IF EXISTS sales_orders_so_no_key")
    op.execute("DROP INDEX IF EXISTS ix_sales_orders_so_no")

    op.execute(_EXIST_TMPL.format(
        table="sales_orders", cname="uq_sales_orders_mill_so_no", cols="mill_id, so_no"
    ))
    op.execute("CREATE INDEX IF NOT EXISTS ix_sales_orders_so_no ON sales_orders (so_no)")

    # ================================================================== #
    #  STOCK TRANSFERS — transfer_no                                       #
    # ================================================================== #
    op.execute(_SAFETY_TMPL.format(table="stock_transfers", num_col="transfer_no"))

    op.execute("ALTER TABLE stock_transfers DROP CONSTRAINT IF EXISTS stock_transfers_transfer_no_key")
    op.execute("DROP INDEX IF EXISTS ix_stock_transfers_transfer_no")

    op.execute(_EXIST_TMPL.format(
        table="stock_transfers",
        cname="uq_stock_transfers_mill_transfer_no",
        cols="mill_id, transfer_no",
    ))
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_stock_transfers_transfer_no"
        " ON stock_transfers (transfer_no)"
    )

    # ================================================================== #
    #  TRIPS — trip_no                                                     #
    # ================================================================== #
    op.execute(_SAFETY_TMPL.format(table="trips", num_col="trip_no"))

    op.execute("ALTER TABLE trips DROP CONSTRAINT IF EXISTS trips_trip_no_key")
    op.execute("DROP INDEX IF EXISTS ix_trips_trip_no")

    op.execute(_EXIST_TMPL.format(
        table="trips", cname="uq_trips_mill_trip_no", cols="mill_id, trip_no"
    ))
    op.execute("CREATE INDEX IF NOT EXISTS ix_trips_trip_no ON trips (trip_no)")


def downgrade() -> None:
    # trips
    op.execute("ALTER TABLE trips DROP CONSTRAINT IF EXISTS uq_trips_mill_trip_no")
    op.execute("DROP INDEX IF EXISTS ix_trips_trip_no")
    op.execute("CREATE UNIQUE INDEX ix_trips_trip_no ON trips (trip_no)")

    # stock_transfers
    op.execute("ALTER TABLE stock_transfers DROP CONSTRAINT IF EXISTS uq_stock_transfers_mill_transfer_no")
    op.execute("DROP INDEX IF EXISTS ix_stock_transfers_transfer_no")
    op.execute("CREATE UNIQUE INDEX ix_stock_transfers_transfer_no ON stock_transfers (transfer_no)")

    # sales_orders
    op.execute("ALTER TABLE sales_orders DROP CONSTRAINT IF EXISTS uq_sales_orders_mill_so_no")
    op.execute("DROP INDEX IF EXISTS ix_sales_orders_so_no")
    op.execute("CREATE UNIQUE INDEX ix_sales_orders_so_no ON sales_orders (so_no)")

    # lots
    op.execute("ALTER TABLE lots DROP CONSTRAINT IF EXISTS uq_lots_mill_lot_no")
    op.execute("DROP INDEX IF EXISTS ix_lots_lot_no")
    op.execute("CREATE UNIQUE INDEX ix_lots_lot_no ON lots (lot_no)")
