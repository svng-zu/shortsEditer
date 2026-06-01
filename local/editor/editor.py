# editor/editor.py — 카테고리별 에디터 디스패처

import json

from .editor_sports   import Editor as SportsEditor
from .editor_economy  import Editor as EconomyEditor
from .editor_politics import Editor as PoliticsEditor

CATEGORY_EDITORS = {
    "sports":   SportsEditor,
    "economy":  EconomyEditor,
    "politics": PoliticsEditor,
}

DEFAULT_EDITOR = EconomyEditor


class Editor:
    def __init__(self, template_id: int = None):
        self._template_id = template_id

    def _get_editor(self, analysis_path: str):
        try:
            with open(analysis_path, "r", encoding="utf-8") as f:
                category = json.load(f).get("category", "")
        except Exception:
            category = ""
        EditorClass = CATEGORY_EDITORS.get(category, DEFAULT_EDITOR)
        print(f"[Dispatcher] category='{category}' → {EditorClass.__module__}")
        return EditorClass(template_id=self._template_id)

    def edit(self, analysis_path):
        return self._get_editor(analysis_path).edit(analysis_path)

    def edit_video(self, analysis_path):
        return self._get_editor(analysis_path).edit_video(analysis_path)

    def apply_overlay(self, raw_path, analysis_path,
                      title_override=None, subtitles=False, style=None, bg_image=None):
        return self._get_editor(analysis_path).apply_overlay(
            raw_path, analysis_path,
            title_override=title_override, subtitles=subtitles, style=style, bg_image=bg_image
        )

    def rerender(self, analysis_path, title_override=None, subtitles=False, style=None, bg_image=None):
        return self._get_editor(analysis_path).rerender(
            analysis_path, title_override=title_override, subtitles=subtitles,
            style=style, bg_image=bg_image
        )

    def preview_frame(self, raw_path, analysis_path, title=None, style=None, seek=2.0, bg_image=None):
        return self._get_editor(analysis_path).preview_frame(
            raw_path, analysis_path, title=title, style=style, seek=seek, bg_image=bg_image
        )

    def run(self, analysis_paths: list):
        results = []
        for path in analysis_paths:
            try:
                out = self.edit(path)
                if out:
                    results.append(out)
            except Exception as e:
                print(f"[Dispatcher] ERROR {path}: {e}")
        print(f"\n✅ 편집 완료 | {len(results)}개 쇼츠")
        return results

    def rerender_all(self, analysis_paths: list, title_override=None, subtitles=False, style=None):
        results = []
        for path in analysis_paths:
            try:
                out = self.rerender(path, title_override=title_override,
                                    subtitles=subtitles, style=style)
                if out:
                    results.append(out)
            except Exception as e:
                print(f"[Dispatcher] ERROR {path}: {e}")
        print(f"\n✅ 재렌더링 완료 | {len(results)}개 쇼츠")
        return results
