"""Payment gateway abstraction layer.

Provider-agnostic interface. Implementations (RazorpayProvider, etc.)
must satisfy this interface.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional, Dict, Any


@dataclass
class CheckoutResult:
    checkout_url: str
    transaction_id: str
    amount: float
    currency: str = "INR"


@dataclass
class PaymentVerificationResult:
    verified: bool
    transaction_id: str
    payment_id: str
    status: str
    amount: float
    metadata: Optional[Dict[str, Any]] = None


@dataclass
class SubscriptionResult:
    subscription_id: str
    status: str
    checkout_url: Optional[str] = None


class PaymentProvider(ABC):
    """Abstract payment gateway interface.

    All payment operations go through this interface.
    To add a new provider (e.g. Stripe), implement this class.
    """

    @abstractmethod
    async def create_checkout(
        self,
        amount: float,
        currency: str,
        description: str,
        metadata: Optional[Dict[str, Any]] = None,
        customer_email: Optional[str] = None,
    ) -> CheckoutResult:
        """Create a one-time payment checkout session."""
        ...

    @abstractmethod
    async def verify_payment(self, transaction_id: str) -> PaymentVerificationResult:
        """Verify a completed payment."""
        ...

    @abstractmethod
    async def create_subscription(
        self,
        plan_amount: float,
        currency: str,
        interval: str,
        description: str,
        metadata: Optional[Dict[str, Any]] = None,
        customer_email: Optional[str] = None,
    ) -> SubscriptionResult:
        """Create a recurring subscription."""
        ...

    @abstractmethod
    async def cancel_subscription(self, subscription_id: str) -> bool:
        """Cancel an active subscription."""
        ...

    @abstractmethod
    async def handle_webhook(self, payload: Dict[str, Any], signature: str) -> Optional[Dict[str, Any]]:
        """Process incoming webhook event.
        Returns parsed event data, or None if invalid.
        """
        ...
