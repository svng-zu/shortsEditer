FROM python:3.11-slim

WORKDIR /app

# 시스템 패키지 설치
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libgl1 \
    libglib2.0-0 \
    fonts-nanum \
    curl \
    unzip \
    nodejs \
    npm \
    && rm -rf /var/lib/apt/lists/*

# yt-dlp EJS(JS Challenge) 솔버용 deno 런타임 설치 (node는 unsupported로 표시됨)
RUN curl -fsSL https://deno.land/install.sh | DENO_INSTALL=/usr/local sh -s -- -y

# Python 패키지 설치 (레이어 캐시 활용)
# PyPI 인덱스가 일시적으로 503을 반환하는 경우가 있어 재시도 추가
COPY requirements.txt .
RUN sh -c 'for i in 1 2 3 4 5; do pip install --no-cache-dir -r requirements.txt && exit 0; sleep 10; done; exit 1'

# yt-dlp-youtube-oauth2 플러그인 버그 패치 (device_code 파라미터 + 초기 데이터 API OAuth 제외)
COPY patch_ytdlp_oauth.py .
RUN python patch_ytdlp_oauth.py

# faster-whisper small 모델 빌드 타임에 미리 다운로드 (첫 실행 지연 방지)
ARG WHISPER_MODEL=small
RUN python -c "from faster_whisper import WhisperModel; WhisperModel('${WHISPER_MODEL}', device='cpu', compute_type='int8')"

# 애플리케이션 코드 복사
COPY . .

# 데이터 디렉토리 생성
RUN mkdir -p /app/data/downloads \
    /app/data/transcripts \
    /app/data/analysis \
    /app/data/shorts \
    /app/data/raw \
    /app/data/temp \
    /app/static/backgrounds \
    /app/static/logos \
    /app/static/fonts

# Google Fonts 다운로드 (FFmpeg drawtext 렌더링용)
# Black Han Sans — 고정 URL (버전 안정적)
RUN curl -fL -o /app/static/fonts/BlackHanSans-Regular.ttf \
      "https://fonts.gstatic.com/s/blackhansans/v17/ea8Aad44WunzF9a-dL6toA8r8nqVIXSkH-Hc.ttf"

# Noto CJK 폰트 — Google Fonts CSS API에서 URL 동적 추출 (버전 변경에 무관)
# 실패해도 빌드 중단 없음 (_resolve_font가 Nanum 폰트로 자동 fallback)
RUN python3 /app/download_fonts.py || true

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
