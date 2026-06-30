variable "aws_region" {
  description = "AWS 리전"
  type        = string
  default     = "ap-northeast-2"
}

variable "project_name" {
  description = "프로젝트 이름 (리소스 이름 prefix)"
  type        = string
  default     = "shortsai"
}

variable "environment" {
  description = "환경 (prod / staging)"
  type        = string
  default     = "prod"
}

variable "ec2_instance_type" {
  description = "EC2 인스턴스 타입 (Whisper 사용 시 최소 t3.medium 권장)"
  type        = string
  default     = "t3.medium"
}

variable "ec2_key_name" {
  description = "EC2 SSH 접속용 키 페어 이름 (AWS 콘솔에서 미리 생성)"
  type        = string
}

variable "allowed_ssh_cidr" {
  description = "SSH 허용 CIDR (내 IP만 허용하려면 'x.x.x.x/32' 형식)"
  type        = string
  default     = "0.0.0.0/0"
}

variable "s3_bucket_name" {
  description = "미디어 저장용 S3 버킷 이름 (전 세계 고유해야 함)"
  type        = string
  default     = "aishortsbucket"
}

variable "root_volume_size" {
  description = "EC2 루트 볼륨 크기 (GB) — Docker 이미지 + 영상 임시 저장 포함"
  type        = number
  default     = 50
}

variable "github_repo_url" {
  description = "EC2 부팅 시 클론할 GitHub 저장소 URL"
  type        = string
  default     = "https://github.com/YOUR_USERNAME/shortsEditer.git"
}
