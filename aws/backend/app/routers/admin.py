# backend/app/routers/admin.py
"""관리자 대시보드 API — 사용자/권한, 전체 통계, 파이프라인 모니터링"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DbSession

from app.config import settings
from app.db import get_db
from app.models.user import User
from app.models.schemas import (
    AdminUserInfo, AdminUserUpdateRequest, AdminStats, AdminPipelineInfo,
    PipelineStep,
)
from app.session import require_admin, make_session
from app.routers.pipeline import (
    _session_statuses, _session_paused, load_category_map, _quota_info,
)

router = APIRouter()


@router.get("/admin/users", response_model=list[AdminUserInfo])
async def list_users(
    db: DbSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    users = db.query(User).order_by(User.created_at.desc()).all()
    result = []
    for u in users:
        session = make_session(u.session_id)
        quota = _quota_info(session, u)
        result.append(AdminUserInfo(
            id=u.id, email=u.email, name=u.name, provider=u.provider,
            is_admin=u.is_admin, created_at=u.created_at, session_id=u.session_id,
            quota_used=quota["used"], quota_limit=quota["limit"],
        ))
    return result


@router.patch("/admin/users/{user_id}")
async def update_user_admin(
    user_id: str,
    req: AdminUserUpdateRequest,
    db: DbSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(404, "사용자를 찾을 수 없습니다.")
    if target.id == admin.id and not req.is_admin:
        raise HTTPException(400, "자기 자신의 관리자 권한은 해제할 수 없습니다.")
    target.is_admin = req.is_admin
    db.commit()
    return {"ok": True}


@router.get("/admin/stats", response_model=AdminStats)
async def get_stats(
    db: DbSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    sessions_root = settings.BASE_DIR / "data" / "sessions"
    session_dirs = [d for d in sessions_root.iterdir() if d.is_dir()] if sessions_root.exists() else []

    downloads = transcripts = analyses = raws = shorts = 0
    category_counts: dict[str, int] = {}

    for d in session_dirs:
        s = make_session(d.name)
        downloads += len(list(s.download_dir.glob("*.mp4")))
        transcripts += len(list(s.transcript_dir.glob("*.json")))
        analyses += len(list(s.analysis_dir.glob("*.json")))
        raws += len(list(s.raw_dir.glob("*.mp4")))
        shorts += len(list(s.shorts_dir.glob("*.mp4")))
        for cat in load_category_map(s).values():
            category_counts[cat] = category_counts.get(cat, 0) + 1

    return AdminStats(
        total_sessions=len(session_dirs),
        total_users=db.query(User).count(),
        downloads=downloads,
        transcripts=transcripts,
        analyses=analyses,
        raws=raws,
        shorts=shorts,
        category_counts=category_counts,
    )


@router.get("/admin/pipelines", response_model=list[AdminPipelineInfo])
async def list_pipelines(
    db: DbSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    result = []
    for session_id, status in _session_statuses.items():
        if status.step == PipelineStep.IDLE:
            continue
        user = db.query(User).filter(User.session_id == session_id).first()
        result.append(AdminPipelineInfo(
            session_id=session_id,
            step=status.step,
            message=status.message,
            progress=status.progress,
            is_paused=_session_paused.get(session_id, False),
            user_email=user.email if user else None,
        ))
    return result
