# backend/app/services/tts.py
"""edge-tts 기반 한국어 TTS 나레이션 생성"""

import asyncio
import subprocess
from pathlib import Path

VOICES = {
    "female": "ko-KR-SunHiNeural",
    "male":   "ko-KR-InJoonNeural",
}


def generate_narration(text: str, output_path: str, voice: str = "female") -> bool:
    """TTS 음성 파일 생성. 성공하면 True 반환."""
    voice_name = VOICES.get(voice, VOICES["female"])
    text = text.replace("\\n", " ").replace("\n", " ").strip()
    if not text:
        return False

    async def _run():
        import edge_tts
        communicate = edge_tts.Communicate(text, voice_name, rate="+0%", volume="+0%")
        await communicate.save(output_path)

    try:
        asyncio.run(_run())
        return Path(output_path).exists() and Path(output_path).stat().st_size > 0
    except Exception as e:
        print(f"[TTS] 생성 실패: {e}")
        return False


def mix_narration(video_path: str, narration_path: str, output_path: str,
                  narration_delay: float = 0.5, narration_volume: float = 1.2,
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
