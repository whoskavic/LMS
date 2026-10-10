"""Schema dasar: JSON camelCase dan bentuk list standar { items, total, page, pageSize }."""

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


class Page[T](CamelModel):
    items: list[T]
    total: int
    page: int
    page_size: int


class Ok(CamelModel):
    ok: bool = True
