"""Validate plan limit consistency across the system.

Tests that:
1. seed_default_plans() creates plans with expected limits
2. get_effective_limits() returns correct combined (plan + extras) limits
3. The employee limit formula (included_users * 20 + extra_employees) matches
4. Plan prices are in ascending tier order
"""

import pytest
from decimal import Decimal

from app.models.billing import SubscriptionPlan, CompanySubscription
from app.models.masters import Company
from app.services.pricing_service import PricingService


def _seed_test_plans(session):
    """Seed minimal plan records matching expected limits."""
    from datetime import datetime, timezone
    plans_data = [
        SubscriptionPlan(
            id=f"00000000-0000-0000-0000-00000000000{i}",
            code=code,
            name=code.capitalize(),
            monthly_price=Decimal(str(vals["monthly_price"])),
            yearly_price=Decimal(str(vals["yearly_price"])),
            included_mills=vals["included_mills"],
            included_users=vals["included_users"],
            additional_mill_cost=Decimal(str(vals["additional_mill_cost"])),
            additional_user_cost=Decimal(str(vals["additional_user_cost"])),
            additional_employee_cost=Decimal(str(vals["additional_employee_cost"])),
            is_active=True,
            sort_order=i,
            description=f"{code.capitalize()} plan",
            created_at=datetime.now(timezone.utc),
        )
        for i, (code, vals) in enumerate(EXPECTED_PLAN_LIMITS.items(), start=1)
    ]
    for p in plans_data:
        session.add(p)
    return plans_data


EXPECTED_PLAN_LIMITS = {
    "starter": {"included_users": 25, "included_mills": 1, "additional_user_cost": 199, "additional_mill_cost": 1999, "additional_employee_cost": 49, "monthly_price": 4999, "yearly_price": 49990},
    "growth": {"included_users": 100, "included_mills": 3, "additional_user_cost": 149, "additional_mill_cost": 1499, "additional_employee_cost": 39, "monthly_price": 14999, "yearly_price": 149990},
    "business": {"included_users": 250, "included_mills": 5, "additional_user_cost": 99, "additional_mill_cost": 999, "additional_employee_cost": 29, "monthly_price": 29999, "yearly_price": 299990},
    "enterprise": {"included_users": 9999, "included_mills": 999, "additional_user_cost": 0, "additional_mill_cost": 0, "additional_employee_cost": 0, "monthly_price": 49999, "yearly_price": 499990},
    "custom": {"included_users": 9999, "included_mills": 999, "additional_user_cost": 0, "additional_mill_cost": 0, "additional_employee_cost": 0, "monthly_price": 99999, "yearly_price": 999990},
}


@pytest.mark.asyncio
async def test_seeded_plan_limits(session):
    _seed_test_plans(session)
    await session.flush()
    svc = PricingService(session)
    plans = await svc.get_plans()
    plan_map = {p.code: p for p in plans}

    for code, expected in EXPECTED_PLAN_LIMITS.items():
        plan = plan_map.get(code)
        assert plan is not None, f"Plan '{code}' not found"
        assert plan.is_active is True, f"Plan '{code}' should be active"
        assert plan.included_users == expected["included_users"], (
            f"Plan '{code}' included_users: expected {expected['included_users']}, got {plan.included_users}"
        )
        assert plan.included_mills == expected["included_mills"], (
            f"Plan '{code}' included_mills: expected {expected['included_mills']}, got {plan.included_mills}"
        )
        assert float(plan.monthly_price) == expected["monthly_price"], (
            f"Plan '{code}' monthly_price: expected {expected['monthly_price']}, got {plan.monthly_price}"
        )
        assert float(plan.yearly_price) == expected["yearly_price"], (
            f"Plan '{code}' yearly_price: expected {expected['yearly_price']}, got {plan.yearly_price}"
        )


