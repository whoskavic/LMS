"""Helper angka dari prototipe (assets/js/domain.js). Skala nilai & IPK dihapus (ADR-009)."""

import math


def average(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0


def progress_percent(done: int, total: int) -> int:
    if not total:
        return 0
    return js_round(min(max(done, 0), total) / total * 100)


def js_round(value: float) -> int:
    """Pembulatan seperti Math.round di JavaScript (0.5 dibulatkan ke atas)."""
    return math.floor(value + 0.5)
