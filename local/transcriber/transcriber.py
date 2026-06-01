# transcriber/transcriber.py

import os
import subprocess
import json
from faster_whisper import WhisperModel

# local/transcriber/ → local/ → edit_tool/
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
DOWNLOAD_DIR = os.path.join(BASE_DIR, "downloads")
TRANSCRIPT_DIR = os.path.join(BASE_DIR, "outputs", "transcripts")

os.makedirs(TRANSCRIPT_DIR, exist_ok=True)

MODEL_SIZE = "large-v3"
DEVICE = "cuda"
COMPUTE_TYPE = "float16"  # 4060 Ti 기준 최적


class Transcriber:

    def __init__(self):
        print(f"[Transcriber] 모델 로딩 중: {MODEL_SIZE}")
        self.model = WhisperModel(MODEL_SIZE, device=DEVICE, compute_type=COMPUTE_TYPE)
        print("[Transcriber] 모델 로딩 완료")

    def extract_audio(self, video_path):
        """mp4 → wav 음성 추출"""
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

    def transcribe(self, video_path):
        """영상 파일 → 자막 세그먼트 반환"""
        print(f"[Transcriber] 음성 추출 중: {os.path.basename(video_path)}")
        audio_path = self.extract_audio(video_path)

        print(f"[Transcriber] Whisper 실행 중...")
        segments, info = self.model.transcribe(
            audio_path,
            language="ko",
            beam_size=5,
            vad_filter=True,           # 무음 구간 자동 제거
            vad_parameters=dict(
                min_silence_duration_ms=500
            )
        )

        results = []
        for seg in segments:
            results.append({
                "start": round(seg.start, 2),
                "end": round(seg.end, 2),
                "text": seg.text.strip()
            })

        # 임시 wav 삭제
        os.remove(audio_path)

        # 결과 저장
        base_name = os.path.splitext(os.path.basename(video_path))[0]
        save_path = os.path.join(TRANSCRIPT_DIR, f"{base_name}.json")

        with open(save_path, "w", encoding="utf-8") as f:
            json.dump({
                "video_path": video_path,
                "language": info.language,
                "duration": info.duration,
                "segments": results
            }, f, ensure_ascii=False, indent=2)

        print(f"[Transcriber] 완료 → {save_path}")
        return results

    def run(self, video_paths: list):
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