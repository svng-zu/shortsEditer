# backend/app/services/editor_sports.py
"""스포츠 카테고리 에디터"""

import os
from app.services.editor_base import EditorBase
from app.config import settings

TEMPLATES = {
    1: {
        "name": "스포츠 다크 (검정+흰글+골드 테두리)",
        "bg_color": "0x0d0d0d",
        "top_bg_color": None,
        "title_color": "0xFFFFFF",
        "title_border": "0xFFD700",
        "title_fontsize": 115,
    },
    2: {
        "name": "스포츠 미니멀 (흰배경+검정글)",
        "bg_color": "0xf5f5f5",
        "top_bg_color": None,
        "title_color": "0x111111",
        "title_border": "0x444444",
        "title_fontsize": 115,
    },
    3: {
        "name": "스포츠 네이비 (네이비+흰글+골드 테두리)",
        "bg_color": "0x1a1a2e",
        "top_bg_color": None,
        "title_color": "0xFFFFFF",
        "title_border": "0xFFD700",
        "title_fontsize": 115,
    },
}

_LOGO_PATH = str(settings.STATIC_DIR / "logos" / "sports_emblem.png")


class SportsEditor(EditorBase):
    """스포츠 에디터"""
    TEMPLATES = TEMPLATES
    MAX_TOTAL_SEC = 59

    def _get_logo_path(self) -> str:
        return _LOGO_PATH if os.path.exists(_LOGO_PATH) else None
