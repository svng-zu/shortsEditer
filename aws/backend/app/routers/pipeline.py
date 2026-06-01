# backend/app/routers/pipeline.py
"""수집/자막/분석 파이프라인 API"""

import json
from pathlib import Path
from fastapi import APIRouter, BackgroundTasks, HTTPException

from app.config import settings
from app.models.schemas import (
    CollectRequest, EditRequest, PipelineStatus, PipelineStep
)
from app.services.collector import YoutubeCollector
from app.services.transcriber import Transcriber
from app.services.analyzer import Analyzer
from app.services.editor import Editor

router = APIRouter()

# 파이프라인 상태 관리
pipeline_status = PipelineStatus()

CATEGORY_MAP_PATH = settings.ANALYSIS_DIR.parent / "category_map.json"


def set_status(step: PipelineStep, message: str, progress: int = 0):
    """파이프라인 상태 업데이트"""
    pipeline_status.step = step
    pipeline_status.message = message
    pipeline_status.progress = progress
    print(f"[{step.value.upper()}] {message}")


def load_category_map() -> dict:
    """카테고리 맵 로드"""
    if not CATEGORY_MAP_PATH.exists():
        return {}
    return json.loads(CATEGORY_MAP_PATH.read_text(encoding="utf-8"))


def save_category_map(mapping: dict):
    """카테고리 맵 저장"""
    simplified = {
        Path(p).stem: cat
        for p, cat in mapping.items()
    }
    CATEGORY_MAP_PATH.write_text(
        json.dumps(simplified, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )


def clear_pipeline_files():
    """파이프라인 파일 초기화"""
    for d, ext in [
        (settings.DOWNLOAD_DIR, ".mp4"),
        (settings.TRANSCRIPT_DIR, ".json"),
        (settings.ANALYSIS_DIR, ".json"),
        (settings.SHORTS_DIR, ".mp4"),
        (settings.RAW_DIR, ".mp4"),
        (settings.RAW_DIR, ".srt"),
    ]:
        for f in d.glob(f"*{ext}"):
            f.unlink()
    if CATEGORY_MAP_PATH.exists():
        CATEGORY_MAP_PATH.unlink()


@router.get("/status")
async def get_status():
    """현재 파이프라인 상태 조회"""
    return pipeline_status


@router.get("/files")
async def list_files():
    """모든 파일 목록 조회"""
    return {
        "downloads": [f.stem for f in sorted(settings.DOWNLOAD_DIR.glob("*.mp4"))],
        "videos": [f.stem.replace("_raw", "") for f in sorted(settings.RAW_DIR.glob("*.mp4"))],
        "transcripts": [f.stem for f in sorted(settings.TRANSCRIPT_DIR.glob("*.json"))],
        "analyses": [f.stem for f in sorted(settings.ANALYSIS_DIR.glob("*.json"))],
        "shorts": [f.stem.replace("_shorts", "") for f in sorted(settings.SHORTS_DIR.glob("*.mp4"))],
    }


# ── 1. 수집 ─────────────────────────────────────────────────────

async def _run_collect(clear_existing: bool):
    """백그라운드 수집 작업"""
    try:
        if clear_existing:
            set_status(PipelineStep.COLLECTING, "기존 파일 삭제 중...", 5)
            clear_pipeline_files()

        set_status(PipelineStep.COLLECTING, "유튜브 채널 수집 중...", 15)
        collector = YoutubeCollector()
        results = collector.run()

        video_paths = {v["filepath"]: v["category"] for v in results if "filepath" in v}
        save_category_map(video_paths)

        set_status(PipelineStep.IDLE, f"수집 완료 — 영상 {len(results)}개", 100)
    except Exception as e:
        set_status(PipelineStep.ERROR, f"수집 오류: {e}", 0)


@router.post("/collect")
async def collect(req: CollectRequest, background_tasks: BackgroundTasks):
    """영상 수집 시작"""
    if pipeline_status.step not in (PipelineStep.IDLE, PipelineStep.DONE, PipelineStep.ERROR):
        raise HTTPException(400, "파이프라인이 실행 중입니다.")
    background_tasks.add_task(_run_collect, req.clear_existing)
    return {"ok": True}


# ── 2. 자막 생성 ────────────────────────────────────────────────

async def _run_transcribe():
    """백그라운드 자막 생성 작업 (AWS Transcribe 사용)"""
    try:
        all_videos = list(settings.DOWNLOAD_DIR.glob("*.mp4"))
        if not all_videos:
            set_status(PipelineStep.ERROR, "다운로드된 영상이 없습니다.", 0)
            return

        videos = [
            v for v in all_videos
            if not (settings.TRANSCRIPT_DIR / f"{v.stem}.json").exists()
        ]
        if not videos:
            set_status(PipelineStep.IDLE, f"모든 자막이 이미 있습니다 ({len(all_videos)}개)", 100)
            return

        set_status(PipelineStep.TRANSCRIBING, f"AWS Transcribe 실행 중 ({len(videos)}/{len(all_videos)}개)...", 10)
        transcriber = Transcriber()
        for i, v in enumerate(videos):
            set_status(PipelineStep.TRANSCRIBING, f"자막 생성 중: {v.name}", int(10 + (i / len(videos)) * 85))
            transcriber.transcribe(str(v))

        set_status(PipelineStep.IDLE, f"자막 생성 완료 — {len(videos)}개", 100)
    except Exception as e:
        set_status(PipelineStep.ERROR, f"자막 오류: {e}", 0)


@router.post("/transcribe")
async def transcribe(background_tasks: BackgroundTasks):
    """자막 생성 시작"""
    if pipeline_status.step not in (PipelineStep.IDLE, PipelineStep.DONE, PipelineStep.ERROR):
        raise HTTPException(400, "파이프라인이 실행 중입니다.")
    background_tasks.add_task(_run_transcribe)
    return {"ok": True}


# ── 3. LLM 분석 ─────────────────────────────────────────────────

async def _run_analyze():
    """백그라운드 LLM 분석 작업 (AWS Bedrock Claude 사용)"""
    try:
        transcripts = list(settings.TRANSCRIPT_DIR.glob("*.json"))
        if not transcripts:
            set_status(PipelineStep.ERROR, "자막 파일이 없습니다.", 0)
            return

        saved_cats = load_category_map()
        category_map = {
            str(t): saved_cats.get(t.stem, "economy")
            for t in transcripts
        }

        set_status(PipelineStep.ANALYZING, f"LLM 분석 중 (총 {len(transcripts)}개)...", 10)
        analyzer = Analyzer()
        for i, t in enumerate(transcripts):
            set_status(PipelineStep.ANALYZING, f"분석 중: {t.name}", int((i / len(transcripts)) * 90))
            analyzer.analyze(str(t), category_map[str(t)])

        set_status(PipelineStep.IDLE, f"분석 완료 — {len(transcripts)}개", 100)
    except Exception as e:
        set_status(PipelineStep.ERROR, f"분석 오류: {e}", 0)


@router.post("/analyze")
async def analyze(background_tasks: BackgroundTasks):
    """LLM 분석 시작"""
    if pipeline_status.step not in (PipelineStep.IDLE, PipelineStep.DONE, PipelineStep.ERROR):
        raise HTTPException(400, "파이프라인이 실행 중입니다.")
    background_tasks.add_task(_run_analyze)
    return {"ok": True}


# ── 4. 영상 편집 ────────────────────────────────────────────────

async def _run_edit(template_id: int):
    """백그라운드 영상 편집 작업"""
    try:
        analyses = list(settings.ANALYSIS_DIR.glob("*.json"))
        if not analyses:
            set_status(PipelineStep.ERROR, "분석 결과가 없습니다.", 0)
            return

        set_status(PipelineStep.EDITING, f"영상 편집 중 (총 {len(analyses)}개)...", 10)
        editor = Editor(template_id=template_id)
        for i, a in enumerate(analyses):
            set_status(PipelineStep.EDITING, f"영상 편집: {a.name}", int((i / len(analyses)) * 90))
            editor.edit_video(str(a))

        raws = list(settings.RAW_DIR.glob("*.mp4"))
        set_status(PipelineStep.DONE, f"영상 편집 완료 — raw {len(raws)}개 생성", 100)
    except Exception as e:
        set_status(PipelineStep.ERROR, f"편집 오류: {e}", 0)


@router.post("/edit")
async def edit(req: EditRequest, background_tasks: BackgroundTasks):
    """영상 편집 시작"""
    if pipeline_status.step not in (PipelineStep.IDLE, PipelineStep.DONE, PipelineStep.ERROR):
        raise HTTPException(400, "파이프라인이 실행 중입니다.")
    background_tasks.add_task(_run_edit, req.template_id)
    return {"ok": True}
