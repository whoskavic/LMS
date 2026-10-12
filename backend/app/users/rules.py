"""Aturan validasi user — dipindah dari `Rules` di MockServer (assets/js/api/transport-local.js)."""

import re
import unicodedata

_EMAIL = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
_PASSWORD = re.compile(r"^(?=.*[A-Za-z])(?=.*\d).{8,}$")


def name_error(v: str) -> str:
    if not v:
        return "Full name is required."
    if len(v) < 3:
        return "Name must be at least 3 characters."
    if len(v) > 60:
        return "Name must be at most 60 characters."
    if not all(unicodedata.category(ch)[0] in "LM" or ch in " .'-" for ch in v):
        return "Use letters, spaces, dots, apostrophes, or hyphens only."
    return ""


def email_error(v: str) -> str:
    if not v:
        return "Email is required."
    if not _EMAIL.match(v) or len(v) > 255:
        return "Enter a valid email address."
    return ""


def password_error(v: str) -> str:
    if not v:
        return "Password is required."
    if not _PASSWORD.match(v):
        return "Use at least 8 characters with letters and numbers."
    return ""
