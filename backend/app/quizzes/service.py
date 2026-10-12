"""Logika quiz (CRUD, attempt, penilaian di server)."""

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.common.errors import assert_valid, conflict, forbidden, not_found
from app.common.grading import average, js_round
from app.common.util import clean, is_int, parse_uuid, to_int
from app.courses.models import Course
from app.enrollments.models import Enrollment
from app.quizzes.models import AttemptAnswer, Question, QuestionOption, Quiz, QuizAttempt


def best_scores(db: Session, enrollment_ids: list[uuid.UUID]) -> dict[tuple[uuid.UUID, uuid.UUID], float]:
    """Skor terbaik per (enrollment, quiz) dari attempt yang sudah submitted."""
    best: dict[tuple[uuid.UUID, uuid.UUID], float] = {}
    rows = db.execute(
        select(QuizAttempt.enrollment_id, QuizAttempt.quiz_id, QuizAttempt.score).where(
            QuizAttempt.enrollment_id.in_(enrollment_ids),
            QuizAttempt.status == "submitted",
            QuizAttempt.score.is_not(None),
        )
    ).all()
    for enrollment_id, quiz_id, score in rows:
        key = (enrollment_id, quiz_id)
        best[key] = max(best.get(key, 0.0), float(score))
    return best


def quiz_average_by_enrollment(db: Session, course_id: uuid.UUID) -> dict[uuid.UUID, int | None]:
    """Rata-rata skor terbaik dari semua quiz course yang sudah dikerjakan (averageQuiz di prototipe)."""
    enrollment_ids = list(db.scalars(select(Enrollment.id).where(Enrollment.course_id == course_id)))
    quiz_ids = list(db.scalars(select(Quiz.id).where(Quiz.course_id == course_id)))
    best = best_scores(db, enrollment_ids)
    result: dict[uuid.UUID, int | None] = {}
    for eid in enrollment_ids:
        scores = [best[(eid, qid)] for qid in quiz_ids if (eid, qid) in best]
        result[eid] = js_round(average(scores)) if scores else None
    return result


# ---------------------------------------------------------------------------
# Validasi & CRUD quiz (instructor pemilik) — aturan dari quizErrors di MockServer
# ---------------------------------------------------------------------------
GRACE = timedelta(seconds=30)  # toleransi submit setelah waktu habis (latensi jaringan)


def now() -> datetime:
    return datetime.now(UTC)


def iso(value: datetime | None) -> str | None:
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z") if value else None


def quiz_input(body) -> dict:
    data = body.model_dump(exclude_unset=True)
    if "title" in data:
        data["title"] = clean(data["title"])
    if "description" in data:
        data["description"] = clean(data["description"])
    for key in ("passing_score", "max_attempts", "time_limit"):
        if key in data and is_int(data[key]):
            data[key] = to_int(data[key])
    if isinstance(data.get("questions"), list):
        data["questions"] = [
            {
                "text": clean((q or {}).get("text")),
                "options": [clean(o) for o in (q or {}).get("options") or []]
                if isinstance((q or {}).get("options"), list)
                else [],
                "answer": to_int((q or {}).get("answer")) if is_int((q or {}).get("answer")) else None,
            }
            for q in data["questions"]
        ]
    return data


