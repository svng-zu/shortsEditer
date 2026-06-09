# backend/app/services/analyzer.py
"""Gemini 기반 LLM 분석 서비스 (메인: 2.5-flash / 청크요약: 2.0-flash-lite)"""

import os
import json
from concurrent.futures import ThreadPoolExecutor, as_completed
import google.generativeai as genai

from app.config import settings

# 메인 분석: 고성능, 청크 요약: 저비용
MAIN_MODEL_NAME = "gemini-2.5-flash"
CHEAP_MODEL_NAME = "gemini-2.5-flash"

# ────────────────────────────────────────────────
# 카테고리별 기준 프롬프트
# ────────────────────────────────────────────────
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

# ────────────────────────────────────────────────
# 조회수가 높았던 쇼츠 예시 (few-shot)
# 새로운 고성과 예시 발견 시 여기에 추가하세요.
# ────────────────────────────────────────────────
HIGH_PERFORMING_EXAMPLES: dict[str, list[dict]] = {
    "economy": [
        {
            "title": "이 한마디에 분위기가 바뀌었다",
            "start": "01:22", "end": "01:55",
            "point": "전문가 강렬 발언 → 호기심 유발 제목"
        },
        {
            "title": "전문가도 예상 못한 결과",
            "start": "05:33", "end": "06:11",
            "point": "반전 결과 공개 → 클릭 유도"
        },
    ],
    "politics": [
        {
            "title": "이 한마디에 분위기가 바뀌었다",
            "start": "01:22", "end": "01:55",
            "point": "정치인 폭탄 발언 → 강한 임팩트"
        },
        {
            "title": "전문가도 예상 못한 결과",
            "start": "05:33", "end": "06:11",
            "point": "여론 반전 공개 → 클릭 유도"
        },
    ],
    "sports": [
        {
            "title": "이 장면에 모두가 침묵했다",
            "start": "02:11", "end": "02:45",
            "point": "극적인 결정적 순간 → 감정 이입"
        },
        {
            "title": "이 선수가 해냈다",
            "start": "04:20", "end": "04:58",
            "point": "한국 선수 활약 하이라이트 → 국내 팬 타겟"
        },
    ],
}


def _format_few_shot(category: str) -> str:
    examples = HIGH_PERFORMING_EXAMPLES.get(category, [])
    if not examples:
        return ""
    lines = ["## 참고: 조회수가 높았던 쇼츠 예시\n"]
    for i, ex in enumerate(examples, 1):
        lines.append(
            f"예시{i}\n"
            f"제목: \"{ex['title']}\"\n"
            f"구간: {ex['start']}~{ex['end']}\n"
            f"포인트: {ex['point']}\n"
        )
    lines.append(
        "위 예시 패턴을 참고해서 아래 영상에서 쇼츠 후보를 찾아라.\n"
        "각 후보마다 시청자를 끌어당기는 title도 함께 제안하세요.\n"
    )
    return "\n".join(lines)


# ────────────────────────────────────────────────
# 프롬프트 템플릿
# ────────────────────────────────────────────────
SINGLE_TOPIC_PROMPT = """
{category_prompt}

{few_shot_examples}

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
      "title": "시청자를 끌어당기는 쇼츠 제목 (예시 패턴 참고, 15자 이내)",
      "reason": "선택 이유",
      "score": 중요도 점수(1~10),
      "edit_order": 편집에서 배치할 순서(1부터 시작),
      "connection_note": "이전 구간과 어떻게 자연스럽게 이어지는지 설명 (첫 구간이면 '시작')"
    }}
  ]
}}

후보 구간 조건:
- 반드시 하나의 일관된 주제/스토리에서만 구간을 선택하세요. 영상에 여러 주제가 있으면 가장 임팩트 있는 단일 주제에 집중하세요.
- 선택한 구간들은 시청자가 봤을 때 맥락이 자연스럽게 이어져야 합니다. 갑자기 다른 소재로 넘어가면 안 됩니다.
- 구간 총 길이 합계가 약 90초가 되도록 조절하세요 (부족해도 되지만 초과는 피하세요).
- 최대 6개 선택, 각 구간은 반드시 5초 이상
- edit_order는 시청자가 자연스럽게 이해할 수 있는 흐름 순서로 지정 (시간순이 아니어도 됨)
- connection_note로 구간 간 연결이 왜 자연스러운지 설명
"""

