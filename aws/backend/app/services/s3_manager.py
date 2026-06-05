# backend/app/services/s3_manager.py
"""S3 파일 관리 유틸리티"""

import os
import boto3
from botocore.exceptions import ClientError
from functools import lru_cache

from app.config import settings


class S3Manager:
    def __init__(self):
        self._client = boto3.client("s3", region_name=settings.AWS_REGION)
        self.bucket = settings.S3_BUCKET_NAME

    def upload(self, local_path: str, s3_key: str) -> str:
        try:
            self._client.upload_file(str(local_path), self.bucket, s3_key)
            print(f"[S3] ↑ {s3_key}")
            return s3_key
        except Exception as e:
            print(f"[S3] 업로드 실패 {s3_key}: {e}")
            return ""

    def download(self, s3_key: str, local_path: str) -> bool:
        try:
            os.makedirs(os.path.dirname(str(local_path)), exist_ok=True)
            self._client.download_file(self.bucket, s3_key, str(local_path))
            print(f"[S3] ↓ {s3_key}")
            return True
        except ClientError:
            return False

    def presigned_url(self, s3_key: str, expiry: int = 3600) -> str:
        try:
            return self._client.generate_presigned_url(
                "get_object",
                Params={"Bucket": self.bucket, "Key": s3_key},
                ExpiresIn=expiry,
            )
        except Exception as e:
            print(f"[S3] presigned URL 실패 {s3_key}: {e}")
            return ""

    def exists(self, s3_key: str) -> bool:
        try:
            self._client.head_object(Bucket=self.bucket, Key=s3_key)
            return True
        except ClientError:
            return False

    def delete(self, s3_key: str):
        try:
            self._client.delete_object(Bucket=self.bucket, Key=s3_key)
        except Exception:
            pass

    def list_keys(self, prefix: str) -> list[str]:
        paginator = self._client.get_paginator("list_objects_v2")
        keys = []
        for page in paginator.paginate(Bucket=self.bucket, Prefix=prefix):
            for obj in page.get("Contents", []):
                keys.append(obj["Key"])
        return keys


@lru_cache()
def get_s3() -> S3Manager:
    return S3Manager()