def quiz_errors(q: dict, min_attempts: int = 0) -> dict[str, str]:
    def in_range(value, low, high):
        return isinstance(value, int) and low <= value <= high

    title = q.get("title") or ""
    fields = {
        "title": "Quiz title is required."
        if not title
        else "Title must be at least 5 characters."
        if len(title) < 5
        else "Title must be at most 80 characters."
        if len(title) > 80
        else "",
        "passingScore": "" if in_range(q.get("passing_score"), 1, 100) else "Enter a number between 1 and 100.",
        "maxAttempts": "Enter a number between 1 and 5."
        if not in_range(q.get("max_attempts"), 1, 5)
        else f"A student has already used {min_attempts} attempts. Use at least {min_attempts}."
        if q["max_attempts"] < min_attempts
        else "",
        "timeLimit": "" if in_range(q.get("time_limit"), 1, 120) else "Enter a number between 1 and 120.",
        "questions": "" if isinstance(q.get("questions"), list) and q["questions"] else "Add at least one question.",
    }
    for i, item in enumerate(q.get("questions") or []):
        options = item["options"]
        fields[f"questions.{i}"] = (
            "Write the question text."
            if not item["text"]
            else "Fill in all four options."
            if len(options) != 4 or any(not o for o in options)
            else "Options must be different from each other."
            if len({o.lower() for o in options}) < 4
            else "Select the correct answer."
            if item["answer"] is None or not 0 <= item["answer"] <= 3
            else ""
        )
    return fields


def find_quiz(db: Session, quiz_id: str) -> Quiz:
    uid = parse_uuid(quiz_id)
    quiz = db.get(Quiz, uid) if uid else None
    if not quiz:
        raise not_found("Quiz")
    return quiz


def attempts_used(db: Session, quiz: Quiz) -> dict[uuid.UUID, int]:
    rows = db.execute(
        select(QuizAttempt.enrollment_id, func.count())
        .where(QuizAttempt.quiz_id == quiz.id)
        .group_by(QuizAttempt.enrollment_id)
    ).all()
    return dict(rows)


def quiz_stats(db: Session, quiz: Quiz) -> dict:
    used = attempts_used(db, quiz)
    enrollment_ids = list(db.scalars(select(Enrollment.id).where(Enrollment.course_id == quiz.course_id)))
    best = [v for (eid, qid), v in best_scores(db, enrollment_ids).items() if qid == quiz.id]
    return {
        "attempts": sum(used.values()),
        "maxAttemptsUsed": max(used.values(), default=0),
        "takers": len(best),
        "avgBestScore": js_round(average(best)) if best else None,
    }


def _questions_full(quiz: Quiz) -> list[dict]:
    return [
        {
            "id": str(q.id),
            "text": q.text,
            "points": q.points,
            "options": [o.text for o in q.options],
            "answer": next((i for i, o in enumerate(q.options) if o.is_correct), None),
        }
        for q in quiz.questions
    ]


def quiz_view(db: Session, quiz: Quiz, user, learner: bool | None = None) -> dict:
    """Student tidak pernah menerima kunci jawaban (soal diambil saat attempt dimulai)."""
    base = {
        "id": str(quiz.id),
        "courseId": str(quiz.course_id),
        "moduleId": str(quiz.module_id) if quiz.module_id else None,
        "title": quiz.title,
        "description": quiz.description or "",
        "passingScore": quiz.passing_score,
        "maxAttempts": quiz.max_attempts,
        "timeLimit": quiz.duration_minutes,
        "questionCount": len(quiz.questions),
    }
    if learner is None:
        learner = user.role == "student"
    if learner:
        enrollment = db.scalar(
            select(Enrollment).where(Enrollment.user_id == user.id, Enrollment.course_id == quiz.course_id)
        )
        attempts = list(
            db.scalars(
                select(QuizAttempt).where(
                    QuizAttempt.quiz_id == quiz.id, QuizAttempt.enrollment_id == (enrollment.id if enrollment else None)
                )
            )
        )
        scores = [float(a.score) for a in attempts if a.status == "submitted" and a.score is not None]
        in_progress = next((a for a in attempts if a.status == "in_progress" and a.expires_at + GRACE > now()), None)
        base["mine"] = {
            "attempts": len(attempts),
            "bestScore": js_round(max(scores)) if scores else None,
            "inProgressAttemptId": str(in_progress.id) if in_progress else None,
        }
    else:
        base["questions"] = _questions_full(quiz)
        base["stats"] = quiz_stats(db, quiz)
    return base


