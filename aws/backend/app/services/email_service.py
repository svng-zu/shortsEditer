# backend/app/services/email_service.py
"""AWS SES를 통한 이메일 발송 (비밀번호 재설정 메일 등)"""

import boto3
from botocore.exceptions import ClientError

from app.config import settings


def send_password_reset_email(to_email: str, reset_link: str) -> bool:
    """비밀번호 재설정 링크 메일 발송. 발신 메일이 설정되지 않았으면 발송하지 않는다."""
    if not settings.SES_SENDER_EMAIL:
        print("[Email] SES_SENDER_EMAIL이 설정되지 않아 재설정 메일을 보내지 않습니다.")
        return False

    subject = "[고릴라AI] 비밀번호 재설정 안내"
    body_text = (
        f"고릴라AI 비밀번호 재설정을 요청하셨습니다.\n\n"
        f"아래 링크를 눌러 새 비밀번호를 설정해주세요 (유효시간 {settings.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES}분):\n"
        f"{reset_link}\n\n"
        f"본인이 요청하지 않았다면 이 메일을 무시하셔도 됩니다."
    )
    body_html = (
        f"<p>고릴라AI 비밀번호 재설정을 요청하셨습니다.</p>"
        f"<p>아래 링크를 눌러 새 비밀번호를 설정해주세요 (유효시간 {settings.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES}분):</p>"
        f'<p><a href="{reset_link}">{reset_link}</a></p>'
        f"<p>본인이 요청하지 않았다면 이 메일을 무시하셔도 됩니다.</p>"
    )

    client = boto3.client("ses", region_name=settings.AWS_REGION)
    try:
        client.send_email(
            Source=settings.SES_SENDER_EMAIL,
            Destination={"ToAddresses": [to_email]},
            Message={
                "Subject": {"Data": subject, "Charset": "UTF-8"},
                "Body": {
                    "Text": {"Data": body_text, "Charset": "UTF-8"},
                    "Html": {"Data": body_html, "Charset": "UTF-8"},
                },
            },
        )
        print(f"[Email] 비밀번호 재설정 메일 발송 완료 → {to_email}")
        return True
    except ClientError as e:
        print(f"[Email] 발송 실패 → {to_email}: {e}")
        return False
