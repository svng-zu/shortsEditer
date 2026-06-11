# backend/app/services/collector.py
"""YouTube 영상 수집 서비스

우회 전략 우선순위:
  1. yt-dlp OAuth2 토큰 (~/.cache/yt-dlp/oauth2_token.json)
  2. 쿠키 파일 (data/cookies_master.txt)
"""

import os
import shutil
import json
import requests
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit
import yt_dlp

from app.config import settings

_SESSION = requests.Session()
_SESSION.headers.update({"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) Chrome/120.0"})

# ---------------------------------------------------------------------------
# 채널 / 카테고리 설정
# ---------------------------------------------------------------------------
CHANNEL_LIMIT = {
    "sports": 6,
    "economy": 3,
    "politics": 3,
}

CATEGORY_CHANNELS = {
    "economy": [
        "https://www.youtube.com/@SBSBiz2021",
        "https://www.youtube.com/@hkwowtv",
    ],
    "politics": [
        "https://www.youtube.com/@MBCNEWS11",
        "https://www.youtube.com/@JTBC_news",
    ],
    "sports": [
        "https://www.youtube.com/@SPOTV",
        "https://www.youtube.com/@KBO1982",
    ],
}

# ---------------------------------------------------------------------------
# 인증 파일 경로
# ---------------------------------------------------------------------------
COOKIES_MASTER = str(settings.BASE_DIR / "data" / "cookies_master.txt")
COOKIES_WORK   = str(settings.BASE_DIR / "data" / "cookies_work.txt")
# yt-dlp-youtube-oauth2 플러그인이 캐시에 저장하는 경로
OAUTH_TOKEN    = str(Path.home() / ".cache" / "yt-dlp" / "youtube-oauth2" / "token_data.json")


def _prepare_cookies() -> str | None:
    if os.path.exists(COOKIES_MASTER):
        shutil.copy2(COOKIES_MASTER, COOKIES_WORK)
        return COOKIES_WORK
    legacy = str(settings.BASE_DIR / "data" / "cookies.txt")
    if os.path.exists(legacy):
        return legacy
    return None


def _has_oauth() -> bool:
    return os.path.exists(OAUTH_TOKEN)


BGUTIL_URL = os.environ.get("BGUTIL_URL", "http://127.0.0.1:4416")
YTDLP_PROXY = os.environ.get("YTDLP_PROXY", "")


def _bgutil_alive() -> bool:
    """bgutil POT 서버 생존 여부 확인"""
    try:
        r = _SESSION.get(f"{BGUTIL_URL}/ping", timeout=3)
        return r.status_code == 200
    except Exception:
        return False


def _auth_opts() -> dict:
    """OAuth2 > 쿠키 순으로 인증 옵션 반환"""
    if _has_oauth():
        print("[Auth] OAuth2 토큰 사용")
        opts: dict = {
            "username": "oauth2",
            "password": "",
            # js_runtimes 미지정 시 yt-dlp가 기본 활성화된 deno를 사용 (Dockerfile에 설치됨)
        }
        # bgutil POT 서버가 살아있으면 extractor_args에 추가
        ea: dict = {"youtube": {"lang": ["ko"]}}
        if _bgutil_alive():
            print(f"[Auth] bgutil POT 서버 사용: {BGUTIL_URL}")
            ea["youtubepot-bgutilhttp"] = {"base_url": [BGUTIL_URL]}
        opts["extractor_args"] = ea
        if YTDLP_PROXY:
            opts["proxy"] = YTDLP_PROXY
        return opts
    cookies = _prepare_cookies()
    if cookies:
        print("[Auth] 쿠키 파일 사용")
        opts = {
            "cookiefile": cookies,
            "extractor_args": {"youtube": {"player_client": ["web"], "lang": ["ko"]}},
        }
        if YTDLP_PROXY:
            opts["proxy"] = YTDLP_PROXY
        return opts
    print("[Auth] 인증 수단 없음 — 차단될 수 있음")
    if YTDLP_PROXY:
        return {"proxy": YTDLP_PROXY}
    return {}


# ---------------------------------------------------------------------------
# 채널 영상 목록 조회
# ---------------------------------------------------------------------------

