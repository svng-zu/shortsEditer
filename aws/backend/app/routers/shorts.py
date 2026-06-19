# backend/app/routers/shorts.py
"""쇼츠 CRUD API"""

import asyncio
import base64
import json
import re
import subprocess
import requests
from pathlib import Path
from urllib.parse import quote
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse, RedirectResponse, StreamingResponse

from app.config import settings
from app.session import get_session, SessionDirs, load_video_id_map, load_channel_map
from app.models.schemas import (
    ShortInfo, RawInfo, UpdateTitleRequest, UpdateNarrationScriptRequest, SrtSaveRequest,
    GenerateNarrationSubtitlesRequest, GenerateNarrationSubtitlesResponse, NarrationPreviewResponse,
)
from app.services.s3_manager import get_s3

router = APIRouter()


def _parse_srt(srt_path) -> list:
    blocks = srt_path.read_text(encoding="utf-8").strip().split("\n\n")
    entries = []
    for block in blocks:
        lines = block.strip().splitlines()
        if len(lines) >= 3:
            entries.append({
                "index": lines[0].strip(),
                "times": lines[1].strip(),
                "text": "\n".join(lines[2:]),
            })
    return entries


def _write_srt(entries: list, srt_path):
    content = ""
    for e in entries:
        content += f"{e['index']}\n{e['times']}\n{e['text']}\n\n"
    srt_path.write_text(content, encoding="utf-8")


def _lookup_channel(ch_map: dict, stem: str) -> dict:
    """analysis stem(예: {download_stem}_t1_v2)에서 채널 정보 조회.
    여러 주제로 분할된 경우 _t{n}, 여러 편집 버전인 경우 _v{n} 접미사가 붙으므로 떼고 재조회한다."""
    if stem in ch_map:
        return ch_map[stem]
    return ch_map.get(re.sub(r"(_t\d+)?(_v\d+)?$", "", stem), {})


def _variant_of(stem: str) -> int:
    """stem 끝의 _v{n} 접미사에서 편집 버전 번호를 추출한다 (없으면 1)."""
    m = re.search(r"_v(\d+)$", stem)
    return int(m.group(1)) if m else 1


def _get_video_duration(video_path) -> float | None:
    cmd = ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", str(video_path)]
    try:
        out = subprocess.run(cmd, capture_output=True, text=True).stdout
        return round(float(json.loads(out)["format"]["duration"]), 1)
    except Exception:
        return None


@router.get("/shorts")
async def list_shorts(session: SessionDirs = Depends(get_session)):
    shorts = []
    seen = set()
    ch_map = load_channel_map(session)

    def _add(filename: str):
        stem = Path(filename).stem.replace("_shorts", "")
        analysis_file = session.analysis_dir / f"{stem}.json"
        meta = {}
        if analysis_file.exists():
            meta = json.loads(analysis_file.read_text(encoding="utf-8"))
        ch = _lookup_channel(ch_map, stem)
        shorts.append(ShortInfo(
            filename=filename,
            url=f"/api/media/shorts/{session.session_id}/{quote(filename)}",
            title=meta.get("intro_text", stem).replace("\\n", "\n").replace("\n", " "),
            category=meta.get("category", ""),
            candidates=meta.get("candidates", []),
            channel_name=ch.get("name", ""),
            channel_thumbnail_url=ch.get("thumbnail_url", ""),
            variant=_variant_of(stem),
        ))
        seen.add(filename)

    for mp4 in sorted(session.shorts_dir.glob("*.mp4")):
        _add(mp4.name)

    # 렌더링 결과는 업로드 후 로컬에서 정리되므로(upload_and_cleanup), S3에만
    # 남아있는 쇼츠도 목록에 포함시킨다.
    prefix = session.s3_key("shorts", "")
    for key in get_s3().list_keys(prefix):
        filename = key[len(prefix):]
        if not filename.endswith(".mp4") or filename in seen:
            continue
        _add(filename)

    return {"shorts": shorts}


