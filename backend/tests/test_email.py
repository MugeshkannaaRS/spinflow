from unittest.mock import patch, MagicMock
import pytest

from app.core.error_handler import SpinFlowException, ErrorCode
from app.core.config import settings


@pytest.fixture(autouse=True)
def reset_settings():
    saved = {}
    for attr in ("SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM_NAME"):
        saved[attr] = getattr(settings, attr, "")
    yield
    for k, v in saved.items():
        setattr(settings, k, v)


@patch("app.core.email.smtplib.SMTP")
class TestSendEmail:
    async def test_send_email_calls_smtp_methods(self, mock_smtp):
        settings.SMTP_HOST = "smtp.gmail.com"
        settings.SMTP_USER = "user@test.com"
        settings.SMTP_PASSWORD = "pass"

        mock_instance = MagicMock()
        mock_smtp.return_value.__enter__.return_value = mock_instance

        from app.core.email import send_email
        await send_email(
            to="to@test.com",
            subject="Test",
            html_body="<p>hi</p>",
            text_body="hi",
        )

        mock_smtp.assert_called_once_with("smtp.gmail.com", 587, timeout=10)
        mock_instance.starttls.assert_called_once()
        mock_instance.login.assert_called_once_with("user@test.com", "pass")
        mock_instance.send_message.assert_called_once()

    async def test_send_email_skips_when_smtp_not_configured(self, mock_smtp):
        settings.SMTP_HOST = ""
        settings.SMTP_USER = ""

        from app.core.email import send_email
        await send_email(to="to@test.com", subject="Test", html_body="<p>hi</p>")

        mock_smtp.assert_not_called()

    async def test_send_email_raises_on_smtp_error(self, mock_smtp):
        settings.SMTP_HOST = "smtp.gmail.com"
        settings.SMTP_USER = "user@test.com"
        settings.SMTP_PASSWORD = "pass"

        mock_instance = MagicMock()
        mock_smtp.return_value.__enter__.return_value = mock_instance
        mock_instance.send_message.side_effect = Exception("Connection refused")

        from app.core.email import send_email
        with pytest.raises(SpinFlowException) as exc_info:
            await send_email(to="to@test.com", subject="Test", html_body="<p>hi</p>")
        assert exc_info.value.code == ErrorCode.EMAIL_ERROR


@patch("app.core.email.send_email")
class TestSendOtpEmail:
    async def test_password_reset_subject(self, mock_send_email):
        from app.core.email import send_otp_email
        await send_otp_email(
            to="user@test.com",
            full_name="Test User",
            otp_code="123456",
            otp_type="password_reset",
        )
        args, kwargs = mock_send_email.call_args
        assert "Password reset" in args[1] or "password" in args[1].lower()

    async def test_email_verification_subject(self, mock_send_email):
        from app.core.email import send_otp_email
        await send_otp_email(
            to="user@test.com",
            full_name="Test User",
            otp_code="123456",
            otp_type="email_verification",
        )
        args, kwargs = mock_send_email.call_args
        assert "Verify" in args[1] or "verify" in args[1].lower()
