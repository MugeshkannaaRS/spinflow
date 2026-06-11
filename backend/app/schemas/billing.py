from pydantic import BaseModel, Field
from typing import Optional, List, Dict
from datetime import datetime


class ModulePricingOut(BaseModel):
    module_name: str
    monthly_price: float
    yearly_price: float
    is_included: bool


class SubscriptionPlanOut(BaseModel):
    id: str
    code: str
    name: str
    description: Optional[str] = None
    monthly_price: float
    yearly_price: float
    included_mills: int
    included_users: int
    included_machines: int = 50
    additional_mill_cost: float
    additional_user_cost: float
    additional_employee_cost: float
    is_active: bool
    sort_order: int
    module_prices: List[ModulePricingOut]

    class Config:
        from_attributes = True


class PlanCreate(BaseModel):
    code: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    monthly_price: float = 0
    yearly_price: float = 0
    included_mills: int = 1
    included_users: int = 25
    included_machines: int = 50
    additional_mill_cost: float = 0
    additional_user_cost: float = 0
    additional_employee_cost: float = 0
    sort_order: int = 0
    module_prices: Optional[List[Dict]] = None


class PlanUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    monthly_price: Optional[float] = None
    yearly_price: Optional[float] = None
    included_mills: Optional[int] = None
    included_users: Optional[int] = None
    included_machines: Optional[int] = None
    additional_mill_cost: Optional[float] = None
    additional_user_cost: Optional[float] = None
    additional_employee_cost: Optional[float] = None
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None


class CompanyCostOut(BaseModel):
    plan_monthly: float
    plan_yearly: float
    included_modules: List[str]
    addon_modules: List[Dict]
    addon_module_cost_monthly: float
    addon_module_cost_yearly: float
    included_mills: int
    included_users: int
    extra_mills: int
    extra_users: int
    extra_mill_cost_monthly: float
    extra_user_cost_monthly: float
    total_monthly: float
    total_yearly: float
    mill_count: int
    user_count: int


class CompanySubscriptionOut(BaseModel):
    plan_id: str
    plan_code: str
    plan_name: str
    status: str
    billing_cycle: str
    started_at: Optional[str] = None
    expires_at: Optional[str] = None
    mill_count: int
    mill_limit: int
    user_count: int
    user_limit: int
    mills_exceeded: bool
    users_exceeded: bool
    cost: CompanyCostOut


class UpdateSubscriptionRequest(BaseModel):
    plan_id: str
    billing_cycle: Optional[str] = "monthly"
    addon_modules: Optional[Dict[str, bool]] = None
    extra_mills: Optional[int] = 0
    extra_users: Optional[int] = 0
    extra_employees: Optional[int] = 0


class SetCompanyPlanRequest(BaseModel):
    plan_id: str
    billing_cycle: str = "monthly"
    addon_modules: Optional[Dict[str, bool]] = None
    extra_mills: int = 0
    extra_users: int = 0
    extra_employees: int = 0


class InvoiceLineItem(BaseModel):
    description: str
    amount: float
    quantity: int = 1


class InvoiceOut(BaseModel):
    id: str
    invoice_number: str
    amount: float
    currency: str
    status: str
    billing_period_start: Optional[str] = None
    billing_period_end: Optional[str] = None
    paid_at: Optional[str] = None
    transaction_id: Optional[str] = None
    gateway: Optional[str] = None
    line_items: Optional[dict] = None
    created_at: Optional[str] = None

    class Config:
        from_attributes = True


class ChangeRequestOut(BaseModel):
    id: str
    company_id: str
    requested_by: str
    current_plan_id: str
    requested_plan_id: str
    change_type: str
    reason: Optional[str] = None
    status: str
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[str] = None
    review_notes: Optional[str] = None
    created_at: Optional[str] = None

    class Config:
        from_attributes = True


class ChangeRequestCreate(BaseModel):
    requested_plan_id: str
    change_type: str = "upgrade"
    reason: Optional[str] = None


class ChangeRequestReview(BaseModel):
    status: str
    review_notes: Optional[str] = None


class CompanyBillingRow(BaseModel):
    id: str
    name: str
    code: str
    plan: str
    status: str
    mills_count: int
    users_count: int
    enabled_modules: List[str]
    monthly_amount: float
    trial_ends_at: Optional[str] = None
    last_payment_at: Optional[str] = None
    next_billing_at: Optional[str] = None


class StatusUpdateBody(BaseModel):
    status: str


class ModuleToggleBody(BaseModel):
    module: str
    enabled: bool


