"""Google Fonts CSS API로 Noto CJK 폰트를 동적으로 다운로드한다.
gstatic 직링크는 버전업마다 바뀌므로 CSS API에서 최신 URL을 추출해 사용.
실패 시 경고만 출력하고 종료 (빌드 중단 없음 — _resolve_font가 Nanum으로 fallback).
"""
import urllib.request
import re
import sys

UA = (
    "Mozilla/5.0 (Linux; Android 9; Pixel 3) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/87.0.4280.141 Mobile Safari/537.36"
)
FONTS = [
    ("Noto+Sans+KR:wght@700",  "/app/static/fonts/NotoSansKR-Bold.otf"),
    ("Noto+Serif+KR:wght@700", "/app/static/fonts/NotoSerifKR-Bold.otf"),
]

for query, out in FONTS:
    try:
        req = urllib.request.Request(
            f"https://fonts.googleapis.com/css2?family={query}",
            headers={"User-Agent": UA},
        )
        css = urllib.request.urlopen(req, timeout=30).read().decode()
        urls = re.findall(r"url\((https://fonts\.gstatic\.com[^)]+)\)", css)
        if urls:
            urllib.request.urlretrieve(urls[0], out)
            print(f"OK: {query} -> {out}")
        else:
            print(f"WARN: no font URL found for {query}", file=sys.stderr)
    except Exception as e:
        print(f"WARN: {query} download failed ({e})", file=sys.stderr)