def _write_questions(db: Session, quiz: Quiz, questions: list[dict]) -> None:
    """Perbarui soal di tempat (ID soal & opsi dipertahankan agar riwayat jawaban tetap terhubung)."""
    existing = list(quiz.questions)
    for i, item in enumerate(questions):
        question = existing[i] if i < len(existing) else None
        if question is None:
            question = Question(quiz_id=quiz.id, position=i + 1, text=item["text"], points=1)
            db.add(question)
            db.flush()
            for j, text in enumerate(item["options"]):
                db.add(QuestionOption(question_id=question.id, text=text, position=j + 1, is_correct=False))
        else:
            question.text, question.position = item["text"], i + 1
            options = list(question.options)
            for j, text in enumerate(item["options"]):
                if j < len(options):
                    options[j].text, options[j].position = text, j + 1
                else:
                    db.add(QuestionOption(question_id=question.id, text=text, position=j + 1, is_correct=False))
        db.flush()
        # Tepat satu jawaban benar: reset dulu (partial unique index), lalu tandai yang benar
        db.execute(
            QuestionOption.__table__.update().where(QuestionOption.question_id == question.id).values(is_correct=False)
        )
        db.flush()
        db.execute(
            QuestionOption.__table__.update()
            .where(QuestionOption.question_id == question.id, QuestionOption.position == item["answer"] + 1)
            .values(is_correct=True)
        )
    for question in existing[len(questions) :]:
        db.delete(question)
    db.flush()
    db.expire(quiz)


def create_quiz(db: Session, user, course: Course, body) -> Quiz:
    data = {"title": "", "passing_score": 70, "max_attempts": 3, "time_limit": 10, "questions": [], **quiz_input(body)}
    assert_valid(quiz_errors(data))
    quiz = Quiz(
        course_id=course.id,
        title=data["title"],
        description=data.get("description") or None,
        passing_score=data["passing_score"],
        max_attempts=data["max_attempts"],
        duration_minutes=data["time_limit"],
    )
    db.add(quiz)
    db.flush()
    _write_questions(db, quiz, data["questions"])
    db.commit()
    return quiz


def update_quiz(db: Session, quiz: Quiz, body) -> Quiz:
    current = {
        "title": quiz.title,
        "description": quiz.description or "",
        "passing_score": quiz.passing_score,
        "max_attempts": quiz.max_attempts,
        "time_limit": quiz.duration_minutes,
        "questions": [
            {"text": q["text"], "options": q["options"], "answer": q["answer"]} for q in _questions_full(quiz)
        ],
    }
    data = {**current, **quiz_input(body)}
    assert_valid(quiz_errors(data, quiz_stats(db, quiz)["maxAttemptsUsed"]))
    quiz.title, quiz.description = data["title"], data.get("description") or None
    quiz.passing_score, quiz.max_attempts, quiz.duration_minutes = (
        data["passing_score"],
        data["max_attempts"],
        data["time_limit"],
    )
    _write_questions(db, quiz, data["questions"])
    db.commit()
    return quiz


# ---------------------------------------------------------------------------
# Attempt (student) — skor, batas attempt, dan timer divalidasi server
# ---------------------------------------------------------------------------
def student_enrollment(db: Session, user, quiz: Quiz) -> Enrollment:
    enrollment = db.scalar(
        select(Enrollment).where(Enrollment.user_id == user.id, Enrollment.course_id == quiz.course_id)
    )
    if not enrollment:
        raise not_found("Quiz")
    return enrollment


def expire_stale(db: Session, attempts: list[QuizAttempt]) -> None:
    for attempt in attempts:
        if attempt.status == "in_progress" and now() > attempt.expires_at + GRACE:
            attempt.status = "expired"
    db.flush()


