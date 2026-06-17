# backend/app/routers/payment.py
"""요금제 조회 및 PortOne(아임포트) 결제 연동 API"""

import uuid
import logging
from datetime import datetime, timedelta

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session as DbSession

from app.config import settings
from app.db import get_db
from app.models.plan import PLANS, Payment
from app.models.user import User
from app.session import get_current_user, get_optional_user

logger = logging.getLogger(__name__)

router = APIRouter(tags=["payment"])


# ── 요청/응답 스키마 ─────────────────────────────────────────────────

class PrepareRequest(BaseModel):
    plan_name: str  # "starter" | "pro" | "business"


class PrepareResponse(BaseModel):
    merchant_uid: str
    plan_name: str
    plan_display: str
    amount: int  # KRW


class VerifyRequest(BaseModel):
    imp_uid: str
    merchant_uid: str


class VerifyResponse(BaseModel):
    success: bool
    plan: str
    plan_expires_at: str | None
    message: str


class PaymentHistoryItem(BaseModel):
    id: str
    plan: str
    amount: int
    merchant_uid: str
    imp_uid: str | None
    status: str
    created_at: str
    paid_at: str | None


# ── 헬퍼 ─────────────────────────────────────────────────────────────

def _portone_configured() -> bool:
    return bool(settings.PORTONE_IMP_KEY and settings.PORTONE_IMP_SECRET)


