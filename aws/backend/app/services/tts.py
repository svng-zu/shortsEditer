# backend/app/services/tts.py
"""Google Cloud Text-to-Speech (Chirp3 HD/Neural2 등) 기반 한국어 TTS 나레이션 생성"""

import json
import subprocess
import sys
import tempfile
from functools import lru_cache
from pathlib import Path

from google.cloud import texttospeech_v1beta1 as texttospeech

from app.config import settings

# ko-KR 음성
# 나레이션 자막(get_narration_subtitles)은 생성된 오디오를 faster-whisper로 다시 분석해
# 단어별 타임스탬프를 구하므로, 모든 음성(Chirp3 HD 포함)에서 동작한다.
VOICES = {
    # 기존 값(하위 호환용)
    "female": "ko-KR-Neural2-A",
    "male":   "ko-KR-Neural2-C",
    # Chirp3 HD (최신/고품질)
    "ko-KR-Chirp3-HD-Achernar":      "ko-KR-Chirp3-HD-Achernar",
    "ko-KR-Chirp3-HD-Achird":        "ko-KR-Chirp3-HD-Achird",
    "ko-KR-Chirp3-HD-Algenib":       "ko-KR-Chirp3-HD-Algenib",
    "ko-KR-Chirp3-HD-Algieba":       "ko-KR-Chirp3-HD-Algieba",
    "ko-KR-Chirp3-HD-Alnilam":       "ko-KR-Chirp3-HD-Alnilam",
    "ko-KR-Chirp3-HD-Aoede":         "ko-KR-Chirp3-HD-Aoede",
    "ko-KR-Chirp3-HD-Autonoe":       "ko-KR-Chirp3-HD-Autonoe",
    "ko-KR-Chirp3-HD-Callirrhoe":    "ko-KR-Chirp3-HD-Callirrhoe",
    "ko-KR-Chirp3-HD-Charon":        "ko-KR-Chirp3-HD-Charon",
    "ko-KR-Chirp3-HD-Despina":       "ko-KR-Chirp3-HD-Despina",
    "ko-KR-Chirp3-HD-Enceladus":     "ko-KR-Chirp3-HD-Enceladus",
    "ko-KR-Chirp3-HD-Erinome":       "ko-KR-Chirp3-HD-Erinome",
    "ko-KR-Chirp3-HD-Fenrir":        "ko-KR-Chirp3-HD-Fenrir",
    "ko-KR-Chirp3-HD-Gacrux":        "ko-KR-Chirp3-HD-Gacrux",
    "ko-KR-Chirp3-HD-Iapetus":       "ko-KR-Chirp3-HD-Iapetus",
    "ko-KR-Chirp3-HD-Kore":          "ko-KR-Chirp3-HD-Kore",
    "ko-KR-Chirp3-HD-Laomedeia":     "ko-KR-Chirp3-HD-Laomedeia",
    "ko-KR-Chirp3-HD-Leda":          "ko-KR-Chirp3-HD-Leda",
    "ko-KR-Chirp3-HD-Orus":          "ko-KR-Chirp3-HD-Orus",
    "ko-KR-Chirp3-HD-Puck":          "ko-KR-Chirp3-HD-Puck",
    "ko-KR-Chirp3-HD-Pulcherrima":   "ko-KR-Chirp3-HD-Pulcherrima",
    "ko-KR-Chirp3-HD-Rasalgethi":    "ko-KR-Chirp3-HD-Rasalgethi",
    "ko-KR-Chirp3-HD-Sadachbia":     "ko-KR-Chirp3-HD-Sadachbia",
    "ko-KR-Chirp3-HD-Sadaltager":    "ko-KR-Chirp3-HD-Sadaltager",
    "ko-KR-Chirp3-HD-Schedar":       "ko-KR-Chirp3-HD-Schedar",
    "ko-KR-Chirp3-HD-Sulafat":       "ko-KR-Chirp3-HD-Sulafat",
    "ko-KR-Chirp3-HD-Umbriel":       "ko-KR-Chirp3-HD-Umbriel",
    "ko-KR-Chirp3-HD-Vindemiatrix":  "ko-KR-Chirp3-HD-Vindemiatrix",
    "ko-KR-Chirp3-HD-Zephyr":        "ko-KR-Chirp3-HD-Zephyr",
    "ko-KR-Chirp3-HD-Zubenelgenubi": "ko-KR-Chirp3-HD-Zubenelgenubi",
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


def _group_words_into_frames(words: list[dict], max_chars: int = 14) -> list[dict]:
    """단어별 타임스탬프를 max_chars 이하 줄로 그리디 줄바꿈한 뒤, 2줄씩 묶어 자막 프레임으로 반환.

    words: [{"word": str, "start": float, "end": float}, ...] (faster-whisper 출력)
    반환값: [{"start": float, "end": float, "text": str}, ...] — text는 '\\n'으로 구분된 최대 2줄.
    """
    lines: list[list[dict]] = []
    current: list[dict] = []
    current_len = 0
    for w in words:
        token = w["word"].strip()
        if not token:
            continue
        added = len(token) + (1 if current else 0)
        if current and current_len + added > max_chars:
            lines.append(current)
            current, current_len = [w], len(token)
        else:
            current.append(w)
            current_len += added
    if current:
        lines.append(current)

    frames = []
    for i in range(0, len(lines), 2):
        frame_lines = lines[i:i + 2]
        frame_words = [w for line in frame_lines for w in line]
        text = "\n".join(" ".join(w["word"].strip() for w in line) for line in frame_lines)
        frames.append({
            "start": round(frame_words[0]["start"], 3),
            "end": round(frame_words[-1]["end"], 3),
            "text": text,
        })
    return frames


def generate_narration(text: str, output_path: str, voice: str = "female", speed: float = 1.0) -> bool:
    """TTS 음성 파일 생성. 성공하면 True 반환."""
    voice_name = VOICES.get(voice, VOICES["female"])
    text = _clean_text(text)
    if not text:
        return False

    try:
        response = _tts_client().synthesize_speech(
            input=texttospeech.SynthesisInput(text=text),
            voice=texttospeech.VoiceSelectionParams(language_code="ko-KR", name=voice_name),
            audio_config=texttospeech.AudioConfig(
                audio_encoding=texttospeech.AudioEncoding.MP3,
                speaking_rate=speed,
            ),
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


def get_narration_subtitles(text: str, voice: str = "female", speed: float = 1.0) -> list[dict]:
    """나레이션 텍스트를 TTS로 합성한 뒤, faster-whisper로 단어별 타임스탬프를 구해 자막 세그먼트를 반환한다.

    반환값은 나레이션 음성(mp3) 시작 시점(0초) 기준 [{start, end, text}] 리스트.
    실제 영상 타임라인에 적용할 때는 NARRATION_DELAY를 더해 오프셋을 맞춘다.
    모든 음성(Chirp3 HD 포함)에서 동작한다.
    """
    text = _clean_text(text)
    if not text:
        return []

    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
        tmp_path = tmp.name
    try:
        if not generate_narration(text, tmp_path, voice, speed):
            return []

        result = subprocess.run(
            [sys.executable, "-m", "app.services.narration_whisper_worker", tmp_path],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        )
        if result.returncode != 0:
            print(f"[TTS] 자막 타이밍 추출 실패: {result.stderr[-300:]}")
            return []
        words = json.loads(result.stdout).get("words", [])
    except Exception as e:
        print(f"[TTS] 자막 타이밍 추출 실패: {e}")
        return []
    finally:
        Path(tmp_path).unlink(missing_ok=True)

    if not words:
        return []
    return _group_words_into_frames(words)