def _videos_from_channel(channel_url: str, fetch_count: int = 30) -> list[dict]:
    """yt-dlp extract_flat으로 채널 최신 영상 목록 조회 (Invidious 불필요)

    기존 인증 인프라(OAuth2 + bgutil POT + 프록시)를 그대로 활용한다.
    flat 추출은 duration도 함께 반환하므로 영상별 추가 조회가 필요 없다.
    upload_date는 flat 모드에서 제공되지 않아 빈 문자열로 둔다.
    """
    # 채널 URL에 ?si=... 같은 공유 트래킹 쿼리스트링이 붙어 있으면 "/videos" 추가 시
    # URL이 깨져 yt-dlp가 채널의 영상 목록 대신 Videos/Live/Shorts 플레이리스트
    # 묶음을 반환하는 문제가 있어, 쿼리스트링/프래그먼트를 제거한 경로만 사용한다.
    parts = urlsplit(channel_url)
    base_url = urlunsplit((parts.scheme, parts.netloc, parts.path.rstrip("/"), "", ""))
    videos_url = base_url + "/videos"
    opts = {
        **_auth_opts(),
        "quiet": True,
        "skip_download": True,
        "no_warnings": True,
        "extract_flat": "in_playlist",
        "playlistend": fetch_count,
    }
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(videos_url, download=False)

    channel_name = info.get("channel") or info.get("uploader") or ""
    videos = []
    for entry in info.get("entries") or []:
        if not entry:
            continue
        vid = entry.get("id")
        if not vid:
            continue
        videos.append({
            "video_id":    vid,
            "title":       entry.get("title") or "",
            "video_url":   f"https://youtube.com/watch?v={vid}",
            "duration":    entry.get("duration"),
            "channel":     channel_name,
            "upload_date": entry.get("upload_date") or "",
        })
    return videos


def _get_duration_via_yt_dlp(video_id: str) -> int | None:
    """yt-dlp로 영상 duration만 가져오기 (인증 있을 때)"""
    opts = {
        **_auth_opts(),
        "quiet": True,
        "skip_download": True,
        "no_warnings": True,
    }
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(
                f"https://youtube.com/watch?v={video_id}", download=False
            )
            return info.get("duration")
    except Exception:
        return None


