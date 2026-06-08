# backend/app/main.py
"""FastAPI 진입점 - AWS 클라우드 배포용"""

import time

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy import text
from sqlalchemy.exc import OperationalError

from app.config import settings
from app.db import Base, engine
from app.models import user  # noqa: F401  (Base.metadata에 테이블 등록)
from app.routers import auth, pipeline, shorts, render, youtube

app = FastAPI(
    title="고릴라AI API",
    description="YouTube 쇼츠 자동 생성 파이프라인 API",
    version="2.0.0"
)


def _migrate_db():
    """create_all이 손대지 못하는 기존 테이블의 컬럼 추가 (idempotent)"""
    with engine.begin() as conn:
        conn.execute(text(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE"
        ))
        conn.execute(text(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token VARCHAR"
        ))
        conn.execute(text(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expires_at TIMESTAMP"
        ))


@app.on_event("startup")
async def init_db():
    """PostgreSQL 기동을 기다렸다가 테이블 생성 (컴포즈 기동 순서상 재시도 필요)"""
    for attempt in range(10):
        try:
            Base.metadata.create_all(bind=engine)
            _migrate_db()
            return
        except OperationalError:
            time.sleep(3)
    Base.metadata.create_all(bind=engine)
    _migrate_db()

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 라우터 등록
app.include_router(auth.router, prefix="/api", tags=["Auth"])
app.include_router(pipeline.router, prefix="/api", tags=["Pipeline"])
app.include_router(shorts.router, prefix="/api", tags=["Shorts"])
app.include_router(render.router, prefix="/api", tags=["Render"])
app.include_router(youtube.router, prefix="/api", tags=["YouTube"])

# 정적 파일 서빙 (shorts/raw는 세션별 동적 서빙으로 대체)
app.mount("/static", StaticFiles(directory=str(settings.STATIC_DIR)), name="static")


@app.get("/")
async def root():
    """프론트엔드 SPA 진입점"""
    return FileResponse(str(settings.STATIC_DIR / "index.html"))


@app.get("/health")
async def health_check():
    """헬스체크 엔드포인트"""
    return {"status": "healthy", "version": "2.0.0"}
