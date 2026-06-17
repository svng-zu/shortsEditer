# backend/app/models/plan.py
"""요금제(Plan) 정의 및 결제(Payment) DB 모델"""

import uuid
from datetime import datetime

from sqlalchemy import Column, String, Integer, DateTime, ForeignKey

from app.db import Base


def _new_id() -> str:
    return str(uuid.uuid4())


# ── 요금제 정의 ──────────────────────────────────────────────────────

PLANS = {
    "free": {
        "name": "Free",
        "monthly_shorts": 5,
        "max_video_minutes": 30,
        "storage_days": 7,
        "tts_engines": ["google_neural2", "google_wavenet"],
        "price_krw": 0,
    },
    "starter": {
        "name": "Starter",
        "monthly_shorts": 30,
        "max_video_minutes": 60,
        "storage_days": 30,
        "tts_engines": ["google_neural2", "google_wavenet", "google_chirp3"],
        "price_krw": 9900,
    },
    "pro": {
        "name": "Pro",
        "monthly_shorts": 100,
        "max_video_minutes": 120,
        "storage_days": 90,
        "tts_engines": ["google_neural2", "google_wavenet", "google_chirp3", "elevenlabs"],
        "price_krw": 29900,
    },
    "business": {
        "name": "Business",
        "monthly_shorts": None,  # unlimited
        "max_video_minutes": None,  # unlimited
        "storage_days": None,  # unlimited
        "tts_engines": ["google_neural2", "google_wavenet", "google_chirp3", "elevenlabs"],
        "price_krw": 79900,
    },
}

ANON_LIMIT = 2  # 비로그인(익명) 사용자 최대 다운로드 개수


def get_plan_limit(plan_name: str) -> int | None:
    """요금제의 월간 쇼츠 생성 한도를 반환한다. None이면 무제한."""
    plan = PLANS.get(plan_name, PLANS["free"])
    return plan["monthly_shorts"]


# ── 결제 기록 모델 ───────────────────────────────────────────────────

class Payment(Base):
    __tablename__ = "payments"

    id = Column(String, primary_key=True, default=_new_id)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    plan = Column(String, nullable=False)
    amount = Column(Integer, nullable=False)  # KRW
    merchant_uid = Column(String, unique=True, nullable=False)
    imp_uid = Column(String, nullable=True)
    status = Column(String, nullable=False, default="pending")  # pending | paid | failed | cancelled
    created_at = Column(DateTime, default=datetime.utcnow)
    paid_at = Column(DateTime, nullable=True)
