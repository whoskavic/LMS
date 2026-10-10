"""Seed data demo Learnova.

Jalankan: `python -m app.seed` (lewati bila data sudah ada) atau `python -m app.seed --reset`
(kosongkan semua tabel lalu isi ulang). Akun demo: lihat DEMO_USERS / README.
"""

import argparse
import json
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app import models  # noqa: F401
from app.auth.security import hash_password
from app.common.grading import grade_from_score
from app.common.util import slugify
from app.courses.models import Category, Course, CourseStatusLog, Module
from app.db import Base, SessionLocal
from app.enrollments.models import Enrollment, ModuleProgress
from app.enrollments.service import apply_progress
from app.quizzes.models import AttemptAnswer, Question, QuestionOption, Quiz, QuizAttempt
from app.users.models import User

# Diekspor dari assets/js/data.js (SEED) agar data demo sama dengan prototipe
DATA = json.loads((Path(__file__).parent / "seed_data.json").read_text())

# 1 admin, 2 instructor, 3 student — diambil dari mock data prototipe (assets/js/data.js)
DEMO_USERS = [
    ("admin", "Admin User", "admin@learnova.ac.id", "admin123", "ADM-001", "Academic Operations"),
    ("instructor", "Dr. Budi Santoso", "budi@learnova.ac.id", "dosen123", "0412078801", "Informatics"),
    ("instructor", "Dr. Adam Miller", "adam@learnova.ac.id", "dosen123", "0415037902", "Informatics"),
    ("student", "Alex Mercer", "alex@learnova.ac.id", "student123", "40992", "Informatics"),
    ("student", "Nadia Putri", "nadia@learnova.ac.id", "student123", "40390", "Informatics"),
    ("student", "Marcus Chen", "marcus@learnova.ac.id", "student123", "40655", "Information Systems"),
]


def reset(db: Session) -> None:
    tables = ", ".join(t.name for t in Base.metadata.sorted_tables)
    db.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))
    db.commit()


def seed_users(db: Session) -> dict[str, User]:
    users = {}
    for role, name, email, password, id_number, department in DEMO_USERS:
        user = User(
            role=role,
            name=name,
            email=email,
            password_hash=hash_password(password),
            id_number=id_number,
            department=department,
        )
        db.add(user)
        users[email] = user
    db.flush()
    return users


def course_modules(course: dict, topics: list[str]) -> list[dict]:
    """Setiap topik = 1 modul Lecture + 1 modul Practice (courseModules di store.js)."""
    modules = []
    for i, topic in enumerate(topics):
        modules.append(
            {
                "title": f"{topic} — Lecture",
                "type": "lecture",
                "minutes": 10 + (i * 7) % 15,
                "content": (
                    f"In this lecture you will explore {topic} as part of {course['title']}. "
                    "We introduce the core ideas behind the topic, why it matters, and how it is applied through "
                    "worked examples.\n\n"
                    f"Watch the video first, then read these notes. Try to connect {topic} with what you learned in "
                    "earlier modules — the practice session that follows will ask you to apply these ideas."
                ),
                "tasks": [],
            }
        )
        modules.append(
            {
                "title": f"{topic} — Practice",
                "type": "practice",
                "minutes": 20 + (i * 5) % 20,
                "content": f"Time to put {topic} into practice. Work through the tasks below and tick each one "
                "when you have finished.",
                "tasks": [
                    f"Review your notes from the {topic} lecture",
                    f"Complete the {topic} exercise set (5 questions)",
                    f"Share one question or insight about {topic} in the discussion forum",
                ],
            }
        )
    return modules


def owner_email(course: dict) -> str:
    """Mock punya 11 dosen; course dibagi ke 2 instructor demo (lihat docs/OPEN_QUESTIONS.md #4)."""
    if course["mockLecturerId"] == 3:
        return "adam@learnova.ac.id"
    if course["mockLecturerId"] == 2 or course["category"] in ("Technology", "Design"):
        return "budi@learnova.ac.id"
    return "adam@learnova.ac.id"


