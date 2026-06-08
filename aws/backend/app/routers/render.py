# backend/app/routers/render.py
"""렌더링/미리보기 API"""

import asyncio
import os
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import FileResponse

from app.session import get_session, make_session, SessionDirs
from app.models.schemas import RenderRequest, PreviewRequest, EditRequest, PipelineStep
from app.services.editor import Editor
from app.services.s3_manager import get_s3
from app.routers.pipeline import get_session_status, set_status

router = APIRouter()


async def _run_render(session_id: str, filename: str, title: str, subtitles: bool,
                      template_id: int, style: dict = None, bg_image: str = None,
                      narration: bool = False, narration_voice: str = "female"):
    s = make_session(session_id)
    try:
        raw_path = s.raw_dir / filename
        if not raw_path.exists():
            set_status(session_id, PipelineStep.ERROR, f"raw 파일 없음: {filename}", 0)
            return

        stem = filename.replace("_raw.mp4", "")
        analysis_path = s.analysis_dir / f"{stem}.json"
        if not analysis_path.exists():
            set_status(session_id, PipelineStep.ERROR, f"분석 파일 없음: {stem}.json", 0)
            return

        set_status(session_id, PipelineStep.EDITING, f"렌더링 중: {filename}", 10)
        editor = Editor(template_id=template_id, session_dirs=s)
        shorts_path = await asyncio.to_thread(
            editor.apply_overlay,
            str(raw_path), str(analysis_path),
            title_override=title if title else None,
            subtitles=subtitles,
            style=style,
            bg_image=bg_image,
            narration=narration,
            narration_voice=narration_voice,
        )
        if shorts_path and os.path.exists(shorts_path):
            get_s3().upload(shorts_path, s.s3_key("shorts", os.path.basename(shorts_path)))
        set_status(session_id, PipelineStep.DONE, f"렌더링 완료: {stem}_shorts.mp4", 100)
    except Exception as e:
        set_status(session_id, PipelineStep.ERROR, f"렌더링 오류: {e}", 0)


@router.post("/render")
async def render(req: RenderRequest, background_tasks: BackgroundTasks,
                 session: SessionDirs = Depends(get_session)):
    status = get_session_status(session.session_id)
    if status.step in (PipelineStep.COLLECTING, PipelineStep.TRANSCRIBING, PipelineStep.ANALYZING):
        raise HTTPException(400, "파이프라인이 실행 중입니다. 분석 완료 후 렌더링하세요.")
    background_tasks.add_task(
        _run_render, session.session_id, req.filename, req.title,
        req.subtitles, req.template_id, req.style.model_dump(), req.bg_image,
        req.narration, req.narration_voice,
    )
    return {"ok": True}


@router.post("/preview")
async def preview(req: PreviewRequest, session: SessionDirs = Depends(get_session)):
    raw_path = session.raw_dir / req.filename
    if not raw_path.exists():
        raise HTTPException(404, f"raw 파일 없음: {req.filename}")

    stem = req.filename.replace("_raw.mp4", "")
    analysis_path = session.analysis_dir / f"{stem}.json"
    if not analysis_path.exists():
        raise HTTPException(404, f"분석 파일 없음: {stem}.json")

    editor = Editor(session_dirs=session)
    style = req.style.model_dump()
    png_path = await asyncio.to_thread(
        editor.preview_frame,
        str(raw_path), str(analysis_path),
        title=req.title if req.title else None,
        style=style,
        seek=req.seek,
        bg_image=req.bg_image,
    )
    if not png_path:
        raise HTTPException(500, "미리보기 생성 실패")
    return FileResponse(png_path, media_type="image/png")


async def _run_rerender(session_id: str, template_id: int):
    s = make_session(session_id)
    try:
        analyses = list(s.analysis_dir.glob("*.json"))
        if not analyses:
            set_status(session_id, PipelineStep.ERROR, "분석 결과가 없습니다.", 0)
            return

        raw_files = list(s.raw_dir.glob("*.mp4"))
        if not raw_files:
            set_status(session_id, PipelineStep.ERROR, "raw 영상이 없습니다.", 0)
            return

        set_status(session_id, PipelineStep.EDITING, f"재렌더링 중 (총 {len(analyses)}개)...", 10)
        editor = Editor(template_id=template_id, session_dirs=s)
        s3 = get_s3()
        for i, a in enumerate(analyses):
            set_status(session_id, PipelineStep.EDITING, f"재렌더링: {a.name}",
                       int((i / len(analyses)) * 90))
            shorts_path = await asyncio.to_thread(editor.rerender, str(a))
            if shorts_path and os.path.exists(shorts_path):
                s3.upload(shorts_path, s.s3_key("shorts", os.path.basename(shorts_path)))

        shorts = list(s.shorts_dir.glob("*.mp4"))
        set_status(session_id, PipelineStep.DONE, f"재렌더링 완료 — 쇼츠 {len(shorts)}개", 100)
    except Exception as e:
        set_status(session_id, PipelineStep.ERROR, f"재렌더링 오류: {e}", 0)


@router.post("/rerender")
async def rerender(req: EditRequest, background_tasks: BackgroundTasks,
                   session: SessionDirs = Depends(get_session)):
    status = get_session_status(session.session_id)
    if status.step not in (PipelineStep.IDLE, PipelineStep.DONE, PipelineStep.ERROR):
        raise HTTPException(400, "파이프라인이 실행 중입니다.")
    background_tasks.add_task(_run_rerender, session.session_id, req.template_id)
    return {"ok": True}
