"""Logika nilai dari prototipe (assets/js/domain.js) — dipindah apa adanya."""

import math
from collections.abc import Iterable
from decimal import Decimal

GRADE_SCALE = [
    (85, "A", 4.0),
    (80, "A-", 3.7),
    (75, "B+", 3.3),
    (70, "B", 3.0),
    (65, "B-", 2.7),
    (60, "C+", 2.3),
    (55, "C", 2.0),
    (45, "D", 1.0),
    (0, "E", 0.0),
]


def grade_from_score(score: float | Decimal | None) -> str | None:
    """Nilai akhir 0–100 → huruf. None bila kosong / di luar rentang."""
    if score is None:
        return None
    n = float(score)
    if n < 0 or n > 100:
        return None
    return next(grade for minimum, grade, _ in GRADE_SCALE if n >= minimum)


def grade_point(grade: str | None) -> float | None:
    return next((point for _, g, point in GRADE_SCALE if g == grade), None)


def average(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0


def gpa(grades: Iterable[str | None]) -> float | None:
    """IPK = rata-rata bobot huruf; huruf kosong/tidak dikenal diabaikan."""
    points = [p for p in (grade_point(g) for g in grades) if p is not None]
    return average(points) if points else None


def progress_percent(done: int, total: int) -> int:
    if not total:
        return 0
    return js_round(min(max(done, 0), total) / total * 100)


def js_round(value: float) -> int:
    """Pembulatan seperti Math.round di JavaScript (0.5 dibulatkan ke atas)."""
    return math.floor(value + 0.5)