@router.get("/raws")
async def list_raws(session: SessionDirs = Depends(get_session)):
    raws = []
    ch_map = load_channel_map(session)
    for mp4 in sorted(session.raw_dir.glob("*.mp4")):
        stem = mp4.stem.replace("_raw", "")
        analysis_file = session.analysis_dir / f"{stem}.json"
        meta = {}
        if analysis_file.exists():
            meta = json.loads(analysis_file.read_text(encoding="utf-8"))
        hook_seg = meta.get("hook_segment")
        base_stem = re.sub(r'_t\d+(_v\d+)?$', '', stem)
        dl_files = sorted(session.download_dir.glob(f"{base_stem}*.mp4"))
        dl_filename = dl_files[0].name if dl_files else None

        ch = _lookup_channel(ch_map, stem)
        raws.append(RawInfo(
            filename=mp4.name,
            url=f"/api/media/raw/{session.session_id}/{quote(mp4.name)}",
            title=meta.get("intro_text", stem).replace("\\n", "\n").replace("\n", " / "),
            category=meta.get("category", ""),
            duration=_get_video_duration(mp4),
            channel_name=ch.get("name", ""),
            channel_thumbnail_url=ch.get("thumbnail_url", ""),
            variant=_variant_of(stem),
            hook_segment=hook_seg,
            download_filename=dl_filename,
        ))
    return {"raws": raws}


@router.get("/media/shorts/{session_id}/{filename}")
async def serve_short(session_id: str, filename: str):
    from app.session import make_session
    s = make_session(session_id)
    # S3 우선 서빙
    s3_key = s.s3_key("shorts", filename)
    url = get_s3().presigned_url(s3_key)
    if url:
        return RedirectResponse(url)
    # 로컬 폴백
    path = s.shorts_dir / filename
    if not path.exists():
        raise HTTPException(404, "파일 없음")
    return FileResponse(str(path), media_type="video/mp4")


def _content_disposition(filename: str) -> str:
    """비ASCII(한글, 대괄호 등) 파일명도 안전하게 다운로드되도록 RFC 5987 인코딩 적용"""
    quoted = quote(filename)
    return f"attachment; filename=\"{quoted}\"; filename*=utf-8''{quoted}"


@router.get("/media/shorts/{session_id}/{filename}/download")
async def download_short(session_id: str, filename: str):
    """Safari 등에서 cross-origin S3 redirect 시 download 속성이 무시되는 문제를 피하기 위해
    백엔드가 같은 origin으로 Content-Disposition: attachment 응답을 직접 스트리밍한다"""
    from app.session import make_session
    s = make_session(session_id)
    s3_key = s.s3_key("shorts", filename)
    s3 = get_s3()
    if s3.exists(s3_key):
        obj = s3._client.get_object(Bucket=s3.bucket, Key=s3_key)
        return StreamingResponse(
            obj["Body"].iter_chunks(),
            # Safari는 video/mp4 응답을 Content-Disposition: attachment여도 인라인 재생으로 처리하는
            # 경우가 있어, 파일로 인식되도록 octet-stream으로 내려준다.
            media_type="application/octet-stream",
            headers={
                "Content-Disposition": _content_disposition(filename),
                "Content-Length": str(obj["ContentLength"]),
            },
        )
    path = s.shorts_dir / filename
    if not path.exists():
        raise HTTPException(404, "파일 없음")
    return FileResponse(str(path), media_type="application/octet-stream", filename=filename)


@router.get("/media/raw/{session_id}/{filename}")
async def serve_raw(session_id: str, filename: str):
    from app.session import make_session
    s = make_session(session_id)
    # S3 우선 서빙
    s3_key = s.s3_key("raw", filename)
    url = get_s3().presigned_url(s3_key)
    if url:
        return RedirectResponse(url)
    # 로컬 폴백
    path = s.raw_dir / filename
    if not path.exists():
        raise HTTPException(404, "파일 없음")
    return FileResponse(str(path), media_type="video/mp4")


@router.get("/media/downloads/{session_id}/{filename}")
async def serve_download(session_id: str, filename: str):
    from app.session import make_session
    s = make_session(session_id)
    # S3 우선 서빙
    s3_key = s.s3_key("downloads", filename)
    url = get_s3().presigned_url(s3_key)
    if url:
        return RedirectResponse(url)
    # 로컬 폴백
    path = s.download_dir / filename
    if not path.exists():
        raise HTTPException(404, "파일 없음")
    return FileResponse(str(path), media_type="video/mp4")


