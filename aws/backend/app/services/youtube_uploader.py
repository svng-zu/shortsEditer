"""YouTube Data API v3를 이용한 쇼츠 업로드 서비스"""

import json
from pathlib import Path

from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
from googleapiclient.errors import HttpError

from app.config import settings

SCOPES = ["https://www.googleapis.com/auth/youtube.upload"]
TOKEN_PATH = settings.BASE_DIR / "data" / "youtube_token.json"


def _client_config() -> dict:
    return {
        "web": {
            "client_id": settings.YOUTUBE_CLIENT_ID,
            "client_secret": settings.YOUTUBE_CLIENT_SECRET,
            "redirect_uris": [settings.YOUTUBE_REDIRECT_URI],
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
        }
    }


def _make_flow() -> Flow:
    return Flow.from_client_config(
        _client_config(),
        scopes=SCOPES,
        redirect_uri=settings.YOUTUBE_REDIRECT_URI,
    )


def get_auth_url() -> str:
    flow = _make_flow()
    auth_url, _ = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
    )
    return auth_url


def handle_callback(code: str):
    """OAuth 콜백 코드로 토큰 저장"""
    flow = _make_flow()
    flow.fetch_token(code=code)
    creds = flow.credentials
    TOKEN_PATH.parent.mkdir(parents=True, exist_ok=True)
    TOKEN_PATH.write_text(
        json.dumps({
            "token": creds.token,
            "refresh_token": creds.refresh_token,
            "token_uri": creds.token_uri,
            "client_id": creds.client_id,
            "client_secret": creds.client_secret,
            "scopes": list(creds.scopes) if creds.scopes else SCOPES,
        }),
        encoding="utf-8",
    )
    print(f"[YouTube] 토큰 저장 완료 → {TOKEN_PATH}")


def is_authenticated() -> bool:
    return TOKEN_PATH.exists()


def _load_credentials() -> Credentials:
    data = json.loads(TOKEN_PATH.read_text(encoding="utf-8"))
    creds = Credentials(
        token=data["token"],
        refresh_token=data["refresh_token"],
        token_uri=data["token_uri"],
        client_id=data["client_id"],
        client_secret=data["client_secret"],
        scopes=data["scopes"],
    )
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
        # 갱신된 토큰 저장
        data["token"] = creds.token
        TOKEN_PATH.write_text(json.dumps(data), encoding="utf-8")
    return creds


def upload_video(
    video_path: str,
    title: str,
    description: str = "",
    privacy: str = "private",
    category_id: str = "25",
) -> dict:
    """
    쇼츠 영상을 YouTube에 업로드하고 video_id와 URL을 반환.
    category_id: 25 = News & Politics
    """
    if not TOKEN_PATH.exists():
        raise RuntimeError("YouTube 인증이 필요합니다. 먼저 /api/youtube/auth-url에서 인증하세요.")

    creds = _load_credentials()
    youtube = build("youtube", "v3", credentials=creds)

    body = {
        "snippet": {
            "title": title,
            "description": description,
            "categoryId": category_id,
        },
        "status": {
            "privacyStatus": privacy,
            "selfDeclaredMadeForKids": False,
        },
    }

    media = MediaFileUpload(video_path, mimetype="video/mp4", resumable=True)

    print(f"[YouTube] 업로드 시작: {title}")
    try:
        request = youtube.videos().insert(
            part=",".join(body.keys()),
            body=body,
            media_body=media,
        )
        response = None
        while response is None:
            status, response = request.next_chunk()
            if status:
                print(f"  업로드 진행: {int(status.progress() * 100)}%")

        video_id = response["id"]
        url = f"https://www.youtube.com/shorts/{video_id}"
        print(f"[YouTube] 완료 → {url}")
        return {"video_id": video_id, "url": url}

    except HttpError as e:
        raise RuntimeError(f"YouTube 업로드 실패: {e.reason}")
