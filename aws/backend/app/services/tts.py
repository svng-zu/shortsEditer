# backend/app/services/tts.py
"""Amazon Polly Neural 기반 한국어 TTS 나레이션 생성"""

import json
import subprocess
import tempfile
from functools import lru_cache
from pathlib import Path

import boto3

from app.config import settings

# Polly 한국어(ko-KR) 음성은 Seoyeon/Jihye 둘 다 여성 음성뿐이라
# (남성 한국어 Neural 음성 없음) 톤 차이를 두는 용도로만 구분한다.
VOICES = {
    "female": "Seoyeon",
    "male":   "Jihye",
}

# mix_narration*에서 나레이션 음성을 영상 시작 후 지연시키는 시간(초).
# 나레이션 자막 타이밍을 영상 타임라인에 맞출 때도 동일한 오프셋을 더한다.
NARRATION_DELAY = 0.5


@lru_cache(maxsize=1)
def _polly_client():
    return boto3.client("polly", region_name=settings.AWS_REGION)


def generate_narration(text: str, output_path: str, voice: str = "female") -> bool:
    """TTS 음성 파일 생성. 성공하면 True 반환."""
    voice_name = VOICES.get(voice, VOICES["female"])
    text = text.replace("\\n", " ").replace("\n", " ").strip()
    if not text:
        return False

    try:
        response = _polly_client().synthesize_speech(
            Text=text,
            OutputFormat="mp3",
            VoiceId=voice_name,
            Engine="neural",
            LanguageCode="ko-KR",
        )
        with open(output_path, "wb") as f:
            f.write(response["AudioStream"].read())
        return Path(output_path).exists() and Path(output_path).stat().st_size > 0
    except Exception as e:
        print(f"[TTS] 생성 실패: {e}")
        return False


def mix_narration(video_path: str, narration_path: str, output_path: str,
                  narration_delay: float = NARRATION_DELAY, narration_volume: float = 1.2,
                  video_volume: float = 0.3) -> bool:
    """나레이션 음성을 영상에 믹싱. 영상 원음은 줄이고 TTS를 앞에 배치."""
    cmd = [
        "ffmpeg", "-y",
        "-i", video_path,
        "-i", narration_path,
        "-filter_complex",
        (
            f"[0:a]volume={video_volume}[va];"
            f"[1:a]volume={narration_volume},adelay={int(narration_delay*1000)}|{int(narration_delay*1000)}[na];"
            f"[va][na]amix=inputs=2:duration=first:dropout_transition=2[aout]"
        ),
        "-map", "0:v",
        "-map", "[aout]",
        "-c:v", "copy",
        "-c:a", "aac", "-b:a", "128k",
        output_path,
    ]
    result = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
    if result.returncode != 0:
        print(f"[TTS] 믹싱 실패: {result.stderr[-300:]}")
        return False
    return True


def mix_narration_and_sfx(video_path: str, narration_path: str, output_path: str,
                          sfx_events: list[dict] = None,
                          narration_delay: float = NARRATION_DELAY, narration_volume: float = 1.2,
                          video_volume: float = 0.3, sfx_volume: float = 0.8) -> bool:
    """나레이션 음성 + 효과음(들)을 영상에 믹싱.

    sfx_events: [{"time": float, "file": "/path/to/sfx.mp3"}, ...]
    sfx_events가 비어있으면 mix_narration과 동일하게 동작한다.
    """
    sfx_events = [e for e in (sfx_events or []) if Path(e.get("file", "")).exists()]

    inputs = ["-i", video_path, "-i", narration_path]
    for e in sfx_events:
        inputs += ["-i", e["file"]]

    va = f"[0:a]volume={video_volume}[va]"
    na = (
        f"[1:a]volume={narration_volume},"
        f"adelay={int(narration_delay*1000)}|{int(narration_delay*1000)}[na]"
    )
    filters = [va, na]
    mix_labels = ["[va]", "[na]"]
    for i, e in enumerate(sfx_events):
        delay_ms = max(0, int(e["time"] * 1000))
        label = f"[sfx{i}]"
        filters.append(f"[{i+2}:a]volume={sfx_volume},adelay={delay_ms}|{delay_ms}{label}")
        mix_labels.append(label)

    filters.append(
        f"{''.join(mix_labels)}amix=inputs={len(mix_labels)}:duration=first:dropout_transition=2[aout]"
    )

    cmd = [
        "ffmpeg", "-y",
        *inputs,
        "-filter_complex", ";".join(filters),
        "-map", "0:v",
        "-map", "[aout]",
        "-c:v", "copy",
        "-c:a", "aac", "-b:a", "128k",
        output_path,
    ]
    result = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
    if result.returncode != 0:
        print(f"[TTS] 믹싱(SFX 포함) 실패: {result.stderr[-300:]}")
        return False
    return True


def _audio_duration(audio_path: str) -> float:
    """ffprobe로 오디오 파일 길이(초) 조회"""
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", audio_path],
        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True
    )
    try:
        return float(result.stdout.strip())
    except ValueError:
        return 0.0


def get_narration_subtitles(text: str, voice: str = "female") -> list[dict]:
    """나레이션 텍스트에 대해 Polly speech marks로 문장별 타이밍을 구해 자막 세그먼트를 반환한다.

    반환값은 나레이션 음성(mp3) 시작 시점(0초) 기준 [{start, end, text}] 리스트.
    실제 영상 타임라인에 적용할 때는 NARRATION_DELAY를 더해 오프셋을 맞춘다.
    """
    voice_name = VOICES.get(voice, VOICES["female"])
    text = text.replace("\\n", " ").replace("\n", " ").strip()
    if not text:
        return []

    try:
        marks_response = _polly_client().synthesize_speech(
            Text=text,
            OutputFormat="json",
            VoiceId=voice_name,
            Engine="neural",
            LanguageCode="ko-KR",
            SpeechMarkTypes=["sentence"],
        )
        raw = marks_response["AudioStream"].read().decode("utf-8")
        marks = [json.loads(line) for line in raw.splitlines() if line.strip()]
    except Exception as e:
        print(f"[TTS] speech marks 조회 실패: {e}")
        return []

    if not marks:
        return []

    # 마지막 문장의 종료 시각은 speech marks에 없으므로 실제 오디오 길이로 보정한다
    audio_duration = 0.0
    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
        tmp_path = tmp.name
    try:
        if generate_narration(text, tmp_path, voice):
            audio_duration = _audio_duration(tmp_path)
    finally:
        Path(tmp_path).unlink(missing_ok=True)

    subtitles = []
    for i, mark in enumerate(marks):
        start = mark["time"] / 1000.0
        end = marks[i + 1]["time"] / 1000.0 if i + 1 < len(marks) else max(audio_duration, start)
        subtitles.append({"start": round(start, 3), "end": round(end, 3), "text": mark["value"].strip()})
    return subtitles
