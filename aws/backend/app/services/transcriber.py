"""faster-whisper를 사용한 자막 생성 서비스

openai-whisper 대비 CTranslate2(int8) 추론으로 CPU에서 약 4배 빠르고,
VAD(무음 구간 필터링) + condition_on_previous_text=False 설정으로
자막이 실제 음성과 어긋나거나(드리프트) 같은 문장이 반복되는 현상을 줄인다.
"""

import os
import json
from pathlib import Path
from faster_whisper import WhisperModel

from app.config import settings


MAX_DURATION_SECONDS = 7200  # 2시간 — 이보다 긴 영상은 처리 중 메모리 부족(OOM)으로 컨테이너가 죽을 수 있어 건너뜀


class Transcriber:
    """faster-whisper 기반 자막 생성기"""

    def __init__(self, transcript_dir: str | None = None):
        self.model = WhisperModel(settings.WHISPER_MODEL, device="cpu", compute_type="int8")
        # "auto"/빈 값이면 None을 넘겨 faster-whisper가 영상마다 언어를 자동 감지하게 함
        lang = settings.WHISPER_LANGUAGE.strip().lower()
        self.language = None if lang in ("", "auto") else lang
        self.transcript_dir = Path(transcript_dir) if transcript_dir else settings.TRANSCRIPT_DIR
        print(f"[Transcriber] faster-whisper 초기화 완료: {settings.WHISPER_MODEL} (int8/cpu)")

    def get_duration(self, video_path: str) -> float:
        """ffprobe로 영상 길이(초) 조회"""
        import subprocess
        result = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", video_path],
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True
        )
        try:
            return float(result.stdout.strip())
        except ValueError:
            return 0.0

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

        # 0. 길이 확인 — 너무 긴 영상(라이브 재방송 등)은 메모리 부족으로
        #    프로세스가 강제 종료(OOM kill)되어 파이프라인이 무한 재시도에 빠질 수 있음
        duration = self.get_duration(video_path)
        if duration > MAX_DURATION_SECONDS:
            raise RuntimeError(
                f"영상이 너무 깁니다 ({duration/3600:.1f}시간 > {MAX_DURATION_SECONDS/3600:.0f}시간) — 자막 생성을 건너뜁니다: {os.path.basename(video_path)}"
            )

        # 1. 오디오 추출
        print(f"[Transcriber] 오디오 추출 중...")
        audio_path = self.extract_audio(video_path)

        try:
            # 2. faster-whisper 변환
            # vad_filter: 무음/비음성 구간을 건너뛰어 속도 향상 + 환각(없는 말 생성) 방지
            # condition_on_previous_text=False: 이전 문장에 영향받아 같은 말을 반복하거나
            #   타이밍이 밀리는(드리프트) 현상을 방지 — 자막-음성 불일치의 주요 원인
            print(f"[Transcriber] faster-whisper 변환 중...")
            seg_iter, info = self.model.transcribe(
                audio_path,
                language=self.language,
                beam_size=5,
                vad_filter=True,
                vad_parameters={"min_silence_duration_ms": 500},
                condition_on_previous_text=False,
            )

            # 3. 세그먼트 파싱 (segments는 제너레이터 — 순회하며 실제 디코딩 수행)
            segments = [
                {
                    "start": round(seg.start, 2),
                    "end": round(seg.end, 2),
                    "text": seg.text.strip()
                }
                for seg in seg_iter
            ]
        finally:
            # 4. 임시 오디오 파일 정리 — 예외 발생 시에도 누락되지 않도록 finally에서 처리
            if os.path.exists(audio_path):
                os.remove(audio_path)

        # 5. 로컬 저장
        save_path = self.transcript_dir / f"{base_name}.json"
        transcript_data = {
            "video_path": video_path,
            "language": (info.language if info else None) or self.language,
            "duration": info.duration if info else 0,
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
