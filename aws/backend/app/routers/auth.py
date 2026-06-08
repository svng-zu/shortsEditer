# backend/app/routers/auth.py
"""사용자 계정 인증 — 이메일/비밀번호 + Google 소셜 로그인"""

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_requests
from google_auth_oauthlib.flow import Flow

from app.config import settings
from app.db import get_db
from app.models.schemas import (
    ForgotPasswordRequest, LoginRequest, MessageResponse, ResetPasswordRequest,
    SignupRequest, TokenResponse, UserResponse,
)
from app.models.user import User
from app.services import auth_service, email_service
from app.session import get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])

GOOGLE_SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
]


def _issue_token(user: User) -> TokenResponse:
    return TokenResponse(
        access_token=auth_service.create_access_token(user.id),
        user=UserResponse.model_validate(user),
    )


@router.post("/signup", response_model=TokenResponse)
async def signup(req: SignupRequest, db: Session = Depends(get_db)):
    if auth_service.get_user_by_email(db, req.email):
        raise HTTPException(409, "이미 가입된 이메일입니다.")
    user = auth_service.create_user(
        db, email=req.email, session_id=req.session_id,
        password=req.password, name=req.name,
    )
    return _issue_token(user)


@router.post("/login", response_model=TokenResponse)
async def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = auth_service.get_user_by_email(db, req.email)
    if not user or not user.password_hash or not auth_service.verify_password(req.password, user.password_hash):
        raise HTTPException(401, "이메일 또는 비밀번호가 올바르지 않습니다.")
    return _issue_token(user)


_FORGOT_PASSWORD_GENERIC_MESSAGE = (
    "해당 이메일로 가입된 계정이 있다면 비밀번호 재설정 링크를 보내드렸습니다."
)


@router.post("/forgot-password", response_model=MessageResponse)
async def forgot_password(req: ForgotPasswordRequest, db: Session = Depends(get_db)):
    """이메일/비밀번호 계정에 재설정 링크 발송. 계정 존재 여부를 노출하지 않기 위해 항상 동일한 메시지를 반환한다"""
    user = auth_service.get_user_by_email(db, req.email)
    if user and user.password_hash:
        token = auth_service.issue_password_reset_token(db, user)
        reset_link = f"{settings.FRONTEND_URL}/?reset_token={token}"
        email_service.send_password_reset_email(user.email, reset_link)
    return MessageResponse(message=_FORGOT_PASSWORD_GENERIC_MESSAGE)


@router.post("/reset-password", response_model=MessageResponse)
async def reset_password(req: ResetPasswordRequest, db: Session = Depends(get_db)):
    user = auth_service.get_user_by_reset_token(db, req.token)
    if not user:
        raise HTTPException(400, "재설정 링크가 유효하지 않거나 만료되었습니다. 다시 요청해주세요.")
    if len(req.new_password) < 8:
        raise HTTPException(400, "비밀번호는 8자 이상이어야 합니다.")
    auth_service.reset_password_with_token(db, user, req.new_password)
    return MessageResponse(message="비밀번호가 변경되었습니다. 새 비밀번호로 로그인해주세요.")


@router.get("/me", response_model=UserResponse)
async def me(user: User = Depends(get_current_user)):
    return user


# ── Google 소셜 로그인 ──────────────────────────────────────

def _google_client_config() -> dict:
    return {
        "web": {
            "client_id": settings.GOOGLE_AUTH_CLIENT_ID,
            "client_secret": settings.GOOGLE_AUTH_CLIENT_SECRET,
            "redirect_uris": [settings.GOOGLE_AUTH_REDIRECT_URI],
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
        }
    }


def _make_google_flow() -> Flow:
    return Flow.from_client_config(
        _google_client_config(),
        scopes=GOOGLE_SCOPES,
        redirect_uri=settings.GOOGLE_AUTH_REDIRECT_URI,
    )


@router.get("/google/login")
async def google_login(session_id: str):
    """Google 로그인 동의 화면 URL 반환. session_id는 state로 왕복시켜 콜백에서 계정에 연결"""
    if not settings.GOOGLE_AUTH_CLIENT_ID:
        raise HTTPException(400, "GOOGLE_AUTH_CLIENT_ID가 설정되지 않았습니다.")
    flow = _make_google_flow()
    auth_url, _ = flow.authorization_url(
        access_type="online",
        include_granted_scopes="true",
        prompt="select_account",
        state=session_id,
    )
    return {"url": auth_url}


@router.get("/google/callback")
async def google_callback(code: str = "", state: str = "", error: str = "", db: Session = Depends(get_db)):
    """Google OAuth 콜백 — JWT 발급 후 프런트로 리다이렉트 (token은 URL fragment로 전달)"""
    if error or not code:
        return RedirectResponse(url="/#auth_error=google")
    try:
        flow = _make_google_flow()
        flow.fetch_token(code=code)
        creds = flow.credentials
        id_info = google_id_token.verify_oauth2_token(
            creds.id_token, google_requests.Request(), settings.GOOGLE_AUTH_CLIENT_ID
        )
        email = id_info["email"]
        name = id_info.get("name")
        sub = id_info["sub"]
    except Exception as e:
        import traceback
        traceback.print_exc()
        return RedirectResponse(url=f"/#auth_error=google&msg={str(e)[:100]}")

    user = auth_service.find_or_create_google_user(
        db, email=email, name=name, google_sub=sub, session_id=state,
    )
    token = auth_service.create_access_token(user.id)
    return RedirectResponse(url=f"/#auth_token={token}")
