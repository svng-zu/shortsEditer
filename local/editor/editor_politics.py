# editor/editor_politics.py
from .editor_base import EditorBase

TEMPLATES = {
    1: {
        "name": "정치 다크 (검정+흰글+빨강 테두리)",
        "bg_color":       "0x0d0505",
        "top_bg_color":   None,
        "title_color":    "0xFFFFFF",
        "title_border":   "0xFF3D3D",
        "title_fontsize": 115,
        "divider":        True,
        "divider_color":  "0xFF3D3D",
    },
    2: {
        "name": "정치 미니멀 (흰배경+검정글+빨강 구분선)",
        "bg_color":       "0xf5f5f5",
        "top_bg_color":   None,
        "title_color":    "0x111111",
        "title_border":   "0xCC0000",
        "title_fontsize": 115,
        "divider":        True,
        "divider_color":  "0xCC0000",
    },
    3: {
        "name": "정치 딥다크 (짙은검정+흰글+빨강 테두리)",
        "bg_color":       "0x111111",
        "top_bg_color":   None,
        "title_color":    "0xFFFFFF",
        "title_border":   "0xFF3D3D",
        "title_fontsize": 115,
        "divider":        True,
        "divider_color":  "0xFF3D3D",
    },
}


class Editor(EditorBase):
    TEMPLATES = TEMPLATES
    MAX_TOTAL_SEC = 90
