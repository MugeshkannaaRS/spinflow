from pydantic import BaseModel, Field, EmailStr, field_validator
from typing import Optional, List
from datetime import datetime
import re


class UserCreate(BaseModel):
    email: EmailStr
    full_name: str
    password: str = Field(..., min_length=8)
    role: str
    department: Optional[str] = None
    mobile: Optional[str] = None
    mill_id: Optional[str] = None

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not re.search(r"\d", v):
            raise ValueError("Password must contain at least one digit")
        if not re.search(r"[!@#$%^&*(),.?\":{}|<>_\-+=\[\]\\';/`~]", v):
            raise ValueError("Password must contain at least one special character")
        return v

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: str) -> str:
        allowed = {
            "SUPER_ADMIN", "MILL_OWNER", "GENERAL_MANAGER",
            "PRODUCTION_MANAGER", "QUALITY_MANAGER", "DISPATCH_MANAGER",
            "STORE_MANAGER", "HR_MANAGER", "ACCOUNTANT",
            "MAINTENANCE_MANAGER", "SUPERVISOR", "MACHINE_OPERATOR",
            "SECURITY_GATE", "AUDITOR",
        }
        if v not in allowed:
            raise ValueError(f"role must be one of: {', '.join(sorted(allowed))}")
        return v


class UserOut(BaseModel):
    id: str
    employee_id: Optional[str] = None
    full_name: Optional[str] = None
    email: Optional[str] = None
    mobile: Optional[str] = None
    role: Optional[str] = None
    department: Optional[str] = None
    is_active: bool = True
    is_verified: bool = False
    last_login: Optional[datetime] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None
    role: Optional[str] = None
    department: Optional[str] = None
    mobile: Optional[str] = None
    is_active: Optional[bool] = None


class UserListResponse(BaseModel):
    total: int
    page: int
    page_size: int
    pages: int
    data: List[UserOut]


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=8)

    @field_validator("new_password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not re.search(r"\d", v):
            raise ValueError("Password must contain at least one digit")
        if not re.search(r"[!@#$%^&*(),.?\":{}|<>_\-+=\[\]\\';/`~]", v):
            raise ValueError("Password must contain at least one special character")
        return v


class UserResetPassword(BaseModel):
    new_password: str = Field(..., min_length=8)
