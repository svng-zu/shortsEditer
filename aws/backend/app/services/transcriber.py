# backend/app/services/transcriber.py
"""AWS Transcribe를 사용한 자막 생성 서비스"""

import os
import json
import time
import uuid
import subprocess
import boto3
from botocore.exceptions import ClientError

from app.config import settings


class Transcriber:
    """AWS Transcribe 기반 자막 생성기"""

    def __init__(self):
        self.s3_client = boto3.client(
            "s3",
            region_name=settings.AWS_REGION,
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        )
        self.transcribe_client = boto3.client(
            "transcribe",
            region_name=settings.AWS_REGION,
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        )
        self.bucket_name = settings.S3_BUCKET_NAME
        self.language_code = settings.TRANSCRIBE_LANGUAGE_CODE
        print("[Transcriber] AWS Transcribe 클라이언트 초기화 완료")

    def extract_audio(self, video_path: str) -> str:
        """mp4 → mp3 음성 추출 (Transcribe용)"""
        audio_path = video_path.replace(".mp4", ".mp3")

        cmd = [
            "ffmpeg", "-y",
            "-i", video_path,
            "-vn",
            "-acodec", "libmp3lame",
            "-ar", "16000",
            "-ac", "1",
            audio_path
        ]

        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return audio_path

    def upload_to_s3(self, file_path: str) -> str:
        """S3에 파일 업로드"""
        file_name = os.path.basename(file_path)
        s3_key = f"transcribe-input/{file_name}"

        print(f"[Transcriber] S3 업로드 중: {file_name}")
        self.s3_client.upload_file(file_path, self.bucket_name, s3_key)

        return f"s3://{self.bucket_name}/{s3_key}"

    def start_transcription_job(self, s3_uri: str, job_name: str) -> str:
        """Transcribe 작업 시작"""
        print(f"[Transcriber] Transcribe 작업 시작: {job_name}")

        self.transcribe_client.start_transcription_job(
            TranscriptionJobName=job_name,
            Media={"MediaFileUri": s3_uri},
            MediaFormat="mp3",
            LanguageCode=self.language_code,
            Settings={
                "ShowSpeakerLabels": False,
            },
            OutputBucketName=self.bucket_name,
            OutputKey=f"transcribe-output/{job_name}.json",
        )

        return job_name

    def wait_for_job(self, job_name: str, timeout: int = 600) -> dict:
        """작업 완료 대기"""
        print(f"[Transcriber] 작업 완료 대기 중: {job_name}")
        start_time = time.time()

        while True:
            response = self.transcribe_client.get_transcription_job(
                TranscriptionJobName=job_name
            )
            status = response["TranscriptionJob"]["TranscriptionJobStatus"]

            if status == "COMPLETED":
                print(f"[Transcriber] 작업 완료: {job_name}")
                return response["TranscriptionJob"]
            elif status == "FAILED":
                reason = response["TranscriptionJob"].get("FailureReason", "Unknown")
                raise RuntimeError(f"Transcribe 작업 실패: {reason}")

            if time.time() - start_time > timeout:
                raise TimeoutError(f"Transcribe 작업 타임아웃: {job_name}")

            time.sleep(10)  # 10초 간격으로 폴링

    def download_result(self, job_name: str) -> dict:
        """Transcribe 결과 다운로드"""
        s3_key = f"transcribe-output/{job_name}.json"

        response = self.s3_client.get_object(Bucket=self.bucket_name, Key=s3_key)
        result = json.loads(response["Body"].read().decode("utf-8"))

        return result

    def parse_transcribe_result(self, result: dict) -> list:
        """Transcribe 결과를 Whisper 형식으로 변환"""
        segments = []
        items = result.get("results", {}).get("items", [])

        current_segment = None
        segment_text = []

        for item in items:
            if item["type"] == "pronunciation":
                start_time = float(item.get("start_time", 0))
                end_time = float(item.get("end_time", 0))
                content = item["alternatives"][0]["content"]

                if current_segment is None:
                    current_segment = {"start": start_time, "end": end_time}
                    segment_text = [content]
                elif end_time - current_segment["start"] > 5.0:
                    # 5초 이상이면 새 세그먼트
                    segments.append({
                        "start": round(current_segment["start"], 2),
                        "end": round(current_segment["end"], 2),
                        "text": " ".join(segment_text)
                    })
                    current_segment = {"start": start_time, "end": end_time}
                    segment_text = [content]
                else:
                    current_segment["end"] = end_time
                    segment_text.append(content)
            elif item["type"] == "punctuation":
                if segment_text:
                    segment_text[-1] += item["alternatives"][0]["content"]

        # 마지막 세그먼트 추가
        if current_segment and segment_text:
            segments.append({
                "start": round(current_segment["start"], 2),
                "end": round(current_segment["end"], 2),
                "text": " ".join(segment_text)
            })

        return segments

    def transcribe(self, video_path: str) -> list:
        """영상 파일 → 자막 세그먼트 반환"""
        print(f"[Transcriber] 처리 시작: {os.path.basename(video_path)}")

        # 1. 오디오 추출
        print(f"[Transcriber] 오디오 추출 중...")
        audio_path = self.extract_audio(video_path)

        # 2. S3 업로드
        s3_uri = self.upload_to_s3(audio_path)

        # 3. Transcribe 작업 시작
        job_name = f"shortsai-{uuid.uuid4().hex[:8]}"
        self.start_transcription_job(s3_uri, job_name)

        # 4. 작업 완료 대기
        self.wait_for_job(job_name)

        # 5. 결과 다운로드 및 파싱
        result = self.download_result(job_name)
        segments = self.parse_transcribe_result(result)

        # 6. 임시 파일 정리
        os.remove(audio_path)

        # 7. 결과 저장
        base_name = os.path.splitext(os.path.basename(video_path))[0]
        save_path = settings.TRANSCRIPT_DIR / f"{base_name}.json"

        with open(save_path, "w", encoding="utf-8") as f:
            json.dump({
                "video_path": video_path,
                "language": self.language_code,
                "duration": result.get("results", {}).get("transcripts", [{}])[0].get("transcript_length", 0),
                "segments": segments
            }, f, ensure_ascii=False, indent=2)

        print(f"[Transcriber] 완료 → {save_path}")
        return segments

    def run(self, video_paths: list) -> dict:
        """여러 영상 일괄 처리"""
        all_results = {}

        for video_path in video_paths:
            if not os.path.exists(video_path):
                print(f"[Transcriber] 파일 없음: {video_path}")
                continue

            try:
                segments = self.transcribe(video_path)
                all_results[video_path] = segments
            except Exception as e:
                print(f"[Transcriber] ERROR: {e}")

        return all_results
