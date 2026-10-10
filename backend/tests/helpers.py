"""Helper test: membuat user dan header Authorization."""

from app.auth.security import create_token, hash_password
from app.users.models import User

PASSWORD = "secret123"
_counter = {"n": 0}


def make_user(
    db, role="student", name=None, email=None, active=True, id_number=None, department="Informatics"
):
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
