# editor/editor_sports.py
import os
from .editor_base import EditorBase, STATIC_DIR

TEMPLATES = {
    1: {
        "name": "스포츠 다크 (검정+흰글+골드 테두리)",
        "bg_color":       "0x0d0d0d",
        "top_bg_color":   None,
        "title_color":    "0xFFFFFF",
        "title_border":   "0xFFD700",
        "title_fontsize": 115,
        "divider":        True,
        "divider_color":  "0xFFD700",
    },
    2: {
        "name": "스포츠 미니멀 (흰배경+검정글)",
        "bg_color":       "0xf5f5f5",
        "top_bg_color":   None,
        "title_color":    "0x111111",
        "title_border":   "0x444444",
        "title_fontsize": 115,
        "divider":        True,
        "divider_color":  "0x222222",
    },
    3: {
        "name": "스포츠 네이비 (네이비+흰글+골드 테두리)",
        "bg_color":       "0x1a1a2e",
        "top_bg_color":   None,
        "title_color":    "0xFFFFFF",
        "title_border":   "0xFFD700",
        "title_fontsize": 115,
        "divider":        True,
        "divider_color":  "0x00d4ff",
    },
}


_LOGO_PATH = os.path.join(STATIC_DIR, "logos", "sports_emblem.png")

class Editor(EditorBase):
    TEMPLATES = TEMPLATES
    MAX_TOTAL_SEC = 59

    def _get_logo_path(self) -> str | None:
        return _LOGO_PATH if os.path.exists(_LOGO_PATH) else None
