# backend/app/routers/pipeline.py
"""수집/자막/분석 파이프라인 API"""

import asyncio
import glob
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import quote, urlsplit
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel

from app.config import settings
from app.session import (
    get_session, get_optional_user, make_session, SessionDirs,
    load_video_id_map, save_video_id_map,
    load_channel_map, save_channel_map,
)
from app.models.user import User
from app.models.schemas import (
    CollectRequest, EditRequest, PipelineStatus, PipelineStep,
    VideoInfoResponse, DownloadInfo, ProcessSelectedRequest, ProcessSelectedItem,
    GenerateScriptRequest, GenerateScriptResponse,
)
from app.services.collector import YoutubeCollector
from app.services.analyzer import Analyzer
from app.services.editor import Editor
from app.services.s3_manager import get_s3

router = APIRouter()

# ── 사용량 제한(쿼터) ──────────────────────────────────────────────

from datetime import datetime as _dt
from app.models.plan import PLANS, ANON_LIMIT


def _quota_info(session: SessionDirs, user: User | None) -> dict:
    is_admin = bool(user and user.is_admin)

    if is_admin:
        return {"used": 0, "limit": None, "plan": "admin", "is_member": True, "is_admin": True}

    used = len(list(session.download_dir.glob("*.mp4")))

    if not user:
        return {"used": used, "limit": ANON_LIMIT, "plan": "anonymous", "is_member": False, "is_admin": False}

    plan_name = user.plan or "free"

    # 요금제 만료 체크
    if user.plan_expires_at and user.plan_expires_at < _dt.utcnow():
        plan_name = "free"

    plan = PLANS.get(plan_name, PLANS["free"])
    limit = plan["monthly_shorts"]

    return {
        "used": used,
        "limit": limit,
        "plan": plan_name,
        "plan_display": plan["name"],
        "price_krw": plan["price_krw"],
        "max_video_minutes": plan["max_video_minutes"],
        "storage_days": plan["storage_days"],
        "is_member": True,
        "is_admin": False,
        "plan_expires_at": user.plan_expires_at.isoformat() if user.plan_expires_at else None,
    }


