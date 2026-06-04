# local/tts/tts.py
"""
Edge TTS를 사용한 한국어 나레이션 생성 모듈
"""
import os
import asyncio
import edge_tts

# local/tts/ → local/
LOCAL_DIR = os.path.dirname(os.path.dirname(__file__))
TEMP_DIR = os.path.join(LOCAL_DIR, "temp")
os.makedirs(TEMP_DIR, exist_ok=True)

# 한국어 음성 옵션
VOICES = {
    "female": "ko-KR-SunHiNeural",      # 여성 (기본)
    "male": "ko-KR-InJoonNeural",        # 남성
    "female_news": "ko-KR-SunHiNeural",  # 뉴스 스타일
}

DEFAULT_VOICE = VOICES["female"]


class TTS:
    def __init__(self, voice: str = None):
        self.voice = voice or DEFAULT_VOICE

    async def _generate_async(self, text: str, output_path: str, rate: str = "+0%", pitch: str = "+0Hz") -> str:
        """비동기 TTS 생성"""
        communicate = edge_tts.Communicate(
            text=text,
            voice=self.voice,
            rate=rate,
            pitch=pitch
        )
        await communicate.save(output_path)
        return output_path

    def generate(self, text: str, output_path: str = None, rate: str = "+0%", pitch: str = "+0Hz") -> str:
        """
        텍스트를 음성 파일로 변환

        Args:
            text: 변환할 텍스트
            output_path: 출력 파일 경로 (없으면 temp 폴더에 생성)
            rate: 속도 조절 (예: "+10%", "-10%")
            pitch: 피치 조절 (예: "+5Hz", "-5Hz")

        Returns:
            생성된 음성 파일 경로
        """
        if not output_path:
            import hashlib
            hash_name = hashlib.md5(text.encode()).hexdigest()[:12]
            output_path = os.path.join(TEMP_DIR, f"tts_{hash_name}.mp3")

        # 이미 존재하면 재사용
        if os.path.exists(output_path):
            return output_path

        # 비동기 실행
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(self._generate_async(text, output_path, rate, pitch))
        finally:
            loop.close()

        print(f"[TTS] 생성 완료: {os.path.basename(output_path)}")
        return output_path

    def generate_intro(self, summary: str, category: str = "economy") -> str:
        """
        도입부 나레이션 생성 (경제/정치용)

        Args:
            summary: 한 줄 요약 텍스트
            category: 카테고리 (economy, politics)

        Returns:
            생성된 음성 파일 경로
        """
        # 카테고리별 도입 멘트
        if category == "politics":
            intro_text = f"{summary}"
        else:  # economy
            intro_text = f"{summary}"

        # 약간 느린 속도로 명확하게
        return self.generate(intro_text, rate="-5%")


# 편의 함수
def generate_tts(text: str, output_path: str = None, voice: str = None) -> str:
    """간편 TTS 생성 함수"""
    tts = TTS(voice=voice)
    return tts.generate(text, output_path)


def generate_intro_narration(summary: str, category: str = "economy") -> str:
    """도입부 나레이션 생성"""
    tts = TTS()
    return tts.generate_intro(summary, category)


if __name__ == "__main__":
    # 테스트
    tts = TTS()
    path = tts.generate("오늘 코스피가 3% 급락했습니다. 외국인 매도세가 원인입니다.")
    print(f"생성된 파일: {path}")
