# 고릴라AI 백엔드 API 전체 명세서

> **FastAPI 기반** — 모든 엔드포인트는 `/api` 프리픽스  
> **인증**: JWT Bearer 토큰 (`Authorization: Bearer <token>`)  
> **세션**: 비로그인 시 `X-Session-Id` 헤더, 로그인 시 사용자 계정에 연결된 session_id 자동 사용

---

## 목차

1. [인증 (Auth)](#1-인증-auth)
2. [파이프라인 (Pipeline)](#2-파이프라인-pipeline)
3. [쇼츠 관리 (Shorts)](#3-쇼츠-관리-shorts)
4. [렌더링 (Render)](#4-렌더링-render)
5. [YouTube 업로드](#5-youtube-업로드)
6. [관리자 (Admin)](#6-관리자-admin)
7. [공통 데이터 모델](#7-공통-데이터-모델)
8. [인프라 / 환경 설정](#8-인프라--환경-설정)

---

## 1. 인증 (Auth)

> 프리픽스: `/api/auth`

### 1.1 이메일 회원가입

```
POST /api/auth/signup
```

**Request Body:**
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| email | string (email) | ✅ | 이메일 주소 |
| password | string | ✅ | 비밀번호 |
| name | string | | 사용자 이름 |
| session_id | string | ✅ | 가입 시점 브라우저의 기존 세션 ID (데이터 연결용) |

**Response (TokenResponse):**
```json
{
  "access_token": "eyJhbGciOi...",
  "token_type": "bearer",
  "user": {
    "id": "uuid",
    "email": "user@email.com",
    "name": "홍길동",
    "provider": "local",
    "is_admin": false,
    "created_at": "2026-06-17T12:00:00"
  }
}
```

**에러:**
- `409`: 이미 가입된 이메일

---

### 1.2 이메일 로그인

```
POST /api/auth/login
```

**Request Body:**
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| email | string (email) | ✅ | 이메일 주소 |
| password | string | ✅ | 비밀번호 |

**Response:** `TokenResponse` (위와 동일)

**에러:**
- `401`: 이메일 또는 비밀번호 불일치

---

### 1.3 비밀번호 재설정 요청

```
POST /api/auth/forgot-password
```

**Request Body:**
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| email | string (email) | ✅ | 가입 이메일 |

**Response:**
```json
{ "message": "해당 이메일로 가입된 계정이 있다면 비밀번호 재설정 링크를 보내드렸습니다." }
```

- 계정 존재 여부를 노출하지 않기 위해 항상 동일 메시지 반환
- AWS SES로 재설정 링크 이메일 발송 (유효시간: 30분)

---

### 1.4 비밀번호 재설정 실행

```
POST /api/auth/reset-password
```

**Request Body:**
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| token | string | ✅ | 이메일로 받은 재설정 토큰 |
| new_password | string | ✅ | 새 비밀번호 (8자 이상) |

**Response:**
```json
{ "message": "비밀번호가 변경되었습니다. 새 비밀번호로 로그인해주세요." }
```

**에러:**
- `400`: 토큰 만료/무효 또는 비밀번호 8자 미만

---

### 1.5 현재 사용자 조회

```
GET /api/auth/me
```

**Headers:** `Authorization: Bearer <token>` (필수)

**Response (UserResponse):**
```json
{
  "id": "uuid",
  "email": "user@email.com",
  "name": "홍길동",
  "provider": "local",
  "is_admin": false,
  "created_at": "2026-06-17T12:00:00"
}
```

---

### 1.6 Google 소셜 로그인

```
GET /api/auth/google/login?session_id={session_id}
```

**Query Params:**
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| session_id | string | ✅ | 현재 세션 ID (OAuth state로 왕복) |

**Response:**
```json
{ "url": "https://accounts.google.com/o/oauth2/auth?..." }
```

프런트엔드에서 이 URL로 리다이렉트하여 Google 동의 화면 표시.

---

### 1.7 Google 콜백

```
GET /api/auth/google/callback?code={code}&state={session_id}
```

- 내부 처리: 토큰 교환 → 사용자 찾기/생성 → JWT 발급
- **리다이렉트:** `/#auth_token={jwt}` (성공) 또는 `/#auth_error=google` (실패)
- 기존 이메일 계정이 있으면 Google 연결 병합

---

## 2. 파이프라인 (Pipeline)

> 프리픽스: `/api`

### 2.1 사용량 조회 (쿼터)

```
GET /api/quota
```

**Response:**
```json
{
  "used": 2,
  "limit": 5,
  "is_member": true,
  "is_admin": false
}
```

| 사용자 유형 | 수집 한도 |
|------------|----------|
| 비로그인 (익명) | 2개 |
| 무료 회원 | 5개 |
| 관리자 | 무제한 |

---

### 2.2 채널 관리

#### 채널 목록 조회

```
GET /api/channels
```

**Response:**
```json
{
  "channels": [
    { "url": "https://www.youtube.com/@SPOTV", "category": "sports", "thumbnail_url": "https://..." }
  ]
}
```

#### 채널 추가

```
POST /api/channels
```

**Request Body:**
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| url | string | ✅ | YouTube 채널 URL |
| category | string | | 카테고리 (`economy`, `politics`, `sports`). 기본: `economy` |

**Response:**
```json
{ "ok": true, "channels": [...] }
```

- 채널 썸네일을 yt-dlp로 자동 조회하여 저장
- 중복 채널 추가 시 `400` 에러

#### 채널 삭제

```
DELETE /api/channels
```

**Request Body:**
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| url | string | ✅ | 삭제할 채널 URL |

---

### 2.3 영상 정보 조회 (다운로드 전 확인)

```
GET /api/video-info?url={youtube_url}
```

**Response (VideoInfoResponse):**
```json
{
  "title": "영상 제목",
  "duration": 1230,
  "thumbnail_url": "https://i.ytimg.com/vi/.../maxresdefault.jpg",
  "filesize_approx": 524288000,
  "video_id": "dQw4w9WgXcQ"
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| title | string | 영상 제목 |
| duration | int | 영상 길이 (초) |
| thumbnail_url | string | 썸네일 URL |
| filesize_approx | int? | 추정 파일 크기 (바이트) |
| video_id | string | YouTube 영상 ID |

---

### 2.4 영상 수집 (채널 기반)

```
POST /api/collect
```

**Request Body:**
| 필드 | 타입 | 필수 | 기본값 | 설명 |
|------|------|------|--------|------|
| clear_existing | bool | | `true` | 기존 파일 삭제 후 수집 |
| limit_per_channel | int | | `3` | 채널당 수집 영상 수 |
| channel_urls | string[]? | | `null` | 특정 채널만 수집 (null이면 전체) |

**동작:**
- 비동기 실행 (즉시 `{"ok": true}` 반환)
- 등록된 채널에서 최근 영상 다운로드
- 다운로드 → S3 업로드
- 카테고리/채널 매핑 자동 저장
- 쿼터 초과 시 `403` (code: `quota_exceeded`)

---

### 2.5 URL 직접 다운로드

```
POST /api/download-url
```

**Request Body:**
| 필드 | 타입 | 필수 | 기본값 | 설명 |
|------|------|------|--------|------|
| url | string | ✅ | | YouTube 영상 URL |
| category | string | | `economy` | 카테고리 |

**동작:**
- 비동기 실행
- yt-dlp로 다운로드 (OAuth2 > 쿠키 > bgutil POT 순으로 인증)
- 쿼터 초과 시 `403`

#### 다운로드 상태 조회

```
GET /api/download-url-status
```

**Response:**
```json
{
  "status": "downloading",
  "message": "42.3%",
  "filename": null,
  "error": null
}
```

| status 값 | 설명 |
|-----------|------|
| `idle` | 대기 |
| `starting` | 시작 중 |
| `downloading` | 다운로드 중 (message에 진행률) |
| `done` | 완료 (filename에 파일명) |
| `error` | 실패 (error에 메시지) |

---

### 2.6 영상 파일 업로드

```
POST /api/upload-video
Content-Type: multipart/form-data
```

| 필드 | 타입 | 설명 |
|------|------|------|
| file | File | MP4/MKV/MOV/AVI 파일 |

**Response:**
```json
{ "ok": true, "filename": "video.mp4", "size_mb": 125.3 }
```

---

### 2.7 파이프라인 상태 조회

```
GET /api/status
```

**Response (PipelineStatus):**
```json
{
  "step": "analyzing",
  "message": "LLM 분석 중 (총 3개)...",
  "progress": 45
}
```

| step 값 | 설명 |
|---------|------|
| `idle` | 대기 중 |
| `collecting` | 수집 중 |
| `transcribing` | 자막 생성 중 |
| `analyzing` | LLM 분석 중 |
| `editing` | 편집/렌더링 중 |
| `done` | 완료 |
| `error` | 오류 |

---

### 2.8 파이프라인 제어

#### 일시정지

```
POST /api/pause
```

**Response:** `{ "ok": true, "paused": true }`

#### 재개

```
POST /api/resume
```

**Response:** `{ "ok": true, "paused": false }`

#### 중지

```
POST /api/stop
```

실행 중인 asyncio Task를 취소하고 즉시 IDLE 상태로 복귀.

---

### 2.9 자막 생성

```
POST /api/transcribe
```

- 비동기 실행
- Whisper (faster-whisper)로 모든 다운로드 영상의 자막 생성
- 이미 자막이 있는 영상은 건너뜀
- 메모리 관리를 위해 영상 1개당 별도 프로세스에서 처리
- 결과: `transcripts/{stem}.json` → S3 업로드

---

### 2.10 LLM 분석

```
POST /api/analyze
```

- 비동기 실행
- Gemini 2.5 Flash Lite로 자막 분석
- 카테고리별 분석 프롬프트 적용 (경제/정치/스포츠)
- Few-shot 예시로 고성능 쇼츠 패턴 학습
- 결과: 쇼츠 후보 구간 (candidates) + 제목 생성
- 결과 파일: `analysis/{stem}_t{n}.json` → S3 업로드

**분석 결과 JSON 구조:**
```json
{
  "category": "sports",
  "intro_text": "제목 텍스트\n두번째 줄",
  "candidates": [
    {
      "start": 12.5,
      "end": 25.3,
      "title": "후보 제목",
      "reason": "선정 이유",
      "score": 9,
      "edit_order": 1,
      "connection_note": "연결 설명"
    }
  ],
  "raw_segments": [...],
  "hook_segment": { "raw_start": 0, "raw_end": 3.5, ... },
  "transcript_path": "/app/data/sessions/.../transcripts/video.json",
  "narration_script": "나레이션 대본...",
  "sfx_placements": [...],
  "narration_subtitles": [...]
}
```

---

### 2.11 영상 편집

```
POST /api/edit
```

**Request Body:**
| 필드 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| template_id | int | `1` | 편집 템플릿 ID |

- 비동기 실행
- 분석 결과의 후보 구간을 FFmpeg로 크롭+합치기
- 얼굴 감지 기반 자동 크롭
- 각 분석 파일당 3개 편집 버전(variant 1~3) 생성
- 결과: `raw/{stem}_raw.mp4` → S3 업로드

---

### 2.12 통합 처리 (자막→분석→편집)

```
POST /api/process
```

**Request Body:** `EditRequest` (template_id)

자막 생성 → LLM 분석 → 영상 편집을 순차적으로 한번에 실행.

---

### 2.13 선택 영상 처리

```
POST /api/process-selected
```

**Request Body:**
```json
{
  "items": [
    { "filename": "video1.mp4", "category": "sports" },
    { "filename": "video2.mp4", "category": "economy" }
  ],
  "template_id": 1
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| items | ProcessSelectedItem[] | 처리할 영상 목록 (파일명 + 카테고리) |
| template_id | int | 편집 템플릿 ID |

선택한 영상만 자막→분석→편집 순차 처리. 처리 후 로컬 원본은 정리(S3 백업 후 삭제).

---

### 2.14 나레이션 대본 생성

```
POST /api/generate-script
```

**Request Body:**
| 필드 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| filename | string | ✅ | 대상 파일명 |
| mode | string | `summary` | 생성 모드: `summary` (요약) / `style_convert` (스타일 변환) |

**조건:** 편집(raw_segments)이 완료된 후에만 호출 가능

**Response (GenerateScriptResponse):**
```json
{
  "narration_script": "생성된 나레이션 대본...",
  "sfx_placements": [
    { "time": 3.0, "sfx_id": "whoosh", "reason": "장면 전환" }
  ]
}
```

---

### 2.15 파일 목록 조회

```
GET /api/files
```

**Response:**
```json
{
  "downloads": ["video1", "video2"],
  "videos": ["video1_t1"],
  "transcripts": ["video1"],
  "analyses": ["video1_t1", "video1_t2"],
  "shorts": ["video1_t1"]
}
```

---

### 2.16 다운로드 목록 조회

```
GET /api/downloads
```

**Response:**
```json
{
  "downloads": [
    {
      "filename": "video.mp4",
      "stem": "video",
      "category": "sports",
      "thumbnail_url": "/api/media/downloads/{session_id}/video.mp4/thumbnail",
      "duration": 1230.5,
      "channel_name": "SPOTV",
      "channel_thumbnail_url": "https://..."
    }
  ]
}
```

- 로컬 + S3에 있는 모든 다운로드 파일 포함
- 각 영상의 카테고리, 썸네일, 길이, 출처 채널 정보 제공

---

### 2.17 다운로드 파일 삭제

```
DELETE /api/downloads/{filename}
```

로컬 파일 + S3 파일 + 캐시 썸네일 삭제.

---

## 3. 쇼츠 관리 (Shorts)

### 3.1 쇼츠 목록 조회

```
GET /api/shorts
```

**Response:**
```json
{
  "shorts": [
    {
      "filename": "video_t1_shorts.mp4",
      "url": "/api/media/shorts/{session_id}/video_t1_shorts.mp4",
      "title": "쇼츠 제목",
      "category": "sports",
      "candidates": [...],
      "channel_name": "SPOTV",
      "channel_thumbnail_url": "https://...",
      "variant": 1
    }
  ]
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| filename | string | 쇼츠 파일명 |
| url | string | 미디어 서빙 URL |
| title | string | 쇼츠 제목 (분석의 intro_text) |
| category | string | 카테고리 |
| candidates | Candidate[] | LLM이 선정한 후보 구간들 |
| channel_name | string | 출처 채널명 |
| channel_thumbnail_url | string | 채널 썸네일 |
| variant | int | 편집 버전 번호 |

---

### 3.2 Raw 영상 목록 조회

```
GET /api/raws
```

**Response:**
```json
{
  "raws": [
    {
      "filename": "video_t1_raw.mp4",
      "url": "/api/media/raw/{session_id}/video_t1_raw.mp4",
      "title": "영상 제목",
      "category": "sports",
      "duration": 45.2,
      "channel_name": "SPOTV",
      "channel_thumbnail_url": "https://...",
      "variant": 1,
      "hook_segment": { "raw_start": 0, "raw_end": 3.5, "orig_start": 12.0, "orig_end": 15.5 },
      "download_filename": "원본영상.mp4"
    }
  ]
}
```

| 추가 필드 | 타입 | 설명 |
|----------|------|------|
| duration | float? | raw 영상 길이 (초) |
| hook_segment | dict? | 훅(주의 끌기) 구간 정보 |
| download_filename | string? | 원본 다운로드 파일명 |

---

### 3.3 미디어 서빙

#### 쇼츠 영상 스트리밍

```
GET /api/media/shorts/{session_id}/{filename}
```

S3 presigned URL로 리다이렉트. S3에 없으면 로컬 파일 서빙.

#### 쇼츠 영상 다운로드

```
GET /api/media/shorts/{session_id}/{filename}/download
```

`Content-Disposition: attachment`로 파일 다운로드. Safari 호환을 위해 `application/octet-stream`으로 스트리밍.

#### Raw 영상 스트리밍

```
GET /api/media/raw/{session_id}/{filename}
```

#### 다운로드 원본 영상 스트리밍

```
GET /api/media/downloads/{session_id}/{filename}
```

#### 다운로드 영상 썸네일

```
GET /api/media/downloads/{session_id}/{filename}/thumbnail
```

YouTube 원본 썸네일 우선, 없으면 ffmpeg로 1초 지점 프레임 추출 후 캐시.

---

### 3.4 쇼츠 삭제

```
DELETE /api/shorts/{filename}
```

로컬 + S3 삭제.

---

### 3.5 Raw 영상 삭제

```
DELETE /api/raws/{filename}
```

로컬 + S3 삭제.

---

### 3.6 제목 수정

```
POST /api/update-title
```

**Request Body:**
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| filename | string | ✅ | 쇼츠 파일명 |
| intro_text | string | ✅ | 새 제목 텍스트 |

분석 JSON의 `intro_text` 필드를 업데이트.

---

### 3.7 나레이션 대본 수정

```
POST /api/update-narration-script
```

**Request Body:**
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| filename | string | ✅ | 파일명 |
| narration_script | string | ✅ | 새 나레이션 대본 |

분석 JSON에 저장 + S3 재업로드.

---

### 3.8 자막 타이밍 조회

```
GET /api/subtitle-entries/{stem}
```

Raw 영상의 원본 타임스탬프 기반 자막 세그먼트 반환. 캔버스 미리보기에서 실시간 자막 표시용.

**Response:**
```json
{
  "entries": [
    { "start": 0.5, "end": 2.3, "text": "자막 텍스트" }
  ]
}
```

---

### 3.9 SRT 자막 관리

#### SRT 조회

```
GET /api/srt/{stem}
```

SRT 파일이 없으면 분석 데이터에서 자동 생성.

**Response:**
```json
{
  "entries": [
    { "index": "1", "times": "00:00:01,000 --> 00:00:03,500", "text": "자막 내용" }
  ]
}
```

#### SRT 저장

```
POST /api/srt
```

**Request Body:**
```json
{
  "stem": "video_t1",
  "entries": [
    { "index": "1", "times": "00:00:01,000 --> 00:00:03,500", "text": "수정된 자막" }
  ]
}
```

---

### 3.10 나레이션 자막 생성

```
POST /api/generate-narration-subtitles
```

**Request Body:**
| 필드 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| filename | string | ✅ | 파일명 |
| narration_voice | string | `female` | TTS 음성 |
| narration_mode | string | `title` | `title` (제목 텍스트) / `script` (대본) |
| narration_speed | float | `1.0` | 읽기 속도 배율 |

**동작:**
1. TTS로 나레이션 음성 합성
2. faster-whisper로 음성 재전사 → 단어별 타임스탬프
3. 원본 대본 단어에 타임스탬프 정렬
4. analysis JSON에 저장 + S3 업로드

**Response:**
```json
{
  "subtitles": [
    { "start": 0.0, "end": 1.5, "text": "나레이션\n자막" }
  ]
}
```

---

### 3.11 나레이션 미리듣기

```
POST /api/narration-preview
```

**Request Body:** `GenerateNarrationSubtitlesRequest`와 동일

**Response:**
```json
{
  "audio_base64": "base64 인코딩된 MP3 오디오",
  "subtitles": [
    { "start": 0.0, "end": 1.5, "text": "나레이션 자막" }
  ]
}
```

analysis JSON에 저장하지 않는 일회성 미리듣기.

---

### 3.12 배경 이미지 관리

#### 배경 목록 조회

```
GET /api/backgrounds
```

**Response:**
```json
{ "backgrounds": ["bg_gradient1", "bg_dark", "bg_news"] }
```

`/static/backgrounds/` 디렉토리의 이미지 파일명(확장자 제외) 반환. 지원 확장자: `.png`, `.jpg`, `.jpeg`, `.webp`

#### 배경 이미지 업로드

```
POST /api/backgrounds/upload
Content-Type: multipart/form-data
```

| 필드 | 타입 | 설명 |
|------|------|------|
| file | File | PNG/JPG/JPEG/WEBP 이미지 파일 |

**Response:** `{ "filename": "bg_custom", "ok": true }`

---

## 4. 렌더링 (Render)

### 4.1 최종 렌더링

```
POST /api/render
```

**Request Body (RenderRequest):**
| 필드 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| filename | string | ✅ | raw 파일명 (예: `video_t1_raw.mp4`) |
| title | string | `""` | 제목 오버라이드 (빈 문자열이면 분석 데이터의 제목 사용) |
| subtitles | bool | `false` | 자막 표시 여부 |
| template_id | int | `1` | 편집 템플릿 ID |
| style | StyleParams | (기본값) | 스타일 파라미터 (아래 상세 참조) |
| bg_image | string? | `null` | 배경 이미지명 (`/api/backgrounds`에서 조회) |
| bg_solid_color | string? | `null` | 배경 단색 HEX 코드 (예: `#1a1a2e`) |
| narration | bool | `false` | 나레이션 삽입 여부 |
| narration_voice | string | `female` | 나레이션 음성 |
| narration_mode | string | `title` | 나레이션 텍스트 소스: `title` / `script` |
| narration_speed | float | `1.0` | 나레이션 속도 |
| use_hook | bool | `false` | 훅(주의 끌기 구간) 사용 여부 |
| hook_sfx_id | string? | `null` | 훅 효과음 ID |
| hook_sfx_offset | float | `0.0` | 훅 효과음 시작 오프셋 (초) |
| hook_sfx_volume | float | `0.8` | 훅 효과음 볼륨 |
| custom_sfx_entries | SfxEntry[] | `[]` | 커스텀 효과음 목록 |
| text_overlays | TextOverlayEntry[] | `[]` | 텍스트 오버레이 목록 |

#### StyleParams (스타일 파라미터 상세)

| 필드 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| **제목 1줄** | | | |
| title1_color | string | `#FFD700` | 제목 1줄 색상 |
| title1_border_width | float | `3.0` | 제목 1줄 테두리 두께 |
| title1_border_color | string | `#000000` | 제목 1줄 테두리 색상 |
| title1_bg_enabled | bool | `false` | 제목 1줄 배경 활성화 |
| title1_bg_color | string | `#000000` | 제목 1줄 배경 색상 |
| title1_bg_opacity | float | `0.6` | 제목 1줄 배경 투명도 |
| **제목 2줄** | | | |
| title2_color | string | `#FFFFFF` | 제목 2줄 색상 |
| title2_border_width | float | `3.0` | 제목 2줄 테두리 두께 |
| title2_border_color | string | `#000000` | 제목 2줄 테두리 색상 |
| title2_bg_enabled | bool | `false` | 제목 2줄 배경 활성화 |
| title2_bg_color | string | `#000000` | 제목 2줄 배경 색상 |
| title2_bg_opacity | float | `0.6` | 제목 2줄 배경 투명도 |
| **제목 공통** | | | |
| title_y_extra | int | `0` | 제목 Y 위치 오프셋 |
| title_fontsize_delta | int | `0` | 제목 폰트 크기 조절 (기본 대비 +/-) |
| title_font_name | string | `NanumSquareRoundEB` | 제목 전용 폰트 |
| **자막** | | | |
| sub_fontsize | int | `68` | 자막 폰트 크기 |
| sub_color | string | `#FFFFFF` | 자막 색상 |
| sub_margin_v | int | `20` | 자막 하단 마진 |
| sub_bg_enabled | bool | `false` | 자막 배경 활성화 |
| sub_bg_color | string | `#000000` | 자막 배경 색상 |
| sub_bg_opacity | float | `0.6` | 자막 배경 투명도 |
| **채널 표시** | | | |
| channel_name | string | `""` | 채널명 오버레이 텍스트 |
| channel_color | string | `#FFFFFF` | 채널명 색상 |
| channel_x | int | `0` | 채널명 X 위치 |
| channel_y | int | `0` | 채널명 Y 위치 |
| channel_fontsize | int | `36` | 채널명 폰트 크기 |
| channel_image_url | string | `""` | 채널 이미지 URL |
| channel_topleft_text | string | `""` | 좌상단 텍스트 |
| channel_topleft_color | string | `#FFFFFF` | 좌상단 텍스트 색상 |
| channel_topleft_fontsize | int | `32` | 좌상단 텍스트 크기 |
| channel_topleft_x | int | `16` | 좌상단 텍스트 X |
| channel_topleft_y | int | `16` | 좌상단 텍스트 Y |
| **폰트** | | | |
| font_name | string | `NanumSquareRoundEB` | 자막/기본 폰트 |
| **영상 보정** | | | |
| brightness | float | `0.0` | 밝기 조절 (-1.0 ~ 1.0) |
| contrast | float | `1.0` | 대비 (0.0 ~ 3.0) |
| saturation | float | `1.0` | 채도 (0.0 ~ 3.0) |
| volume | float | `1.0` | 영상 원본 볼륨 |
| narration_volume | float | `1.2` | 나레이션 볼륨 |
| narration_video_volume | float | `0.3` | 나레이션 활성 시 원본 볼륨 |

#### SfxEntry (효과음)

| 필드 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| time | float | ✅ | 효과음 삽입 시각 (초) |
| sfx_id | string | ✅ | 효과음 ID (`/api/sfx/list`에서 조회) |
| volume | float | `0.8` | 효과음 볼륨 |

#### TextOverlayEntry (텍스트 오버레이)

| 필드 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| time | float | ✅ | 시작 시각 (초) |
| end | float | ✅ | 종료 시각 (초) |
| text | string | ✅ | 표시할 텍스트 |
| color | string | `#FFFFFF` | 텍스트 색상 |
| x_pct | float | `0.5` | X 위치 비율 (0=왼쪽, 0.5=중앙, 1=오른쪽) |
| y_pct | float | `0.12` | Y 위치 비율 (0=상단, 1=하단, 영상 영역 기준) |
| size | float | `1.0` | 폰트 크기 배율 |

---

### 4.2 미리보기 프레임 생성

```
POST /api/preview
```

**Request Body (PreviewRequest):**
| 필드 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| filename | string | ✅ | raw 파일명 |
| title | string | `""` | 제목 오버라이드 |
| style | StyleParams | (기본값) | 스타일 |
| seek | float | `2.0` | 캡처할 시각 (초) |
| bg_image | string? | `null` | 배경 이미지 |
| bg_solid_color | string? | `null` | 배경 단색 |
| subtitles | bool | `false` | 자막 표시 |

**Response:** `image/png` 파일 (1080×1920 프레임 이미지)

---

### 4.3 효과음 목록 조회

```
GET /api/sfx/list
```

**Response:**
```json
{
  "sfx": [
    {
      "id": "whoosh",
      "name": "Whoosh",
      "file": "whoosh.mp3",
      "category": "transition",
      "duration": 0.8
    }
  ]
}
```

`/static/sfx/sfx_manifest.json`에서 효과음 메타데이터 로드.

---

### 4.4 전체 재렌더링

```
POST /api/rerender
```

**Request Body:** `EditRequest` (template_id)

모든 분석 결과에 대해 오버레이 재적용. 기존 쇼츠를 새 템플릿/스타일로 재생성할 때 사용.

---

## 5. YouTube 업로드

### 5.1 인증 상태 확인

```
GET /api/youtube/auth-status
```

**Response:**
```json
{
  "authenticated": true,
  "configured": true
}
```

| 필드 | 설명 |
|------|------|
| configured | YouTube OAuth 클라이언트 설정 여부 |
| authenticated | 토큰 저장 완료 여부 |

---

### 5.2 인증 URL 요청

```
GET /api/youtube/auth-url
```

**Response:**
```json
{ "url": "https://accounts.google.com/o/oauth2/auth?..." }
```

이 URL로 사용자를 리다이렉트하여 YouTube 업로드 권한 동의.

---

### 5.3 OAuth 콜백

```
GET /api/youtube/callback?code={code}
```

인증 코드로 토큰 교환 후 저장. 프런트엔드로 리다이렉트:
- 성공: `/?youtube_auth=success`
- 실패: `/?youtube_auth=error`

---

### 5.4 업로드

```
POST /api/youtube/upload
```

**Request Body:**
| 필드 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| filename | string | ✅ | 쇼츠 파일명 |
| title | string | ✅ | YouTube 영상 제목 |
| description | string | `""` | 영상 설명 |
| privacy | string | `private` | 공개 설정: `private` / `unlisted` / `public` |

**Response:** `{ "ok": true, "message": "업로드 시작됨" }`

비동기 백그라운드 실행.

---

### 5.5 업로드 상태 조회

```
GET /api/youtube/upload-status
```

**Response:**
```json
{
  "running": false,
  "result": { "video_id": "abc123", "url": "https://www.youtube.com/shorts/abc123" },
  "error": null
}
```

---

## 6. 관리자 (Admin)

> 모든 관리자 API는 `Authorization: Bearer <token>` 필수 + `is_admin=true` 권한 필요 (그렇지 않으면 `403`)

### 6.1 사용자 목록 조회

```
GET /api/admin/users
```

**Response:**
```json
[
  {
    "id": "uuid",
    "email": "user@email.com",
    "name": "홍길동",
    "provider": "local",
    "is_admin": false,
    "created_at": "2026-06-17T12:00:00",
    "session_id": "uuid",
    "quota_used": 3,
    "quota_limit": 5
  }
]
```

---

### 6.2 사용자 권한 수정

```
PATCH /api/admin/users/{user_id}
```

**Request Body:**
| 필드 | 타입 | 설명 |
|------|------|------|
| is_admin | bool | 관리자 권한 부여/해제 |

- 자기 자신의 관리자 권한은 해제 불가 (`400`)

---

### 6.3 전체 통계 조회

```
GET /api/admin/stats
```

**Response (AdminStats):**
```json
{
  "total_sessions": 15,
  "total_users": 8,
  "downloads": 42,
  "transcripts": 38,
  "analyses": 76,
  "raws": 65,
  "shorts": 50,
  "category_counts": {
    "sports": 20,
    "economy": 15,
    "politics": 7
  }
}
```

---

### 6.4 파이프라인 모니터링

```
GET /api/admin/pipelines
```

**Response:**
```json
[
  {
    "session_id": "uuid",
    "step": "analyzing",
    "message": "LLM 분석 중...",
    "progress": 45,
    "is_paused": false,
    "user_email": "user@email.com"
  }
]
```

IDLE 상태가 아닌 활성 파이프라인만 반환.

---

## 7. 공통 데이터 모델

### 7.1 사용 가능한 카테고리

| 값 | 설명 | 분석 특성 |
|-----|------|----------|
| `economy` | 경제 | 핵심 수치, 전망, 생활 경제 |
| `politics` | 정치 | 강한 발언, 기승전결 4단계 구성 |
| `sports` | 스포츠 | 골/득점, 한국 선수 활약, 결정적 장면 |

### 7.2 사용 가능한 TTS 음성

**Google Cloud TTS:**
| 카테고리 | 음성 ID 예시 |
|---------|-------------|
| 기본 | `female`, `male` |
| Chirp3 HD (최신) | `ko-KR-Chirp3-HD-Achernar` ~ `ko-KR-Chirp3-HD-Zubenelgenubi` (30종) |
| Neural2 | `ko-KR-Neural2-A`, `ko-KR-Neural2-B`, `ko-KR-Neural2-C` |
| WaveNet | `ko-KR-Wavenet-A` ~ `ko-KR-Wavenet-D` (4종) |
| Standard | `ko-KR-Standard-A` ~ `ko-KR-Standard-D` (4종) |

**ElevenLabs (선택적):**
| 음성 ID | 이름 | 성별 |
|---------|------|------|
| `el-rachel` | Rachel | 여성 |
| `el-sarah` | Sarah | 여성 |
| `el-charlotte` | Charlotte | 여성 |
| `el-adam` | Adam | 남성 |
| `el-antoni` | Antoni | 남성 |

ElevenLabs 실패 시 Google TTS(여성)로 자동 폴백.

### 7.3 사용 가능한 폰트

| 폰트명 | 계열 |
|--------|------|
| `NanumSquareRoundEB` | 나눔스퀘어라운드 ExtraBold (기본) |
| `NanumSquareRoundB` | 나눔스퀘어라운드 Bold |
| `NanumSquareRoundR` | 나눔스퀘어라운드 Regular |
| `NanumSquareEB` | 나눔스퀘어 ExtraBold |
| `NanumSquareB` | 나눔스퀘어 Bold |
| `NanumGothicExtraBold` | 나눔고딕 ExtraBold |
| `NanumGothicBold` | 나눔고딕 Bold |
| `NanumGothic` | 나눔고딕 Regular |
| `NanumBarunGothicBold` | 나눔바른고딕 Bold |
| `NanumMyeongjoExtraBold` | 나눔명조 ExtraBold |
| `NanumMyeongjoBold` | 나눔명조 Bold |
| `NanumBrush` | 나눔손글씨 붓 |
| `NanumPen` | 나눔손글씨 펜 |
| `BlackHanSans` | 검정한산스 |
| `NotoSerifKRBold` | Noto Serif KR Bold |
| `NotoSansKRBold` | Noto Sans KR Bold |

### 7.4 영상 캔버스 규격

| 항목 | 값 | 설명 |
|------|-----|------|
| 캔버스 전체 | 1080 × 1920 | 세로형 쇼츠 |
| 영상 영역 | 1080 × 810 | 16:9 비율 크롭 |
| 영상 Y 위치 | 555px | 상단 여백 (555px = 전체 높이의 50%) |
| 상단 영역 | 555px | 제목/채널명 오버레이 |
| 하단 영역 | 555px | 자막/추가 정보 |

### 7.5 User 모델

| 필드 | 타입 | 설명 |
|------|------|------|
| id | string (UUID) | 사용자 고유 ID |
| email | string | 이메일 (unique) |
| password_hash | string? | 비밀번호 해시 (소셜 계정은 null) |
| name | string? | 이름 |
| provider | string | `local` / `google` |
| provider_id | string? | 소셜 제공자 고유 ID |
| session_id | string | 연결된 세션 ID |
| is_admin | bool | 관리자 여부 |
| created_at | datetime | 가입일시 |
| reset_token | string? | 비밀번호 재설정 토큰 |
| reset_token_expires_at | datetime? | 재설정 토큰 만료일시 |

---

## 8. 인프라 / 환경 설정

### 8.1 세션 구조

```
sessions/{session_id}/
  downloads/         # 다운로드된 원본 영상 (.mp4)
    .thumbs/         # 영상 썸네일 캐시 (.jpg)
  transcripts/       # Whisper 자막 (.json)
  analysis/          # Gemini 분석 결과 (.json)
  raw/               # 1차 편집본 (.mp4, .srt)
  shorts/            # 최종 쇼츠 (.mp4)
  channels.json      # 등록된 채널 목록
  category_map.json  # stem → category 매핑
  video_ids.json     # stem → YouTube video_id 매핑
  channel_map.json   # stem → { name, thumbnail_url } 매핑
```

### 8.2 S3 구조

```
s3://aishortsbucket/
  sessions/{session_id}/
    downloads/{filename}.mp4
    transcripts/{filename}.json
    analysis/{filename}.json
    raw/{filename}_raw.mp4
    shorts/{filename}_shorts.mp4
```

### 8.3 인증 흐름

1. **비로그인 (익명):** `X-Session-Id` 헤더로 세션 식별 → 수집 2개 제한
2. **이메일 회원:** `/api/auth/signup` → JWT 발급 → `Authorization: Bearer <token>` → 수집 5개 제한
3. **Google 소셜:** `/api/auth/google/login` → Google 동의 → 콜백 → JWT 발급
4. **관리자:** `is_admin=true` → 무제한 수집, Admin API 접근 가능

### 8.4 파이프라인 흐름 요약

```
채널 등록 → 수집(collect/download-url/upload-video)
                ↓
        자막 생성 (transcribe) — Whisper
                ↓
        LLM 분석 (analyze) — Gemini 2.5 Flash Lite
                ↓
        영상 편집 (edit) — FFmpeg 크롭+합치기 → raw
                ↓
        [대본 생성] (generate-script) — 선택적
                ↓
        최종 렌더링 (render) — 오버레이+나레이션+SFX → shorts
                ↓
        [YouTube 업로드] (youtube/upload) — 선택적
```

### 8.5 기타 엔드포인트

```
GET  /         → 프론트엔드 SPA (index.html)
GET  /health   → { "status": "healthy", "version": "2.0.0" }
GET  /static/  → 정적 파일 서빙
```

### 8.6 DB

- PostgreSQL (SQLAlchemy ORM)
- 테이블: `users`
- 자동 마이그레이션: 기동 시 `create_all` + `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`

### 8.7 JWT 설정

| 항목 | 값 |
|------|-----|
| 알고리즘 | HS256 |
| 만료 | 7일 (10080분) |
| 시크릿 | `.env`의 `JWT_SECRET_KEY` |
