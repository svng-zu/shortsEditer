# ShortsAI — CLAUDE.md

YouTube 채널에서 영상을 수집해 자동으로 쇼츠를 생성하는 파이프라인. AWS 버전(`aws/`)이 메인.

## 프로젝트 구조

```
aws/
  backend/app/
    config.py          # 환경설정 (S3_BUCKET_NAME, GEMINI_API_KEY 등)
    session.py         # 세션별 로컬 경로 + S3 키 관리 (SessionDirs)
    routers/
      pipeline.py      # 수집/자막/분석/편집 파이프라인 API + S3 업로드
      shorts.py        # 쇼츠 CRUD + S3 presigned URL 미디어 서빙
      render.py        # 렌더링/미리보기 API + S3 업로드
      youtube.py       # YouTube 업로드 OAuth
      auth.py          # 소셜 로그인 (준비중)
    services/
      s3_manager.py    # S3 업로드/다운로드/presigned URL (get_s3() 싱글톤)
      collector.py     # yt-dlp YouTube 다운로더
      transcriber.py   # Whisper 자막 생성 (S3 업로드는 pipeline.py에서 처리)
      analyzer.py      # Gemini 2.5 Flash LLM 분석 (analysis_dir 파라미터 필수)
      editor.py        # 카테고리별 에디터 디스패처
      editor_base.py   # FFmpeg 편집 공통 로직 (얼굴 감지 crop, 오버레이)
      editor_sports/economy/politics.py  # 카테고리별 템플릿
      tts.py           # TTS 나레이션 생성
      youtube_uploader.py  # YouTube 업로드
  frontend/src/
    App.tsx            # 메인 SPA
    components/        # Header, Pipeline, ShortsPanel, DetailPanel, RightPanel
    services/api.ts    # 백엔드 API 호출
  docker-compose.yml
  .env                 # 실제 환경변수 (git 제외)
  .env.example         # 환경변수 템플릿
```

## S3 파일 구조

```
s3://aishortsbucket/
  sessions/{session_id}/
    downloads/{filename}.mp4    # 다운로드된 원본 영상
    transcripts/{filename}.json # Whisper 자막
    analysis/{filename}.json    # Gemini 분석 결과
    raw/{filename}_raw.mp4      # 1차 편집본 (크롭+합치기)
    shorts/{filename}_shorts.mp4 # 최종 쇼츠 (오버레이 완성본)
```

## 파이프라인 흐름

1. **수집** (`/api/collect` or `/api/download-url`) → `collector.py` → `downloads/` → S3 업로드
2. **자막** (`/api/transcribe`) → `transcriber.py` Whisper → `transcripts/` → S3 업로드
3. **분석** (`/api/analyze`) → `analyzer.py` Gemini → `analysis/` → S3 업로드
   - `analyzer.analyze(transcript_path, category, analysis_dir)` — `analysis_dir` 반드시 세션 경로 전달
4. **편집** (`/api/edit`) → `editor_base.edit_video()` → `raw/` → S3 업로드
5. **렌더** (`/api/render`) → `editor_base.apply_overlay()` → `shorts/` → S3 업로드

## 미디어 서빙

- `GET /api/media/shorts/{session_id}/{filename}` → S3 presigned URL redirect (유효 1시간)
- `GET /api/media/raw/{session_id}/{filename}` → 동일

S3에 없으면 로컬 파일 서빙으로 폴백.

## 세션 관리

- `X-Session-Id` 헤더로 세션 구분 (기본값: `"default"`)
- `SessionDirs.s3_key(subdir, filename)` → `sessions/{id}/{subdir}/{filename}`
- 로컬 경로: `aws/data/sessions/{session_id}/{subdir}/`

## 주요 환경변수 (.env)

```
AWS_REGION=ap-northeast-2
S3_BUCKET_NAME=aishortsbucket
GEMINI_API_KEY=...
YOUTUBE_CLIENT_ID=...
YOUTUBE_CLIENT_SECRET=...
YOUTUBE_REDIRECT_URI=http://{EC2_IP}/api/youtube/callback
WHISPER_MODEL=small
CORS_ORIGINS=["http://localhost:5173","http://{EC2_IP}"]
```

## 실행 방법

```bash
cd aws
docker-compose up --build
```

EC2 IAM Role에 S3 읽기/쓰기 권한 필요 (`aishortsbucket`).

## 알려진 사항

- 로컬 파일은 docker volume (`./data:/app/data`)으로 유지 → EC2 재시작 후에도 보존
- S3는 영구 백업 + 미디어 서빙용 (EC2 디스크 절약)
- bgutil 컨테이너: YouTube 다운로드 POT 우회용 (port 4416)
- 카테고리: `economy`, `politics`, `sports`