MULTI_TOPIC_PROMPT = """
{category_prompt}

{few_shot_examples}

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
          "title": "시청자를 끌어당기는 쇼츠 제목 (예시 패턴 참고, 15자 이내)",
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
- 각 topic은 반드시 하나의 단일 스토리/사건에 집중하세요. 같은 topic 안에서 다른 사건/주제로 넘어가면 안 됩니다.
- topic 내 candidates는 맥락이 자연스럽게 이어지는 구간만 선택하세요.
- 각 topic의 구간 총 합계가 약 90초가 되도록 조절하세요.
- 주제 간 내용이 겹치면 안 됨 (각 주제는 다른 뉴스 기사)
- 각 주제의 candidates: 최대 4개, 각 구간 5초 이상
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
    """Gemini 기반 LLM 분석기 (메인: {MAIN_MODEL_NAME} / 청크: {CHEAP_MODEL_NAME})"""

    def __init__(self):
        genai.configure(api_key=settings.GEMINI_API_KEY)
        self.model = genai.GenerativeModel(
            model_name=MAIN_MODEL_NAME,
            generation_config={"temperature": 0.3, "max_output_tokens": 8192},
        )
        # 청크 요약 전용 저비용 모델
        self.cheap_model = genai.GenerativeModel(
            model_name=CHEAP_MODEL_NAME,
            generation_config={"temperature": 0.1, "max_output_tokens": 500},
        )
        print(f"[Analyzer] {MAIN_MODEL_NAME} + {CHEAP_MODEL_NAME}(chunk) 초기화 완료")

    def _call_main(self, prompt: str, max_tokens: int = 8192) -> str:
        response = self.model.generate_content(
            prompt,
            generation_config={"max_output_tokens": max_tokens, "temperature": 0.3},
        )
        return response.text

    def _call_cheap(self, prompt: str) -> str:
        response = self.cheap_model.generate_content(prompt)
        return response.text

    # 하위 호환 alias
    def _call_bedrock(self, prompt: str, max_tokens: int = 8192) -> str:
        return self._call_main(prompt, max_tokens)

    def _build_segments_text(self, segments, max_segments=80):
        if len(segments) <= max_segments:
            return self._format_segments(segments)
        print(f"[Analyzer] 세그먼트 {len(segments)}개 → 청크 요약 처리 ({CHEAP_MODEL_NAME})")
        return self._summarize_chunks(segments, chunk_size=30)

    def _format_segments(self, segments):
        return "\n".join(
            f"[{seg['start']}s ~ {seg['end']}s] {seg['text']}"
            for seg in segments
        )

    def _summarize_chunks(self, segments, chunk_size=30):
        """긴 세그먼트를 청크로 나눠 병렬 요약 (저비용 모델 사용). 총 50청크 초과 시 샘플링."""
        MAX_CHUNKS = 50
        chunks = [segments[i:i+chunk_size] for i in range(0, len(segments), chunk_size)]

        if len(chunks) > MAX_CHUNKS:
            step = len(chunks) / MAX_CHUNKS
            chunks = [chunks[int(i * step)] for i in range(MAX_CHUNKS)]
            print(f"  [Analyzer] 청크 샘플링: {len(chunks)}개 선택")

        total = len(chunks)
        summaries = [None] * total

        def summarize_one(idx: int, chunk: list) -> tuple[int, str]:
            chunk_text = self._format_segments(chunk)
            prompt = CHUNK_SUMMARY_PROMPT.format(segments_text=chunk_text)
            print(f"  [Analyzer] 청크 {idx+1}/{total} 요약 중...")
            return idx, self._call_cheap(prompt).strip()

        with ThreadPoolExecutor(max_workers=5) as executor:
            futures = {executor.submit(summarize_one, i, c): i for i, c in enumerate(chunks)}
            for future in as_completed(futures):
                idx, summary = future.result()
                summaries[idx] = summary

        combined = "\n\n".join(summaries)
        if len(combined) > 4000:
            combined = combined[:4000] + "\n...(이하 생략)"
        return combined

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

    def _save_single(self, result, transcript_path, category, base_name, analysis_dir):
        candidates = result.get("candidates", [])
        candidates.sort(key=lambda x: x.get("edit_order", 99))
        save_path = analysis_dir / f"{base_name}.json"
        with open(save_path, "w", encoding="utf-8") as f:
            json.dump({
                "transcript_path": transcript_path,
                "category": category,
                "intro_text": result.get("intro_text", ""),
                "candidates": candidates,
            }, f, ensure_ascii=False, indent=2)
        print(f"[Analyzer] 저장 → {save_path.name}")
        return [str(save_path)]

    def _save_topics(self, result, transcript_path, category, base_name, analysis_dir):
        topics = result.get("topics", [])
        if not topics:
            return []
        saved = []
        for i, topic in enumerate(topics, 1):
            candidates = topic.get("candidates", [])
            if not candidates:
                continue
            candidates.sort(key=lambda x: x.get("edit_order", 99))
            suffix = f"_t{i}" if len(topics) > 1 else ""
            save_path = analysis_dir / f"{base_name}{suffix}.json"
            with open(save_path, "w", encoding="utf-8") as f:
                json.dump({
                    "transcript_path": transcript_path,
                    "category": category,
                    "intro_text": topic.get("intro_text", ""),
                    "candidates": candidates,
                }, f, ensure_ascii=False, indent=2)
            print(f"[Analyzer] 토픽 {i} 저장 → {save_path.name}")
            saved.append(str(save_path))
        return saved

    def analyze(self, transcript_path: str, category: str, analysis_dir=None) -> dict:
        """자막 분석 실행"""
        from pathlib import Path
        if analysis_dir is None:
            analysis_dir = settings.ANALYSIS_DIR
        analysis_dir = Path(analysis_dir)
        analysis_dir.mkdir(parents=True, exist_ok=True)

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
        few_shot = _format_few_shot(category)
        prompt_tmpl = MULTI_TOPIC_PROMPT if multi else SINGLE_TOPIC_PROMPT
        prompt = prompt_tmpl.format(
            category_prompt=category_prompt,
            few_shot_examples=few_shot,
            video_title=video_title,
            segments_text=segments_text,
        )

        max_tokens = 8192 if multi else 4096
        response = self._call_main(prompt, max_tokens=max_tokens)
        result = self._parse_response(response)

        if not result:
            return {}

        base_name = os.path.splitext(os.path.basename(transcript_path))[0]
        if multi:
            saved = self._save_topics(result, transcript_path, category, base_name, analysis_dir)
        else:
            saved = self._save_single(result, transcript_path, category, base_name, analysis_dir)

        print(f"[Analyzer] 완료 — {len(saved)}개 파일 생성")
        return result

    def run(self, transcript_paths: list, category_map: dict) -> dict:
        """여러 자막 일괄 분석"""
        all_results = {}
        for path in transcript_paths:
            category = category_map.get(path, "economy")
            try:
                result = self.analyze(path, category)
                all_results[path] = result
            except Exception as e:
                print(f"[Analyzer] ERROR {path}: {e}")
        return all_results
