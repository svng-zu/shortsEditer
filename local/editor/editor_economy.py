# editor/editor_economy.py
from .editor_base import EditorBase

TEMPLATES = {
    1: {
        "name": "경제 다크 (검정+흰글+초록 테두리)",
        "bg_color":       "0x0a0f0a",
        "top_bg_color":   None,
        "title_color":    "0xFFFFFF",
        "title_border":   "0x00E676",
        "title_fontsize": 115,
        "divider":        True,
        "divider_color":  "0x00E676",
    },
    2: {
        "name": "경제 미니멀 (흰배경+검정글+초록 구분선)",
        "bg_color":       "0xf5f5f5",
        "top_bg_color":   None,
        "title_color":    "0x111111",
        "title_border":   "0x00897B",
        "title_fontsize": 115,
        "divider":        True,
        "divider_color":  "0x00897B",
    },
    3: {
        "name": "경제 네이비 (네이비+흰글+초록 테두리)",
        "bg_color":       "0x0d1b2a",
        "top_bg_color":   None,
        "title_color":    "0xFFFFFF",
        "title_border":   "0x00E676",
        "title_fontsize": 115,
        "divider":        True,
        "divider_color":  "0x00E676",
    },
}


class Editor(EditorBase):
    TEMPLATES = TEMPLATES
    MAX_TOTAL_SEC = 90
