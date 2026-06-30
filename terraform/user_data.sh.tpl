#!/bin/bash
set -e
exec > /var/log/user_data.log 2>&1

echo "=== ShortsAI EC2 초기 세팅 시작 ==="

# Docker 설치
apt-get update -y
apt-get install -y ca-certificates curl gnupg git

install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc

echo \
  "deb [arch=$$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $$(. /etc/os-release && echo "$$VERSION_CODENAME") stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null

apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

usermod -aG docker ubuntu

# 저장소 클론
mkdir -p /home/ubuntu/short_editor
git clone ${github_repo_url} /home/ubuntu/short_editor/shortsEditer
chown -R ubuntu:ubuntu /home/ubuntu/short_editor

# yt-dlp 캐시 디렉토리
mkdir -p /home/ubuntu/.cache/yt-dlp
chown -R ubuntu:ubuntu /home/ubuntu/.cache

echo "=== 완료: .env 파일 설정 후 'cd aws && docker compose up -d' 실행 ==="
