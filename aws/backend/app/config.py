# backend/app/config.py
import os
from pathlib import Path
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # App
    APP_NAME: str = "ShortsAI"
    DEBUG: bool = False

    # AWS
    AWS_REGION: str = "us-east-1"
    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""

    # AWS Bedrock
    BEDROCK_MODEL_ID: str = "anthropic.claude-3-sonnet-20240229-v1:0"

    # AWS Transcribe
    TRANSCRIBE_LANGUAGE_CODE: str = "ko-KR"
    S3_BUCKET_NAME: str = ""

    # Paths
    BASE_DIR: Path = Path(__file__).parent.parent.parent
    DOWNLOAD_DIR: Path = BASE_DIR / "data" / "downloads"
    TRANSCRIPT_DIR: Path = BASE_DIR / "data" / "transcripts"
    ANALYSIS_DIR: Path = BASE_DIR / "data" / "analysis"
    SHORTS_DIR: Path = BASE_DIR / "data" / "shorts"
    RAW_DIR: Path = BASE_DIR / "data" / "raw"
    STATIC_DIR: Path = BASE_DIR / "static"

    # CORS
    CORS_ORIGINS: list = ["http://localhost:5173", "http://localhost:3000"]

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    return Settings()


# Create directories on import
settings = get_settings()
for d in [settings.DOWNLOAD_DIR, settings.TRANSCRIPT_DIR,
          settings.ANALYSIS_DIR, settings.SHORTS_DIR, settings.RAW_DIR]:
    d.mkdir(parents=True, exist_ok=True)
