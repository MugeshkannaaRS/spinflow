"""Razorpay payment provider implementation."""

import hashlib
import hmac
import json
import logging
from typing import Any, Dict, Optional

import razorpay
from app.core.config import settings
from app.services.payment_provider import (
    CheckoutResult,
    PaymentProvider,
    PaymentVerificationResult,
    SubscriptionResult,
)

logger = logging.getLogger(__name__)


class RazorpayProvider(PaymentProvider):
    """Razorpay implementation of PaymentProvider interface."""

    def __init__(self):
        self._client: Optional[razorpay.Client] = None
        self._key_id = settings.RAZORPAY_KEY_ID or ""
        self._key_secret = settings.RAZORPAY_KEY_SECRET or ""

    def _get_client(self) -> razorpay.Client:
        if self._client is None:
            if not self._key_id or not self._key_secret:
                raise RuntimeError("Razorpay not configured: RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET required")
            self._client = razorpay.Client(auth=(self._key_id, self._key_secret))
        return self._client

    async def create_checkout(
        self,
        amount: float,
        currency: str = "INR",
        description: str = "",
        metadata: Optional[Dict[str, Any]] = None,
        customer_email: Optional[str] = None,
    ) -> CheckoutResult:
        client = self._get_client()
        amount_paisa = int(round(amount * 100))

        order_data = {
            "amount": amount_paisa,
            "currency": currency,
            "receipt": description[:40] if description else "",
            "notes": metadata or {},
        }
        order = client.order.create(data=order_data)
        order_id = order.get("id", "")

        return CheckoutResult(
            checkout_url=f"https://checkout.razorpay.com/v1/checkout.js?order_id={order_id}&key={self._key_id}",
            transaction_id=order_id,
            amount=amount,
            currency=currency,
        )

    async def verify_payment(self, transaction_id: str) -> PaymentVerificationResult:
        client = self._get_client()
        try:
            order = client.order.fetch(transaction_id)
            status = order.get("status", "unknown")
            amount_paisa = order.get("amount", 0)
            payments = client.order.payments(transaction_id)
            payment_id = ""
            if payments and payments.get("items"):
                payment_id = payments["items"][0].get("id", "")

            return PaymentVerificationResult(
                verified=status == "paid",
                transaction_id=transaction_id,
                payment_id=payment_id,
                status=status,
                amount=amount_paisa / 100.0,
            )
        except Exception as e:
            logger.error("Razorpay verification failed: %s", e)
            return PaymentVerificationResult(
                verified=False,
                transaction_id=transaction_id,
                payment_id="",
                status="error",
                amount=0,
            )

    async def create_subscription(
        self,
        plan_amount: float,
        currency: str = "INR",
        interval: str = "monthly",
        description: str = "",
        metadata: Optional[Dict[str, Any]] = None,
        customer_email: Optional[str] = None,
    ) -> SubscriptionResult:
        client = self._get_client()
        amount_paisa = int(round(plan_amount * 100))
        period = "monthly" if interval == "monthly" else "yearly"

        sub_data = {
            "plan_id": self._find_or_create_plan(amount_paisa, currency, period, description),
            "total_count": 12 if period == "monthly" else 1,
            "quantity": 1,
            "customer_notify": 1 if customer_email else 0,
            "notes": metadata or {},
        }
        if customer_email:
            sub_data["customer_notify"] = 1

        subscription = client.subscription.create(data=sub_data)
        sub_id = subscription.get("id", "")

        return SubscriptionResult(
            subscription_id=sub_id,
            status=subscription.get("status", "created"),
            checkout_url=f"https://checkout.razorpay.com/v1/subscribe/{sub_id}",
        )

    async def cancel_subscription(self, subscription_id: str) -> bool:
        client = self._get_client()
        try:
            client.subscription.cancel(subscription_id)
            return True
        except Exception as e:
            logger.error("Razorpay cancel failed: %s", e)
            return False

    async def handle_webhook(self, payload: Dict[str, Any], signature: str) -> Optional[Dict[str, Any]]:
        if not self._key_secret:
            logger.warning("Razorpay webhook secret not configured")
            return None

        body = json.dumps(payload, separators=(",", ":")) if isinstance(payload, dict) else payload
        expected_signature = hmac.new(
            self._key_secret.encode(),
            body.encode(),
            hashlib.sha256,
        ).hexdigest()

        if not hmac.compare_digest(expected_signature, signature):
            logger.warning("Razorpay webhook signature mismatch")
            return None

        event = payload.get("event", "")
        payload_data = payload.get("payload", {})

        return {
            "event": event,
            "payment": payload_data.get("payment", {}).get("entity"),
            "order": payload_data.get("order", {}).get("entity"),
            "subscription": payload_data.get("subscription", {}).get("entity"),
        }

    def _find_or_create_plan(self, amount_paisa: int, currency: str, period: str, description: str) -> str:
        client = self._get_client()
        plans = client.plan.all(count=50)
        for plan in plans.get("items", []):
            if (
                plan.get("amount") == amount_paisa
                and plan.get("currency") == currency
                and plan.get("period") == period
            ):
                return plan["id"]

        new_plan = client.plan.create({
            "period": period,
            "interval": 1,
            "item": {
                "name": description or "SpinFlow ERP Subscription",
                "amount": amount_paisa,
                "currency": currency,
                "description": description,
            },
        })
        return new_plan.get("id", "")
