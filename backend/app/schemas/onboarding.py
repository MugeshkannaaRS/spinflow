from pydantic import BaseModel, Field
from typing import Optional, List


class OnboardingMill(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    code: str = Field(..., min_length=1, max_length=50)
    city: Optional[str] = None
    state: Optional[str] = None


class OnboardingOwner(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=200)
    email: str = Field(..., max_length=200)
    password: str = Field(..., min_length=8)


class OnboardingRequest(BaseModel):
    company_name: str = Field(..., min_length=1, max_length=200)
    company_code: str = Field(..., min_length=1, max_length=50)
    gstin: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    plan_code: str = Field(default="starter", max_length=50)
    max_users: int = Field(default=25, ge=1, le=99999)
    max_employees: int = Field(default=100, ge=1, le=999999)
    mills: List[OnboardingMill] = Field(..., min_length=1)
    owner: OnboardingOwner
    modules: Optional[List[str]] = None


class OnboardingResult(BaseModel):
    company_id: str
    company_code: str
    company_name: str
    mill_ids: List[str]
    owner_id: str
    owner_email: str
    plan_code: str
    modules_enabled: List[str]