def attempt_view(db: Session, attempt: QuizAttempt, quiz: Quiz) -> dict:
    """Soal + pilihan tanpa kunci; kunci & benar/salah hanya disertakan bila attempt sudah submitted."""
    submitted = attempt.status == "submitted"
    chosen = {a.question_id: a for a in attempt.answers}
    questions = []
    for q in quiz.questions:
        item = {
            "id": str(q.id),
            "text": q.text,
            "points": q.points,
            "options": [{"id": str(o.id), "text": o.text} for o in q.options],
        }
        answer = chosen.get(q.id)
        item["selectedOptionId"] = str(answer.selected_option_id) if answer and answer.selected_option_id else None
        if submitted:
            item["correctOptionId"] = next((str(o.id) for o in q.options if o.is_correct), None)
            item["isCorrect"] = bool(answer and answer.is_correct)
        questions.append(item)
    view = {
        "id": str(attempt.id),
        "quizId": str(quiz.id),
        "attemptNumber": attempt.attempt_number,
        "status": attempt.status,
        "startedAt": iso(attempt.started_at),
        "expiresAt": iso(attempt.expires_at),
        "submittedAt": iso(attempt.submitted_at),
        "serverTime": iso(now()),
        "score": js_round(float(attempt.score)) if attempt.score is not None else None,
        "questions": questions,
    }
    if submitted:
        view["correct"] = sum(1 for q in questions if q["isCorrect"])
        view["total"] = len(questions)
        view["passed"] = view["score"] is not None and view["score"] >= quiz.passing_score
    return view


def attempt_summary(attempt: QuizAttempt, quiz: Quiz) -> dict:
    score = js_round(float(attempt.score)) if attempt.score is not None else None
    return {
        "id": str(attempt.id),
        "attemptNumber": attempt.attempt_number,
        "status": attempt.status,
        "score": score,
        "passed": score is not None and score >= quiz.passing_score,
        "startedAt": iso(attempt.started_at),
        "submittedAt": iso(attempt.submitted_at),
    }


def my_attempts(db: Session, user, quiz: Quiz) -> list[QuizAttempt]:
    enrollment = student_enrollment(db, user, quiz)
    attempts = list(
        db.scalars(
            select(QuizAttempt)
            .where(QuizAttempt.enrollment_id == enrollment.id, QuizAttempt.quiz_id == quiz.id)
            .order_by(QuizAttempt.attempt_number)
        )
    )
    expire_stale(db, attempts)
    db.commit()
    return attempts


def start_attempt(db: Session, user, quiz: Quiz) -> QuizAttempt:
    """Mulai attempt baru, atau lanjutkan attempt yang masih berjalan. Attempt dihitung saat dimulai."""
    enrollment = student_enrollment(db, user, quiz)
    if enrollment.course.status != "active":
        raise conflict("COURSE_NOT_ACTIVE", "This course is not active. New quiz attempts are closed.")
    if not quiz.questions:
        raise conflict("QUIZ_EMPTY", "This quiz has no questions yet.")
    attempts = list(
        db.scalars(
            select(QuizAttempt).where(QuizAttempt.enrollment_id == enrollment.id, QuizAttempt.quiz_id == quiz.id)
        )
    )
    expire_stale(db, attempts)
    running = next((a for a in attempts if a.status == "in_progress"), None)
    if running:
        db.commit()
        return running
    if len(attempts) >= quiz.max_attempts:
        db.commit()
        raise conflict("NO_ATTEMPTS_LEFT", f"You have used all {quiz.max_attempts} attempts for this quiz.")
    started = now()
    attempt = QuizAttempt(
        enrollment_id=enrollment.id,
        quiz_id=quiz.id,
        attempt_number=len(attempts) + 1,
        status="in_progress",
        started_at=started,
        expires_at=started + timedelta(minutes=quiz.duration_minutes),
    )
    db.add(attempt)
    db.commit()
    return attempt


def find_attempt(db: Session, user, attempt_id: str) -> QuizAttempt:
    uid = parse_uuid(attempt_id)
    attempt = db.get(QuizAttempt, uid) if uid else None
    enrollment = db.get(Enrollment, attempt.enrollment_id) if attempt else None
    if not attempt or enrollment.user_id != user.id:
        raise not_found("Attempt")
    return attempt


