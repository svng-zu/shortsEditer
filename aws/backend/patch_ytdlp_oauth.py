"""yt-dlp-youtube-oauth2 플러그인 버그 패치"""
import os, sys

plugin_path = None
try:
    import yt_dlp_plugins.extractor.youtubeoauth as m
    plugin_path = m.__file__
except ImportError:
    sys.exit("yt-dlp-youtube-oauth2 not installed")

with open(plugin_path) as f:
    src = f.read()

# Fix 1: 'code' → 'device_code' (token polling 파라미터 오류)
src = src.replace(
    "'code': code_response['device_code'],",
    "'device_code': code_response['device_code'],",
)

# Fix 2: /youtubei/v1/next 등 초기 데이터 API에 OAuth 헤더 제외
old = (
    "    def handle_oauth(self, request: yt_dlp.networking.Request):\n"
    "\n"
    "        if not urllib.parse.urlparse(request.url).netloc.endswith('youtube.com'):\n"
    "            return"
)
new = (
    "    def handle_oauth(self, request: yt_dlp.networking.Request):\n"
    "        parsed = urllib.parse.urlparse(request.url)\n"
    "        if not parsed.netloc.endswith('youtube.com'):\n"
    "            return\n"
    "        if '/youtubei/v1/' in parsed.path and '/youtubei/v1/player' not in parsed.path:\n"
    "            return"
)
src = src.replace(old, new)

with open(plugin_path, "w") as f:
    f.write(src)

print(f"Patched: {plugin_path}")
