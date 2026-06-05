# backend/app/config.py
import os
from pathlib import Path
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # App
    APP_NAME: str = "ShortsAI"
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

    # Whisper
    WHISPER_MODEL: str = "medium"
    WHISPER_LANGUAGE: str = "ko"

    # Paths
    BASE_DIR: Path = Path(__file__).parent.parent
    DOWNLOAD_DIR: Path = BASE_DIR / "data" / "downloads"
    TRANSCRIPT_DIR: Path = BASE_DIR / "data" / "transcripts"
    ANALYSIS_DIR: Path = BASE_DIR / "data" / "analysis"
    SHORTS_DIR: Path = BASE_DIR / "data" / "shorts"
    RAW_DIR: Path = BASE_DIR / "data" / "raw"
    STATIC_DIR: Path = BASE_DIR / "static"

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
          settings.STATIC_DIR]:
    d.mkdir(parents=True, exist_ok=True)
