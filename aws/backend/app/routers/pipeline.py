# backend/app/routers/pipeline.py
"""수집/자막/분석 파이프라인 API"""

import asyncio
import json
import os
import re
import subprocess
import threading
from pathlib import Path
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel

from app.config import settings
from app.session import get_session, get_optional_user, make_session, SessionDirs
from app.models.user import User
from app.models.schemas import (
    CollectRequest, EditRequest, PipelineStatus, PipelineStep
)
from app.services.collector import YoutubeCollector
from app.services.transcriber import Transcriber
from app.services.analyzer import Analyzer
from app.services.editor import Editor
from app.services.s3_manager import get_s3

router = APIRouter()

# ── 사용량 제한(쿼터) ──────────────────────────────────────────────
# 결제 연동 전까지는 "수집된 영상 개수"로 무료 한도를 안내만 한다.

def _quota_info(session: SessionDirs, user: User | None) -> dict:
    is_admin = bool(user and user.is_admin)
    limit = None if is_admin else (settings.FREE_MEMBER_VIDEO_LIMIT if user else settings.FREE_ANON_VIDEO_LIMIT)
    used = len(list(session.download_dir.glob("*.mp4")))
    return {"used": used, "limit": limit, "is_member": user is not None, "is_admin": is_admin}


def check_collect_quota(session: SessionDirs, user: User | None) -> None:
    if user and user.is_admin:
        return
    info = _quota_info(session, user)
    if info["used"] >= info["limit"]:
        raise HTTPException(403, detail={
            "code": "quota_exceeded",
            **info,
            "message": f"무료 한도({info['limit']}개)에 도달했습니다.",
        })


@router.get("/quota")
async def get_quota(session: SessionDirs = Depends(get_session), user: User | None = Depends(get_optional_user)):
    return _quota_info(session, user)


# ── 채널 관리 ─────────────────────────────────────────────────────

class ChannelItem(BaseModel):
    url: str
    category: str = "economy"

class ChannelDeleteRequest(BaseModel):
    url: str

def _load_channels(s: SessionDirs) -> list[dict]:
    if not s.channels_path.exists():
        return []
    return json.loads(s.channels_path.read_text(encoding="utf-8"))

def _save_channels(s: SessionDirs, channels: list[dict]):
    s.channels_path.write_text(json.dumps(channels, ensure_ascii=False, indent=2), encoding="utf-8")

@router.get("/channels")
async def get_channels(session: SessionDirs = Depends(get_session)):
    return {"channels": _load_channels(session)}

@router.post("/channels")
async def add_channel(item: ChannelItem, session: SessionDirs = Depends(get_session)):
    channels = _load_channels(session)
    if any(c["url"] == item.url for c in channels):
        raise HTTPException(400, "이미 등록된 채널입니다.")
    channels.append({"url": item.url, "category": item.category})
    _save_channels(session, channels)
    return {"ok": True, "channels": channels}

@router.delete("/channels")
async def remove_channel(req: ChannelDeleteRequest, session: SessionDirs = Depends(get_session)):
    channels = [c for c in _load_channels(session) if c["url"] != req.url]
    _save_channels(session, channels)
    return {"ok": True, "channels": channels}

# 세션별 파이프라인 상태
_session_statuses: dict[str, PipelineStatus] = {}
_session_paused: dict[str, bool] = {}


def is_paused(session_id: str) -> bool:
    return _session_paused.get(session_id, False)


def check_paused(session_id: str):
    import time
    while _session_paused.get(session_id, False):
        time.sleep(0.5)


def get_session_status(session_id: str) -> PipelineStatus:
    if session_id not in _session_statuses:
        _session_statuses[session_id] = PipelineStatus()
    return _session_statuses[session_id]


def set_status(session_id: str, step: PipelineStep, message: str, progress: int = 0):
    status = get_session_status(session_id)
    status.step = step
    status.message = message
    status.progress = progress
    print(f"[{session_id[:8]}][{step.value.upper()}] {message}")


def load_category_map(s: SessionDirs) -> dict:
    if not s.category_map_path.exists():
        return {}
    return json.loads(s.category_map_path.read_text(encoding="utf-8"))


