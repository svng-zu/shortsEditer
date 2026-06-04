# app.py — FastAPI 백엔드
# 실행: uvicorn app:app --reload --port 8000

import sys
import os

# MediaPipe / TFLite / gRPC verbose 로그 억제 (import 전에 설정해야 효과 있음)
os.environ.setdefault("GLOG_minloglevel", "3")
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")
os.environ.setdefault("GRPC_VERBOSITY", "ERROR")
os.environ.setdefault("MEDIAPIPE_DISABLE_GPU", "1")

# local 디렉토리를 Python 경로에 추가
LOCAL_DIR = os.path.dirname(os.path.abspath(__file__))
if LOCAL_DIR not in sys.path:
    sys.path.insert(0, LOCAL_DIR)
import json
import shutil
import threading
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

# ── 경로 ──────────────────────────────────────────────────────
LOCAL_DIR      = Path(__file__).parent          # local/
DOWNLOAD_DIR   = LOCAL_DIR / "downloads"
TRANSCRIPT_DIR = LOCAL_DIR / "outputs" / "transcripts"
ANALYSIS_DIR   = LOCAL_DIR / "outputs" / "analysis"
SHORTS_DIR     = LOCAL_DIR / "outputs" / "shorts"
RAW_DIR        = LOCAL_DIR / "outputs" / "raw"
TEMP_DIR       = LOCAL_DIR / "temp"
STATIC_DIR     = LOCAL_DIR / "static"           # local/static (배경, 로고)
CATEGORY_MAP_PATH = LOCAL_DIR / "outputs" / "category_map.json"

for d in [DOWNLOAD_DIR, TRANSCRIPT_DIR, ANALYSIS_DIR, SHORTS_DIR, RAW_DIR, TEMP_DIR, STATIC_DIR]:
    d.mkdir(parents=True, exist_ok=True)

# ── 파이프라인 임포트 ─────────────────────────────────────────
from collector.youtube_collector import YoutubeCollector
from transcriber.transcriber     import Transcriber
from llm.analyzer                import Analyzer
from editor.editor               import Editor

app = FastAPI(title="Shorts Generator")
app.mount("/shorts", StaticFiles(directory=str(SHORTS_DIR)), name="shorts")
app.mount("/raw",    StaticFiles(directory=str(RAW_DIR)),    name="raw")
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

# ── 진행 상태 관리 ────────────────────────────────────────────
import time

pipeline_status = {
    "step":     "idle",   # idle | collecting | transcribing | analyzing | editing | done | error | paused
    "message":  "",
    "progress": 0,        # 0~100
    "paused":   False,
    "current_item": "",   # 현재 처리 중인 항목
    "total_items": 0,
    "done_items": 0,
}

def set_status(step, message, progress=0, current_item="", total_items=0, done_items=0):
    pipeline_status["step"]     = step
    pipeline_status["message"]  = message
    pipeline_status["progress"] = progress
    if current_item:
        pipeline_status["current_item"] = current_item
    if total_items:
        pipeline_status["total_items"] = total_items
    if done_items is not None:
        pipeline_status["done_items"] = done_items
    print(f"[{step.upper()}] {message}")

def check_paused():
    """일시 중지 상태면 대기, 재개되면 계속 진행"""
    while pipeline_status["paused"]:
        time.sleep(0.5)

# ── 헬퍼 ─────────────────────────────────────────────────────
def load_category_map() -> dict:
    if not CATEGORY_MAP_PATH.exists():
        return {}
    return json.loads(CATEGORY_MAP_PATH.read_text(encoding="utf-8"))

