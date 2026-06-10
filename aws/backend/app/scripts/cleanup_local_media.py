"""로컬에 누적된 미디어 파일을 정리한다 — S3를 단일 영구 저장소로 유지하기 위한 일회성/반복 실행 도구.

대상:
  - downloads/*.part, downloads/*.wav  → 즉시 삭제 (미완성/재생성 가능)
  - downloads/*.mp4                    → S3에 있으면 로컬 삭제, 없으면 업로드 후 삭제
  - shorts/*.mp4                       → 동일 (S3에 있으면 삭제, 없으면 업로드 후 삭제)

건드리지 않음: raw/*.mp4, transcripts/*.json, analysis/*.json, .thumbs/, 최상위 *.json

idempotent — 여러 번 실행해도 안전.

사용: docker compose exec backend python3 -m app.scripts.cleanup_local_media
"""

import os

from app.config import settings
from app.services.s3_manager import get_s3


def cleanup_session(session_dir, s3) -> tuple[int, int]:
    """세션 1개 정리. (정리한 파일 수, 절약한 바이트) 반환"""
    session_id = session_dir.name
    cleaned, freed = 0, 0

    download_dir = session_dir / "downloads"
    shorts_dir = session_dir / "shorts"

    # downloads/*.part, downloads/*.wav — 미완성/임시 파일 즉시 삭제
    if download_dir.exists():
        for f in list(download_dir.glob("*.part")) + list(download_dir.glob("*.wav")):
            size = f.stat().st_size
            f.unlink()
            cleaned += 1
            freed += size
            print(f"[cleanup] {session_id}: 삭제 {f.relative_to(session_dir)}")

    # downloads/*.mp4, shorts/*.mp4 — S3에 있으면 로컬 삭제, 없으면 업로드 후 삭제
    for subdir, mp4_dir in (("downloads", download_dir), ("shorts", shorts_dir)):
        if not mp4_dir.exists():
            continue
        for f in mp4_dir.glob("*.mp4"):
            s3_key = f"sessions/{session_id}/{subdir}/{f.name}"
            size = f.stat().st_size
            if s3.exists(s3_key):
                f.unlink()
                cleaned += 1
                freed += size
                print(f"[cleanup] {session_id}: 삭제 (S3 백업 확인됨) {f.relative_to(session_dir)}")
            else:
                if s3.upload(str(f), s3_key):
                    f.unlink()
                    cleaned += 1
                    freed += size
                    print(f"[cleanup] {session_id}: 업로드 후 삭제 {f.relative_to(session_dir)}")
                else:
                    print(f"[cleanup] {session_id}: 업로드 실패, 보존 {f.relative_to(session_dir)}")

    return cleaned, freed


def main():
    sessions_root = settings.BASE_DIR / "data" / "sessions"
    if not sessions_root.exists():
        print(f"세션 디렉토리 없음: {sessions_root}")
        return

    s3 = get_s3()
    total_cleaned, total_freed = 0, 0
    for session_dir in sorted(sessions_root.iterdir()):
        if not session_dir.is_dir():
            continue
        cleaned, freed = cleanup_session(session_dir, s3)
        total_cleaned += cleaned
        total_freed += freed

    print(f"\n완료 — 파일 {total_cleaned}개 정리, {total_freed / (1024**3):.2f}GB 절약")


if __name__ == "__main__":
    main()