def check_collect_quota(session: SessionDirs, user: User | None) -> None:
    if user and user.is_admin:
        return
    info = _quota_info(session, user)

    # 비로그인 사용자가 한도에 도달하면 로그인 유도
    if not user and info["used"] >= info["limit"]:
        raise HTTPException(403, detail={
            "code": "login_required",
            **info,
            "message": f"체험 한도({info['limit']}개)에 도달했습니다. 로그인하면 더 사용할 수 있습니다.",
        })

    # 로그인 사용자 한도 체크 (limit이 None이면 무제한)
    if info["limit"] is not None and info["used"] >= info["limit"]:
        raise HTTPException(403, detail={
            "code": "quota_exceeded",
            **info,
            "message": f"{info.get('plan_display', info['plan'])} 요금제 한도({info['limit']}개)에 도달했습니다. 업그레이드하세요.",
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
    collector = YoutubeCollector(session)
    ch_info = await asyncio.to_thread(collector.get_channel_info, item.url)
    channels.append({"url": item.url, "category": item.category, "thumbnail_url": ch_info.get("thumbnail_url", ""), "name": ch_info.get("name", "")})
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
_session_tasks: dict[str, asyncio.Task] = {}


def _spawn(session_id: str, coro) -> asyncio.Task:
    """파이프라인 작업을 asyncio Task로 실행하고 세션에 연결 — /stop으로 취소 가능하게 한다."""
    task = asyncio.create_task(coro)
    _session_tasks[session_id] = task
    return task


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


def _channel_thumbnail(s: SessionDirs, channel_url: str) -> str:
    """등록된 채널 목록(channels.json)에서 channel_url과 일치하는 채널의 썸네일을 찾는다."""
    if not channel_url:
        return ""
    target = urlsplit(channel_url).path.rstrip("/").lower()
    for c in _load_channels(s):
        if urlsplit(c["url"]).path.rstrip("/").lower() == target:
            return c.get("thumbnail_url", "")
    return ""


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

    # 로컬 정리 후에도 S3에 남아있는 이전 결과물(특히 process-selected 후
    # 로컬에서 정리된 downloads/raw/shorts)을 함께 삭제해, 재수집 후
    # 목록에 옛 영상이 다시 노출되지 않도록 한다.
    s3 = get_s3()
    for subdir in ("downloads", "transcripts", "analysis", "raw", "shorts"):
        prefix = s.s3_key(subdir, "")
        for key in s3.list_keys(prefix):
            s3.delete(key)


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


def _extract_video_id(url: str) -> str | None:
    for pat in [r'[?&]v=([^&]+)', r'youtu\.be/([^?]+)', r'shorts/([^?]+)']:
        m = re.search(pat, url)
        if m:
            return m.group(1)
    return None


async def _run_url_download(session_id: str, url: str, category: str):
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
        "format": "bestvideo[ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a]/bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best",
        "outtmpl": outtmpl,
        "merge_output_format": "mp4",
        "noplaylist": True,
        "quiet": True,
        "progress_hooks": [progress_hook],
        **auth,
    }

    video_id = _extract_video_id(url)
    label = "YouTube (OAuth2)" if _has_oauth() else "YouTube 직접"

    def _download() -> str:
        """블로킹 yt-dlp 다운로드 + 후처리. 결과 파일명을 반환."""
        with yt_dlp.YoutubeDL({**base_opts}) as ydl:
            info = ydl.extract_info(url, download=True)
            filename = ydl.prepare_filename(info)
            if not filename.endswith(".mp4"):
                filename = os.path.splitext(filename)[0] + ".mp4"

            stem = os.path.splitext(os.path.basename(filename))[0]
            cat_map = {}
            if s.category_map_path.exists():
                cat_map = json.loads(s.category_map_path.read_text())
            cat_map[stem] = category
            s.category_map_path.write_text(json.dumps(cat_map, ensure_ascii=False, indent=2))

            if video_id:
                id_map = load_video_id_map(s)
                id_map[stem] = video_id
                save_video_id_map(s, id_map)

            channel_name = info.get("channel") or info.get("uploader") or ""
            channel_url = info.get("channel_url") or info.get("uploader_url") or ""
            if channel_name:
                ch_map = load_channel_map(s)
                ch_map[stem] = {
                    "name": channel_name,
                    "thumbnail_url": _channel_thumbnail(s, channel_url),
                }
                save_channel_map(s, ch_map)

            fname = os.path.basename(filename)
            get_s3().upload(filename, s.s3_key("downloads", fname))
            return fname

    print(f"[URL-DL] {label}: {url}")
    try:
        fname = await asyncio.to_thread(_download)
        _dl_states[session_id] = {
            "status": "done",
            "message": f"✓ {label} 완료",
            "filename": fname,
            "error": None,
        }
    except Exception as e:
        print(f"[URL-DL] {label} 실패: {e}")
        err_msg = "다운로드 실패."
        if not _has_oauth():
            err_msg += " OAuth2 인증이 필요합니다. 파이프라인 상단 'YouTube 인증' 버튼을 눌러 설정하세요."
        _dl_states[session_id] = {"status": "error", "message": "", "filename": None, "error": err_msg}


class UrlDownloadRequest(BaseModel):
    url: str
    category: str = "economy"


@router.post("/download-url")
async def download_url(req: UrlDownloadRequest,
                       session: SessionDirs = Depends(get_session),
                       user: User | None = Depends(get_optional_user)):
    check_collect_quota(session, user)
    _dl_states[session.session_id] = {"status": "starting", "message": "시작 중...", "filename": None, "error": None}
    _spawn(session.session_id, _run_url_download(session.session_id, req.url, req.category))
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

async def _run_collect(session_id: str, clear_existing: bool, limit_per_channel: int = 3,
                       channel_urls: list[str] | None = None):
    s = make_session(session_id)
    try:
        if clear_existing:
            set_status(session_id, PipelineStep.COLLECTING, "기존 파일 삭제 중...", 5)
            await asyncio.to_thread(clear_pipeline_files, s)

        set_status(session_id, PipelineStep.COLLECTING, "유튜브 채널 수집 중...", 5)
        collector = YoutubeCollector(download_dir=str(s.download_dir))
        custom_channels = _load_channels(s)
        if channel_urls:
            custom_channels = [c for c in custom_channels if c["url"] in channel_urls]

        def progress_cb(msg: str, pct: int):
            set_status(session_id, PipelineStep.COLLECTING, msg, pct)

        results = await asyncio.to_thread(collector.run, limit_per_channel, custom_channels or None, progress_cb)

        video_paths = {v["filepath"]: v["category"] for v in results if "filepath" in v}
        save_category_map(s, video_paths)

        id_map = load_video_id_map(s)
        for v in results:
            if "filepath" in v and v.get("video_id"):
                id_map[Path(v["filepath"]).stem] = v["video_id"]
        save_video_id_map(s, id_map)

        ch_map = load_channel_map(s)
        for v in results:
            if "filepath" in v and v.get("channel"):
                ch_map[Path(v["filepath"]).stem] = {
                    "name": v["channel"],
                    "thumbnail_url": _channel_thumbnail(s, v.get("channel_url", "")),
                }
        save_channel_map(s, ch_map)

        s3 = get_s3()
        for v in results:
            if "filepath" in v and os.path.exists(v["filepath"]):
                fname = os.path.basename(v["filepath"])
                s3.upload(v["filepath"], s.s3_key("downloads", fname))

        set_status(session_id, PipelineStep.DONE, f"수집 완료 — 영상 {len(results)}개", 100)
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


@router.post("/stop")
async def stop_pipeline(session: SessionDirs = Depends(get_session)):
    """실행 중인 파이프라인을 즉시 취소하고 대기 상태로 되돌린다."""
    session_id = session.session_id
    _session_paused[session_id] = False
    task = _session_tasks.pop(session_id, None)
    if task and not task.done():
        task.cancel()
    set_status(session_id, PipelineStep.IDLE, "사용자가 작업을 종료함", 0)
    return {"ok": True}


@router.post("/collect")
async def collect(req: CollectRequest,
                  session: SessionDirs = Depends(get_session),
                  user: User | None = Depends(get_optional_user)):
    check_collect_quota(session, user)
    status = get_session_status(session.session_id)
    if status.step not in (PipelineStep.IDLE, PipelineStep.DONE, PipelineStep.ERROR):
        raise HTTPException(400, "파이프라인이 실행 중입니다.")
    _spawn(session.session_id, _run_collect(session.session_id, req.clear_existing, req.limit_per_channel, req.channel_urls))
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
        s3 = get_s3()
        for i, v in enumerate(videos):
            set_status(session_id, PipelineStep.TRANSCRIBING, f"자막 생성 중: {v.name}",
                       int(10 + (i / len(videos)) * 85))
            # 영상 1개당 별도 프로세스에서 처리 — faster-whisper가 누적시키는 메모리를
            # 프로세스 종료 시 OS가 완전히 회수하게 하여, 여러 영상 연속 처리 시
            # 백엔드 전체가 OOM kill 당해 파이프라인이 멈추는 문제를 방지한다.
            proc = await asyncio.create_subprocess_exec(
                sys.executable, "-m", "app.services.transcribe_worker", str(v), str(s.transcript_dir),
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
            )
            out, _ = await proc.communicate()
            for line in out.decode("utf-8", "replace").splitlines():
                print(f"[{session_id[:8]}][TRANSCRIBING] {line}")
            if proc.returncode != 0:
                print(f"[{session_id[:8]}][TRANSCRIBING][SKIP] {v.name}: 워커 프로세스 종료 코드 {proc.returncode}")
                continue
            json_file = s.transcript_dir / f"{v.stem}.json"
            if json_file.exists():
                s3.upload(str(json_file), s.s3_key("transcripts", json_file.name))

        set_status(session_id, PipelineStep.IDLE, f"자막 생성 완료 — {len(videos)}개", 100)
    except Exception as e:
        set_status(session_id, PipelineStep.ERROR, f"자막 오류: {e}", 0)


@router.post("/transcribe")
async def transcribe(session: SessionDirs = Depends(get_session)):
    status = get_session_status(session.session_id)
    if status.step not in (PipelineStep.IDLE, PipelineStep.DONE, PipelineStep.ERROR):
        raise HTTPException(400, "파이프라인이 실행 중입니다.")
    _spawn(session.session_id, _run_transcribe(session.session_id))
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
            before = set(s.analysis_dir.glob(f"{glob.escape(t.stem)}*.json"))
            await asyncio.to_thread(analyzer.analyze, str(t), category_map[str(t)], s.analysis_dir)
            after = set(s.analysis_dir.glob(f"{glob.escape(t.stem)}*.json"))
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
async def analyze(session: SessionDirs = Depends(get_session)):
    status = get_session_status(session.session_id)
    if status.step not in (PipelineStep.IDLE, PipelineStep.DONE, PipelineStep.ERROR):
        raise HTTPException(400, "파이프라인이 실행 중입니다.")
    _spawn(session.session_id, _run_analyze(session.session_id))
    return {"ok": True}


# ── 4. 영상 편집 ────────────────────────────────────────────────

EDIT_VARIANTS = (1, 2, 3)


async def _run_edit(session_id: str, template_id: int):
    s = make_session(session_id)
    try:
        analyses = list(s.analysis_dir.glob("*.json"))
        if not analyses:
            set_status(session_id, PipelineStep.ERROR, "분석 결과가 없습니다.", 0)
            return

        total_jobs = len(analyses) * len(EDIT_VARIANTS)
        set_status(session_id, PipelineStep.EDITING,
                   f"영상 편집 중 (총 {len(analyses)}개, 버전 {len(EDIT_VARIANTS)}개)...", 10)
        editor = Editor(template_id=template_id, session_dirs=s)
        s3 = get_s3()
        for i, a in enumerate(analyses):
            base_name = a.stem
            for variant in EDIT_VARIANTS:
                set_status(session_id, PipelineStep.EDITING,
                           f"영상 편집: {a.name} (버전 {variant})",
                           int(((i * len(EDIT_VARIANTS) + (variant - 1)) / total_jobs) * 90))
                raw_path = await asyncio.to_thread(editor.edit_video, str(a), variant)
                if raw_path and os.path.exists(raw_path):
                    s3.upload(raw_path, s.s3_key("raw", os.path.basename(raw_path)))
                    if variant >= 2:
                        variant_analysis = s.analysis_dir / f"{base_name}_v{variant}.json"
                        if variant_analysis.exists():
                            s3.upload(str(variant_analysis), s.s3_key("analysis", variant_analysis.name))

        raws = list(s.raw_dir.glob("*.mp4"))
        set_status(session_id, PipelineStep.DONE, f"영상 편집 완료 — raw {len(raws)}개 생성", 100)
    except Exception as e:
        set_status(session_id, PipelineStep.ERROR, f"편집 오류: {e}", 0)


@router.post("/edit")
async def edit(req: EditRequest,
               session: SessionDirs = Depends(get_session)):
    status = get_session_status(session.session_id)
    if status.step not in (PipelineStep.IDLE, PipelineStep.DONE, PipelineStep.ERROR):
        raise HTTPException(400, "파이프라인이 실행 중입니다.")
    _spawn(session.session_id, _run_edit(session.session_id, req.template_id))
    return {"ok": True}


# ── GPT(Gemini) 나레이션 대본 리라이팅 + 효과음 위치 선정 ──────────────

@router.post("/generate-script", response_model=GenerateScriptResponse)
async def generate_script(req: GenerateScriptRequest,
                          session: SessionDirs = Depends(get_session)):
    """edit 완료(raw_segments 존재) 후 호출. narration_script/sfx_placements를
    analysis json에 추가하고 S3에 재업로드한다."""
    stem = req.filename.replace("_shorts.mp4", "").replace("_raw.mp4", "")
    analysis_path = session.analysis_dir / f"{stem}.json"
    if not analysis_path.exists():
        raise HTTPException(404, f"분석 파일 없음: {stem}.json")

    data = json.loads(analysis_path.read_text(encoding="utf-8"))
    if not data.get("raw_segments"):
        raise HTTPException(400, "편집(raw_segments)이 완료된 후에 사용할 수 있습니다.")

    try:
        result = await asyncio.to_thread(
            Analyzer().generate_script_and_sfx, str(analysis_path), data.get("transcript_path"), req.mode
        )
    except Exception as e:
        raise HTTPException(500, f"대본 생성 실패: {e}")

    if not result:
        raise HTTPException(422, "대본 생성에 필요한 데이터가 부족합니다.")

    get_s3().upload(str(analysis_path), session.s3_key("analysis", analysis_path.name))
    return GenerateScriptResponse(**result)


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
async def process_videos(req: EditRequest,
                         session: SessionDirs = Depends(get_session)):
    status = get_session_status(session.session_id)
    if status.step not in (PipelineStep.IDLE, PipelineStep.DONE, PipelineStep.ERROR):
        raise HTTPException(400, "파이프라인이 실행 중입니다.")
    _spawn(session.session_id, _run_full_edit(session.session_id, req.template_id))
    return {"ok": True}


# ── 영상 정보 조회 (다운로드 전 확인용) ────────────────────────────

@router.get("/video-info")
async def get_video_info(url: str, session: SessionDirs = Depends(get_session)):
    """다운로드 없이 영상 메타데이터 조회"""
    collector = YoutubeCollector()
    try:
        info = await asyncio.to_thread(collector.get_video_info, url)
    except Exception as e:
        raise HTTPException(400, f"영상 정보 조회 실패: {e}")
    return VideoInfoResponse(**info)


# ── 다운로드 목록 조회 ─────────────────────────────────────────────

def _ffprobe_duration(video_path: str) -> float | None:
    """ffprobe로 영상 길이(초) 조회 (실패 시 None)"""
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", video_path],
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, timeout=10,
        )
        return float(result.stdout.strip())
    except (ValueError, subprocess.TimeoutExpired):
        return None


