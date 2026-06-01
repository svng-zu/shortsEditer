# backend/app/routers/shorts.py
"""쇼츠 CRUD API"""

import json
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from app.config import settings
from app.models.schemas import ShortInfo, RawInfo, UpdateTitleRequest, SrtSaveRequest

router = APIRouter()


def _parse_srt(srt_path) -> list:
    """SRT 파일 파싱"""
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
    """SRT 파일 작성"""
    content = ""
    for e in entries:
        content += f"{e['index']}\n{e['times']}\n{e['text']}\n\n"
    srt_path.write_text(content, encoding="utf-8")


@router.get("/shorts")
async def list_shorts():
    """완성된 쇼츠 목록"""
    shorts = []
    for mp4 in sorted(settings.SHORTS_DIR.glob("*.mp4")):
        stem = mp4.stem.replace("_shorts", "")
        analysis_file = settings.ANALYSIS_DIR / f"{stem}.json"
        meta = {}
        if analysis_file.exists():
            meta = json.loads(analysis_file.read_text(encoding="utf-8"))

        shorts.append(ShortInfo(
            filename=mp4.name,
            url=f"/shorts/{mp4.name}",
            title=meta.get("intro_text", mp4.stem).replace("\\n", " "),
            category=meta.get("category", ""),
            candidates=meta.get("candidates", []),
        ))
    return {"shorts": shorts}


@router.get("/raws")
async def list_raws():
    """편집된 raw 영상 목록"""
    raws = []
    for mp4 in sorted(settings.RAW_DIR.glob("*.mp4")):
        stem = mp4.stem.replace("_raw", "")
        analysis_file = settings.ANALYSIS_DIR / f"{stem}.json"
        meta = {}
        if analysis_file.exists():
            meta = json.loads(analysis_file.read_text(encoding="utf-8"))
        raws.append(RawInfo(
            filename=mp4.name,
            url=f"/raw/{mp4.name}",
            title=meta.get("intro_text", stem).replace("\\n", " / "),
            category=meta.get("category", ""),
        ))
    return {"raws": raws}


@router.delete("/shorts/{filename}")
async def delete_short(filename: str):
    """쇼츠 삭제"""
    path = settings.SHORTS_DIR / filename
    if not path.exists():
        raise HTTPException(404, "파일 없음")
    path.unlink()
    return {"ok": True}


@router.post("/update-title")
async def update_title(req: UpdateTitleRequest):
    """쇼츠 제목 수정"""
    stem = req.filename.replace("_shorts.mp4", "")
    analysis_path = settings.ANALYSIS_DIR / f"{stem}.json"

    if not analysis_path.exists():
        raise HTTPException(404, f"분석 파일 없음: {stem}.json")

    data = json.loads(analysis_path.read_text(encoding="utf-8"))
    data["intro_text"] = req.intro_text.strip()
    analysis_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"[Title] {stem} → '{req.intro_text.strip()}'")
    return {"ok": True}


@router.get("/srt/{stem}")
async def get_srt(stem: str):
    """SRT 자막 조회"""
    from app.services.editor import Editor

    srt_path = settings.RAW_DIR / f"{stem}_raw.srt"
    analysis_path = settings.ANALYSIS_DIR / f"{stem}.json"

    if not srt_path.exists():
        if not analysis_path.exists():
            raise HTTPException(404, "분석 파일 없음")
        editor = Editor()
        ok = editor._get_editor(str(analysis_path))._generate_srt(str(analysis_path), str(srt_path))
        if not ok:
            raise HTTPException(422, "자막 생성 실패 (전사 데이터 없음)")

    return {"entries": _parse_srt(srt_path)}


@router.post("/srt")
async def save_srt(req: SrtSaveRequest):
    """SRT 자막 저장"""
    srt_path = settings.RAW_DIR / f"{req.stem}_raw.srt"
    entries = [{"index": e.index, "times": e.times, "text": e.text} for e in req.entries]
    _write_srt(entries, srt_path)
    return {"ok": True, "count": len(entries)}


@router.get("/backgrounds")
async def list_backgrounds():
    """배경 이미지 목록"""
    backgrounds_dir = settings.STATIC_DIR / "backgrounds"
    backgrounds_dir.mkdir(parents=True, exist_ok=True)
    images = sorted(p.stem for p in backgrounds_dir.glob("*.png"))
    return {"backgrounds": images}