# ---------------------------------------------------------------------------
# YoutubeCollector
# ---------------------------------------------------------------------------
class YoutubeCollector:
    """YouTube 영상 수집기

    영상 목록: yt-dlp extract_flat (채널 /videos 페이지)
    다운로드: yt-dlp (OAuth2 > 쿠키 인증)
    """

    def __init__(self, download_dir: str | None = None):
        self.download_dir = download_dir or str(settings.DOWNLOAD_DIR)

    def get_latest_videos(self, channel_url: str) -> list[dict]:
        """채널 최신 영상 목록 조회"""
        try:
            videos = _videos_from_channel(channel_url)
        except Exception as e:
            raise RuntimeError(f"채널 영상 목록 조회 실패: {channel_url} ({e})")
        print(f"[Collector] 채널에서 {len(videos)}개 발견")

        # duration 필터링
        filtered = []
        for v in videos:
            dur = v.get("duration")
            if dur is None:
                dur = _get_duration_via_yt_dlp(v["video_id"])
            if dur is None:
                continue
            if dur < 180:  # 3분 미만 제외
                continue
            if dur > 7200:  # 2시간 초과 제외 (라이브 재방송 등 — Whisper 처리 시 메모리 부족 유발)
                print(f"[Collector] 제외 (너무 긺, {dur}s): {v.get('title', v['video_id'])}")
                continue
            v["duration"] = dur
            filtered.append(v)
        print(f"[Collector] duration 필터 후 {len(filtered)}개")
        return filtered

    def get_video_info(self, url: str) -> dict:
        """다운로드 없이 영상 메타데이터만 조회 (yt-dlp extract_info)"""
        opts = {
            **_auth_opts(),
            "quiet": True,
            "skip_download": True,
            "no_warnings": True,
        }
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=False)
        video_id = info.get("id", "")
        thumbnail = info.get("thumbnail") or f"https://img.youtube.com/vi/{video_id}/maxresdefault.jpg"
        # filesize_approx: 포맷별 filesize 합산 추정 (없으면 None)
        filesize = info.get("filesize_approx") or info.get("filesize")
        if filesize is None:
            formats = info.get("formats") or []
            sizes = [f.get("filesize") or f.get("filesize_approx") or 0 for f in formats[-5:]]
            filesize = max(sizes) if any(sizes) else None
        return {
            "title": info.get("title", ""),
            "duration": info.get("duration") or 0,
            "thumbnail_url": thumbnail,
            "filesize_approx": filesize,
            "video_id": video_id,
        }

    def get_channel_info(self, channel_url: str) -> dict:
        """채널 URL에서 채널 아바타 썸네일 URL 추출 (yt-dlp extract_flat)"""
        opts = {
            **_auth_opts(),
            "quiet": True,
            "skip_download": True,
            "no_warnings": True,
            "extract_flat": True,
            "playlistend": 1,
        }
        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(channel_url, download=False)
            thumbnails = info.get("thumbnails") or []
            # 가장 높은 해상도(마지막 항목)의 URL 사용
            thumbnail_url = next(
                (t["url"] for t in reversed(thumbnails) if t.get("url")), None
            )
            return {"thumbnail_url": thumbnail_url or info.get("thumbnail") or ""}
        except Exception:
            return {"thumbnail_url": ""}

    def download_video(self, video_url: str, on_progress: callable = None) -> dict:
        """영상 다운로드 (yt-dlp + 인증)"""
        hooks = []
        if on_progress:
            def _hook(d):
                if d["status"] == "downloading":
                    pct_str = d.get("_percent_str", "").strip()
                    speed   = d.get("_speed_str", "").strip()
                    on_progress(pct_str, speed)
            hooks.append(_hook)

        ydl_opts = {
            **_auth_opts(),
            "format": "bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best",
            "outtmpl": f"{self.download_dir}/%(title)s.%(ext)s",
            "merge_output_format": "mp4",
            "noplaylist": True,
            "postprocessors": [{"key": "FFmpegVideoConvertor", "preferedformat": "mp4"}],
            "quiet": True,
            "progress_hooks": hooks,
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(video_url, download=True)
            return {
                "title":    info.get("title"),
                "filepath": ydl.prepare_filename(info),
                "duration": info.get("duration"),
                "channel":  info.get("channel"),
                "video_id": info.get("id"),
            }

    def run(self, limit_per_channel: int = None, custom_channels: list[dict] = None,
            on_progress: callable = None) -> list:
        """전체 수집 실행
        custom_channels: [{"url": "...", "category": "..."}, ...] 형식
        on_progress(message: str, progress: int): 진행 상황 콜백
        """
        if not _has_oauth() and not _prepare_cookies():
            print(
                "\n[경고] 인증 수단 없음!\n"
                "  OAuth2: 로컬에서 `yt-dlp --username oauth2 --password '' <url>` 실행 후\n"
                "         ~/.cache/yt-dlp/oauth2_token.json 을 EC2로 복사하세요.\n"
                "  쿠키: 브라우저에서 내보낸 cookies.txt를\n"
                "        data/cookies_master.txt 로 저장하세요.\n"
            )

        # 사용자 채널이 있으면 카테고리별로 재구성, 없으면 기본값 사용
        if custom_channels:
            category_channels: dict[str, list] = {}
            for item in custom_channels:
                category_channels.setdefault(item["category"], []).append(item["url"])
        else:
            category_channels = CATEGORY_CHANNELS

        # 전체 예상 다운로드 수 계산 (진행률 기준)
        default_limit = limit_per_channel or 3
        total_channels = sum(len(chs) for chs in category_channels.values())
        total_expected = total_channels * default_limit
        completed = 0

        all_results = []

        for category, channels in category_channels.items():
            print(f"\n========== {category.upper()} ==========")
            limit = limit_per_channel if limit_per_channel is not None else CHANNEL_LIMIT.get(category, 1)

            for channel_url in channels:
                ch_name = channel_url.split("@")[-1] if "@" in channel_url else channel_url
                print(f"\n[CHANNEL] {channel_url} (최대 {limit}개)")
                channel_count = 0

                try:
                    if on_progress:
                        pct = int(completed / max(total_expected, 1) * 90) + 5
                        on_progress(f"[{category}] {ch_name} 채널 목록 조회 중...", pct)
                    videos = self.get_latest_videos(channel_url)

                    for video in videos:
                        if channel_count >= limit:
                            break

                        video["category"] = category
                        title_short = video["title"][:28] + ("…" if len(video["title"]) > 28 else "")
                        print(f"  TITLE: {video['title']}")
                        print(f"  URL:   {video['video_url']}")
                        print(f"  DUR:   {video.get('duration', '?')}s")

                        base_pct = int(completed / max(total_expected, 1) * 90) + 5

                        if on_progress:
                            on_progress(
                                f"[{category}] {ch_name} · {title_short} 다운로드 중... ({completed+1}/{total_expected})",
                                base_pct,
                            )

                        def _dl_hook(pct_str, speed, _bp=base_pct, _title=title_short, _cat=category, _ch=ch_name, _c=completed, _t=total_expected):
                            if on_progress and pct_str:
                                on_progress(
                                    f"[{_cat}] {_ch} · {_title} {pct_str} {speed} ({_c+1}/{_t})",
                                    _bp,
                                )

                        result = self.download_video(video["video_url"], on_progress=_dl_hook)
                        video["filepath"] = result["filepath"]
                        all_results.append(video)
                        channel_count += 1
                        completed += 1

                except Exception as e:
                    print(f"ERROR: {e}")

        save_path = settings.ANALYSIS_DIR.parent / "collected_videos.json"
        with open(save_path, "w", encoding="utf-8") as f:
            json.dump(all_results, f, ensure_ascii=False, indent=2)

        print("\n✅ COLLECTION COMPLETE")
        return all_results
