# llm/analyzer.py

import os
import json
from llm.gemini_client import call_gemini

# local/llm/ → local/ → edit_tool/
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
TRANSCRIPT_DIR = os.path.join(BASE_DIR, "outputs", "transcripts")
ANALYSIS_DIR = os.path.join(BASE_DIR, "outputs", "analysis")

os.makedirs(ANALYSIS_DIR, exist_ok=True)

CATEGORY_PROMPTS = {
    "economy": """
당신은 경제 뉴스 영상에서 쇼츠로 만들기 좋은 구간을 찾는 전문가입니다.
아래 기준으로 쇼츠 후보 구간을 선택하세요:
- 핵심 경제 수치 언급 (코스피, 금리, 환율, GDP 등)
- 시청자에게 임팩트 있는 경제 전망 발언
- 일반인이 체감할 수 있는 생활 경제 이슈
""",
    "politics": """
당신은 정치 뉴스 영상에서 쇼츠로 만들기 좋은 구간을 찾는 전문가입니다.
아래 기준으로 쇼츠 후보 구간을 선택하세요:
- 정치인의 강한 발언, 논쟁적 발언
- 여론을 뒤흔들 만한 폭로나 주장
- 핵심 쟁점을 한 문장으로 요약할 수 있는 구간
""",
    "sports": """
당신은 스포츠 영상에서 쇼츠로 만들기 좋은 구간을 찾는 전문가입니다.
아래 기준으로 쇼츠 후보 구간을 선택하세요:
- 가장 먼저 나올 장면은 어떤 팀과 어떤 팀의 경기인지
- 한국 선수 관련 하이라이트 및 활약 언급
- 경기 결정적 장면 묘사 구간
- 기록 경신, 이변, 극적인 순간
가장 첫장면은 어떤 팀간의 경기인지를 확인하는 것입니다. 주로 10초 이내에 해당 장면이 나타납니다.
"""
}

SINGLE_TOPIC_PROMPT = """
{category_prompt}

영상 제목: {video_title}

아래는 영상의 전체 자막 세그먼트입니다:
{segments_text}

위 세그먼트를 분석하여 아래 JSON 형식으로만 응답하세요. 다른 텍스트는 절대 포함하지 마세요:
{{
  "intro_text": "영상 제목을 참고해 첫줄은 대결 팀명(예: A vs B), 둘째줄은 날짜 또는 핵심 이벤트. 반드시 2줄, 각 줄은 띄어쓰기 포함 12자 이내. 예: SF vs 애슬레틱스\\n05.18 MLB 하이라이트",
  "candidates": [
    {{
      "start": 시작시간(초),
      "end": 종료시간(초),
      "reason": "선택 이유",
      "score": 중요도 점수(1~10),
      "edit_order": 편집에서 배치할 순서(1부터 시작),
      "connection_note": "이전 구간과 어떻게 자연스럽게 이어지는지 설명 (첫 구간이면 '시작')"
    }}
  ]
}}

후보 구간 조건:
- 최대 5개 선택
- 각 구간은 반드시 5초 이상
- edit_order는 시청자가 자연스럽게 이해할 수 있는 흐름 순서로 지정 (시간순이 아니어도 됨)
- connection_note로 구간 간 연결이 왜 자연스러운지 설명
"""

MULTI_TOPIC_PROMPT = """
{category_prompt}

영상 제목: {video_title}

아래는 영상의 전체 자막 세그먼트입니다:
{segments_text}

이 뉴스 영상에는 여러 독립적인 주제/기사가 포함되어 있습니다.
주제별로 분리하여 아래 JSON 형식으로만 응답하세요. 다른 텍스트는 절대 포함하지 마세요:
{{
  "topics": [
    {{
      "intro_text": "첫줄은 핵심 키워드(12자 이내)\\n둘째줄은 수치·날짜 또는 부제(12자 이내)",
      "candidates": [
        {{
          "start": 시작시간(초),
          "end": 종료시간(초),
          "reason": "선택 이유",
          "score": 중요도(1~10),
          "edit_order": 1
        }}
      ]
    }}
  ]
}}

조건:
- topics: 독립적인 주제별로 1~4개로 분리 (주제가 하나라면 1개만)
- 주제 간 내용이 겹치면 안 됨 (각 주제는 다른 뉴스 기사)
- 각 주제의 candidates: 최대 3개, 각 구간 5초 이상
- edit_order는 각 topic 내에서 1부터 시작
"""

MULTI_TOPIC_CATEGORIES = {"economy", "politics"}

CHUNK_SUMMARY_PROMPT = """
아래는 영상 자막의 일부입니다. 핵심 내용을 3줄 이내로 요약하고,
중요한 발언이나 수치가 있으면 반드시 포함하세요.
타임스탬프(시작~끝 시간)도 함께 유지하세요.

{segments_text}

형식: [시작s ~ 끝s] 핵심 요약
"""


