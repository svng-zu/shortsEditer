"""세션별 파일 경로 관리 + 로그인 사용자 인증"""

import json
from dataclasses import dataclass
from pathlib import Path

from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session as DbSession

from app.config import settings
from app.db import get_db
from app.models.user import User
from app.services import auth_service


@dataclass
class SessionDirs:
    session_id: str
    download_dir: Path
    transcript_dir: Path
    analysis_dir: Path
    shorts_dir: Path
    raw_dir: Path

    @property
    def category_map_path(self) -> Path:
        return self.download_dir.parent / "category_map.json"

    @property
    def channels_path(self) -> Path:
        return self.download_dir.parent / "channels.json"

    @property
    def video_id_map_path(self) -> Path:
        return self.download_dir.parent / "video_ids.json"

    @property
    def channel_map_path(self) -> Path:
        return self.download_dir.parent / "channel_map.json"

    def s3_key(self, subdir: str, filename: str) -> str:
        return f"sessions/{self.session_id}/{subdir}/{filename}"


def load_video_id_map(s: SessionDirs) -> dict:
    """다운로드 파일명(stem) → YouTube video_id 매핑 (썸네일 CDN 조회용)"""
    if not s.video_id_map_path.exists():
        return {}
    try:
        return json.loads(s.video_id_map_path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def save_video_id_map(s: SessionDirs, mapping: dict):
    s.video_id_map_path.write_text(
        json.dumps(mapping, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def load_channel_map(s: SessionDirs) -> dict:
    """다운로드 파일명(stem) → 출처 채널 {name, thumbnail_url} 매핑"""
    if not s.channel_map_path.exists():
        return {}
    try:
        return json.loads(s.channel_map_path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def save_channel_map(s: SessionDirs, mapping: dict):
    s.channel_map_path.write_text(
        json.dumps(mapping, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def make_session(session_id: str) -> SessionDirs:
    base = settings.BASE_DIR / "data" / "sessions" / session_id
    s = SessionDirs(
        session_id=session_id,
        download_dir=base / "downloads",
        transcript_dir=base / "transcripts",
        analysis_dir=base / "analysis",
        shorts_dir=base / "shorts",
        raw_dir=base / "raw",
    )
    for d in [s.download_dir, s.transcript_dir, s.analysis_dir, s.shorts_dir, s.raw_dir]:
        d.mkdir(parents=True, exist_ok=True)
    return s


async def get_current_user(
    authorization: str = Header(default=""),
    db: DbSession = Depends(get_db),
) -> User:
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "로그인이 필요합니다.")
    user_id = auth_service.decode_access_token(authorization.removeprefix("Bearer ").strip())
    if not user_id:
        raise HTTPException(401, "유효하지 않거나 만료된 토큰입니다.")
    user = auth_service.get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(401, "존재하지 않는 사용자입니다.")
    return user


async def require_admin(user: User = Depends(get_current_user)) -> User:
    """관리자 전용 엔드포인트 가드 — is_admin이 아니면 403"""
    if not user.is_admin:
        raise HTTPException(403, "관리자 권한이 필요합니다.")
    return user


async def get_optional_user(
    authorization: str = Header(default=""),
    db: DbSession = Depends(get_db),
) -> User | None:
    """로그인 토큰이 있으면 사용자를 반환하고, 없거나 무효하면 None — 401을 던지지 않음"""
    if not authorization.startswith("Bearer "):
        return None
    user_id = auth_service.decode_access_token(authorization.removeprefix("Bearer ").strip())
    if not user_id:
        return None
    return auth_service.get_user_by_id(db, user_id)


async def get_session(
    user: User | None = Depends(get_optional_user),
    x_session_id: str = Header(default="default"),
) -> SessionDirs:
    """로그인 사용자는 계정에 연결된 session_id로, 비로그인(익명)은 X-Session-Id 헤더로 세션을 해석한다."""
    return make_session(user.session_id if user else x_session_id)