@router.get("/downloads")
async def list_downloads(session: SessionDirs = Depends(get_session)):
    """다운로드된 영상 목록 + 카테고리 + 썸네일 + 길이 반환"""
    cat_map = load_category_map(session)
    ch_map = load_channel_map(session)

    registered_channels = _load_channels(session)

    def _infer_channel(stem: str) -> dict:
        """channel_map에 없을 때 등록 채널 이름으로 폴백 추론."""
        stem_lower = stem.lower()
        for c in registered_channels:
            name = c.get("name", "")
            if not name:
                continue
            # 전체 이름 또는 첫 단어(영문 채널명 단축형)로 매칭
            tokens = [name.lower()] + [t.lower() for t in name.split() if len(t) >= 3]
            if any(tok in stem_lower for tok in tokens):
                return {"name": name, "thumbnail_url": c.get("thumbnail_url", "")}
        return {}

    def _build():
        result = []
        seen = set()
        for f in sorted(session.download_dir.glob("*.mp4")):
            thumbnail_url = f"/api/media/downloads/{session.session_id}/{quote(f.name)}/thumbnail"
            ch = ch_map.get(f.stem) or _infer_channel(f.stem)
            result.append(DownloadInfo(
                filename=f.name,
                stem=f.stem,
                category=cat_map.get(f.stem, "economy"),
                thumbnail_url=thumbnail_url,
                duration=_ffprobe_duration(str(f)),
                channel_name=ch.get("name", ""),
                channel_thumbnail_url=ch.get("thumbnail_url", ""),
            ))
            seen.add(f.name)

        # process-selected 처리 후 로컬에서 정리되어 S3에만 남은 다운로드도 목록에 포함
        prefix = session.s3_key("downloads", "")
        for key in get_s3().list_keys(prefix):
            filename = key[len(prefix):]
            if not filename.endswith(".mp4") or "/" in filename or filename in seen:
                continue
            stem = Path(filename).stem
            thumbnail_url = f"/api/media/downloads/{session.session_id}/{quote(filename)}/thumbnail"
            ch = ch_map.get(stem) or _infer_channel(stem)
            result.append(DownloadInfo(
                filename=filename,
                stem=stem,
                category=cat_map.get(stem, "economy"),
                thumbnail_url=thumbnail_url,
                duration=None,
                channel_name=ch.get("name", ""),
                channel_thumbnail_url=ch.get("thumbnail_url", ""),
            ))
        return result

    result = await asyncio.to_thread(_build)
    return {"downloads": [d.model_dump() for d in result]}


