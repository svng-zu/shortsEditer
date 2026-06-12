# backend/app/services/narration_whisper_worker.py
"""나레이션 TTS 오디오의 단어별 타임스탬프를 추출하는 워커.

faster-whisper(ctranslate2)는 프로세스 메모리가 누적되는 문제가 있어
(transcribe_worker.py와 동일한 이유) 별도 프로세스에서 실행 후 종료한다.

사용: python -m app.services.narration_whisper_worker <audio_path>
출력: stdout에 JSON {"words": [{"word": str, "start": float, "end": float}, ...]}
"""
import json
import sys

from faster_whisper import WhisperModel

from app.config import settings


def main():
    audio_path = sys.argv[1]
    model = WhisperModel(settings.WHISPER_MODEL, device="cpu", compute_type="int8")
    seg_iter, _ = model.transcribe(
        audio_path,
        language="ko",
        word_timestamps=True,
        vad_filter=True,
        condition_on_previous_text=False,
    )

    words = []
    for seg in seg_iter:
        for w in (seg.words or []):
            words.append({"word": w.word, "start": round(w.start, 3), "end": round(w.end, 3)})

    print(json.dumps({"words": words}, ensure_ascii=False))


if __name__ == "__main__":
    main()
