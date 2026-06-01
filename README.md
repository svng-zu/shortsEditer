# ShortsAI - YouTube 쇼츠 자동 생성 파이프라인

YouTube 영상에서 자동으로 쇼츠를 생성하는 파이프라인입니다.

## 버전 선택

| 버전 | 경로 | 자막 생성 | LLM 분석 | 용도 |
|------|------|----------|----------|------|
| **로컬** | `local/` | Whisper (로컬) | Ollama (로컬) | 개인 PC에서 실행 |
| **AWS** | `aws/` | AWS Transcribe | AWS Bedrock Claude | 클라우드 배포 |

---

## 로컬 버전 (local/)

### 요구사항
- Python 3.10+
- FFmpeg
- CUDA GPU (Whisper용, 선택)
- Ollama 설치 및 실행

### 실행 방법

```bash
cd local

# 가상환경 (선택)
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 의존성 설치
pip install -r requirements.txt

# Ollama 실행 (별도 터미널)
ollama serve
ollama pull gemma3:27b

# 서버 실행
uvicorn app:app --reload --port 8000
```

브라우저에서 `http://localhost:8000` 접속

### 구조
```
local/
├── app.py                  # FastAPI 진입점 (UI 포함)
├── collector/              # YouTube 수집
├── transcriber/            # Whisper 자막 생성
├── llm/                    # Ollama LLM 분석
├── editor/                 # 영상 편집
├── static/                 # 정적 파일 (배경, 로고)
└── requirements.txt
```

---

## AWS 버전 (aws/)

### 요구사항
- Docker & Docker Compose
- AWS 계정 (Bedrock, Transcribe, S3 권한)

### 실행 방법

```bash
cd aws

# 환경변수 설정
cp .env.example .env
# .env 파일에 AWS 자격증명 입력

# Docker 실행
docker-compose up --build
```

브라우저에서 `http://localhost` 접속

### 구조
```
aws/
├── backend/
│   ├── app/
│   │   ├── main.py         # FastAPI 진입점
│   │   ├── config.py       # 환경설정
│   │   ├── routers/        # API 라우터
│   │   ├── services/       # 비즈니스 로직
│   │   └── models/         # Pydantic 스키마
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/                # React 컴포넌트
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml
└── .env.example
```

---

## 공통 기능

- **영상 수집**: YouTube 채널에서 최신 영상 자동 다운로드
- **자막 생성**: 음성 → 텍스트 자동 변환
- **LLM 분석**: 쇼츠로 만들기 좋은 구간 자동 선택
- **영상 편집**: 자동 크롭, 배경 합성, 제목 오버레이
- **카테고리별 템플릿**: 스포츠/경제/정치 맞춤 디자인

## 공유 데이터 폴더

```
edit_tool/
├── downloads/      # 다운로드된 원본 영상
├── outputs/        # 출력 파일
│   ├── transcripts/   # 자막 JSON
│   ├── analysis/      # 분석 결과
│   ├── raw/           # 편집된 raw 영상
│   └── shorts/        # 완성된 쇼츠
└── temp/           # 임시 파일
```

---

## 비용 비교

| 항목 | 로컬 | AWS |
|------|------|-----|
| 초기 비용 | GPU PC 필요 | 없음 |
| 월 운영비 | 전기료만 | ~$30+ (EC2) |
| 자막 비용 | 무료 | ~$0.024/분 |
| LLM 비용 | 무료 | ~$0.01~0.05/요청 |

---

## 라이선스

MIT License