def save_category_map(mapping: dict):
    simplified = {
        Path(p).stem: cat
        for p, cat in mapping.items()
    }
    CATEGORY_MAP_PATH.write_text(
        json.dumps(simplified, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )

def archive_shorts():
    """완성된 shorts를 날짜 폴더로 이동"""
    shorts = list(SHORTS_DIR.glob("*.mp4"))
    if not shorts:
        return
    archive_dir = LOCAL_DIR / "outputs" / "archive" / datetime.now().strftime("%Y%m%d")
    archive_dir.mkdir(parents=True, exist_ok=True)
    for f in shorts:
        shutil.move(str(f), str(archive_dir / f.name))
    print(f"[Archive] {len(shorts)}개 → {archive_dir.name}/")

def clear_pipeline_files():
    """새 수집 전 완성본 보관 후 기존 파일 전부 삭제"""
    archive_shorts()
    for d, ext in [
        (DOWNLOAD_DIR,   ".mp4"),
        (TRANSCRIPT_DIR, ".json"),
        (ANALYSIS_DIR,   ".json"),
        (SHORTS_DIR,     ".mp4"),
        (RAW_DIR,        ".mp4"),
        (RAW_DIR,        ".srt"),
    ]:
        for f in d.glob(f"*{ext}"):
            f.unlink()
    if CATEGORY_MAP_PATH.exists():
        CATEGORY_MAP_PATH.unlink()

def get_shorts_list():
    shorts = []
    for mp4 in sorted(SHORTS_DIR.glob("*.mp4")):
        stem = mp4.stem.replace("_shorts", "")
        # 분석 JSON에서 메타 가져오기
        analysis_file = ANALYSIS_DIR / f"{stem}.json"
        meta = {}
        if analysis_file.exists():
            meta = json.loads(analysis_file.read_text(encoding="utf-8"))

        shorts.append({
            "filename":   mp4.name,
            "url":        f"/shorts/{mp4.name}",
            "title":      meta.get("intro_text", mp4.stem).replace("\\n", " "),

            "category":   meta.get("category", ""),
            "candidates": meta.get("candidates", []),
        })
    return shorts

# ── API 엔드포인트 ────────────────────────────────────────────

@app.get("/")
def index():
    return FileResponse(str(STATIC_DIR / "index.html"))

@app.get("/api/status")
def get_status():
    return pipeline_status

@app.post("/api/pause")
def pause_pipeline():
    if pipeline_status["step"] in ("idle", "done", "error"):
        raise HTTPException(400, "실행 중인 작업이 없습니다.")
    pipeline_status["paused"] = True
    pipeline_status["message"] = "일시 중지됨"
    print("[PAUSE] 파이프라인 일시 중지")
    return {"ok": True, "paused": True}

@app.post("/api/resume")
def resume_pipeline():
    if not pipeline_status["paused"]:
        raise HTTPException(400, "일시 중지 상태가 아닙니다.")
    pipeline_status["paused"] = False
    pipeline_status["message"] = "재개됨"
    print("[RESUME] 파이프라인 재개")
    return {"ok": True, "paused": False}

@app.get("/api/shorts")
def list_shorts():
    return {"shorts": get_shorts_list()}

@app.get("/api/files")
def list_files():
    return {
        "downloads":  [f.stem for f in sorted(DOWNLOAD_DIR.glob("*.mp4"))],
        "videos":     [f.stem.replace("_raw", "") for f in sorted(RAW_DIR.glob("*.mp4"))],
        "transcripts":[f.stem for f in sorted(TRANSCRIPT_DIR.glob("*.json"))],
        "analyses":   [f.stem for f in sorted(ANALYSIS_DIR.glob("*.json"))],
        "shorts":     [f.stem.replace("_shorts", "") for f in sorted(SHORTS_DIR.glob("*.mp4"))],
    }

# ── 1. 수집 ──────────────────────────────────────────────────
class CollectRequest(BaseModel):
    clear_existing: bool = True

def _run_collect(clear_existing: bool):
    try:
        if clear_existing:
            set_status("collecting", "기존 파일 삭제 중...", 5)
            clear_pipeline_files()

        set_status("collecting", "유튜브 채널 수집 중...", 15)
        collector = YoutubeCollector()
        results = collector.run()

        video_paths = {v["filepath"]: v["category"] for v in results if "filepath" in v}
        save_category_map(video_paths)

        set_status("idle", f"수집 완료 — 영상 {len(results)}개", 100)
    except Exception as e:
        set_status("error", f"수집 오류: {e}", 0)

@app.post("/api/collect")
def collect(req: CollectRequest, background_tasks: BackgroundTasks):
    if pipeline_status["step"] not in ("idle", "done", "error"):
        raise HTTPException(400, "파이프라인이 실행 중입니다.")
    background_tasks.add_task(_run_collect, req.clear_existing)
    return {"ok": True}

# ── 2. 자막 생성 ──────────────────────────────────────────────
def _run_transcribe():
    try:
        all_videos = list(DOWNLOAD_DIR.glob("*.mp4"))
        if not all_videos:
            set_status("error", "다운로드된 영상이 없습니다.", 0)
            return

        # 이미 자막이 있는 파일 건너뜀
        videos = [
            v for v in all_videos
            if not (TRANSCRIPT_DIR / f"{v.stem}.json").exists()
        ]
        if not videos:
            set_status("idle", f"모든 자막이 이미 있습니다 ({len(all_videos)}개)", 100)
            return

        set_status("transcribing", f"Whisper 실행 중 ({len(videos)}/{len(all_videos)}개)...", 10,
                   total_items=len(videos), done_items=0)
        transcriber = Transcriber()
        for i, v in enumerate(videos):
            check_paused()  # 일시 중지 확인
            set_status("transcribing", f"자막 생성 중: {v.name}", int(10 + (i / len(videos)) * 85),
                       current_item=v.name, done_items=i)
            transcriber.transcribe(str(v))

        set_status("idle", f"자막 생성 완료 — {len(videos)}개", 100, done_items=len(videos))
    except Exception as e:
        set_status("error", f"자막 오류: {e}", 0)

@app.post("/api/transcribe")
def transcribe(background_tasks: BackgroundTasks):
    if pipeline_status["step"] not in ("idle", "done", "error"):
        raise HTTPException(400, "파이프라인이 실행 중입니다.")
    background_tasks.add_task(_run_transcribe)
    return {"ok": True}

# ── 3. LLM 분석 ───────────────────────────────────────────────
def _run_analyze():
    try:
        transcripts = list(TRANSCRIPT_DIR.glob("*.json"))
        if not transcripts:
            set_status("error", "자막 파일이 없습니다.", 0)
            return

        saved_cats = load_category_map()
        category_map = {
            str(t): saved_cats.get(t.stem, "economy")
            for t in transcripts
        }

        set_status("analyzing", f"LLM 분석 중 (총 {len(transcripts)}개)...", 10,
                   total_items=len(transcripts), done_items=0)
        analyzer = Analyzer()
        for i, t in enumerate(transcripts):
            check_paused()  # 일시 중지 확인
            set_status("analyzing", f"분석 중: {t.name}", int((i / len(transcripts)) * 90),
                       current_item=t.name, done_items=i)
            analyzer.analyze(str(t), category_map[str(t)])

        set_status("idle", f"분석 완료 — {len(transcripts)}개", 100, done_items=len(transcripts))
        _run_edit_video(template_id=1)
    except Exception as e:
        set_status("error", f"분석 오류: {e}", 0)

@app.post("/api/analyze")
def analyze(background_tasks: BackgroundTasks):
    if pipeline_status["step"] not in ("idle", "done", "error"):
        raise HTTPException(400, "파이프라인이 실행 중입니다.")
    background_tasks.add_task(_run_analyze)
    return {"ok": True}

# ── 배경 이미지 목록 ──────────────────────────────────────────
BACKGROUNDS_DIR = STATIC_DIR / "backgrounds"
BACKGROUNDS_DIR.mkdir(parents=True, exist_ok=True)

@app.get("/api/backgrounds")
def list_backgrounds():
    images = sorted(p.stem for p in BACKGROUNDS_DIR.glob("*.png"))
    return {"backgrounds": images}

# ── 스타일 파라미터 ───────────────────────────────────────────
class StyleParams(BaseModel):
    title1_color:        str   = "#FFD700"
    title2_color:        str   = "#FFFFFF"
    title_y_extra:       int   = 0         # 기본 위치에서 추가 오프셋(px)
    title_fontsize_scale: float = 1.0
    sub_fontsize:        int   = 28
    sub_color:           str   = "#FFFFFF"
    sub_margin_v:        int   = 20        # 하단 여백(px)

# ── 4. 영상 편집 (Stage 1만) ──────────────────────────────────
class EditRequest(BaseModel):
    template_id: int = 1   # 1~3

def _run_edit_video(template_id: int):
    try:
        analyses = list(ANALYSIS_DIR.glob("*.json"))
        if not analyses:
            set_status("error", "분석 결과가 없습니다.", 0)
            return

        set_status("editing", f"영상 편집 중 (총 {len(analyses)}개)...", 10,
                   total_items=len(analyses), done_items=0)
        editor = Editor(template_id=template_id)
        for i, a in enumerate(analyses):
            check_paused()  # 일시 중지 확인
            set_status("editing", f"영상 편집: {a.name}", int((i / len(analyses)) * 90),
                       current_item=a.name, done_items=i)
            # Stage 1만: raw 영상 생성 (크롭/편집)
            editor.edit_video(str(a))

        raws = list(RAW_DIR.glob("*.mp4"))
        set_status("done", f"영상 편집 완료 — raw {len(raws)}개 생성", 100, done_items=len(analyses))
    except Exception as e:
        set_status("error", f"편집 오류: {e}", 0)

@app.post("/api/edit")
def edit(req: EditRequest, background_tasks: BackgroundTasks):
    if pipeline_status["step"] not in ("idle", "done", "error"):
        raise HTTPException(400, "파이프라인이 실행 중입니다.")
    background_tasks.add_task(_run_edit_video, req.template_id)
    return {"ok": True}

# ── 4-2. raw 영상 목록 ─────────────────────────────────────────
@app.get("/api/raws")
def list_raws():
    raws = []
    for mp4 in sorted(RAW_DIR.glob("*.mp4")):
        stem = mp4.stem.replace("_raw", "")
        analysis_file = ANALYSIS_DIR / f"{stem}.json"
        meta = {}
        if analysis_file.exists():
            meta = json.loads(analysis_file.read_text(encoding="utf-8"))
        raws.append({
            "filename": mp4.name,
            "url":      f"/raw/{mp4.name}",
            "title":    meta.get("intro_text", stem).replace("\\n", " / "),
            "category": meta.get("category", ""),
        })
    return {"raws": raws}

# ── 4-3. 렌더링 (Stage 2: 배경+제목+자막 합성) ────────────────
class RenderRequest(BaseModel):
    filename:    str
    title:       str = ""
    subtitles:   bool = False
    template_id: int = 1
    style:       StyleParams = StyleParams()
    bg_image:    Optional[str] = None   # None = 카테고리 자동, "sports" 등 지정 가능

class PreviewRequest(BaseModel):
    filename:    str
    title:       str = ""
    style:       StyleParams = StyleParams()
    seek:        float = 2.0
    bg_image:    Optional[str] = None

def _run_render(filename: str, title: str, subtitles: bool, template_id: int,
                style: dict = None, bg_image: str = None):
    try:
        raw_path = RAW_DIR / filename
        if not raw_path.exists():
            set_status("error", f"raw 파일 없음: {filename}", 0)
            return

        stem          = filename.replace("_raw.mp4", "")
        analysis_path = ANALYSIS_DIR / f"{stem}.json"
        if not analysis_path.exists():
            set_status("error", f"분석 파일 없음: {stem}.json", 0)
            return

        set_status("editing", f"렌더링 중: {filename}", 10)
        editor = Editor(template_id=template_id)
        editor.apply_overlay(
            str(raw_path), str(analysis_path),
            title_override=title if title else None,
            subtitles=subtitles,
            style=style,
            bg_image=bg_image,
        )
        set_status("done", f"렌더링 완료: {stem}_shorts.mp4", 100)
    except Exception as e:
        set_status("error", f"렌더링 오류: {e}", 0)

@app.post("/api/render")
def render(req: RenderRequest, background_tasks: BackgroundTasks):
    if pipeline_status["step"] not in ("idle", "done", "error"):
        raise HTTPException(400, "파이프라인이 실행 중입니다.")
    background_tasks.add_task(
        _run_render, req.filename, req.title, req.subtitles, req.template_id,
        req.style.dict(), req.bg_image
    )
    return {"ok": True}

# ── 미리보기 (1-프레임 PNG) ────────────────────────────────────
@app.post("/api/preview")
def preview(req: PreviewRequest):
    raw_path = RAW_DIR / req.filename
    if not raw_path.exists():
        raise HTTPException(404, f"raw 파일 없음: {req.filename}")
    stem          = req.filename.replace("_raw.mp4", "")
    analysis_path = ANALYSIS_DIR / f"{stem}.json"
    if not analysis_path.exists():
        raise HTTPException(404, f"분석 파일 없음: {stem}.json")

    editor    = Editor()
    style     = req.style.dict()
    png_path  = editor.preview_frame(
        str(raw_path), str(analysis_path),
        title=req.title if req.title else None,
        style=style,
        seek=req.seek,
        bg_image=req.bg_image,
    )
    if not png_path:
        raise HTTPException(500, "미리보기 생성 실패")
    return FileResponse(png_path, media_type="image/png")

# ── 제목 수정 ─────────────────────────────────────────────────
class UpdateTitleRequest(BaseModel):
    filename: str   # 쇼츠 파일명 (예: xxx_shorts.mp4)
    intro_text: str

@app.post("/api/update-title")
def update_title(req: UpdateTitleRequest):
    # 쇼츠 파일명 → analysis JSON 파일명 역산
    # xxx_shorts.mp4 → xxx.json
    stem = req.filename.replace("_shorts.mp4", "")
    analysis_path = ANALYSIS_DIR / f"{stem}.json"

    if not analysis_path.exists():
        raise HTTPException(404, f"분석 파일 없음: {stem}.json")

    data = json.loads(analysis_path.read_text(encoding="utf-8"))
    data["intro_text"] = req.intro_text.strip()
    analysis_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"[Title] {stem} → '{req.intro_text.strip()}'")
    return {"ok": True}