def _thumb_path(session: SessionDirs, filename: str) -> Path:
    thumbs_dir = session.download_dir / ".thumbs"
    thumbs_dir.mkdir(parents=True, exist_ok=True)
    return thumbs_dir / f"{Path(filename).stem}.jpg"


def _fetch_youtube_thumbnail(video_id: str, dest: Path) -> bool:
    """YouTube 썸네일 CDN에서 원본 가로 썸네일을 받아 캐싱 (maxres 없으면 hq로 폴백)"""
    for quality in ("maxresdefault", "hqdefault"):
        url = f"https://img.youtube.com/vi/{video_id}/{quality}.jpg"
        try:
            resp = requests.get(url, timeout=10)
            if resp.status_code == 200 and len(resp.content) > 1000:
                dest.write_bytes(resp.content)
                return True
        except Exception:
            continue
    return False


@router.get("/media/downloads/{session_id}/{filename}/thumbnail")
async def serve_download_thumbnail(session_id: str, filename: str):
    """다운로드된 영상의 미리보기 이미지 — YouTube 원본 썸네일(가로) 우선,
    video_id를 모르거나 가져오기 실패 시 1초 지점 프레임을 ffmpeg로 추출해 캐싱"""
    from app.session import make_session
    s = make_session(session_id)
    thumb_path = _thumb_path(s, filename)
    if not thumb_path.exists():
        video_id = load_video_id_map(s).get(Path(filename).stem)
        if not (video_id and _fetch_youtube_thumbnail(video_id, thumb_path)):
            video_path = s.download_dir / filename
            if not video_path.exists():
                raise HTTPException(404, "파일 없음")
            subprocess.run(
                ["ffmpeg", "-y", "-ss", "1", "-i", str(video_path), "-frames:v", "1", "-vf", "scale=480:-1", str(thumb_path)],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=30,
            )
    if not thumb_path.exists():
        raise HTTPException(404, "썸네일 생성 실패")
    return FileResponse(str(thumb_path), media_type="image/jpeg")


@router.delete("/shorts/{filename}")
async def delete_short(filename: str, session: SessionDirs = Depends(get_session)):
    path = session.shorts_dir / filename
    s3 = get_s3()
    s3_key = session.s3_key("shorts", filename)
    local_exists = path.exists()
    s3_exists = s3.exists(s3_key)
    if not local_exists and not s3_exists:
        raise HTTPException(404, "파일 없음")
    if local_exists:
        path.unlink()
    if s3_exists:
        s3.delete(s3_key)
    return {"ok": True}


@router.delete("/raws/{filename}")
async def delete_raw(filename: str, session: SessionDirs = Depends(get_session)):
    path = session.raw_dir / filename
    if not path.exists():
        raise HTTPException(404, "파일 없음")
    path.unlink()
    get_s3().delete(session.s3_key("raw", filename))
    return {"ok": True}


