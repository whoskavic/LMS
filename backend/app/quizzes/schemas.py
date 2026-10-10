from typing import Any

from app.common.schemas import CamelModel


class QuizIn(CamelModel):
    """Quiz + soal. questions: [{ text, options: [4 teks], answer: index opsi benar 0–3 }]."""

    title: Any = None
    description: Any = None
    passing_score: Any = None
    max_attempts: Any = None
    time_limit: Any = None
    questions: Any = None


class AnswersIn(CamelModel):
    """Jawaban: { "<questionId>": "<optionId>" }."""

    answers: dict[str, str | None] | None = None
