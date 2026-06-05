"""세션별 파일 경로 관리"""

from dataclasses import dataclass
from pathlib import Path
from fastapi import Header

from app.config import settings


@dataclass
class SessionDirs:
    session_id: str
    download_dir: Path
    transcript_dir: Path
    analysis_dir: Path
    shorts_dir: Path
    raw_dir: Path

    @property
    def category_map_path(self) -> Path:
        return self.download_dir.parent / "category_map.json"

    def s3_key(self, subdir: str, filename: str) -> str:
        return f"sessions/{self.session_id}/{subdir}/{filename}"


def make_session(session_id: str) -> SessionDirs:
    base = settings.BASE_DIR / "data" / "sessions" / session_id
    s = SessionDirs(
        session_id=session_id,
        download_dir=base / "downloads",
        transcript_dir=base / "transcripts",
        analysis_dir=base / "analysis",
        shorts_dir=base / "shorts",
        raw_dir=base / "raw",
    )
    for d in [s.download_dir, s.transcript_dir, s.analysis_dir, s.shorts_dir, s.raw_dir]:
        d.mkdir(parents=True, exist_ok=True)
    return s


async def get_session(x_session_id: str = Header(default="default")) -> SessionDirs:
    return make_session(x_session_id)