# ── 5. 재렌더링 (배경/제목만 재적용, 영상 편집 생략) ────────────
def _run_rerender(template_id: int):
    try:
        analyses = list(ANALYSIS_DIR.glob("*.json"))
        if not analyses:
            set_status("error", "분석 결과가 없습니다.", 0)
            return

        raw_files = list(RAW_DIR.glob("*.mp4"))
        if not raw_files:
            set_status("error", "raw 영상이 없습니다. 먼저 영상 편집을 실행하세요.", 0)
            return

        set_status("editing", f"재렌더링 중 (총 {len(analyses)}개)...", 10)
        editor = Editor(template_id=template_id)
        for i, a in enumerate(analyses):
            set_status("editing", f"재렌더링: {a.name}", int((i / len(analyses)) * 90))
            editor.rerender(str(a))

        shorts = list(SHORTS_DIR.glob("*.mp4"))
        set_status("done", f"재렌더링 완료 — 쇼츠 {len(shorts)}개", 100)
    except Exception as e:
        set_status("error", f"재렌더링 오류: {e}", 0)

@app.post("/api/rerender")
def rerender(req: EditRequest, background_tasks: BackgroundTasks):
    if pipeline_status["step"] not in ("idle", "done", "error"):
        raise HTTPException(400, "파이프라인이 실행 중입니다.")
    background_tasks.add_task(_run_rerender, req.template_id)
    return {"ok": True}