class BillingSummaryOut(BaseModel):
    mrr: float
    arr: float
    active_subscriptions: int
    overdue_count: int
    trial_count: int
    suspended_count: int
    collection_rate: float
    revenue_growth: float
    total_companies: int
    revenue_trend: List[Dict]


class SubscriptionRowOut(BaseModel):
    company_id: str
    company_name: str
    company_code: str
    plan_name: str
    plan_code: str
    user_count: int
    user_limit: int
    mill_count: int
    mill_limit: int
    modules_enabled: int
    renewal_date: Optional[str] = None
    monthly_amount: float
    status: str
    overdue_status: str


class InvoiceRowOut(BaseModel):
    id: str
    invoice_number: str
    company_name: str
    amount: float
    currency: str
    issue_date: str
    due_date: Optional[str] = None
    status: str
    paid_at: Optional[str] = None


class PaymentRowOut(BaseModel):
    id: str
    company_name: str
    invoice_number: Optional[str] = None
    amount: float
    currency: str
    method: Optional[str] = None
    reference: Optional[str] = None
    paid_date: Optional[str] = None
    status: str


class AnalyticsOut(BaseModel):
    mrr: float
    arr: float
    churn_rate: float
    arpu: float
    ltv: float
    mrr_trend: List[Dict]
    top_customers: List[Dict]
    plan_distribution: List[Dict]


# ── Payment Schemas ──────────────────────────────────────────

class PaymentCreate(BaseModel):
    company_id: str
    amount: float
    method: str = "bank_transfer"
    reference_number: Optional[str] = None
    invoice_id: Optional[str] = None
    notes: Optional[str] = None


class PaymentOut(BaseModel):
    id: str
    company_id: str
    company_name: Optional[str] = None
    invoice_id: Optional[str] = None
    invoice_number: Optional[str] = None
    amount: float
    currency: str
    method: str
    reference_number: Optional[str] = None
    gateway: Optional[str] = None
    status: str
    paid_at: Optional[str] = None
    notes: Optional[str] = None
    created_at: Optional[str] = None


# ── Invoice Detail Schema ──────────────────────────────────

class InvoiceDetailOut(BaseModel):
    id: str
    invoice_number: str
    company_id: str
    company_name: Optional[str] = None
    amount: float
    subtotal: float
    tax_amount: float
    currency: str
    status: str
    invoice_type: str
    billing_period_start: Optional[str] = None
    billing_period_end: Optional[str] = None
    due_date: Optional[str] = None
    paid_at: Optional[str] = None
    transaction_id: Optional[str] = None
    gateway: Optional[str] = None
    line_items: Optional[dict] = None
    notes: Optional[str] = None
    is_auto_generated: bool = False
    created_at: Optional[str] = None

    class Config:
        from_attributes = True


# ── Purchase / Overage Schemas ─────────────────────────────

class PurchaseOverageRequest(BaseModel):
    resource_type: str = Field(..., pattern="^(extra_users|extra_mills|extra_employees)$")
    quantity: int = Field(..., ge=1, le=9999)


class PurchaseOverageResult(BaseModel):
    success: bool
    invoice_id: Optional[str] = None
    invoice_number: Optional[str] = None
    amount: float
    resource_type: str
    quantity: int
    message: str


# ── Auto-Invoice Generation Result ─────────────────────────

class AutoInvoiceResult(BaseModel):
    total: int
    generated: int
    errors: int
    details: List[Dict]


# ── Overdue Workflow Result ────────────────────────────────

class OverdueWorkflowResult(BaseModel):
    processed: int
    reminders: int
    warnings: int
    restricted: int
    suspended: int
    terminated: int


# ── Billing Dashboard (enriched) ──────────────────────────

class BillingDashboardOut(BaseModel):
    mrr: float
    arr: float
    active_subscriptions: int
    trial_companies: int
    overdue_companies: int
    suspended_companies: int
    collection_rate: float
    revenue_growth: float
    new_customers: int
    churn_rate: float
    total_companies: int
    new_customers_this_month: int
    companies_over_limit: int
    revenue_trend: List[Dict]


# ── Subscription Row (employee-enriched) ─────────────────

class SubscriptionRowEnriched(BaseModel):
    company_id: str
    company_name: str
    company_code: str
    plan_name: str
    plan_code: str
    subscription_type: str
    user_count: int
    user_limit: int
    employee_count: int
    employee_limit: int
    mill_count: int
    mill_limit: int
    modules_enabled: int
    modules_list: List[str]
    renewal_date: Optional[str] = None
    monthly_value: float
    status: str
    overdue_status: str