STATUS_PATH = {
    "draft": ["draft"],
    "pending": ["draft", "pending"],
    "active": ["draft", "pending", "active"],
    "archived": ["draft", "pending", "active", "archived"],
}


def seed_courses(db: Session, users: dict[str, User]) -> dict[str, Course]:
    admin = users["admin@learnova.ac.id"]
    categories = {}
    for name in DATA["categories"]:
        categories[name] = Category(name=name, slug=slugify(name))
        db.add(categories[name])
    courses = {}
    base = datetime(2026, 8, 1, 2, 0, tzinfo=UTC)
    for i, c in enumerate(DATA["courses"]):
        status = c["status"].lower()
        owner = users[owner_email(c)]
        course = Course(
            instructor=owner,
            category=categories[c["category"]],
            title=c["title"],
            slug=slugify(c["title"]),
            description=c["description"],
            price=0,
            status=status,
            code=c["code"],
            semester=c["semester"],
            duration_weeks=c["duration"],
            start_date=date.fromisoformat(c["startDate"]),
            max_students=c["maxStudents"],
            color=c["color"],
            enrollment_open=c["enrollmentOpen"],
            issues_certificate=c["certificate"],
        )
        db.add(course)
        db.flush()
        created = base + timedelta(days=i)
        course.created_at = created
        previous = None
        for step, to_status in enumerate(STATUS_PATH[status]):
            at = created + timedelta(days=step * 2)
            actor = owner if to_status in ("draft", "pending") else admin
            db.add(
                CourseStatusLog(
                    course_id=course.id,
                    actor_id=actor.id,
                    from_status=previous,
                    to_status=to_status,
                    created_at=at,
                )
            )
            if to_status == "pending":
                course.submitted_at = at
            if to_status == "active" and not course.published_at:
                course.published_at = at
            previous = to_status
        for position, m in enumerate(course_modules(c, DATA["courseTopics"].get(c["code"], [])), start=1):
            db.add(Module(course_id=course.id, position=position, **m))
        courses[c["code"]] = course
    db.flush()
    return courses


# Enrollment demo: Alex Mercer memakai demoEnrollments dari mock; 2 student lain dibuat dengan pola serupa.
# done = jumlah modul selesai (None = semua), finalScore = nilai akhir dari instructor.
EXTRA_ENROLLMENTS = {
    "nadia@learnova.ac.id": [
        {"code": "CS205", "done": 6},
        {"code": "MATH201", "done": None},
        {"code": "DES302", "done": 3},
        {"code": "DATA200", "done": None, "finalScore": 88},
    ],
    "marcus@learnova.ac.id": [
        {"code": "CS101", "done": 4},
        {"code": "BIO210", "done": 10},
        {"code": "PHY310", "done": 0},
        {"code": "PHY110", "done": None, "finalScore": 71},
    ],
}


def seed_enrollments(db: Session, users: dict[str, User], courses: dict[str, Course]) -> list[Enrollment]:
    plan = {"alex@learnova.ac.id": DATA["demoEnrollments"], **EXTRA_ENROLLMENTS}
    enrollments = []
    for email, items in plan.items():
        for item in items:
            course = courses[item["code"]]
            start = datetime.combine(course.start_date, datetime.min.time(), tzinfo=UTC)
            enrollment = Enrollment(user_id=users[email].id, course=course, enrolled_at=start - timedelta(days=7))
            db.add(enrollment)
            db.flush()
            modules = list(db.scalars(select(Module).where(Module.course_id == course.id).order_by(Module.position)))
            done = len(modules) if item.get("done") is None else min(item["done"], len(modules))
            for i, module in enumerate(modules[:done]):
                db.add(
                    ModuleProgress(
                        enrollment_id=enrollment.id,
                        module_id=module.id,
                        completed_at=start + timedelta(days=3 * (i + 1)),
                    )
                )
            db.flush()
            if done == len(modules) and modules:
                # Course selesai: tanggal selesai = akhir course (seperti fallback sertifikat di prototipe)
                enrollment.completed_at = min(start + timedelta(weeks=course.duration_weeks or 1), datetime.now(UTC))
            apply_progress(db, enrollment)
            if item.get("finalScore") is not None:
                enrollment.final_score = item["finalScore"]
                enrollment.grade_letter = grade_from_score(item["finalScore"])
            enrollments.append(enrollment)
    db.flush()
    return enrollments


