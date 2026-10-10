"""Seed data demo Learnova.

Jalankan: `python -m app.seed` (lewati bila data sudah ada) atau `python -m app.seed --reset`
(kosongkan semua tabel lalu isi ulang). Akun demo: lihat DEMO_USERS / README.
"""

import argparse

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app import models  # noqa: F401
from app.auth.security import hash_password
from app.db import Base, SessionLocal
from app.users.models import User

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


def seed(db: Session) -> None:
    seed_users(db)
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
