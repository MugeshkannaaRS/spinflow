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
    is_active: bool
    last_login: Optional[datetime] = None

    class Config:
        from_attributes = True


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


class UserUpdateRequest(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    department: Optional[str] = None
    is_active: Optional[bool] = None
    phone: Optional[str] = None
