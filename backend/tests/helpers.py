"""Helper test: membuat user dan header Authorization."""

from app.auth.security import create_token, hash_password
from app.users.models import User

PASSWORD = "secret123"
_counter = {"n": 0}


def make_user(db, role="student", name=None, email=None, active=True, id_number=None, department="Informatics"):
    _counter["n"] += 1
    n = _counter["n"]
    defaults = {"student": f"{40000 + n}", "instructor": f"{1000000000 + n}", "admin": f"ADM-{n % 1000:03d}"}
    user = User(
        role=role,
        name=name or f"Test {role.title()} {chr(64 + n % 26 or 1)}",
        email=email or f"{role}{n}@test.dev",
        password_hash=hash_password(PASSWORD),
        id_number=id_number or defaults[role],
        department=department,
        is_active=active,
    )
    db.add(user)
    db.commit()
    return user


def auth(user) -> dict:
    return {"Authorization": f"Bearer {create_token(user.id)}"}


def make_category(db, name="Technology"):
    from app.courses.models import Category

    category = Category(name=name, slug=name.lower())
    db.add(category)
    db.commit()
    return category


FULL_COURSE = {
    "title": "Web Programming",
    "description": "Client-side development with HTML5, CSS3, and JavaScript.",
    "category": "Technology",
    "semester": "Fall 2026",
    "duration": 14,
    "startDate": "2099-09-01",
    "code": "CS205",
    "maxStudents": 60,
    "enrollmentOpen": True,
    "certificate": True,
}


def make_course(db, instructor, status="active", title="Web Programming", code=None, category=None, **extra):
    from app.common.util import slugify
    from app.courses.models import Course

    course = Course(
        instructor_id=instructor.id,
        title=title,
        slug=slugify(title) + f"-{instructor.id.hex[:6]}-{code or ''}".lower(),
        status=status,
        code=code,
        category_id=category.id if category else None,
        description=extra.pop("description", f"{title} — a course description that is long enough."),
        max_students=extra.pop("max_students", 60),
        enrollment_open=extra.pop("enrollment_open", True),
        issues_certificate=extra.pop("issues_certificate", True),
        **extra,
    )
    db.add(course)
    db.commit()
    return course


def make_module(db, course, title="Lesson One", position=1, type_="lecture"):
    from app.courses.models import Module

    module = Module(
        course_id=course.id,
        title=title,
        type=type_,
        content="x" * 30,
        minutes=10,
        position=position,
        tasks=[],
    )
    db.add(module)
    db.commit()
    return module
