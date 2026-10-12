from typing import Literal

from app.common.schemas import CamelModel
from app.users.models import User

ApiStatus = Literal["Active", "Inactive"]


class UserOut(CamelModel):
    id: str
    role: str
    name: str
    email: str
    status: ApiStatus
    headline: str | None = None
    bio: str | None = None

    @classmethod
    def of(cls, user: User) -> "UserOut":
        return cls(
            id=str(user.id),
            role=user.role,
            name=user.name,
            email=user.email,
            status="Active" if user.is_active else "Inactive",
            headline=user.headline,
            bio=user.bio,
        )


class UserRow(UserOut):
    courses: int | None = None


class UserCreate(CamelModel):
    role: str = ""
    name: str = ""
    email: str = ""
    status: str = "Active"
    password: str = ""


class UserUpdate(CamelModel):
    name: str | None = None
    email: str | None = None
    status: str | None = None


class ProfileUpdate(CamelModel):
    name: str | None = None
    headline: str | None = None  # hanya instructor (profil publik)
    bio: str | None = None
