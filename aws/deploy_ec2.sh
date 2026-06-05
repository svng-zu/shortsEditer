#!/bin/bash
# EC2 최초 세팅 스크립트 (한 번만 실행)
# 실행: chmod +x deploy_ec2.sh && ./deploy_ec2.sh <github_repo_url>
# 예시: ./deploy_ec2.sh https://github.com/yourname/yourrepo.git

set -e

REPO_URL="${1:-}"
DEPLOY_DIR="$HOME/shortsai"

echo "=============================="
echo " ShortsAI EC2 초기 세팅"
echo "=============================="

# 1. Docker 설치
if ! command -v docker &> /dev/null; then
    echo "[1/5] Docker 설치 중..."
    sudo apt-get update -y
    sudo apt-get install -y ca-certificates curl gnupg lsb-release git
    sudo mkdir -p /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    sudo apt-get update -y
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
    sudo usermod -aG docker $USER
    echo "  ⚠️  Docker 그룹 적용을 위해 로그아웃 후 재접속하거나 'newgrp docker' 실행 필요"
else
    echo "[1/5] Docker 이미 설치됨 ✓"
fi

# 2. git 설치 확인
if ! command -v git &> /dev/null; then
    sudo apt-get install -y git
fi
echo "[2/5] git 설치됨 ✓"

# 3. 코드 클론 또는 업데이트
if [ -d "$DEPLOY_DIR/.git" ]; then
    echo "[3/5] 기존 저장소 업데이트 중..."
    cd "$DEPLOY_DIR"
    git pull origin main
else
    if [ -z "$REPO_URL" ]; then
        echo ""
        echo "  ⚠️  GitHub 저장소 URL을 인자로 전달해주세요."
        echo "  사용법: ./deploy_ec2.sh https://github.com/yourname/repo.git"
        exit 1
    fi
    echo "[3/5] 저장소 클론 중: $REPO_URL"
    git clone "$REPO_URL" "$DEPLOY_DIR"
    cd "$DEPLOY_DIR"
fi
echo "  코드 위치: $DEPLOY_DIR"

# 4. .env 파일 설정
ENV_FILE="$DEPLOY_DIR/aws/.env"
if [ ! -f "$ENV_FILE" ]; then
    echo ""
    echo "[4/5] .env 파일 생성 중..."
    cp "$DEPLOY_DIR/aws/.env.example" "$ENV_FILE"
    echo ""
    echo "  ========================================="
    echo "  ⚠️  아래 파일에 API 키를 직접 입력하세요:"
    echo "  $ENV_FILE"
    echo ""
    echo "  필수 항목:"
    echo "    GEMINI_API_KEY=your_actual_key"
    echo "    S3_BUCKET_NAME=your_bucket_name"
    echo "  ========================================="
    echo ""
    read -p "  설정을 완료했으면 Enter를 눌러주세요..."
else
    echo "[4/5] .env 파일 이미 존재 ✓"
fi

# GEMINI_API_KEY 확인
if grep -q "your_gemini_api_key" "$ENV_FILE"; then
    echo ""
    echo "  ⚠️  GEMINI_API_KEY가 설정되지 않았습니다. $ENV_FILE 파일을 수정 후 다시 실행하세요."
    exit 1
fi

# 5. Docker 빌드 및 시작
echo "[5/5] Docker 이미지 빌드 및 시작 중 (첫 빌드는 10~20분 소요)..."
cd "$DEPLOY_DIR/aws"

# docker 그룹이 현재 세션에 적용되지 않은 경우 sudo 사용
DOCKER_CMD="docker"
if ! docker ps &>/dev/null 2>&1; then
    DOCKER_CMD="sudo docker"
fi

$DOCKER_CMD compose down 2>/dev/null || true
$DOCKER_CMD compose build
$DOCKER_CMD compose up -d

echo ""
echo "=============================="
echo "✅ 초기 세팅 완료!"
EC2_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || echo "YOUR_EC2_IP")
echo ""
echo "  프론트엔드: http://$EC2_IP"
echo "  백엔드 API: http://$EC2_IP:8000"
echo "  헬스체크:   http://$EC2_IP:8000/health"
echo ""
echo "  로그 확인: docker compose logs -f"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  GitHub Actions CI/CD 설정:"
echo "  GitHub 저장소 → Settings → Secrets → Actions"
echo "    EC2_HOST = $EC2_IP"
echo "    EC2_USER = ubuntu"
echo "    EC2_SSH_KEY = (EC2 .pem 파일 내용 전체)"
echo "=============================="
