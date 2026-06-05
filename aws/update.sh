#!/bin/bash
# EC2 코드 업데이트 및 재배포 스크립트
# 실행: ./update.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "코드 업데이트 및 재배포 중..."

# 컨테이너 정지
docker compose down

# 이미지 재빌드
docker compose build

# 재시작
docker compose up -d

echo "✅ 업데이트 완료"
docker compose ps