class Analyzer:

    def __init__(self):
        print("[Analyzer] Gemini API 사용")

    def _build_segments_text(self, segments, max_segments=80):
        if len(segments) <= max_segments:
            return self._format_segments(segments)
        print(f"[Analyzer] 세그먼트 {len(segments)}개 → 청크 요약 처리")
        return self._summarize_chunks(segments, chunk_size=20)

    def _format_segments(self, segments):
        lines = []
        for seg in segments:
            lines.append(f"[{seg['start']}s ~ {seg['end']}s] {seg['text']}")
        return "\n".join(lines)

    def _summarize_chunks(self, segments, chunk_size=20):
        summaries = []
        chunks = [segments[i:i+chunk_size] for i in range(0, len(segments), chunk_size)]
        for idx, chunk in enumerate(chunks):
            chunk_text = self._format_segments(chunk)
            prompt = CHUNK_SUMMARY_PROMPT.format(segments_text=chunk_text)
            print(f"  [Analyzer] 청크 {idx+1}/{len(chunks)} 요약 중...")
            summary = call_gemini(prompt, max_tokens=512)
            summaries.append(summary.strip())
        return "\n\n".join(summaries)

    def _parse_response(self, response):
        try:
            clean = response.strip()
            if "```" in clean:
                clean = clean.split("```")[1]
                if clean.startswith("json"):
                    clean = clean[4:]
            return json.loads(clean.strip())
        except Exception as e:
            print(f"[Analyzer] 파싱 실패: {e}")
            print(f"[Analyzer] 원본 응답:\n{response}")
            return {}

    def _save_single(self, result, transcript_path, category, base_name):
        candidates = result.get("candidates", [])
        candidates.sort(key=lambda x: x.get("edit_order", 99))
        save_path = os.path.join(ANALYSIS_DIR, f"{base_name}.json")
        with open(save_path, "w", encoding="utf-8") as f:
            json.dump({
                "transcript_path": transcript_path,
                "category": category,
                "intro_text": result.get("intro_text", ""),
                "candidates": candidates,
            }, f, ensure_ascii=False, indent=2)
        print(f"[Analyzer] 저장 → {os.path.basename(save_path)}")
        return [save_path]

    def _save_topics(self, result, transcript_path, category, base_name):
        topics = result.get("topics", [])
        if not topics:
            return []
        saved = []
        # 주제가 1개면 suffix 없이, 여러 개면 _t1, _t2 ...
        for i, topic in enumerate(topics, 1):
            candidates = topic.get("candidates", [])
            if not candidates:
                continue
            candidates.sort(key=lambda x: x.get("edit_order", 99))
            suffix = f"_t{i}" if len(topics) > 1 else ""
            save_path = os.path.join(ANALYSIS_DIR, f"{base_name}{suffix}.json")
            with open(save_path, "w", encoding="utf-8") as f:
                json.dump({
                    "transcript_path": transcript_path,
                    "category": category,
                    "intro_text": topic.get("intro_text", ""),
                    "candidates": candidates,
                }, f, ensure_ascii=False, indent=2)
            print(f"[Analyzer] 토픽 {i} 저장 → {os.path.basename(save_path)}")
            saved.append(save_path)
        return saved

    def analyze(self, transcript_path, category):
        with open(transcript_path, "r", encoding="utf-8") as f:
            transcript = json.load(f)

        segments = transcript.get("segments", [])
        if not segments:
            print(f"[Analyzer] 세그먼트 없음: {transcript_path}")
            return {}

        video_title = os.path.splitext(os.path.basename(transcript_path))[0]
        multi = category in MULTI_TOPIC_CATEGORIES
        print(f"[Analyzer] 분석 중: {video_title} ({category}) | 세그먼트 {len(segments)}개 | {'멀티토픽' if multi else '단일토픽'}")

        segments_text = self._build_segments_text(segments)
        category_prompt = CATEGORY_PROMPTS.get(category, "")
        prompt_tmpl = MULTI_TOPIC_PROMPT if multi else SINGLE_TOPIC_PROMPT
        prompt = prompt_tmpl.format(
            category_prompt=category_prompt,
            video_title=video_title,
            segments_text=segments_text,
        )

        max_tokens = 8192 if multi else 4096
        response = call_gemini(prompt, max_tokens=max_tokens)
        result = self._parse_response(response)

        if not result:
            return {}

        base_name = os.path.splitext(os.path.basename(transcript_path))[0]
        if multi:
            saved = self._save_topics(result, transcript_path, category, base_name)
        else:
            saved = self._save_single(result, transcript_path, category, base_name)

        print(f"[Analyzer] 완료 — {len(saved)}개 파일 생성")
        return result

    def run(self, transcript_paths: list, category_map: dict):
        all_results = {}
        for path in transcript_paths:
            category = category_map.get(path, "economy")
            try:
                result = self.analyze(path, category)
                all_results[path] = result
            except Exception as e:
                print(f"[Analyzer] ERROR {path}: {e}")
        return all_results