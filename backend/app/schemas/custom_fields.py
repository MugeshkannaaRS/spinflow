from __future__ import annotations
from pydantic import BaseModel, ConfigDict, field_validator
from typing import Optional, List, Literal
import re


_KEY_RE = re.compile(r'^[a-z0-9_]{1,50}$')


class CustomFieldDefinitionCreate(BaseModel):
    module: str
    table_name: str
    field_key: str
    label: str
    field_type: Literal["text", "number", "select", "boolean", "date"]
    options: Optional[List[str]] = None
    is_required: bool = False
    sort_order: int = 0

    @field_validator("field_key")
    @classmethod
    def validate_field_key(cls, v: str) -> str:
        if not _KEY_RE.match(v):
            raise ValueError("field_key must be lowercase letters, digits and underscores only (max 50 chars)")
        return v


class CustomFieldDefinitionUpdate(BaseModel):
    label: Optional[str] = None
    options: Optional[List[str]] = None
    is_required: Optional[bool] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None


class CustomFieldDefinitionOut(BaseModel):
    id: str
    mill_id: str
    module: str
    table_name: str
    field_key: str
    label: str
    field_type: str
    options: Optional[List[str]] = None
    is_required: bool
    sort_order: int
    is_active: bool

    model_config = ConfigDict(from_attributes=True)
