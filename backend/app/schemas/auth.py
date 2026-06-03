from __future__ import annotations
from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime


class LoginRequest(BaseModel):
    email: str = Field(..., max_length=200)
    password: str = Field(..., min_length=1)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class UserResponse(BaseModel):
    id: str
    name: str
    email: str
    role: str
    role_name: str
    department: Optional[str] = None
    mill_id: Optional[str] = None
    mill_name: Optional[str] = None
    company_id: Optional[str] = None
    is_active: bool
    last_login: Optional[datetime] = None
    must_change_password: bool = False
    module_restrictions: Optional[dict] = None

    class Config:
        from_attributes = True


class MillSettingsOut(BaseModel):
    working_hours_per_day: int = 24
    shifts_per_day: int = 3
    production_target_kg: float = 0
    currency: str = "INR"
    timezone: str = "Asia/Kolkata"

    class Config:
        from_attributes = True


class CompanyInfo(BaseModel):
    name: str
    max_users: int
    current_user_count: int = 0
    subscription_plan: Optional[str] = None


class MeResponse(BaseModel):
    user: UserResponse
    allowed_modules: list[str]
    mill_settings: Optional[MillSettingsOut] = None
    company: Optional[CompanyInfo] = None
    column_configs_version: Optional[str] = None


class LoginResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserResponse


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=6)


class ForgotPasswordRequest(BaseModel):
    email: str = Field(..., max_length=200)


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(..., min_length=6)


class VerifyOTPRequest(BaseModel):
    email: str
    otp: str


class UserCreateRequest(BaseModel):
    name: str = Field(..., max_length=200)
    email: str = Field(..., max_length=200)
    password: str = Field(..., min_length=6)
    role: str
    department: Optional[str] = None
    mill_id: Optional[str] = None
    mill_name: Optional[str] = None
    phone: Optional[str] = None
    company_id: Optional[str] = None


class UserUpdateRequest(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    department: Optional[str] = None
    is_active: Optional[bool] = None
    phone: Optional[str] = None
