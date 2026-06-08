# backend/app/routers/shorts.py
"""쇼츠 CRUD API"""

import json
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, RedirectResponse

from app.config import settings
from app.session import get_session, SessionDirs
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
    images = sorted(p.stem for p in backgrounds_dir.glob("*.png"))
    return {"backgrounds": images}
