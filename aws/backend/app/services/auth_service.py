# backend/app/services/auth_service.py
"""비밀번호 해시, JWT 발급/검증, 사용자 CRUD 헬퍼"""

import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from sqlalchemy.orm import Session

from app.config import settings
from app.models.user import User


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))


def create_access_token(user_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.JWT_EXPIRE_MINUTES)
    payload = {"sub": user_id, "exp": expire}
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> str | None:
    """검증 성공 시 user_id(sub) 반환, 실패 시 None"""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        return payload.get("sub")
    except jwt.PyJWTError:
        return None


def get_user_by_email(db: Session, email: str) -> User | None:
    return db.query(User).filter(User.email == email).first()


def get_user_by_id(db: Session, user_id: str) -> User | None:
    return db.query(User).filter(User.id == user_id).first()


def issue_password_reset_token(db: Session, user: User) -> str:
    """비밀번호 재설정 토큰을 생성해 사용자에 저장하고 반환한다 (평문 토큰은 메일로만 전달)"""
    token = secrets.token_urlsafe(32)
    user.reset_token = token
    user.reset_token_expires_at = datetime.now(timezone.utc) + timedelta(
        minutes=settings.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES
    )
    db.commit()
    return token


def get_user_by_reset_token(db: Session, token: str) -> User | None:
    """토큰이 유효(존재 + 미만료)한 사용자만 반환"""
    user = db.query(User).filter(User.reset_token == token).first()
    if not user or not user.reset_token_expires_at:
        return None
    expires_at = user.reset_token_expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        return None
    return user


def reset_password_with_token(db: Session, user: User, new_password: str) -> None:
    """새 비밀번호로 교체하고 재설정 토큰을 폐기한다"""
    user.password_hash = hash_password(new_password)
    user.reset_token = None
    user.reset_token_expires_at = None
    db.commit()


def create_user(
    db: Session,
    email: str,
    session_id: str,
    password: str | None = None,
    name: str | None = None,
    provider: str = "local",
    provider_id: str | None = None,
) -> User:
    user = User(
        email=email,
        password_hash=hash_password(password) if password else None,
        name=name,
        provider=provider,
        provider_id=provider_id,
        session_id=session_id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def find_or_create_google_user(
    db: Session, email: str, name: str | None, google_sub: str, session_id: str
) -> User:
    """이메일이 이미 존재하면 google 계정 정보를 연결(병합), 없으면 새로 생성"""
    user = get_user_by_email(db, email)
    if user:
        if not user.provider_id:
            user.provider_id = google_sub
            if user.provider == "local":
                user.provider = "google"
            db.commit()
            db.refresh(user)
        return user
    return create_user(
        db, email=email, session_id=session_id, name=name,
        provider="google", provider_id=google_sub,
    )