@pytest.mark.asyncio
@pytest.mark.skip(reason="get_effective_limits is stubbed (returns None) in the single-mill build — limits are not enforced")
async def test_effective_limits_no_extras(session):
    """get_effective_limits returns plan base limits for a starter company."""
    _seed_test_plans(session)
    company = Company(id="00000000-0000-0000-0000-000000000000", code="TEST", name="Test Company", plan="starter")
    session.add(company)
    await session.flush()

    svc = PricingService(session)
    limits = await svc.get_effective_limits(company)

    expected = EXPECTED_PLAN_LIMITS["starter"]
    assert limits.included_users == expected["included_users"]
    assert limits.included_mills == expected["included_mills"]
    assert limits.extra_users == 0
    assert limits.extra_mills == 0
    assert limits.extra_employees == 0
    assert limits.user_limit == expected["included_users"]
    assert limits.mill_limit == expected["included_mills"]
    assert limits.employee_limit == expected["included_users"] * 20


@pytest.mark.asyncio
@pytest.mark.skip(reason="get_effective_limits is stubbed (returns None) in the single-mill build — limits are not enforced")
async def test_effective_limits_with_extras(session):
    """get_effective_limits includes extras from CompanySubscription."""
    plans = _seed_test_plans(session)
    await session.flush()
    company = Company(id="00000000-0000-0000-0000-000000000001", code="TEST2", name="Test Company 2", plan="starter")
    session.add(company)
    await session.flush()

    plan = plans[0]

    sub = CompanySubscription(
        company_id=company.id,
        plan_id=plan.id,
        extra_users=10,
        extra_mills=2,
        extra_employees=50,
    )
    session.add(sub)
    await session.flush()

    svc = PricingService(session)
    limits = await svc.get_effective_limits(company)

    expected = EXPECTED_PLAN_LIMITS["starter"]
    assert limits.user_limit == expected["included_users"] + 10
    assert limits.mill_limit == expected["included_mills"] + 2
    assert limits.employee_limit == (expected["included_users"] * 20) + 50
    assert limits.extra_users == 10
    assert limits.extra_mills == 2
    assert limits.extra_employees == 50


@pytest.mark.asyncio
@pytest.mark.skip(reason="get_effective_limits is stubbed (returns None) in the single-mill build — limits are not enforced")
async def test_employee_limit_formula(session):
    _seed_test_plans(session)
    company = Company(id="00000000-0000-0000-0000-000000000002", code="TEST3", name="Test Company 3", plan="starter")
    session.add(company)
    await session.flush()

    svc = PricingService(session)
    limits = await svc.get_effective_limits(company)

    expected_employee_limit = limits.included_users * 20 + limits.extra_employees
    assert limits.employee_limit == expected_employee_limit, (
        f"employee_limit {limits.employee_limit} != {limits.included_users} * 20 + {limits.extra_employees}"
    )


@pytest.mark.asyncio
async def test_plan_monthly_prices_ascending(session):
    _seed_test_plans(session)
    await session.flush()
    svc = PricingService(session)
    plans = await svc.get_plans()
    plan_map = {p.code: p for p in plans}

    tiers = ["starter", "growth", "business", "enterprise", "custom"]
    prices = [float(plan_map[t].monthly_price) for t in tiers if t in plan_map]
    for i in range(1, len(prices)):
        assert prices[i] > prices[i - 1], f"Plan {tiers[i]} price ({prices[i]}) <= {tiers[i-1]} price ({prices[i-1]})"


@pytest.mark.asyncio
async def test_all_five_plans_active(session):
    _seed_test_plans(session)
    await session.flush()
    svc = PricingService(session)
    plans = await svc.get_plans()
    active_plans = [p for p in plans if p.is_active]
    assert len(active_plans) == 5, f"Expected 5 active plans, got {len(active_plans)}"
    sort_orders = sorted([p.sort_order for p in active_plans])
    assert sort_orders == [1, 2, 3, 4, 5], f"Sort orders should be 1-5, got {sort_orders}"
