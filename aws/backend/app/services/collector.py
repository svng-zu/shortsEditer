# backend/app/services/collector.py
"""YouTube 영상 수집 서비스"""

import os
import json
import yt_dlp

from app.config import settings

CHANNEL_LIMIT = {
    "sports": 6,
    "economy": 3,
    "politics": 3,
}

CATEGORY_CHANNELS = {
    "economy": [
        "https://www.youtube.com/@SBSBiz2021",
        "https://www.youtube.com/@hkwowtv"
    ],
    "politics": [
        "https://www.youtube.com/@MBCNEWS11",
        "https://www.youtube.com/@JTBC_news"
    ],
    "sports": [
        "https://www.youtube.com/@SPOTV",
        "https://www.youtube.com/@KBO1982"
    ]
}


class YoutubeCollector:
    """YouTube 영상 수집기"""

    def __init__(self):
        self.ydl_extract_opts = {
            "quiet": True,
            "extract_flat": True,
            "playlistend": 10
        }
        self.download_dir = str(settings.DOWNLOAD_DIR)

    def get_latest_videos(self, channel_url):
        """채널의 최신 영상 목록 조회"""
        videos = []

        with yt_dlp.YoutubeDL(self.ydl_extract_opts) as ydl:
            info = ydl.extract_info(channel_url + "/videos", download=False)
            entries = info.get("entries", [])

            for entry in entries:
                if not entry:
                    continue

                duration = entry.get("duration")

                if duration is None:  # shorts 제외
                    continue
                if duration < 180:    # 3분 이하 제외
                    continue

                videos.append({
                    "title": entry.get("title"),
                    "video_url": f"https://youtube.com/watch?v={entry.get('id')}",
                    "duration": duration,
                    "channel": entry.get("channel"),
                    "upload_date": entry.get("upload_date")
                })

        return videos

    def download_video(self, url, quality="1080"):
        """영상 다운로드"""
        ydl_opts = {
            "format": (
                f"bestvideo[height>={quality}][height<=2160][ext=mp4][vcodec^=avc]"
                f"+bestaudio[ext=m4a]"
                f"/bestvideo[height>={quality}][height<=2160][ext=mp4]"
                f"+bestaudio[ext=m4a]"
                f"/best[ext=mp4]"
            ),
            "outtmpl": f"{self.download_dir}/%(title)s.%(ext)s",
            "merge_output_format": "mp4",
            "noplaylist": True,
            "postprocessors": [{
                "key": "FFmpegVideoConvertor",
                "preferedformat": "mp4"
            }]
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            file_path = ydl.prepare_filename(info)

            return {
                "title": info.get("title"),
                "filepath": file_path,
                "duration": info.get("duration"),
                "channel": info.get("channel")
            }

    def run(self):
        """전체 수집 실행"""
        all_results = []

        for category, channels in CATEGORY_CHANNELS.items():
            print(f"\n========== {category.upper()} ==========")
            limit = CHANNEL_LIMIT.get(category, 1)

            for channel_url in channels:
                print(f"\n[CHANNEL] {channel_url} (최대 {limit}개)")
                channel_count = 0

                try:
                    videos = self.get_latest_videos(channel_url)

                    for video in videos:
                        if channel_count >= limit:
                            break

                        video["category"] = category
                        print(f"  TITLE: {video['title']}")
                        print(f"  URL: {video['video_url']}")
                        print(f"  DURATION: {video['duration']}")

                        print(f"  다운로드 시작...")
                        result = self.download_video(video["video_url"])
                        video["filepath"] = result["filepath"]

                        all_results.append(video)
                        channel_count += 1

                except Exception as e:
                    print(f"ERROR: {e}")

        # 메타데이터 저장
        save_path = settings.ANALYSIS_DIR.parent / "collected_videos.json"
        with open(save_path, "w", encoding="utf-8") as f:
            json.dump(all_results, f, ensure_ascii=False, indent=2)

        print("\n✅ COLLECTION COMPLETE")
        return all_results
