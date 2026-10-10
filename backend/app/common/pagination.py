"""Helper pagination & sort yang meniru MockServer (page di-clamp ke halaman terakhir)."""

from collections.abc import Callable, Sequence
from typing import Any


def clamp_page(
    total: int, page: int | None, page_size: int | None, default_size: int = 50
) -> tuple[int, int]:
    size = min(max(page_size or default_size, 1), 200)
    pages = max(1, -(-total // size))
    return min(max(page or 1, 1), pages), size


def sort_items(items: list[dict], sort: str | None) -> list[dict]:
    """Urutkan list dict; sort = "key" atau "-key". Nilai None selalu di akhir."""
    if not sort:
        return items
    desc = sort.startswith("-")
    key = sort[1:] if desc else sort
    present = [i for i in items if i.get(key) is not None]
    missing = [i for i in items if i.get(key) is None]

    def value(item: dict) -> Any:
        v = item[key]
        return v.lower() if isinstance(v, str) else v

    return sorted(present, key=value, reverse=desc) + missing


def paginate(
    items: Sequence[Any],
    page: int | None,
    page_size: int | None,
    sort: str | None = None,
    default_sort: str | None = None,
    to_dict: Callable[[Any], dict] | None = None,
) -> dict:
    """Pagination di memori untuk list yang sudah difilter (data per halaman kecil)."""
    rows = [to_dict(i) for i in items] if to_dict else list(items)
    rows = sort_items(rows, sort or default_sort)
    page, size = clamp_page(len(rows), page, page_size)
    start = (page - 1) * size
    return {"items": rows[start : start + size], "total": len(rows), "page": page, "pageSize": size}
