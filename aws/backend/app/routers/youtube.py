"""YouTube 업로드 API"""

from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from app.config import settings
from app.services import youtube_uploader

router = APIRouter()

# 업로드 상태 (간단한 인메모리 추적)
_upload_status: dict = {"running": False, "result": None, "error": None}


class UploadRequest(BaseModel):
    filename: str
    title: str
    description: str = ""
    privacy: str = "private"


@router.get("/youtube/auth-status")
async def auth_status():
    """YouTube 인증 상태 확인"""
    if not settings.YOUTUBE_CLIENT_ID:
        return {"authenticated": False, "configured": False}
    return {
        "authenticated": youtube_uploader.is_authenticated(),
        "configured": True,
    }


@router.get("/youtube/auth-url")
async def get_auth_url():
    """YouTube OAuth2 인증 URL 반환"""
    if not settings.YOUTUBE_CLIENT_ID:
        raise HTTPException(400, "YOUTUBE_CLIENT_ID가 설정되지 않았습니다.")
    return {"url": youtube_uploader.get_auth_url()}


@router.get("/youtube/callback")
async def oauth_callback(code: str = "", error: str = ""):
    """Google OAuth2 콜백 — 토큰 저장 후 프론트엔드로 리다이렉트"""
    if error:
        return RedirectResponse(url="/?youtube_auth=error")
    if not code:
        raise HTTPException(400, "code 파라미터 없음")
    try:
        youtube_uploader.handle_callback(code)
    except Exception as e:
        return RedirectResponse(url=f"/?youtube_auth=error&msg={str(e)[:100]}")
    return RedirectResponse(url="/?youtube_auth=success")


@router.get("/youtube/upload-status")
async def upload_status():
    """업로드 진행 상태 조회"""
    return _upload_status


async def _run_upload(video_path: str, title: str, description: str, privacy: str):
    global _upload_status
    _upload_status = {"running": True, "result": None, "error": None}
    try:
        result = youtube_uploader.upload_video(video_path, title, description, privacy)
        _upload_status = {"running": False, "result": result, "error": None}
    except Exception as e:
        _upload_status = {"running": False, "result": None, "error": str(e)}


@router.post("/youtube/upload")
async def upload(req: UploadRequest, background_tasks: BackgroundTasks):
    """쇼츠 영상을 YouTube에 업로드"""
    if _upload_status.get("running"):
        raise HTTPException(400, "업로드가 이미 진행 중입니다.")

    video_path = settings.SHORTS_DIR / req.filename
    if not video_path.exists():
        raise HTTPException(404, f"파일 없음: {req.filename}")

    background_tasks.add_task(
        _run_upload, str(video_path), req.title, req.description, req.privacy
    )
    return {"ok": True, "message": "업로드 시작됨"}
