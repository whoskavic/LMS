from app.common.schemas import CamelModel


class ReviewIn(CamelModel):
    rating: int | None = None
    comment: str | None = None