# ── 삭제 ──────────────────────────────────────────────────────
@app.delete("/api/shorts/{filename}")
def delete_short(filename: str):
    path = SHORTS_DIR / filename
    if not path.exists():
        raise HTTPException(404, "파일 없음")
    path.unlink()
    return {"ok": True}

# ── 자막(SRT) 조회/저장 ───────────────────────────────────────
def _parse_srt(srt_path: Path) -> list:
    blocks = srt_path.read_text(encoding="utf-8").strip().split("\n\n")
    entries = []
    for block in blocks:
        lines = block.strip().splitlines()
        if len(lines) >= 3:
            entries.append({
                "index": lines[0].strip(),
                "times": lines[1].strip(),
                "text":  "\n".join(lines[2:]),
            })
    return entries

def _write_srt(entries: list, srt_path: Path):
    content = ""
    for e in entries:
        content += f"{e['index']}\n{e['times']}\n{e['text']}\n\n"
    srt_path.write_text(content, encoding="utf-8")

@app.get("/api/srt/{stem}")
def get_srt(stem: str):
    """raw 파일의 SRT 반환. 없으면 자막 생성 후 반환."""
    srt_path      = RAW_DIR / f"{stem}_raw.srt"
    analysis_path = ANALYSIS_DIR / f"{stem}.json"

    if not srt_path.exists():
        if not analysis_path.exists():
            raise HTTPException(404, "분석 파일 없음")
        editor = Editor()
        ok = editor._get_editor(str(analysis_path))._generate_srt(str(analysis_path), str(srt_path))
        if not ok:
            raise HTTPException(422, "자막 생성 실패 (전사 데이터 없음)")

    return {"entries": _parse_srt(srt_path)}

class SrtSaveRequest(BaseModel):
    stem:    str        # raw 파일 stem (xxx)
    entries: list       # [{index, times, text}, ...]

@app.post("/api/srt")
def save_srt(req: SrtSaveRequest):
    srt_path = RAW_DIR / f"{req.stem}_raw.srt"
    _write_srt(req.entries, srt_path)
    return {"ok": True, "count": len(req.entries)}