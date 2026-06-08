# backend/app/models/user.py
"""사용자 계정 DB 모델"""

import uuid
from datetime import datetime

from sqlalchemy import Column, String, DateTime, Boolean

from app.db import Base


def _new_id() -> str:
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=_new_id)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=True)  # 소셜 전용 계정은 None
    name = Column(String, nullable=True)
    provider = Column(String, nullable=False, default="local")  # "local" | "google"
    provider_id = Column(String, nullable=True)  # 소셜 제공자의 고유 ID (예: google sub)
    session_id = Column(String, nullable=False)  # 연결된 SessionDirs 키
    is_admin = Column(Boolean, nullable=False, default=False, server_default="false")
    created_at = Column(DateTime, default=datetime.utcnow)
