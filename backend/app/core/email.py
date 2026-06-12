import logging
import asyncio
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import smtplib
import ssl

from app.core.config import settings
from app.core.error_handler import SpinFlowException, ErrorCode

logger = logging.getLogger("spinflow")


async def send_email(to: str, subject: str, html_body: str, text_body: str = "") -> None:
    if not settings.SMTP_HOST or not settings.SMTP_USER:
        logger.warning("SMTP not configured — email not sent to %s", to)
        return

    message = MIMEMultipart("alternative")
    message["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_USER}>"
    message["To"] = to
    message["Subject"] = subject

    if text_body:
        message.attach(MIMEText(text_body, "plain"))

    message.attach(MIMEText(html_body, "html"))

    try:
        def _send() -> None:
            context = ssl.create_default_context()
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as server:
                server.starttls(context=context)
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                server.send_message(message)
        await asyncio.wait_for(asyncio.to_thread(_send), timeout=15)
    except asyncio.TimeoutError:
        logger.error("SMTP timeout sending email to %s", to)
        raise SpinFlowException.bad_request("Email send timed out", ErrorCode.EMAIL_ERROR)
    except Exception:
        logger.exception("Failed to send email to %s", to)
        raise SpinFlowException.bad_request("Failed to send email", ErrorCode.EMAIL_ERROR)


async def send_otp_email(to: str, full_name: str, otp_code: str, otp_type: str) -> None:
    subjects = {
        "password_reset": "SpinFlow ERP — Password reset OTP",
        "email_verification": "SpinFlow ERP — Verify your email",
    }
    subject = subjects.get(otp_type, "SpinFlow ERP — Your OTP")

    html_body = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background-color:#f4f6f8;">
<table align="center" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;margin:40px auto;background-color:#ffffff;border-radius:8px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;">
<tr><td style="background-color:#1e3a5f;padding:20px;text-align:center;">
<h1 style="color:#ffffff;margin:0;font-size:20px;">SpinFlow ERP</h1>
</td></tr>
<tr><td style="padding:32px;">
<p style="font-size:15px;color:#333333;margin:0 0 16px 0;">Hello {full_name},</p>
<p style="font-size:14px;color:#555555;margin:0 0 24px 0;">{_get_otp_purpose_text(otp_type)}</p>
<div style="text-align:center;margin:24px 0;">
<div style="display:inline-block;font-size:32px;font-weight:bold;letter-spacing:8px;color:#1e3a5f;border:2px solid #e2e8f0;padding:16px 24px;border-radius:8px;font-family:monospace;">{otp_code}</div>
</div>
<p style="font-size:12px;color:#888888;margin:16px 0 0 0;">This OTP expires in 10 minutes. Do not share it with anyone.</p>
</td></tr>
<tr><td style="background-color:#f9fafb;padding:16px;text-align:center;">
<p style="font-size:11px;color:#aaaaaa;margin:0;">If you did not request this, please ignore this email.</p>
</td></tr>
</table>
</body>
</html>"""

    text_body = f"Your OTP is: {otp_code}. Expires in 10 minutes."

    await send_email(to, subject, html_body, text_body)


def _get_otp_purpose_text(otp_type: str) -> str:
    texts = {
        "password_reset": "We received a request to reset your password. Use the OTP below to proceed.",
        "email_verification": "Thank you for registering. Please use the OTP below to verify your email address.",
    }
    return texts.get(otp_type, "Use the OTP below to complete your request.")