def save_category_map(s: SessionDirs, mapping: dict):
    simplified = {Path(p).stem: cat for p, cat in mapping.items()}
    s.category_map_path.write_text(
        json.dumps(simplified, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def clear_pipeline_files(s: SessionDirs):
    for d, ext in [
        (s.download_dir, ".mp4"),
        (s.transcript_dir, ".json"),
        (s.analysis_dir, ".json"),
        (s.shorts_dir, ".mp4"),
        (s.raw_dir, ".mp4"),
        (s.raw_dir, ".srt"),
    ]:
        for f in d.glob(f"*{ext}"):
            f.unlink()
    if s.category_map_path.exists():
        s.category_map_path.unlink()


COOKIES_PATH = settings.BASE_DIR / "data" / "cookies.txt"
OAUTH_TOKEN_DIR = Path.home() / ".cache" / "yt-dlp" / "youtube-oauth2"

_oauth_state: dict = {"status": "idle", "url": None, "code": None, "error": None}
_oauth_proc: subprocess.Popen | None = None


def _run_oauth_background():
    global _oauth_state, _oauth_proc
    try:
        _oauth_proc = subprocess.Popen(
            ["yt-dlp", "--username", "oauth2", "--password", "",
             "https://www.youtube.com/watch?v=dQw4w9WgXcQ"],
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, bufsize=1
        )
        for line in _oauth_proc.stdout:
            line = line.strip()
            print("[OAuth2]", line)
            if "google.com/device" in line:
                url_m = re.search(r'(https://[^\s]+)', line)
                code_m = re.search(r'([A-Z0-9]{3,4}(?:-[A-Z0-9]{3,4}){1,3})', line)
                if url_m:
                    _oauth_state["url"] = url_m.group(1)
                if code_m:
                    _oauth_state["code"] = code_m.group(1)
                _oauth_state["status"] = "waiting"
        _oauth_proc.wait()
        if _oauth_proc.returncode == 0:
            _oauth_state["status"] = "done"
        else:
            if _oauth_state["status"] == "waiting":
                _oauth_state["status"] = "done"
            else:
                _oauth_state["status"] = "error"
                _oauth_state["error"] = "인증 실패 또는 취소됨"
    except Exception as e:
        _oauth_state["status"] = "error"
        _oauth_state["error"] = str(e)


@router.post("/oauth-init")
async def oauth_init():
    global _oauth_state
    _oauth_state = {"status": "starting", "url": None, "code": None, "error": None}
    t = threading.Thread(target=_run_oauth_background, daemon=True)
    t.start()
    return {"ok": True}


@router.get("/oauth-status")
async def oauth_status():
    token_file = OAUTH_TOKEN_DIR / "token_data.json"
    is_saved = token_file.exists()
    return {**_oauth_state, "token_saved": is_saved}


@router.post("/upload-video")
async def upload_video(file: UploadFile = File(...), session: SessionDirs = Depends(get_session),
                       user: User | None = Depends(get_optional_user)):
    check_collect_quota(session, user)
    if not file.filename or not file.filename.lower().endswith((".mp4", ".mkv", ".mov", ".avi")):
        raise HTTPException(400, "MP4/MKV/MOV/AVI 파일만 업로드 가능합니다.")
    dest = session.download_dir / file.filename
    content = await file.read()
    dest.write_bytes(content)
    return {"ok": True, "filename": file.filename, "size_mb": round(len(content) / 1024 / 1024, 1)}


# URL 다운로드 상태 (세션별)
_dl_states: dict[str, dict] = {}

INVIDIOUS_INSTANCES = [
    "https://inv.nadeko.net",
    "https://invidious.privacydev.net",
    "https://yt.cdaut.de",
    "https://invidious.nerdvpn.de",
]


def _extract_video_id(url: str) -> str | None:
    for pat in [r'[?&]v=([^&]+)', r'youtu\.be/([^?]+)', r'shorts/([^?]+)']:
        m = re.search(pat, url)
        if m:
            return m.group(1)
    return None


def _run_url_download(session_id: str, url: str, category: str):
    import yt_dlp
    from app.services.collector import _auth_opts, _has_oauth, _bgutil_alive, BGUTIL_URL

    s = make_session(session_id)
    _dl_states[session_id] = {"status": "downloading", "message": "시작 중...", "filename": None, "error": None}

    outtmpl = str(s.download_dir / "%(title).80s.%(ext)s")

    def progress_hook(d):
        if d["status"] == "downloading":
            _dl_states[session_id]["message"] = d.get("_percent_str", "").strip()

    # 인증 옵션 (OAuth2 > 쿠키 순, 없으면 bgutil POT만)
    auth = _auth_opts()
    if not auth and _bgutil_alive():
        print("[URL-DL] OAuth/쿠키 없음 — bgutil POT만 사용")
        auth = {
            "extractor_args": {
                "youtubepot-bgutilhttp": {"base_url": [BGUTIL_URL]}
            }
        }

    base_opts = {
        "format": "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
        "outtmpl": outtmpl,
        "merge_output_format": "mp4",
        "noplaylist": True,
        "quiet": True,
        "progress_hooks": [progress_hook],
        **auth,
    }

    video_id = _extract_video_id(url)

    # OAuth2가 있으면 YouTube 직접만, 없으면 Invidious → YouTube 순
    candidates: list[tuple[str, str]] = []
    if _has_oauth():
        candidates.append((url, "YouTube (OAuth2)"))
    else:
        if video_id:
            for inst in INVIDIOUS_INSTANCES:
                candidates.append((f"{inst}/watch?v={video_id}", f"Invidious ({inst.split('/')[2]})"))
        candidates.append((url, "YouTube 직접"))

    for dl_url, label in candidates:
        _dl_states[session_id]["message"] = f"{label} 시도 중..."
        print(f"[URL-DL] {label}: {dl_url}")
        try:
            with yt_dlp.YoutubeDL({**base_opts}) as ydl:
                info = ydl.extract_info(dl_url, download=True)
                filename = ydl.prepare_filename(info)
                if not filename.endswith(".mp4"):
                    filename = os.path.splitext(filename)[0] + ".mp4"

                stem = os.path.splitext(os.path.basename(filename))[0]
                cat_map = {}
                if s.category_map_path.exists():
                    cat_map = json.loads(s.category_map_path.read_text())
                cat_map[stem] = category
                s.category_map_path.write_text(json.dumps(cat_map, ensure_ascii=False, indent=2))

                fname = os.path.basename(filename)
                get_s3().upload(filename, s.s3_key("downloads", fname))
                _dl_states[session_id] = {
                    "status": "done",
                    "message": f"✓ {label} 완료",
                    "filename": fname,
                    "error": None,
                }
                return
        except Exception as e:
            print(f"[URL-DL] {label} 실패: {e}")
            continue

    # 모두 실패 — OAuth2 미설정이면 안내
    err_msg = "다운로드 실패."
    if not _has_oauth():
        err_msg += " OAuth2 인증이 필요합니다. 파이프라인 상단 'YouTube 인증' 버튼을 눌러 설정하세요."
    _dl_states[session_id] = {"status": "error", "message": "", "filename": None, "error": err_msg}


class UrlDownloadRequest(BaseModel):
    url: str
    category: str = "economy"


@router.post("/download-url")
async def download_url(req: UrlDownloadRequest, background_tasks: BackgroundTasks,
                       session: SessionDirs = Depends(get_session),
                       user: User | None = Depends(get_optional_user)):
    check_collect_quota(session, user)
    _dl_states[session.session_id] = {"status": "starting", "message": "시작 중...", "filename": None, "error": None}
    background_tasks.add_task(_run_url_download, session.session_id, req.url, req.category)
    return {"ok": True}


@router.get("/download-url-status")
async def download_url_status(session: SessionDirs = Depends(get_session)):
    return _dl_states.get(session.session_id, {"status": "idle", "message": "", "filename": None, "error": None})


@router.get("/status")
async def get_status(session: SessionDirs = Depends(get_session)):
    return get_session_status(session.session_id)


@router.get("/files")
async def list_files(session: SessionDirs = Depends(get_session)):
    return {
        "downloads":   [f.stem for f in sorted(session.download_dir.glob("*.mp4"))],
        "videos":      [f.stem.replace("_raw", "") for f in sorted(session.raw_dir.glob("*.mp4"))],
        "transcripts": [f.stem for f in sorted(session.transcript_dir.glob("*.json"))],
        "analyses":    [f.stem for f in sorted(session.analysis_dir.glob("*.json"))],
        "shorts":      [f.stem.replace("_shorts", "") for f in sorted(session.shorts_dir.glob("*.mp4"))],
    }


# ── 1. 수집 ─────────────────────────────────────────────────────

async def _run_collect(session_id: str, clear_existing: bool, limit_per_channel: int = 3):
    s = make_session(session_id)
    try:
        if clear_existing:
            set_status(session_id, PipelineStep.COLLECTING, "기존 파일 삭제 중...", 5)
            await asyncio.to_thread(clear_pipeline_files, s)

        set_status(session_id, PipelineStep.COLLECTING, "유튜브 채널 수집 중...", 5)
        collector = YoutubeCollector(download_dir=str(s.download_dir))
        custom_channels = _load_channels(s)

        def progress_cb(msg: str, pct: int):
            set_status(session_id, PipelineStep.COLLECTING, msg, pct)

        results = await asyncio.to_thread(collector.run, limit_per_channel, custom_channels or None, progress_cb)

        video_paths = {v["filepath"]: v["category"] for v in results if "filepath" in v}
        save_category_map(s, video_paths)

        s3 = get_s3()
        for v in results:
            if "filepath" in v and os.path.exists(v["filepath"]):
                fname = os.path.basename(v["filepath"])
                s3.upload(v["filepath"], s.s3_key("downloads", fname))

        set_status(session_id, PipelineStep.IDLE, f"수집 완료 — 영상 {len(results)}개", 100)
    except Exception as e:
        set_status(session_id, PipelineStep.ERROR, f"수집 오류: {e}", 0)


@router.post("/pause")
async def pause_pipeline(session: SessionDirs = Depends(get_session)):
    _session_paused[session.session_id] = True
    status = get_session_status(session.session_id)
    status.message = status.message + " (일시정지됨)"
    return {"ok": True, "paused": True}


@router.post("/resume")
async def resume_pipeline(session: SessionDirs = Depends(get_session)):
    _session_paused[session.session_id] = False
    return {"ok": True, "paused": False}


@router.post("/collect")
async def collect(req: CollectRequest, background_tasks: BackgroundTasks,
                  session: SessionDirs = Depends(get_session),
                  user: User | None = Depends(get_optional_user)):
    check_collect_quota(session, user)
    status = get_session_status(session.session_id)
    if status.step not in (PipelineStep.IDLE, PipelineStep.DONE, PipelineStep.ERROR):
        raise HTTPException(400, "파이프라인이 실행 중입니다.")
    background_tasks.add_task(_run_collect, session.session_id, req.clear_existing, req.limit_per_channel)
    return {"ok": True}


# ── 2. 자막 생성 ────────────────────────────────────────────────

async def _run_transcribe(session_id: str):
    s = make_session(session_id)
    try:
        all_videos = list(s.download_dir.glob("*.mp4"))
        if not all_videos:
            set_status(session_id, PipelineStep.ERROR, "다운로드된 영상이 없습니다.", 0)
            return

        videos = [v for v in all_videos if not (s.transcript_dir / f"{v.stem}.json").exists()]
        if not videos:
            set_status(session_id, PipelineStep.IDLE, f"모든 자막이 이미 있습니다 ({len(all_videos)}개)", 100)
            return

        set_status(session_id, PipelineStep.TRANSCRIBING, f"Whisper 실행 중 ({len(videos)}/{len(all_videos)}개)...", 10)
        transcriber = Transcriber(transcript_dir=str(s.transcript_dir))
        s3 = get_s3()
        for i, v in enumerate(videos):
            set_status(session_id, PipelineStep.TRANSCRIBING, f"자막 생성 중: {v.name}",
                       int(10 + (i / len(videos)) * 85))
            await asyncio.to_thread(transcriber.transcribe, str(v))
            json_file = s.transcript_dir / f"{v.stem}.json"
            if json_file.exists():
                s3.upload(str(json_file), s.s3_key("transcripts", json_file.name))

        set_status(session_id, PipelineStep.IDLE, f"자막 생성 완료 — {len(videos)}개", 100)
    except Exception as e:
        set_status(session_id, PipelineStep.ERROR, f"자막 오류: {e}", 0)


@router.post("/transcribe")
async def transcribe(background_tasks: BackgroundTasks, session: SessionDirs = Depends(get_session)):
    status = get_session_status(session.session_id)
    if status.step not in (PipelineStep.IDLE, PipelineStep.DONE, PipelineStep.ERROR):
        raise HTTPException(400, "파이프라인이 실행 중입니다.")
    background_tasks.add_task(_run_transcribe, session.session_id)
    return {"ok": True}


# ── 3. LLM 분석 ─────────────────────────────────────────────────

async def _run_analyze(session_id: str):
    s = make_session(session_id)
    try:
        transcripts = list(s.transcript_dir.glob("*.json"))
        if not transcripts:
            set_status(session_id, PipelineStep.ERROR, "자막 파일이 없습니다.", 0)
            return

        saved_cats = load_category_map(s)
        category_map = {str(t): saved_cats.get(t.stem, "economy") for t in transcripts}

        set_status(session_id, PipelineStep.ANALYZING, f"LLM 분석 중 (총 {len(transcripts)}개)...", 10)
        analyzer = Analyzer()
        s3 = get_s3()
        total_saved = 0
        for i, t in enumerate(transcripts):
            set_status(session_id, PipelineStep.ANALYZING, f"분석 중: {t.name}",
                       int((i / len(transcripts)) * 90))
            before = set(s.analysis_dir.glob(f"{t.stem}*.json"))
            await asyncio.to_thread(analyzer.analyze, str(t), category_map[str(t)], s.analysis_dir)
            after = set(s.analysis_dir.glob(f"{t.stem}*.json"))
            new_files = after - before
            if not new_files:
                print(f"[{session_id[:8]}][WARN] 분석 결과 없음: {t.name}")
            for f in new_files:
                s3.upload(str(f), s.s3_key("analysis", f.name))
                total_saved += 1

        analyses = list(s.analysis_dir.glob("*.json"))
        if not analyses:
            set_status(session_id, PipelineStep.ERROR, "분석 결과가 없습니다. Gemini 응답 파싱 실패를 확인하세요.", 0)
            return
        set_status(session_id, PipelineStep.IDLE, f"분석 완료 — {len(analyses)}개 파일 생성", 100)
    except Exception as e:
        set_status(session_id, PipelineStep.ERROR, f"분석 오류: {e}", 0)


@router.post("/analyze")
async def analyze(background_tasks: BackgroundTasks, session: SessionDirs = Depends(get_session)):
    status = get_session_status(session.session_id)
    if status.step not in (PipelineStep.IDLE, PipelineStep.DONE, PipelineStep.ERROR):
        raise HTTPException(400, "파이프라인이 실행 중입니다.")
    background_tasks.add_task(_run_analyze, session.session_id)
    return {"ok": True}


# ── 4. 영상 편집 ────────────────────────────────────────────────

async def _run_edit(session_id: str, template_id: int):
    s = make_session(session_id)
    try:
        analyses = list(s.analysis_dir.glob("*.json"))
        if not analyses:
            set_status(session_id, PipelineStep.ERROR, "분석 결과가 없습니다.", 0)
            return

        set_status(session_id, PipelineStep.EDITING, f"영상 편집 중 (총 {len(analyses)}개)...", 10)
        editor = Editor(template_id=template_id, session_dirs=s)
        s3 = get_s3()
        for i, a in enumerate(analyses):
            set_status(session_id, PipelineStep.EDITING, f"영상 편집: {a.name}",
                       int((i / len(analyses)) * 90))
            raw_path = await asyncio.to_thread(editor.edit_video, str(a))
            if raw_path and os.path.exists(raw_path):
                s3.upload(raw_path, s.s3_key("raw", os.path.basename(raw_path)))

        raws = list(s.raw_dir.glob("*.mp4"))
        set_status(session_id, PipelineStep.DONE, f"영상 편집 완료 — raw {len(raws)}개 생성", 100)
    except Exception as e:
        set_status(session_id, PipelineStep.ERROR, f"편집 오류: {e}", 0)


@router.post("/edit")
async def edit(req: EditRequest, background_tasks: BackgroundTasks,
               session: SessionDirs = Depends(get_session)):
    status = get_session_status(session.session_id)
    if status.step not in (PipelineStep.IDLE, PipelineStep.DONE, PipelineStep.ERROR):
        raise HTTPException(400, "파이프라인이 실행 중입니다.")
    background_tasks.add_task(_run_edit, session.session_id, req.template_id)
    return {"ok": True}


# ── 통합: 자막 생성 + AI 분석 + 영상 편집 (한 번에 실행) ──────────

async def _run_full_edit(session_id: str, template_id: int):
    await _run_transcribe(session_id)
    if get_session_status(session_id).step == PipelineStep.ERROR:
        return
    await _run_analyze(session_id)
    if get_session_status(session_id).step == PipelineStep.ERROR:
        return
    await _run_edit(session_id, template_id)


@router.post("/process")
async def process_videos(req: EditRequest, background_tasks: BackgroundTasks,
                         session: SessionDirs = Depends(get_session)):
    status = get_session_status(session.session_id)
    if status.step not in (PipelineStep.IDLE, PipelineStep.DONE, PipelineStep.ERROR):
        raise HTTPException(400, "파이프라인이 실행 중입니다.")
    background_tasks.add_task(_run_full_edit, session.session_id, req.template_id)
    return {"ok": True}
