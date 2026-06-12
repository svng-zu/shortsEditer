# backend/app/services/tts.py
"""Google Cloud Text-to-Speech (Neural2) 기반 한국어 TTS 나레이션 생성"""

import re
import subprocess
import tempfile
from functools import lru_cache
from pathlib import Path

from google.cloud import texttospeech_v1beta1 as texttospeech

from app.config import settings

# ko-KR 음성 — SSML <mark> 타임포인트를 지원하는 Neural2/WaveNet/Standard만 포함
# (Chirp3 HD는 <mark>를 지원하지 않아 나레이션 자막 생성(get_narration_subtitles)이 동작하지 않음)
VOICES = {
    # 기존 값(하위 호환용)
    "female": "ko-KR-Neural2-A",
    "male":   "ko-KR-Neural2-C",
    # Neural2
    "ko-KR-Neural2-A": "ko-KR-Neural2-A",
    "ko-KR-Neural2-B": "ko-KR-Neural2-B",
    "ko-KR-Neural2-C": "ko-KR-Neural2-C",
    # WaveNet
    "ko-KR-Wavenet-A": "ko-KR-Wavenet-A",
    "ko-KR-Wavenet-B": "ko-KR-Wavenet-B",
    "ko-KR-Wavenet-C": "ko-KR-Wavenet-C",
    "ko-KR-Wavenet-D": "ko-KR-Wavenet-D",
    # Standard
    "ko-KR-Standard-A": "ko-KR-Standard-A",
    "ko-KR-Standard-B": "ko-KR-Standard-B",
    "ko-KR-Standard-C": "ko-KR-Standard-C",
    "ko-KR-Standard-D": "ko-KR-Standard-D",
}

# mix_narration*에서 나레이션 음성을 영상 시작 후 지연시키는 시간(초).
# 나레이션 자막 타이밍을 영상 타임라인에 맞출 때도 동일한 오프셋을 더한다.
NARRATION_DELAY = 0.5

_DEFAULT_CREDENTIALS_PATH = Path(__file__).resolve().parent.parent / "credentials" / "gcp_tts_key.json"


@lru_cache(maxsize=1)
def _tts_client():
    creds_path = settings.GCP_TTS_CREDENTIALS or str(_DEFAULT_CREDENTIALS_PATH)
    return texttospeech.TextToSpeechClient.from_service_account_file(creds_path)


def _clean_text(text: str) -> str:
    return text.replace("\\n", " ").replace("\n", " ").strip()


def _split_sentences(text: str) -> list[str]:
    """문장 단위로 분리 (마침표/물음표/느낌표 기준)."""
    parts = re.split(r"(?<=[.!?])\s+", text)
    return [p.strip() for p in parts if p.strip()]


def _escape_ssml(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _wrap_lines(text: str, max_chars: int = 14) -> list[str]:
    """단어 단위 그리디 줄바꿈. 모든 줄을 max_chars 이하로 유지한다."""
    words = text.split()
    lines, current, current_len = [], [], 0
    for w in words:
        added = len(w) + (1 if current else 0)
        if current and current_len + added > max_chars:
            lines.append(" ".join(current))
            current, current_len = [w], len(w)
        else:
            current.append(w)
            current_len += added
    if current:
        lines.append(" ".join(current))
    return lines


def _chunk_sentence_frames(sentence: str, max_chars: int = 14) -> list[str]:
    """문장을 max_chars 이하 줄들로 줄바꿈한 뒤, 2줄씩 묶어 자막 프레임 문자열로 반환.

    각 프레임은 '\\n'으로 구분된 최대 2줄."""
    lines = _wrap_lines(sentence, max_chars)
    return ["\n".join(lines[i:i + 2]) for i in range(0, len(lines), 2)]


def generate_narration(text: str, output_path: str, voice: str = "female") -> bool:
    """TTS 음성 파일 생성. 성공하면 True 반환."""
    voice_name = VOICES.get(voice, VOICES["female"])
    text = _clean_text(text)
    if not text:
        return False

    try:
        response = _tts_client().synthesize_speech(
            input=texttospeech.SynthesisInput(text=text),
            voice=texttospeech.VoiceSelectionParams(language_code="ko-KR", name=voice_name),
            audio_config=texttospeech.AudioConfig(audio_encoding=texttospeech.AudioEncoding.MP3),
        )
        with open(output_path, "wb") as f:
            f.write(response.audio_content)
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
    """나레이션 텍스트에 대해 SSML mark 타임포인트로 문장별 타이밍을 구해 자막 세그먼트를 반환한다.

    반환값은 나레이션 음성(mp3) 시작 시점(0초) 기준 [{start, end, text}] 리스트.
    실제 영상 타임라인에 적용할 때는 NARRATION_DELAY를 더해 오프셋을 맞춘다.
    """
    voice_name = VOICES.get(voice, VOICES["female"])
    text = _clean_text(text)
    if not text:
        return []

    sentences = _split_sentences(text)
    if not sentences:
        return []

    ssml = "<speak>" + "".join(
        f'<mark name="s{i}"/>{_escape_ssml(sent)}' for i, sent in enumerate(sentences)
    ) + "</speak>"

    try:
        request = texttospeech.SynthesizeSpeechRequest(
            input=texttospeech.SynthesisInput(ssml=ssml),
            voice=texttospeech.VoiceSelectionParams(language_code="ko-KR", name=voice_name),
            audio_config=texttospeech.AudioConfig(audio_encoding=texttospeech.AudioEncoding.MP3),
            enable_time_pointing=[texttospeech.SynthesizeSpeechRequest.TimepointType.SSML_MARK],
        )
        response = _tts_client().synthesize_speech(request=request)
    except Exception as e:
        print(f"[TTS] speech marks 조회 실패: {e}")
        return []

    timepoints = {tp.mark_name: tp.time_seconds for tp in response.timepoints}
    if not timepoints:
        return []

    # 마지막 문장의 종료 시각은 마크에 없으므로 실제 오디오 길이로 보정한다
    audio_duration = 0.0
    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
        tmp_path = tmp.name
    try:
        with open(tmp_path, "wb") as f:
            f.write(response.audio_content)
        audio_duration = _audio_duration(tmp_path)
    finally:
        Path(tmp_path).unlink(missing_ok=True)

    subtitles = []
    for i, sent in enumerate(sentences):
        start = timepoints.get(f"s{i}", 0.0)
        end = timepoints.get(f"s{i+1}", start) if i + 1 < len(sentences) else max(audio_duration, start)
        frames = _chunk_sentence_frames(sent)
        total_chars = sum(len(f.replace("\n", "")) for f in frames) or 1
        t = start
        for f in frames:
            dur = (end - start) * (len(f.replace("\n", "")) / total_chars)
            f_end = t + dur
            subtitles.append({"start": round(t, 3), "end": round(f_end, 3), "text": f})
            t = f_end
    return subtitles
