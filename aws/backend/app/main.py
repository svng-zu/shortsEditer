# backend/app/main.py
"""FastAPI 진입점 - AWS 클라우드 배포용"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from app.config import settings
from app.routers import pipeline, shorts, render, youtube

app = FastAPI(
    title="ShortsAI API",
    description="YouTube 쇼츠 자동 생성 파이프라인 API",
    version="2.0.0"
)

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 라우터 등록
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