async def _get_portone_token() -> str:
    """PortOne REST API 액세스 토큰을 발급받는다."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://api.iamport.kr/users/getToken",
            json={
                "imp_key": settings.PORTONE_IMP_KEY,
                "imp_secret": settings.PORTONE_IMP_SECRET,
            },
        )
    data = resp.json()
    if data.get("code") != 0:
        logger.error("PortOne 토큰 발급 실패: %s", data.get("message"))
        raise HTTPException(502, "결제 시스템 인증에 실패했습니다.")
    return data["response"]["access_token"]


async def _verify_payment_with_portone(imp_uid: str) -> dict:
    """PortOne에서 결제 정보를 조회한다."""
    token = await _get_portone_token()
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"https://api.iamport.kr/payments/{imp_uid}",
            headers={"Authorization": token},
        )
    data = resp.json()
    if data.get("code") != 0:
        logger.error("PortOne 결제 조회 실패: %s", data.get("message"))
        raise HTTPException(502, "결제 정보 조회에 실패했습니다.")
    return data["response"]


# ── 공개 엔드포인트 ──────────────────────────────────────────────────

@router.get("/plans")
async def list_plans():
    """요금제 목록 — 로그인 불필요"""
    result = []
    for key, plan in PLANS.items():
        result.append({
            "key": key,
            **plan,
        })
    return result


@router.get("/plans/current")
async def current_plan(user: User | None = Depends(get_optional_user)):
    """현재 사용자의 요금제 정보"""
    if not user:
        return {"plan": "anonymous", "plan_display": "비로그인", "plan_expires_at": None}

    plan_name = user.plan or "free"
    # 만료 체크
    if user.plan_expires_at and user.plan_expires_at < datetime.utcnow():
        plan_name = "free"

    plan = PLANS.get(plan_name, PLANS["free"])
    return {
        "plan": plan_name,
        "plan_display": plan["name"],
        "plan_expires_at": user.plan_expires_at.isoformat() if user.plan_expires_at else None,
        **plan,
    }


# ── 결제 엔드포인트 (로그인 필수) ────────────────────────────────────

@router.post("/payment/prepare", response_model=PrepareResponse)
async def prepare_payment(
    body: PrepareRequest,
    user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
):
    """결제 준비 — merchant_uid 생성 + Payment 레코드 저장"""
    if not _portone_configured():
        raise HTTPException(503, "결제 시스템이 아직 설정되지 않았습니다.")

    plan_name = body.plan_name
    if plan_name not in PLANS or plan_name == "free":
        raise HTTPException(400, "유효하지 않은 요금제입니다.")

    plan = PLANS[plan_name]
    amount = plan["price_krw"]
    merchant_uid = f"order_{uuid.uuid4().hex[:16]}_{int(datetime.utcnow().timestamp())}"

    payment = Payment(
        user_id=user.id,
        plan=plan_name,
        amount=amount,
        merchant_uid=merchant_uid,
        status="pending",
    )
    db.add(payment)
    db.commit()

    return PrepareResponse(
        merchant_uid=merchant_uid,
        plan_name=plan_name,
        plan_display=plan["name"],
        amount=amount,
    )


@router.post("/payment/verify", response_model=VerifyResponse)
async def verify_payment(
    body: VerifyRequest,
    user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
):
    """결제 검증 — PortOne API로 결제 금액 대조 후 요금제 적용"""
    if not _portone_configured():
        raise HTTPException(503, "결제 시스템이 아직 설정되지 않았습니다.")

    # 1. DB에서 pending 상태의 결제 레코드 조회
    payment: Payment | None = (
        db.query(Payment)
        .filter(Payment.merchant_uid == body.merchant_uid, Payment.user_id == user.id)
        .first()
    )
    if not payment:
        raise HTTPException(404, "결제 정보를 찾을 수 없습니다.")
    if payment.status == "paid":
        raise HTTPException(400, "이미 처리된 결제입니다.")

    # 2. PortOne API로 실제 결제 정보 확인
    portone_data = await _verify_payment_with_portone(body.imp_uid)

    paid_amount = portone_data.get("amount", 0)
    portone_status = portone_data.get("status")

    # 3. 금액 대조
    if portone_status != "paid" or paid_amount != payment.amount:
        payment.status = "failed"
        payment.imp_uid = body.imp_uid
        db.commit()

        logger.warning(
            "결제 검증 실패: merchant_uid=%s, expected=%d, actual=%d, status=%s",
            body.merchant_uid, payment.amount, paid_amount, portone_status,
        )
        raise HTTPException(400, detail={
            "code": "payment_mismatch",
            "message": "결제 금액이 일치하지 않습니다.",
            "expected": payment.amount,
            "actual": paid_amount,
        })

    # 4. 결제 성공 — Payment 레코드 업데이트
    now = datetime.utcnow()
    payment.status = "paid"
    payment.imp_uid = body.imp_uid
    payment.paid_at = now

    # 5. User 요금제 업데이트 (+30일)
    plan_expires_at = now + timedelta(days=30)

    # 기존 만료일이 미래라면 그 시점부터 +30일
    if user.plan_expires_at and user.plan_expires_at > now:
        plan_expires_at = user.plan_expires_at + timedelta(days=30)

    user.plan = payment.plan
    user.plan_expires_at = plan_expires_at
    db.commit()

    logger.info(
        "결제 완료: user=%s, plan=%s, expires=%s, amount=%d",
        user.id, payment.plan, plan_expires_at.isoformat(), payment.amount,
    )

    return VerifyResponse(
        success=True,
        plan=payment.plan,
        plan_expires_at=plan_expires_at.isoformat(),
        message=f"{PLANS[payment.plan]['name']} 요금제가 활성화되었습니다.",
    )


@router.get("/payment/history")
async def payment_history(
    user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
):
    """결제 이력 조회"""
    payments = (
        db.query(Payment)
        .filter(Payment.user_id == user.id)
        .order_by(Payment.created_at.desc())
        .limit(50)
        .all()
    )
    return [
        PaymentHistoryItem(
            id=p.id,
            plan=p.plan,
            amount=p.amount,
            merchant_uid=p.merchant_uid,
            imp_uid=p.imp_uid,
            status=p.status,
            created_at=p.created_at.isoformat() if p.created_at else "",
            paid_at=p.paid_at.isoformat() if p.paid_at else None,
        )
        for p in payments
    ]
