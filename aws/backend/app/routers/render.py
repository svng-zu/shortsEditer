# backend/app/routers/render.py
"""렌더링/미리보기 API"""

from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.responses import FileResponse

from app.config import settings
from app.models.schemas import (
    RenderRequest, PreviewRequest, EditRequest, PipelineStep
)
from app.services.editor import Editor
from app.routers.pipeline import pipeline_status, set_status

router = APIRouter()


async def _run_render(filename: str, title: str, subtitles: bool, template_id: int,
                      style: dict = None, bg_image: str = None):
    """백그라운드 렌더링 작업"""
    try:
        raw_path = settings.RAW_DIR / filename
        if not raw_path.exists():
            set_status(PipelineStep.ERROR, f"raw 파일 없음: {filename}", 0)
            return

        stem = filename.replace("_raw.mp4", "")
        analysis_path = settings.ANALYSIS_DIR / f"{stem}.json"
        if not analysis_path.exists():
            set_status(PipelineStep.ERROR, f"분석 파일 없음: {stem}.json", 0)
            return

        set_status(PipelineStep.EDITING, f"렌더링 중: {filename}", 10)
        editor = Editor(template_id=template_id)
        editor.apply_overlay(
            str(raw_path), str(analysis_path),
            title_override=title if title else None,
            subtitles=subtitles,
            style=style,
            bg_image=bg_image,
        )
        set_status(PipelineStep.DONE, f"렌더링 완료: {stem}_shorts.mp4", 100)
    except Exception as e:
        set_status(PipelineStep.ERROR, f"렌더링 오류: {e}", 0)


@router.post("/render")
async def render(req: RenderRequest, background_tasks: BackgroundTasks):
    """렌더링 시작"""
    if pipeline_status.step not in (PipelineStep.IDLE, PipelineStep.DONE, PipelineStep.ERROR):
        raise HTTPException(400, "파이프라인이 실행 중입니다.")
    background_tasks.add_task(
        _run_render, req.filename, req.title, req.subtitles, req.template_id,
        req.style.model_dump(), req.bg_image
    )
    return {"ok": True}


@router.post("/preview")
async def preview(req: PreviewRequest):
    """미리보기 이미지 생성"""
    raw_path = settings.RAW_DIR / req.filename
    if not raw_path.exists():
        raise HTTPException(404, f"raw 파일 없음: {req.filename}")

    stem = req.filename.replace("_raw.mp4", "")
    analysis_path = settings.ANALYSIS_DIR / f"{stem}.json"
    if not analysis_path.exists():
        raise HTTPException(404, f"분석 파일 없음: {stem}.json")

    editor = Editor()
    style = req.style.model_dump()
    png_path = editor.preview_frame(
        str(raw_path), str(analysis_path),
        title=req.title if req.title else None,
        style=style,
        seek=req.seek,
        bg_image=req.bg_image,
    )
    if not png_path:
        raise HTTPException(500, "미리보기 생성 실패")
    return FileResponse(png_path, media_type="image/png")


async def _run_rerender(template_id: int):
    """백그라운드 재렌더링 작업"""
    try:
        analyses = list(settings.ANALYSIS_DIR.glob("*.json"))
        if not analyses:
            set_status(PipelineStep.ERROR, "분석 결과가 없습니다.", 0)
            return

        raw_files = list(settings.RAW_DIR.glob("*.mp4"))
        if not raw_files:
            set_status(PipelineStep.ERROR, "raw 영상이 없습니다. 먼저 영상 편집을 실행하세요.", 0)
            return

        set_status(PipelineStep.EDITING, f"재렌더링 중 (총 {len(analyses)}개)...", 10)
        editor = Editor(template_id=template_id)
        for i, a in enumerate(analyses):
            set_status(PipelineStep.EDITING, f"재렌더링: {a.name}", int((i / len(analyses)) * 90))
            editor.rerender(str(a))

        shorts = list(settings.SHORTS_DIR.glob("*.mp4"))
        set_status(PipelineStep.DONE, f"재렌더링 완료 — 쇼츠 {len(shorts)}개", 100)
    except Exception as e:
        set_status(PipelineStep.ERROR, f"재렌더링 오류: {e}", 0)


@router.post("/rerender")
async def rerender(req: EditRequest, background_tasks: BackgroundTasks):
    """재렌더링 시작"""
    if pipeline_status.step not in (PipelineStep.IDLE, PipelineStep.DONE, PipelineStep.ERROR):
        raise HTTPException(400, "파이프라인이 실행 중입니다.")
    background_tasks.add_task(_run_rerender, req.template_id)
    return {"ok": True}
