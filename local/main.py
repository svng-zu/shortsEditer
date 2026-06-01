# main.py

import sys
import os

# local 디렉토리를 Python 경로에 추가
LOCAL_DIR = os.path.dirname(os.path.abspath(__file__))
if LOCAL_DIR not in sys.path:
    sys.path.insert(0, LOCAL_DIR)

import json
import shutil
from collector.youtube_collector import YoutubeCollector
from transcriber.transcriber import Transcriber
from llm.analyzer import Analyzer
from editor.editor import Editor

BASE_DIR = os.path.dirname(__file__)
DOWNLOAD_DIR = os.path.join(BASE_DIR, "downloads")
TRANSCRIPT_DIR = os.path.join(BASE_DIR, "outputs", "transcripts")
ANALYSIS_DIR = os.path.join(BASE_DIR, "outputs", "analysis")
CATEGORY_MAP_PATH = os.path.join(BASE_DIR, "outputs", "category_map.json")

os.makedirs(os.path.join(BASE_DIR, "outputs"), exist_ok=True)


# ── 유틸 ──────────────────────────────────────────────────────
def ask(question):
    return input(f"\n{question} (y/n): ").strip().lower() == "y"


def clear_directory(dir_path, extensions=None):
    """디렉토리 내 파일 삭제. extensions 지정 시 해당 확장자만."""
    if not os.path.exists(dir_path):
        return 0
    count = 0
    for f in os.listdir(dir_path):
        if extensions and not any(f.endswith(ext) for ext in extensions):
            continue
        fpath = os.path.join(dir_path, f)
        if os.path.isfile(fpath):
            os.remove(fpath)
            count += 1
    return count


def clear_all_pipeline_files():
    """새 다운로드 전 파이프라인 전체 초기화"""
    print("\n🗑️  기존 파일 정리 중...")

    n1 = clear_directory(DOWNLOAD_DIR, [".mp4"])
    print(f"  - 다운로드 영상 {n1}개 삭제")

    n2 = clear_directory(TRANSCRIPT_DIR, [".json"])
    print(f"  - 자막 파일 {n2}개 삭제")

    n3 = clear_directory(ANALYSIS_DIR, [".json"])
    print(f"  - 분석 결과 {n3}개 삭제")

    if os.path.exists(CATEGORY_MAP_PATH):
        os.remove(CATEGORY_MAP_PATH)
        print(f"  - 카테고리 맵 삭제")

    print("✅ 초기화 완료\n")


# ── 카테고리 맵 저장/로드 ──────────────────────────────────────
def save_category_map(category_map: dict):
    """파일명(확장자 제외) 기준으로 카테고리 맵 저장"""
    simplified = {}
    for path, cat in category_map.items():
        key = os.path.splitext(os.path.basename(path))[0]
        simplified[key] = cat
    with open(CATEGORY_MAP_PATH, "w", encoding="utf-8") as f:
        json.dump(simplified, f, ensure_ascii=False, indent=2)
    print(f"[Main] 카테고리 맵 저장 → {CATEGORY_MAP_PATH}")


def load_category_map() -> dict:
    if not os.path.exists(CATEGORY_MAP_PATH):
        return {}
    with open(CATEGORY_MAP_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def resolve_category_map(transcript_paths: list) -> dict:
    """transcript 경로 → {path: category} 매핑. 저장된 맵 우선, 없으면 economy."""
    saved = load_category_map()
    result = {}
    for t_path in transcript_paths:
        base = os.path.splitext(os.path.basename(t_path))[0]
        cat = saved.get(base, "economy")
        if base not in saved:
            print(f"  [Main] 카테고리 미등록 → '{base}' : economy 기본값 사용")
        result[t_path] = cat
    return result


# ── 파일 목록 조회 ─────────────────────────────────────────────
def get_existing_videos():
    if not os.path.exists(DOWNLOAD_DIR):
        return []
    return sorted([
        os.path.join(DOWNLOAD_DIR, f)
        for f in os.listdir(DOWNLOAD_DIR)
        if f.endswith(".mp4")
    ])


def get_existing_transcripts():
    if not os.path.exists(TRANSCRIPT_DIR):
        return []
    return sorted([
        os.path.join(TRANSCRIPT_DIR, f)
        for f in os.listdir(TRANSCRIPT_DIR)
        if f.endswith(".json")
    ])


def get_existing_analysis():
    if not os.path.exists(ANALYSIS_DIR):
        return []
    return sorted([
        os.path.join(ANALYSIS_DIR, f)
        for f in os.listdir(ANALYSIS_DIR)
        if f.endswith(".json")
    ])


# ── 메인 ──────────────────────────────────────────────────────
def main():

    # ── 1. 다운로드 ───────────────────────────────────────────
    existing_videos = get_existing_videos()

    if existing_videos:
        print(f"\n📂 기존 다운로드 영상 {len(existing_videos)}개 발견:")
        for path in existing_videos:
            print(f"  - {os.path.basename(path)}")
        download = ask("새로 다운로드 받을까요? (기존 영상/자막/분석 파일 전부 삭제됩니다)")
    else:
        print("\n다운로드된 영상이 없습니다. 새로 수집합니다.")
        download = True

    if download:
        # 기존 파이프라인 파일 전부 삭제
        if existing_videos:
            clear_all_pipeline_files()

        collector = YoutubeCollector()
        results = collector.run()
        video_paths = [v["filepath"] for v in results if "filepath" in v]

        # 카테고리 맵 저장 (이후 단계에서 재사용)
        category_map_by_video = {v["filepath"]: v["category"] for v in results if "filepath" in v}
        save_category_map(category_map_by_video)
    else:
        video_paths = existing_videos

    if not video_paths:
        print("처리할 영상이 없습니다.")
        return

    # ── 2. 자막 생성 ───────────────────────────────────────────
    existing_transcripts = get_existing_transcripts()

    if existing_transcripts:
        print(f"\n📝 기존 자막 {len(existing_transcripts)}개 발견:")
        for path in existing_transcripts:
            print(f"  - {os.path.basename(path)}")

    transcribe = ask("자막을 생성할까요?")

    if transcribe:
        transcriber = Transcriber()
        transcriber.run(video_paths)

    transcript_paths = get_existing_transcripts()
    if not transcript_paths:
        print("자막 파일이 없습니다. 자막 생성을 먼저 실행하세요.")
        return

    # ── 3. LLM 분석 ────────────────────────────────────────────
    existing_analysis = get_existing_analysis()

    if existing_analysis:
        print(f"\n🤖 기존 분석 결과 {len(existing_analysis)}개 발견:")
        for path in existing_analysis:
            print(f"  - {os.path.basename(path)}")

    analyze = ask("LLM 분석을 실행할까요?")

    if analyze:
        category_map = resolve_category_map(transcript_paths)
        analyzer = Analyzer()
        analyzer.run(transcript_paths, category_map)

    analysis_paths = get_existing_analysis()
    if not analysis_paths:
        print("분석 결과가 없습니다. LLM 분석을 먼저 실행하세요.")
        return

    # ── 4. 편집 ────────────────────────────────────────────────
    print(f"\n✂️  분석 결과 {len(analysis_paths)}개 준비됨")
    edit = ask("쇼츠 편집을 시작할까요?")
    if edit:
        editor = Editor()
        editor.run(analysis_paths)


if __name__ == "__main__":
    main()