"""기존(채널맵 도입 이전) 다운로드 영상에 출처 채널 정보를 1회 보충하는 스크립트.

collected_videos.json(stem -> 채널 표시명)과 각 세션의 channels.json(등록 채널 ->
썸네일)을 yt-dlp로 매칭해 channel_map.json을 채운다.
"""
import json
from pathlib import Path
from urllib.parse import urlsplit

import yt_dlp

from app.config import settings
from app.session import make_session, load_channel_map, save_channel_map

DATA_DIR = settings.BASE_DIR / "data"


def _channel_display_name(channel_url: str) -> str | None:
    opts = {
        "quiet": True, "skip_download": True, "no_warnings": True,
        "extract_flat": "in_playlist", "playlistend": 1,
    }
    base = urlsplit(channel_url)
    videos_url = f"{base.scheme}://{base.netloc}{base.path.rstrip('/')}/videos"
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(videos_url, download=False)
        return info.get("channel") or info.get("uploader")
    except Exception as e:
        print(f"  [WARN] {channel_url} 조회 실패: {e}")
        return None


def main():
    collected_path = DATA_DIR / "collected_videos.json"
    if not collected_path.exists():
        print("collected_videos.json 없음")
        return
    collected = json.loads(collected_path.read_text(encoding="utf-8"))

    # session_id -> {stem: channel_display_name}
    by_session: dict[str, dict[str, str]] = {}
    for v in collected:
        fp = v.get("filepath", "")
        ch = v.get("channel")
        if not fp or not ch or "/sessions/" not in fp:
            continue
        session_id = fp.split("/sessions/")[1].split("/")[0]
        stem = Path(fp).stem
        by_session.setdefault(session_id, {})[stem] = ch

    for session_id, stem_to_channel in by_session.items():
        print(f"\n[SESSION {session_id}]")
        s = make_session(session_id)
        if not s.channels_path.exists():
            print("  channels.json 없음 — 스킵")
            continue
        registered = json.loads(s.channels_path.read_text(encoding="utf-8"))

        # 등록 채널 URL -> 표시명 조회 (캐시)
        name_to_thumb: dict[str, str] = {}
        for c in registered:
            name = _channel_display_name(c["url"])
            if name:
                name_to_thumb[name] = c.get("thumbnail_url", "")
                print(f"  {c['url']} -> '{name}'")

        ch_map = load_channel_map(s)
        updated = 0
        for stem, channel_name in stem_to_channel.items():
            if stem in ch_map:
                continue
            thumb = name_to_thumb.get(channel_name, "")
            ch_map[stem] = {"name": channel_name, "thumbnail_url": thumb}
            updated += 1
        save_channel_map(s, ch_map)
        print(f"  -> {updated}개 항목 추가 (총 {len(ch_map)}개)")


if __name__ == "__main__":
    main()
