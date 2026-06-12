# backend/app/config.py
import os
from pathlib import Path
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # App
    APP_NAME: str = "고릴라AI"
    DEBUG: bool = False

    # AWS (IAM Role 사용 - 키 불필요)
    AWS_REGION: str = "ap-northeast-2"
    S3_BUCKET_NAME: str = "aishortsbucket"

    # Gemini
    GEMINI_API_KEY: str = ""

    # YouTube OAuth2 (Google Cloud Console에서 발급)
    YOUTUBE_CLIENT_ID: str = ""
    YOUTUBE_CLIENT_SECRET: str = ""
    YOUTUBE_REDIRECT_URI: str = "http://localhost/api/youtube/callback"

    # 사용자 계정 DB (PostgreSQL)
    DATABASE_URL: str = "postgresql+psycopg2://shortsai:shortsai@postgres:5432/shortsai"

    # JWT 인증
    JWT_SECRET_KEY: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7일

    # 사용량 제한 (수집 가능한 영상 개수) — 익명 체험 vs 회원 무료 한도
    FREE_ANON_VIDEO_LIMIT: int = 2
    FREE_MEMBER_VIDEO_LIMIT: int = 5

    # 사용자 로그인용 Google OAuth2 (YouTube 업로드용과는 별도 클라이언트)
    GOOGLE_AUTH_CLIENT_ID: str = ""
    GOOGLE_AUTH_CLIENT_SECRET: str = ""
    GOOGLE_AUTH_REDIRECT_URI: str = "http://localhost/api/auth/google/callback"

    # 비밀번호 재설정 메일 (AWS SES)
    FRONTEND_URL: str = "https://gorilai.duckdns.org"
    SES_SENDER_EMAIL: str = ""
    PASSWORD_RESET_TOKEN_EXPIRE_MINUTES: int = 30

    # Whisper
    WHISPER_MODEL: str = "medium"
    WHISPER_LANGUAGE: str = "auto"

    # Paths
    BASE_DIR: Path = Path(__file__).parent.parent
    DOWNLOAD_DIR: Path = BASE_DIR / "data" / "downloads"
    TRANSCRIPT_DIR: Path = BASE_DIR / "data" / "transcripts"
    ANALYSIS_DIR: Path = BASE_DIR / "data" / "analysis"
    SHORTS_DIR: Path = BASE_DIR / "data" / "shorts"
    RAW_DIR: Path = BASE_DIR / "data" / "raw"
    STATIC_DIR: Path = BASE_DIR / "static"
    SFX_DIR: Path = BASE_DIR / "static" / "sfx"

    # CORS
    CORS_ORIGINS: list = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://43.203.53.134",
    ]

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    return Settings()


# Create directories on import
settings = get_settings()
for d in [settings.DOWNLOAD_DIR, settings.TRANSCRIPT_DIR,
          settings.ANALYSIS_DIR, settings.SHORTS_DIR, settings.RAW_DIR,
          settings.STATIC_DIR, settings.SFX_DIR]:
    d.mkdir(parents=True, exist_ok=True)
