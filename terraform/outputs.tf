output "ec2_public_ip" {
  description = "EC2 고정 IP (Elastic IP)"
  value       = aws_eip.main.public_ip
}

output "ec2_instance_id" {
  description = "EC2 인스턴스 ID"
  value       = aws_instance.main.id
}

output "s3_bucket_name" {
  description = "S3 미디어 버킷 이름"
  value       = aws_s3_bucket.media.id
}

output "ssh_command" {
  description = "SSH 접속 명령어"
  value       = "ssh -i ~/.ssh/${var.ec2_key_name}.pem ubuntu@${aws_eip.main.public_ip}"
}

output "app_url" {
  description = "앱 접속 URL"
  value       = "http://${aws_eip.main.public_ip}"
}

output "github_actions_secrets" {
  description = "GitHub Actions에 등록할 Secrets"
  value = {
    EC2_HOST = aws_eip.main.public_ip
    EC2_USER = "ubuntu"
  }
}
