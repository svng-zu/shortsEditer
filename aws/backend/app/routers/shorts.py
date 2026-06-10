# backend/app/routers/shorts.py
"""쇼츠 CRUD API"""

import json
import subprocess
import requests
from pathlib import Path
from urllib.parse import quote
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse, RedirectResponse, StreamingResponse

from app.config import settings
from app.session import get_session, SessionDirs, load_video_id_map
from app.models.schemas import ShortInfo, RawInfo, UpdateTitleRequest, SrtSaveRequest
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


@router.get("/shorts")
async def list_shorts(session: SessionDirs = Depends(get_session)):
    shorts = []
    for mp4 in sorted(session.shorts_dir.glob("*.mp4")):
        stem = mp4.stem.replace("_shorts", "")
        analysis_file = session.analysis_dir / f"{stem}.json"
        meta = {}
        if analysis_file.exists():
            meta = json.loads(analysis_file.read_text(encoding="utf-8"))
        shorts.append(ShortInfo(
            filename=mp4.name,
            url=f"/api/media/shorts/{session.session_id}/{mp4.name}",
            title=meta.get("intro_text", mp4.stem).replace("\\n", " "),
            category=meta.get("category", ""),
            candidates=meta.get("candidates", []),
        ))
    return {"shorts": shorts}


@router.get("/raws")
async def list_raws(session: SessionDirs = Depends(get_session)):
    raws = []
    for mp4 in sorted(session.raw_dir.glob("*.mp4")):
        stem = mp4.stem.replace("_raw", "")
        analysis_file = session.analysis_dir / f"{stem}.json"
        meta = {}
        if analysis_file.exists():
            meta = json.loads(analysis_file.read_text(encoding="utf-8"))
        raws.append(RawInfo(
            filename=mp4.name,
            url=f"/api/media/raw/{session.session_id}/{mp4.name}",
            title=meta.get("intro_text", stem).replace("\\n", " / "),
            category=meta.get("category", ""),
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
    if not path.exists():
        raise HTTPException(404, "파일 없음")
    path.unlink()
    get_s3().delete(session.s3_key("shorts", filename))
    return {"ok": True}


@router.delete("/raws/{filename}")
async def delete_raw(filename: str, session: SessionDirs = Depends(get_session)):
    path = session.raw_dir / filename
    if not path.exists():
        raise HTTPException(404, "파일 없음")
    path.unlink()
    get_s3().delete(session.s3_key("raw", filename))
    return {"ok": True}


@router.delete("/downloads/{filename}")
async def delete_download(filename: str, session: SessionDirs = Depends(get_session)):
    path = session.download_dir / filename
    if not path.exists():
        raise HTTPException(404, "파일 없음")
    path.unlink()
    get_s3().delete(session.s3_key("downloads", filename))
    _thumb_path(session, filename).unlink(missing_ok=True)
    return {"ok": True}


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
