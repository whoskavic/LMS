import re
import unicodedata
import uuid


def parse_uuid(value: str | uuid.UUID | None) -> uuid.UUID | None:
    if isinstance(value, uuid.UUID):
        return value
    try:
        return uuid.UUID(str(value))
    except (TypeError, ValueError):
        return None


def slugify(value: str, max_length: int = 200) -> str:
    text = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    text = re.sub(r"[^a-zA-Z0-9]+", "-", text).strip("-").lower()
    return text[:max_length].strip("-") or "item"


def clean(value: object) -> str:
    return value.strip() if isinstance(value, str) else ("" if value is None else str(value).strip())


def is_int(value: object) -> bool:
    if isinstance(value, bool):
        return False
    if isinstance(value, int):
        return True
    if isinstance(value, float):
        return value.is_integer()
    if isinstance(value, str) and value.strip():
        try:
            int(value.strip())
            return True
        except ValueError:
            return False
    return False


def to_int(value: object) -> int | None:
    return int(float(value)) if is_int(value) else None
