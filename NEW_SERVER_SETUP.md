# 새 서버 셋업 가이드

> 이 파일은 새 EC2에 ShortsAI를 처음부터 셋업할 때 사용합니다.
> 백업 파일(`shortsai_backup.tar.gz`)을 로컬에 보관하고 있어야 합니다.

---

## 백업 파일 구성

```
shortsai_backup/
├── .env                        # 모든 API 키와 설정값
├── certs/
│   ├── cert.pem                # SSL 인증서
│   ├── fullchain.pem           # SSL 체인 인증서
│   └── key.pem                 # SSL 개인키
├── credentials/
│   └── gcp_tts_key.json        # Google Cloud TTS 서비스 계정 키
└── db_backup.sql               # PostgreSQL DB 덤프 (유저 계정 데이터)
```

---

## .env 키 설명

| 변수명 | 설명 | 발급처 |
|--------|------|--------|
| `AWS_REGION` | AWS 리전 | 고정값: `ap-northeast-2` |
| `S3_BUCKET_NAME` | S3 버킷 이름 | 새 계정에서 새로 만든 버킷 이름으로 변경 |
| `GEMINI_API_KEY` | Gemini AI API 키 (영상 분석용) | [Google AI Studio](https://aistudio.google.com/app/apikey) |
| `ELEVENLABS_API_KEY` | ElevenLabs TTS API 키 (나레이션 음성) | [ElevenLabs](https://elevenlabs.io) → Profile → API Keys |
| `WHISPER_MODEL` | Whisper 모델 크기 (`small` / `medium`) | 고정값 (변경 불필요) |
| `WHISPER_LANGUAGE` | 자막 언어 (`auto` / `ko`) | 고정값 |
| `POSTGRES_PASSWORD` | PostgreSQL DB 비밀번호 | 백업 `.env`에서 복사 |
| `JWT_SECRET_KEY` | 로그인 토큰 서명 키 | 백업 `.env`에서 복사 (또는 `openssl rand -hex 32`로 재생성) |
| `GOOGLE_AUTH_CLIENT_ID` | Google 소셜 로그인 OAuth 클라이언트 ID | [Google Cloud Console](https://console.cloud.google.com) → API 및 서비스 → 사용자 인증 정보 |
| `GOOGLE_AUTH_CLIENT_SECRET` | Google 소셜 로그인 OAuth 시크릿 | 동일 |
| `GOOGLE_AUTH_REDIRECT_URI` | Google 로그인 콜백 URL | `https://[새도메인]/api/auth/google/callback` 으로 변경 |
| `YOUTUBE_CLIENT_ID` | YouTube 업로드 OAuth 클라이언트 ID | Google Cloud Console (현재 Google Auth와 동일 클라이언트 사용 중) |
| `YOUTUBE_CLIENT_SECRET` | YouTube 업로드 OAuth 시크릿 | 동일 |
| `YOUTUBE_REDIRECT_URI` | YouTube 업로드 콜백 URL | `https://[새도메인]/api/youtube/callback` 으로 변경 |
| `FRONTEND_URL` | 프론트엔드 도메인 | `https://[새도메인]` 으로 변경 |
| `SES_SENDER_EMAIL` | 비밀번호 재설정 발신 이메일 | 새 AWS 계정 SES에서 인증한 이메일 |
| `CORS_ORIGINS` | CORS 허용 출처 목록 | 새 서버 IP / 도메인으로 변경 |
| `FRONTEND_DIR` | 사용할 프론트엔드 디렉토리 | 고정값: `frontend-v2` |

---

## 새 Claude에게 전달할 프롬프트

새 EC2에 SSH 접속한 상태에서 Claude Code를 열고, 아래 내용을 그대로 붙여넣으세요.

---

```
안녕! 나 ShortsAI 프로젝트를 새 AWS EC2에 셋업해야 해.

## 현재 상황
- 새 Ubuntu EC2에 SSH 접속한 상태야
- 로컬에 shortsai_backup.tar.gz 백업 파일이 있어
- GitHub 저장소: https://github.com/svng-zu/shortsEditer

## 해줘야 할 것들

1. Docker 설치 (없으면)
2. 저장소 클론: https://github.com/svng-zu/shortsEditer → ~/short_editor/shortsEditer
3. 내가 scp로 업로드할 백업 파일(shortsai_backup.tar.gz)에서 아래 파일들 복원:
   - .env → aws/.env
   - certs/*.pem → aws/certs/
   - credentials/gcp_tts_key.json → aws/backend/app/credentials/
4. .env 안의 아래 항목들을 새 서버 IP/도메인으로 업데이트:
   - GOOGLE_AUTH_REDIRECT_URI
   - YOUTUBE_REDIRECT_URI
   - FRONTEND_URL
   - CORS_ORIGINS
5. docker compose up -d 실행 (FRONTEND_DIR=frontend-v2)
6. DB 복원: db_backup.sql을 postgres 컨테이너에 import
7. 헬스체크: http://localhost:8000/health

자세한 내용은 프로젝트 루트의 NEW_SERVER_SETUP.md 파일 참고해줘.
```

---

## 백업을 새 EC2로 올리는 명령어

```bash
# 로컬 PC에서 실행
scp -i "새키파일.pem" ~/aws/shortsai_backup.tar.gz ubuntu@[새EC2_IP]:~/
```

## 백업 압축 해제 및 파일 복원

```bash
# EC2에서 실행
cd ~
tar -xzf shortsai_backup.tar.gz

cp shortsai_backup/.env ~/short_editor/shortsEditer/aws/.env

mkdir -p ~/short_editor/shortsEditer/aws/certs
cp shortsai_backup/certs/*.pem ~/short_editor/shortsEditer/aws/certs/

mkdir -p ~/short_editor/shortsEditer/aws/backend/app/credentials
cp shortsai_backup/credentials/gcp_tts_key.json ~/short_editor/shortsEditer/aws/backend/app/credentials/
```

## DB 복원 (docker compose 실행 후)

```bash
cat ~/shortsai_backup/db_backup.sql | docker exec -i aws-postgres-1 psql -U shortsai shortsai
```

## 도메인/IP 변경 시 Google Cloud Console 업데이트 필수

Google Cloud Console → API 및 서비스 → 사용자 인증 정보 → OAuth 2.0 클라이언트에서
승인된 리디렉션 URI에 새 도메인 추가:
- `https://[새도메인]/api/auth/google/callback`
- `https://[새도메인]/api/youtube/callback`

## DuckDNS 도메인 사용 시

https://www.duckdns.org 접속 → gorilai 도메인의 IP를 새 EC2 IP로 업데이트
