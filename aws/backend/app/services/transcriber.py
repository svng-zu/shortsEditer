"""Whisper를 사용한 자막 생성 서비스"""

import os
import json
from pathlib import Path
import whisper

from app.config import settings


class Transcriber:
    """Whisper 기반 자막 생성기"""

    def __init__(self, transcript_dir: str | None = None):
        self.model = whisper.load_model(settings.WHISPER_MODEL)
        self.language = settings.WHISPER_LANGUAGE
        self.transcript_dir = Path(transcript_dir) if transcript_dir else settings.TRANSCRIPT_DIR
        print(f"[Transcriber] Whisper 초기화 완료: {settings.WHISPER_MODEL}")

    def extract_audio(self, video_path: str) -> str:
        """mp4 → wav 음성 추출 (Whisper 최적화)"""
        import subprocess
        audio_path = video_path.replace(".mp4", ".wav")
        cmd = [
            "ffmpeg", "-y",
            "-i", video_path,
            "-vn",
            "-acodec", "pcm_s16le",
            "-ar", "16000",
            "-ac", "1",
            audio_path
        ]
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return audio_path

    def transcribe(self, video_path: str) -> list:
        """영상 파일 → 자막 세그먼트 반환"""
        print(f"[Transcriber] 처리 시작: {os.path.basename(video_path)}")
        base_name = os.path.splitext(os.path.basename(video_path))[0]

        # 1. 오디오 추출
        print(f"[Transcriber] 오디오 추출 중...")
        audio_path = self.extract_audio(video_path)

        # 2. Whisper 변환
        print(f"[Transcriber] Whisper 변환 중...")
        result = self.model.transcribe(
            audio_path,
            language=self.language,
            verbose=False
        )

        # 3. 세그먼트 파싱
        segments = [
            {
                "start": round(seg["start"], 2),
                "end": round(seg["end"], 2),
                "text": seg["text"].strip()
            }
            for seg in result["segments"]
        ]

        # 4. 임시 오디오 파일 정리
        os.remove(audio_path)

        # 5. 로컬 저장
        save_path = self.transcript_dir / f"{base_name}.json"
        transcript_data = {
            "video_path": video_path,
            "language": self.language,
            "duration": result.get("duration", 0),
            "segments": segments
        }
        with open(save_path, "w", encoding="utf-8") as f:
            json.dump(transcript_data, f, ensure_ascii=False, indent=2)

        print(f"[Transcriber] 완료 → {save_path} ({len(segments)}개 세그먼트)")
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