@router.delete("/downloads/{filename}")
async def delete_download(filename: str, session: SessionDirs = Depends(get_session)):
    """수집된 영상 파일 삭제 (로컬 + S3)"""
    filepath = session.download_dir / filename
    s3 = get_s3()
    s3_key = session.s3_key("downloads", filename)
    local_exists = filepath.exists()
    s3_exists = s3.exists(s3_key)
    if not local_exists and not s3_exists:
        raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다.")
    if local_exists:
        filepath.unlink()
    if s3_exists:
        try:
            s3.delete(s3_key)
        except Exception:
            pass
    thumb_path = session.download_dir / ".thumbs" / f"{Path(filename).stem}.jpg"
    thumb_path.unlink(missing_ok=True)
    return {"ok": True}


# ── 선택 영상 편집 (자막→분석→편집 순차 처리) ────────────────────

async def _run_process_selected(session_id: str, items: list[ProcessSelectedItem], template_id: int, max_duration: int | None = None):
    s = make_session(session_id)
    total = len(items)
    s3 = get_s3()

    # category_map 업데이트
    cat_map = load_category_map(s)
    for item in items:
        stem = Path(item.filename).stem
        cat_map[stem] = item.category
    s.category_map_path.write_text(json.dumps(cat_map, ensure_ascii=False, indent=2), encoding="utf-8")

    fail_count = 0
    try:
        # ── Step 1: 자막 생성 ──────────────────────────────────────
        for i, item in enumerate(items):
            try:
                video_path = s.download_dir / item.filename
                if not video_path.exists():
                    print(f"[process-selected] 파일 없음: {item.filename}")
                    continue
                stem = video_path.stem
                transcript_path = s.transcript_dir / f"{stem}.json"
                if transcript_path.exists():
                    print(f"[process-selected] 자막 이미 존재, 건너뜀: {stem}")
                    continue
                set_status(session_id, PipelineStep.TRANSCRIBING,
                           f"[{i+1}/{total}] 자막 생성 중: {item.filename}",
                           int((i / total) * 30))
                proc = await asyncio.create_subprocess_exec(
                    sys.executable, "-m", "app.services.transcribe_worker",
                    str(video_path), str(s.transcript_dir),
                    stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
                )
                out, _ = await proc.communicate()
                for line in out.decode("utf-8", "replace").splitlines():
                    print(f"[{session_id[:8]}][TRANSCRIBING] {line}")
                if transcript_path.exists():
                    s3.upload(str(transcript_path), s.s3_key("transcripts", transcript_path.name))
            except Exception as e:
                fail_count += 1
                print(f"[process-selected][자막 오류] {item.filename}: {e}")

        # ── Step 2: LLM 분석 ──────────────────────────────────────
        analyzer = Analyzer()
        for i, item in enumerate(items):
            try:
                stem = Path(item.filename).stem
                transcript_path = s.transcript_dir / f"{stem}.json"
                if not transcript_path.exists():
                    continue
                set_status(session_id, PipelineStep.ANALYZING,
                           f"[{i+1}/{total}] LLM 분석 중: {item.filename}",
                           30 + int((i / total) * 30))
                before = set(s.analysis_dir.glob(f"{glob.escape(stem)}*.json"))
                await asyncio.to_thread(analyzer.analyze, str(transcript_path), item.category, s.analysis_dir)
                after = set(s.analysis_dir.glob(f"{glob.escape(stem)}*.json"))
                for f in (after - before):
                    s3.upload(str(f), s.s3_key("analysis", f.name))
            except Exception as e:
                fail_count += 1
                print(f"[process-selected][분석 오류] {item.filename}: {e}")

        # ── Step 3: 영상 편집 ──────────────────────────────────────
        editor = Editor(template_id=template_id, session_dirs=s)
        if max_duration:
            editor.MAX_TOTAL_SEC = max_duration
        for i, item in enumerate(items):
            stem = Path(item.filename).stem
            analyses = list(s.analysis_dir.glob(f"{glob.escape(stem)}*.json"))
            for a in analyses:
                try:
                    set_status(session_id, PipelineStep.EDITING,
                               f"[{i+1}/{total}] 영상 편집 중: {a.name}",
                               60 + int((i / total) * 35))
                    raw_path = await asyncio.to_thread(editor.edit_video, str(a))
                    if raw_path and os.path.exists(raw_path):
                        s3.upload(raw_path, s.s3_key("raw", os.path.basename(raw_path)))
                        # raw가 S3에 안전하게 백업되면 원본 다운로드 mp4는 로컬에서 정리
                        # (재편집 시 editor_base._find_video_path의 S3 폴백으로 재다운로드)
                        download_path = s.download_dir / item.filename
                        if download_path.exists() and s3.exists(s.s3_key("downloads", item.filename)):
                            os.remove(download_path)
                except Exception as e:
                    fail_count += 1
                    print(f"[process-selected][편집 오류] {a.name}: {e}")

        msg = f"선택 편집 완료 — {total}개 처리"
        if fail_count:
            msg += f" (실패 {fail_count}개)"
        set_status(session_id, PipelineStep.DONE, msg, 100)
    except Exception as e:
        set_status(session_id, PipelineStep.ERROR, f"선택 편집 오류: {e}", 0)


@router.post("/process-selected")
async def process_selected(req: ProcessSelectedRequest, session: SessionDirs = Depends(get_session)):
    status = get_session_status(session.session_id)
    if status.step not in (PipelineStep.IDLE, PipelineStep.DONE, PipelineStep.ERROR):
        raise HTTPException(400, "파이프라인이 실행 중입니다.")
    if not req.items:
        raise HTTPException(400, "처리할 영상을 선택하세요.")
    _spawn(session.session_id, _run_process_selected(session.session_id, req.items, req.template_id, req.max_duration))
    return {"ok": True}