@router.get("/subtitle-entries/{stem}")
async def get_subtitle_entries(stem: str, session: SessionDirs = Depends(get_session)):
    """raw 영상의 자막 타이밍 목록을 반환. 캔버스 미리보기에서 실제 자막을 표시하는 데 사용."""
    clean_stem = stem.replace("_raw.mp4", "").replace("_raw", "")
    analysis_path = session.analysis_dir / f"{clean_stem}.json"
    if not analysis_path.exists():
        return {"entries": []}
    try:
        analysis = json.loads(analysis_path.read_text(encoding="utf-8"))
    except Exception:
        return {"entries": []}

    raw_segments = analysis.get("raw_segments", [])
    transcript_path = analysis.get("transcript_path", "")
    if not transcript_path or not Path(transcript_path).exists():
        return {"entries": []}

    # raw_segments 없으면 candidates로 재구성 (구버전 호환)
    if not raw_segments:
        candidates = analysis.get("candidates", [])
        if not candidates:
            return {"entries": []}
        raw_time = 0.0
        BUFFER_SEC = 0.5
        for c in sorted(candidates, key=lambda x: x.get("edit_order", 0)):
            orig_s = float(c["start"])
            orig_e = float(c["end"])
            buf_s = max(0.0, orig_s - BUFFER_SEC)
            buf_e = orig_e + BUFFER_SEC
            dur = buf_e - buf_s
            raw_segments.append({
                "raw_start": round(raw_time, 3),
                "raw_end": round(raw_time + dur, 3),
                "orig_start": round(buf_s, 3),
                "orig_end": round(buf_e, 3),
            })
            raw_time += dur

    try:
        transcript = json.loads(Path(transcript_path).read_text(encoding="utf-8"))
    except Exception:
        return {"entries": []}

    seg_list = transcript.get("segments", [])
    entries = []
    for rs in raw_segments:
        orig_start = rs["orig_start"]
        orig_end = rs["orig_end"]
        raw_start = rs["raw_start"]
        raw_end = rs["raw_end"]
        offset = raw_start - orig_start
        for seg in seg_list:
            # 세그먼트가 orig 구간과 겹치기만 하면 포함 (완전 포함 아니어도 됨)
            if seg["end"] <= orig_start or seg["start"] >= orig_end:
                continue
            clipped_start = max(seg["start"], orig_start)
            clipped_end = min(seg["end"], orig_end)
            r_start = round(clipped_start + offset, 3)
            r_end = round(clipped_end + offset, 3)
            # raw 영상 범위 안으로 클리핑
            r_start = max(0.0, r_start)
            r_end = min(raw_end, r_end)
            if r_end - r_start > 0.1:
                entries.append({
                    "start": r_start,
                    "end": r_end,
                    "text": seg["text"].strip(),
                })
    return {"entries": entries}


@router.post("/update-title")
async def update_title(req: UpdateTitleRequest, session: SessionDirs = Depends(get_session)):
    stem = req.filename.replace("_shorts.mp4", "")
    analysis_path = session.analysis_dir / f"{stem}.json"
    if not analysis_path.exists():
        raise HTTPException(404, f"분석 파일 없음: {stem}.json")
    data = json.loads(analysis_path.read_text(encoding="utf-8"))
    data["intro_text"] = req.intro_text.strip()
    analysis_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"ok": True}


@router.post("/update-narration-script")
async def update_narration_script(req: UpdateNarrationScriptRequest, session: SessionDirs = Depends(get_session)):
    stem = req.filename.replace("_shorts.mp4", "").replace("_raw.mp4", "")
    analysis_path = session.analysis_dir / f"{stem}.json"
    if not analysis_path.exists():
        raise HTTPException(404, f"분석 파일 없음: {stem}.json")
    data = json.loads(analysis_path.read_text(encoding="utf-8"))
    data["narration_script"] = req.narration_script.strip()
    analysis_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    get_s3().upload(str(analysis_path), session.s3_key("analysis", analysis_path.name))
    return {"ok": True}


@router.post("/generate-narration-subtitles", response_model=GenerateNarrationSubtitlesResponse)
async def generate_narration_subtitles(req: GenerateNarrationSubtitlesRequest, session: SessionDirs = Depends(get_session)):
    """나레이션 음성(TTS)에 대한 자막을 Polly speech marks로 생성해 analysis json에 저장한다.

    렌더링 시 narration이 켜져 있으면 이 자막이 영상 자막 대신 사용된다.
    """
    stem = req.filename.replace("_shorts.mp4", "").replace("_raw.mp4", "")
    analysis_path = session.analysis_dir / f"{stem}.json"
    if not analysis_path.exists():
        raise HTTPException(404, f"분석 파일 없음: {stem}.json")

    data = json.loads(analysis_path.read_text(encoding="utf-8"))
    narration_text = data.get("intro_text", "")
    if req.narration_mode == "script":
        narration_text = data.get("narration_script") or narration_text
    if not narration_text.strip():
        raise HTTPException(422, "나레이션 텍스트가 없습니다.")

    from app.services.tts import get_narration_subtitles
    subtitles = await asyncio.to_thread(get_narration_subtitles, narration_text, req.narration_voice, req.narration_speed)
    if not subtitles:
        raise HTTPException(500, "나레이션 자막 생성 실패")

    data["narration_subtitles"] = subtitles
    analysis_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    get_s3().upload(str(analysis_path), session.s3_key("analysis", analysis_path.name))
    return GenerateNarrationSubtitlesResponse(subtitles=subtitles)


