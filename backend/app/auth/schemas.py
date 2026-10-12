from app.common.schemas import CamelModel
from app.users.schemas import UserOut


class LoginIn(CamelModel):
    email: str = ""
    password: str = ""


class RegisterIn(CamelModel):
    """Registrasi publik selalu membuat akun student (field `role` lama diabaikan)."""

    name: str = ""
    email: str = ""
    password: str = ""


class BecomeInstructorIn(CamelModel):
    headline: str | None = None
    bio: str | None = None


class TokenOut(CamelModel):
    token: str
    user: UserOut


class PasswordChange(CamelModel):
    current: str = ""
    next: str = ""
