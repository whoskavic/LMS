from app.common.schemas import CamelModel
from app.users.schemas import UserOut


class LoginIn(CamelModel):
    email: str = ""
    password: str = ""


class RegisterIn(CamelModel):
    name: str = ""
    email: str = ""
    password: str = ""
    role: str = "student"


class TokenOut(CamelModel):
    token: str
    user: UserOut


class PasswordChange(CamelModel):
    current: str = ""
    next: str = ""
