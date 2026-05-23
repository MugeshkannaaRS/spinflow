from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class StockBalanceOut(BaseModel):
    id: str
    mill_id: str
    lot_id: str
    warehouse_id: str
    fg_state: str
    qty_on_hand: float
    qty_reserved: float
    qty_quarantine: float
    weight_on_hand_kg: float
    weight_reserved_kg: float
    last_move_at: Optional[str] = None
    qty_available: float = 0.0

    class Config:
        from_attributes = True


class StockLedgerOut(BaseModel):
    id: str
    mill_id: str
    lot_id: Optional[str] = None
    warehouse_id: str
    move_type: str
    qty_in: float = 0.0
    qty_out: float = 0.0
    weight_in_kg: float = 0.0
    weight_out_kg: float = 0.0
    ref_doc_type: Optional[str] = None
    ref_doc_id: Optional[str] = None
    lot_no: Optional[str] = None
    yarn_count: Optional[str] = None
    warehouse_code: Optional[str] = None
    user_id: str
    shift_id: Optional[str] = None
    notes: Optional[str] = None
    created_at: Optional[str] = None

    class Config:
        from_attributes = True


class StockSnapshotRow(BaseModel):
    lot_id: str
    lot_no: str
    yarn_count: str = ""
    warehouse_id: str
    warehouse_code: str = ""
    fg_state: str
    qty_on_hand: float
    qty_reserved: float
    qty_available: float
    qty_quarantine: float
    weight_on_hand_kg: float
    last_move_at: Optional[str] = None


class StockTransferCreate(BaseModel):
    mill_id: str
    from_warehouse_id: str
    to_warehouse_id: str
    lot_id: str
    bags_count: int = Field(gt=0)
    weight_kg: float = Field(gt=0)
    notes: Optional[str] = None


class StockTransferOut(BaseModel):
    id: str
    mill_id: str
    transfer_no: str
    from_warehouse_id: str
    to_warehouse_id: str
    status: str
    lot_id: str
    bags_count: int
    weight_kg: float
    notes: Optional[str] = None
    created_by: str
    confirmed_by: Optional[str] = None
    completed_by: Optional[str] = None
    created_at: Optional[str] = None

    class Config:
        from_attributes = True
