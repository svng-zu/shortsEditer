# backend/app/services/tts.py
"""Google Cloud Text-to-Speech (Chirp3 HD/Neural2 등) 기반 한국어 TTS 나레이션 생성"""

import difflib
import json
import re
import subprocess
import sys
import tempfile
from functools import lru_cache
from pathlib import Path

import httpx
from google.cloud import texttospeech_v1beta1 as texttospeech

from app.config import settings

# ElevenLabs: voice 값이 아래 목록에 있으면 ElevenLabs로 합성하고, 실패 시 Google Cloud TTS(여성)로 폴백.
ELEVENLABS_API_URL = "https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
ELEVENLABS_VOICES = {
    "el-rachel":    "21m00Tcm4TlvDq8ikWAM",  # Rachel (여성)
    "el-sarah":     "EXAVITQu4vr4xnSDxMaL",  # Sarah (여성)
    "el-charlotte": "XB0fDUnXU5powFXDhCwa",  # Charlotte (여성)
    "el-adam":      "pNInz6obpgDQGcFmaJgB",  # Adam (남성)
    "el-antoni":    "ErXwobaYiN019PkySvjV",  # Antoni (남성)
}

# ko-KR 음성
# 나레이션 자막(get_narration_subtitles)은 생성된 오디오를 faster-whisper로 다시 분석해
# 단어별 타임스탬프를 구하므로, 모든 음성(Chirp3 HD 포함)에서 동작한다.
# 자막 텍스트 자체는 whisper 전사 결과가 아닌 원본 대본을 사용하고,
# whisper 타임스탬프를 대본 단어에 정렬해 타이밍만 가져온다.
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


def _normalize_token(s: str) -> str:
    return re.sub(r"\W+", "", s).lower()


def _align_script_words(script_words: list[str], whisper_words: list[dict]) -> list[dict]:
    """whisper 단어별 타임스탬프를 원본 대본 단어(script_words)에 정렬한다.

    whisper_words: [{"word": str, "start": float, "end": float}, ...] (TTS 음성 재전사 결과)
    반환값: script_words와 동일한 순서/길이의 [{"word": str, "start": float, "end": float}, ...].
    매칭되지 않는 단어는 인접 매칭 구간(또는 전체 구간) 사이를 글자 수 비례로 보간한다.
    """
    if not script_words or not whisper_words:
        return []

    w_tokens = [_normalize_token(w["word"]) for w in whisper_words]
    s_tokens = [_normalize_token(w) for w in script_words]

    matcher = difflib.SequenceMatcher(a=w_tokens, b=s_tokens, autojunk=False)
    matched: dict[int, int] = {}
    for a0, b0, size in matcher.get_matching_blocks():
        for k in range(size):
            if w_tokens[a0 + k]:
                matched[b0 + k] = a0 + k

    total_start = whisper_words[0]["start"]
    total_end = whisper_words[-1]["end"]

    result: list[dict | None] = [None] * len(script_words)
    for b_idx, a_idx in matched.items():
        result[b_idx] = {
            "word": script_words[b_idx],
            "start": whisper_words[a_idx]["start"],
            "end": whisper_words[a_idx]["end"],
        }

    n = len(script_words)
    i = 0
    while i < n:
        if result[i] is not None:
            i += 1
            continue
        j = i
        while j < n and result[j] is None:
            j += 1
        gap_start = result[i - 1]["end"] if i > 0 else total_start
        gap_end = result[j]["start"] if j < n else total_end
        gap_end = max(gap_end, gap_start)
        chars = [len(script_words[k]) for k in range(i, j)]
        total_chars = sum(chars) or 1
        cum = 0
        for k in range(i, j):
            seg_start = gap_start + (gap_end - gap_start) * (cum / total_chars)
            cum += chars[k - i]
            seg_end = gap_start + (gap_end - gap_start) * (cum / total_chars)
            result[k] = {"word": script_words[k], "start": round(seg_start, 3), "end": round(seg_end, 3)}
        i = j

    return result


