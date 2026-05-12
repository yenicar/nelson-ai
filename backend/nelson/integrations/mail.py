"""Gmail SMTP integration.

Sends Nelson-drafted emails on human approval. Uses Gmail's app-password flow
(no full OAuth needed) — simple, durable, and doesn't require a redirect URL
or web flow. The user generates an app password at
https://myaccount.google.com/apppasswords and puts it in `.env`.

If GMAIL_FROM or GMAIL_APP_PASSWORD is empty, send_email() raises
NotConfiguredError — the caller should fall back to "approved but not sent"
status so the human can send manually.
"""
from __future__ import annotations

import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from nelson.config.settings import settings


class MailError(RuntimeError):
    """Send failed — see message + cause."""


class NotConfiguredError(MailError):
    """Gmail credentials aren't set; the system can't send."""


def send_email(to: str, subject: str, body: str, *, reply_to: str | None = None) -> None:
    """Send an email via Gmail SMTP. Raises MailError on failure.

    `to`         — recipient email
    `subject`    — line of subject
    `body`       — plain-text body (no HTML for now)
    `reply_to`   — optional Reply-To header

    On success returns None. On any failure raises MailError with a clear cause.
    The caller is responsible for recording success/failure in `pending_actions`.
    """
    if not settings.gmail_configured:
        raise NotConfiguredError(
            "Gmail not configured. Set GMAIL_FROM and GMAIL_APP_PASSWORD in .env "
            "to actually send. Until then, approved emails are recorded as drafts only."
        )
    to = (to or "").strip()
    subject = (subject or "").strip()
    if not to:
        raise MailError("Recipient address ('to') is required.")
    if "@" not in to:
        raise MailError(f"'to' doesn't look like an email address: {to!r}")
    if not subject:
        raise MailError("Subject is required.")

    msg = MIMEMultipart()
    msg["From"] = settings.gmail_from
    msg["To"] = to
    msg["Subject"] = subject
    if reply_to:
        msg["Reply-To"] = reply_to
    msg.attach(MIMEText(body or "", "plain"))

    # App passwords are sometimes shown as "abcd efgh ijkl mnop" — strip spaces.
    password = settings.gmail_app_password.replace(" ", "")

    try:
        with smtplib.SMTP("smtp.gmail.com", 587, timeout=30) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(settings.gmail_from, password)
            server.send_message(msg)
    except smtplib.SMTPAuthenticationError as e:
        raise MailError(
            f"Gmail rejected the app password (code {e.smtp_code}). "
            f"Double-check GMAIL_FROM and GMAIL_APP_PASSWORD. "
            f"App passwords require 2-step verification on your Google account."
        ) from e
    except smtplib.SMTPException as e:
        raise MailError(f"SMTP error: {type(e).__name__}: {e}") from e
    except OSError as e:
        raise MailError(f"Network error contacting smtp.gmail.com: {e}") from e
