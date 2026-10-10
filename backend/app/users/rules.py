"""Aturan validasi user — dipindah dari `Rules` di MockServer (assets/js/api/transport-local.js)."""

import re
import unicodedata

ID_RULES = {
    "student": ("NIM", re.compile(r"^\d{5,10}$"), "5–10 digits"),
    "instructor": ("NIDN", re.compile(r"^\d{10}$"), "10 digits"),
    "admin": ("Staff ID", re.compile(r"^[A-Z]{3}-\d{3}$"), "format ADM-001"),
}
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


def department_error(v: str, required: bool = True) -> str:
    if not v:
        return "Department is required." if required else ""
    if len(v) < 2:
        return "Department is too short."
    if len(v) > 60:
        return "Department must be at most 60 characters."
    return ""


def password_error(v: str) -> str:
    if not v:
        return "Password is required."
    if not _PASSWORD.match(v):
        return "Use at least 8 characters with letters and numbers."
    return ""


def id_number_error(v: str, role: str, required: bool = True) -> str:
    label, pattern, hint = ID_RULES[role]
    if not v:
        return f"{label} is required." if required else ""
    if not pattern.match(v):
        return f"{label} must be {hint}."
    return ""


def id_label(role: str) -> str:
    return ID_RULES[role][0]