@router.post("/narration-preview", response_model=NarrationPreviewResponse)
async def narration_preview(req: GenerateNarrationSubtitlesRequest, session: SessionDirs = Depends(get_session)):
    """나레이션(TTS) 오디오와 자막 타이밍을 렌더링 전에 미리듣기/미리보기용으로 생성한다.

    analysis json에 저장하지 않는 일회성 미리듣기 — 렌더링 결과에 영향을 주지 않는다.
    """
    stem = req.filename.replace("_shorts.mp4", "").replace("_raw.mp4", "")
    analysis_path = session.analysis_dir / f"{stem}.json"
    if not analysis_path.exists():
        raise HTTPException(404, f"분석 파일 없음: {stem}.json")

    data = json.loads(analysis_path.read_text(encoding="utf-8"))
    narration_text = data.get("intro_text", "")
    if req.narration_mode == "script":
        narration_text = data.get("narration_script") or narration_text
    if not narration_text.strip():
        raise HTTPException(422, "나레이션 텍스트가 없습니다.")

    from app.services.tts import generate_narration_preview
    audio_bytes, subtitles = await asyncio.to_thread(
        generate_narration_preview, narration_text, req.narration_voice, req.narration_speed
    )
    if not audio_bytes:
        raise HTTPException(500, "나레이션 미리듣기 생성 실패")

    return NarrationPreviewResponse(audio_base64=base64.b64encode(audio_bytes).decode(), subtitles=subtitles)


@router.get("/srt/{stem}")
async def get_srt(stem: str, session: SessionDirs = Depends(get_session)):
    from app.services.editor import Editor
    srt_path = session.raw_dir / f"{stem}_raw.srt"
    analysis_path = session.analysis_dir / f"{stem}.json"
    if not srt_path.exists():
        if not analysis_path.exists():
            raise HTTPException(404, "분석 파일 없음")
        editor = Editor(session_dirs=session)
        ok = editor._get_editor(str(analysis_path))._generate_srt(str(analysis_path), str(srt_path))
        if not ok:
            raise HTTPException(422, "자막 생성 실패 (전사 데이터 없음)")
    return {"entries": _parse_srt(srt_path)}


@router.post("/srt")
async def save_srt(req: SrtSaveRequest, session: SessionDirs = Depends(get_session)):
    srt_path = session.raw_dir / f"{req.stem}_raw.srt"
    entries = [{"index": e.index, "times": e.times, "text": e.text} for e in req.entries]
    _write_srt(entries, srt_path)
    return {"ok": True, "count": len(entries)}


@router.get("/backgrounds")
async def list_backgrounds():
    backgrounds_dir = settings.STATIC_DIR / "backgrounds"
    backgrounds_dir.mkdir(parents=True, exist_ok=True)
    exts = {".png", ".jpg", ".jpeg", ".webp"}
    images = sorted(p.stem for p in backgrounds_dir.iterdir() if p.suffix.lower() in exts)
    return {"backgrounds": images}


@router.post("/backgrounds/upload")
async def upload_background(file: UploadFile = File(...)):
    import re as _re
    ext = Path(file.filename).suffix.lower() if file.filename else ".png"
    if ext not in {".png", ".jpg", ".jpeg", ".webp"}:
        raise HTTPException(400, "PNG/JPG/JPEG/WEBP 파일만 지원합니다")

    stem = Path(file.filename).stem if file.filename else "bg"
    stem = _re.sub(r"[^a-zA-Z0-9_\-가-힣]", "_", stem)[:64]

    bg_dir = settings.STATIC_DIR / "backgrounds"
    bg_dir.mkdir(parents=True, exist_ok=True)
    save_path = bg_dir / f"{stem}{ext}"

    content = await file.read()
    save_path.write_bytes(content)
    return {"filename": stem, "ok": True}