def seed_quizzes(db: Session, courses: dict[str, Course]) -> dict[str, Quiz]:
    """1 quiz (5 soal) per course yang punya bank soal di mock: lulus 70, maksimal 3 attempt, 10 menit."""
    quizzes = {}
    for code, bank in DATA["quizBank"].items():
        quiz = Quiz(
            course_id=courses[code].id,
            title=f"{code} Quiz 1 · Fundamentals",
            passing_score=70,
            max_attempts=3,
            duration_minutes=10,
        )
        db.add(quiz)
        db.flush()
        for position, item in enumerate(bank, start=1):
            question = Question(quiz_id=quiz.id, text=item["text"], points=1, position=position)
            db.add(question)
            db.flush()
            for i, option_text in enumerate(item["options"]):
                db.add(
                    QuestionOption(
                        question_id=question.id, text=option_text, position=i + 1, is_correct=i == item["answer"]
                    )
                )
        db.flush()
        db.refresh(quiz)
        quizzes[code] = quiz
    return quizzes


QUIZ_SCORES = {
    # Skor quiz demo mock (demoEnrollments.quiz) untuk Alex; student lain mengikuti pola serupa
    "nadia@learnova.ac.id": {"MATH201": 100, "DATA200": 80, "CS205": 60},
    "marcus@learnova.ac.id": {"BIO210": 40, "PHY110": 80},
}


def seed_attempts(db: Session, users: dict[str, User], enrollments: list[Enrollment], quizzes: dict[str, Quiz]):
    alex = users["alex@learnova.ac.id"].id
    scores = {(alex, e["code"]): e["quiz"] for e in DATA["demoEnrollments"] if e.get("quiz") is not None}
    for email, items in QUIZ_SCORES.items():
        scores.update({(users[email].id, code): score for code, score in items.items()})
    taken_at = datetime(2026, 9, 20, 3, 0, tzinfo=UTC)
    for enrollment in enrollments:
        code = enrollment.course.code
        score = scores.get((enrollment.user_id, code))
        quiz = quizzes.get(code)
        if score is None or quiz is None:
            continue
        correct = round(score / 100 * len(quiz.questions))
        attempt = QuizAttempt(
            enrollment_id=enrollment.id,
            quiz_id=quiz.id,
            attempt_number=1,
            status="submitted",
            started_at=taken_at,
            expires_at=taken_at + timedelta(minutes=quiz.duration_minutes),
            submitted_at=taken_at + timedelta(minutes=6),
            score=score,
        )
        db.add(attempt)
        db.flush()
        for i, question in enumerate(quiz.questions):
            options = list(question.options)
            right = next(o for o in options if o.is_correct)
            chosen = right if i < correct else options[(options.index(right) + 1) % len(options)]
            db.add(
                AttemptAnswer(
                    attempt_id=attempt.id,
                    question_id=question.id,
                    selected_option_id=chosen.id,
                    is_correct=chosen.id == right.id,
                )
            )
    db.flush()


def seed(db: Session) -> None:
    users = seed_users(db)
    courses = seed_courses(db, users)
    enrollments = seed_enrollments(db, users, courses)
    quizzes = seed_quizzes(db, courses)
    seed_attempts(db, users, enrollments, quizzes)
    db.commit()


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed data demo Learnova")
    parser.add_argument("--reset", action="store_true", help="kosongkan semua tabel sebelum seed")
    args = parser.parse_args()
    with SessionLocal() as db:
        if args.reset:
            reset(db)
        elif db.scalar(select(func.count()).select_from(User)):
            print("Data sudah ada — seed dilewati. Pakai --reset untuk mengisi ulang.")
            return
        seed(db)
        print("Seed selesai.")


if __name__ == "__main__":
    main()