def _group_words_into_frames(words: list[dict], max_chars: int = 12) -> list[dict]:
    """단어별 타임스탬프를 max_chars 이하 줄로 그리디 줄바꿈한 뒤, 2줄씩 묶어 자막 프레임으로 반환.

    words: [{"word": str, "start": float, "end": float}, ...] (대본 단어에 whisper 타이밍을 정렬한 결과)
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


def _generate_narration_elevenlabs(text: str, output_path: str, voice_id: str, speed: float = 1.0) -> bool:
    """ElevenLabs TTS로 음성 생성. API 키 미설정/실패 시 False 반환."""
    api_key = settings.ELEVENLABS_API_KEY
    if not api_key:
        return False

    try:
        response = httpx.post(
            ELEVENLABS_API_URL.format(voice_id=voice_id),
            headers={"xi-api-key": api_key, "Content-Type": "application/json"},
            json={
                "text": text,
                "model_id": "eleven_multilingual_v2",
                "voice_settings": {
                    "stability": 0.5,
                    "similarity_boost": 0.75,
                    "speed": max(0.7, min(1.2, speed)),
                },
            },
            timeout=60.0,
        )
        response.raise_for_status()
        Path(output_path).write_bytes(response.content)
        return Path(output_path).exists() and Path(output_path).stat().st_size > 0
    except Exception as e:
        print(f"[TTS] ElevenLabs 생성 실패, Google TTS로 폴백: {e}")
        return False


def generate_narration(text: str, output_path: str, voice: str = "female", speed: float = 1.0) -> bool:
    """TTS 음성 파일 생성. 성공하면 True 반환.

    voice가 ElevenLabs 음성이면 ElevenLabs로 합성하고, 실패하면 Google Cloud TTS(여성)로 폴백한다.
    """
    text = _clean_text(text)
    if not text:
        return False

    if voice in ELEVENLABS_VOICES:
        if _generate_narration_elevenlabs(text, output_path, ELEVENLABS_VOICES[voice], speed):
            return True
        voice = "female"

    voice_name = VOICES.get(voice, VOICES["female"])
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


def mix_narration_and_sfx(video_path: str, output_path: str,
                          narration_path: str | None = None,
                          sfx_events: list[dict] = None,
                          narration_delay: float = NARRATION_DELAY, narration_volume: float = 1.2,
                          video_volume: float = 0.3, sfx_volume: float = 0.8) -> bool:
    """나레이션(선택) + 효과음(들)을 영상에 믹싱.

    narration_path=None이면 나레이션 없이 SFX만 적용.
    sfx_events: [{"time": float, "file": "/path/to/sfx.mp3", "volume": float(선택)}, ...]
    각 SFX의 "volume" 키가 있으면 해당 값을, 없으면 sfx_volume을 사용한다.
    """
    sfx_events = [e for e in (sfx_events or []) if Path(e.get("file", "")).exists()]
    has_narration = narration_path is not None

    inputs = ["-i", video_path]
    if has_narration:
        inputs += ["-i", narration_path]
    for e in sfx_events:
        inputs += ["-i", e["file"]]

    va = f"[0:a]volume={video_volume}[va]"
    filters = [va]
    mix_labels = ["[va]"]

    if has_narration:
        na = (
            f"[1:a]volume={narration_volume},"
            f"adelay={int(narration_delay*1000)}|{int(narration_delay*1000)}[na]"
        )
        filters.append(na)
        mix_labels.append("[na]")
        sfx_start_idx = 2
    else:
        sfx_start_idx = 1

    for i, e in enumerate(sfx_events):
        delay_ms = max(0, int(e["time"] * 1000))
        vol = e.get("volume", sfx_volume)
        label = f"[sfx{i}]"
        filters.append(f"[{sfx_start_idx + i}:a]volume={vol},adelay={delay_ms}|{delay_ms}{label}")
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


def generate_narration_preview(text: str, voice: str = "female", speed: float = 1.0) -> tuple[bytes | None, list[dict]]:
    """나레이션 텍스트를 TTS로 합성해 오디오 바이트와 자막 세그먼트를 함께 반환한다.

    자막은 합성된 오디오를 faster-whisper로 재전사해 얻은 단어별 타임스탬프를
    원본 대본 단어에 정렬한 결과(0초 기준 [{start, end, text}] 리스트).
    실제 영상 타임라인에 적용할 때는 NARRATION_DELAY를 더해 오프셋을 맞춘다.
    모든 음성(Chirp3 HD 포함)에서 동작한다.
    """
    text = _clean_text(text)
    if not text:
        return None, []

    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
        tmp_path = tmp.name
    try:
        if not generate_narration(text, tmp_path, voice, speed):
            return None, []

        audio_bytes = Path(tmp_path).read_bytes()

        result = subprocess.run(
            [sys.executable, "-m", "app.services.narration_whisper_worker", tmp_path],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        )
        if result.returncode != 0:
            print(f"[TTS] 자막 타이밍 추출 실패: {result.stderr[-300:]}")
            return audio_bytes, []
        whisper_words = json.loads(result.stdout).get("words", [])
    except Exception as e:
        print(f"[TTS] 자막 타이밍 추출 실패: {e}")
        return None, []
    finally:
        Path(tmp_path).unlink(missing_ok=True)

    if not whisper_words:
        return audio_bytes, []

    script_words = text.split()
    aligned_words = _align_script_words(script_words, whisper_words)
    subtitles = _group_words_into_frames(aligned_words) if aligned_words else []
    return audio_bytes, subtitles


def get_narration_subtitles(text: str, voice: str = "female", speed: float = 1.0) -> list[dict]:
    """나레이션 텍스트를 TTS로 합성한 뒤, faster-whisper로 단어별 타임스탬프를 구해 자막 세그먼트를 반환한다.

    반환값은 나레이션 음성(mp3) 시작 시점(0초) 기준 [{start, end, text}] 리스트.
    실제 영상 타임라인에 적용할 때는 NARRATION_DELAY를 더해 오프셋을 맞춘다.
    모든 음성(Chirp3 HD 포함)에서 동작한다.
    """
    _, subtitles = generate_narration_preview(text, voice, speed)
    return subtitles
