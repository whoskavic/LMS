from typing import Literal

from app.common.schemas import CamelModel
from app.users.models import User

ApiStatus = Literal["Active", "Inactive"]


class UserOut(CamelModel):
    id: str
    role: str
    name: str
    email: str
    id_number: str | None = None
    department: str | None = None
    status: ApiStatus

    @classmethod
    def of(cls, user: User) -> "UserOut":
        return cls(
            id=str(user.id),
            role=user.role,
            name=user.name,
            email=user.email,
            id_number=user.id_number,
            department=user.department,
            status="Active" if user.is_active else "Inactive",
        )


class UserRow(UserOut):
    courses: int | None = None


class UserCreate(CamelModel):
    role: str = ""
    name: str = ""
    email: str = ""
    id_number: str = ""
    department: str = ""
    status: str = "Active"
    password: str = ""


class UserUpdate(CamelModel):
    name: str | None = None
    email: str | None = None
    id_number: str | None = None
    department: str | None = None
    status: str | None = None


class ProfileUpdate(CamelModel):
    name: str | None = None
    department: str | None = None
