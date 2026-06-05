FROM python:3.11-slim

WORKDIR /app

# 시스템 패키지 설치
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libgl1 \
    libglib2.0-0 \
    fonts-nanum \
    curl \
    nodejs \
    npm \
    && rm -rf /var/lib/apt/lists/*

# Python 패키지 설치 (레이어 캐시 활용)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# yt-dlp-youtube-oauth2 플러그인 버그 패치 (device_code 파라미터 + 초기 데이터 API OAuth 제외)
COPY patch_ytdlp_oauth.py .
RUN python patch_ytdlp_oauth.py

# Whisper small 모델 빌드 타임에 미리 다운로드 (첫 실행 지연 방지)
ARG WHISPER_MODEL=small
RUN python -c "import whisper; whisper.load_model('${WHISPER_MODEL}')"

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
    /app/static/logos

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