def _parse_answers(quiz: Quiz, answers: dict | None) -> dict[uuid.UUID, uuid.UUID | None]:
    """{questionId: optionId} → hanya pasangan yang valid untuk quiz ini."""
    valid: dict[uuid.UUID, uuid.UUID | None] = {}
    by_id = {q.id: q for q in quiz.questions}
    for qid, oid in (answers or {}).items():
        question = by_id.get(parse_uuid(qid))
        if not question:
            continue
        option = next((o for o in question.options if o.id == parse_uuid(oid)), None)
        valid[question.id] = option.id if option else None
    return valid


def _ensure_open(db: Session, attempt: QuizAttempt) -> None:
    if attempt.status == "in_progress" and now() > attempt.expires_at + GRACE:
        attempt.status = "expired"
        db.commit()
    if attempt.status == "expired":
        raise conflict("ATTEMPT_EXPIRED", "Time is up — this attempt has expired and was not graded.")
    if attempt.status != "in_progress":
        raise conflict("ATTEMPT_SUBMITTED", "This attempt has already been submitted.")


def _store_answers(db: Session, attempt: QuizAttempt, answers: dict) -> None:
    current = {a.question_id: a for a in attempt.answers}
    for qid, oid in answers.items():
        row = current.get(qid)
        if row:
            row.selected_option_id = oid
        else:
            attempt.answers.append(AttemptAnswer(question_id=qid, selected_option_id=oid, is_correct=False))
    db.flush()


def save_answers(db: Session, user, attempt_id: str, answers: dict | None) -> tuple[QuizAttempt, Quiz]:
    attempt = find_attempt(db, user, attempt_id)
    quiz = db.get(Quiz, attempt.quiz_id)
    _ensure_open(db, attempt)
    _store_answers(db, attempt, _parse_answers(quiz, answers))
    db.commit()
    return attempt, quiz


def submit_attempt(db: Session, user, attempt_id: str, answers: dict | None) -> tuple[QuizAttempt, Quiz]:
    """Nilai di server: skor = poin benar / total poin × 100 (dibulatkan seperti prototipe)."""
    attempt = find_attempt(db, user, attempt_id)
    quiz = db.get(Quiz, attempt.quiz_id)
    _ensure_open(db, attempt)
    if answers is not None:
        _store_answers(db, attempt, _parse_answers(quiz, answers))
    chosen = {a.question_id: a for a in attempt.answers}
    earned = total = 0
    for question in quiz.questions:
        correct = next((o.id for o in question.options if o.is_correct), None)
        row = chosen.get(question.id)
        if row is None:
            row = AttemptAnswer(question_id=question.id, selected_option_id=None)
            attempt.answers.append(row)
        row.is_correct = row.selected_option_id is not None and row.selected_option_id == correct
        total += question.points
        earned += question.points if row.is_correct else 0
    attempt.score = js_round(earned / total * 100) if total else 0
    attempt.status = "submitted"
    attempt.submitted_at = now()
    db.commit()
    return attempt, quiz


def owned_quiz(db: Session, user, quiz_id: str) -> Quiz:
    quiz = find_quiz(db, quiz_id)
    course = db.get(Course, quiz.course_id)
    if user.role != "instructor" or course.instructor_id != user.id:
        raise forbidden("Only the course instructor can change this quiz.")
    return quiz


def select_quizzes(course_id: uuid.UUID):
    return select(Quiz).where(Quiz.course_id == course_id).order_by(Quiz.created_at, Quiz.id)


def student_enrollment_for_course(db: Session, user, course: Course) -> Enrollment:
    enrollment = db.scalar(select(Enrollment).where(Enrollment.user_id == user.id, Enrollment.course_id == course.id))
    if not enrollment:
        raise not_found("Enrollment")
    return enrollment
