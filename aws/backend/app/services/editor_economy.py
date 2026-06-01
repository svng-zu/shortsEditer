# backend/app/services/editor_economy.py
"""경제 카테고리 에디터"""

import os
from app.services.editor_base import EditorBase
from app.config import settings

TEMPLATES = {
    1: {
        "name": "경제 다크 (진녹색 배경+초록 포인트)",
        "bg_color": "0x0a0f0a",
        "top_bg_color": None,
        "title_color": "0xFFFFFF",
        "title_border": "0x00E676",
        "title_fontsize": 115,
        "divider": True,
        "divider_color": "0x00E676",
    },
    2: {
        "name": "경제 미니멀 (흰배경+검정글)",
        "bg_color": "0xf5f5f5",
        "top_bg_color": None,
        "title_color": "0x111111",
        "title_border": "0x00897B",
        "title_fontsize": 115,
        "divider": True,
        "divider_color": "0x00897B",
    },
    3: {
        "name": "경제 네이비 (네이비+흰글+초록 포인트)",
        "bg_color": "0x0d1b2a",
        "top_bg_color": None,
        "title_color": "0xFFFFFF",
        "title_border": "0x00E676",
        "title_fontsize": 115,
        "divider": True,
        "divider_color": "0x00E676",
    },
}

_LOGO_PATH = str(settings.STATIC_DIR / "logos" / "economy_emblem.png")


class EconomyEditor(EditorBase):
    """경제 에디터"""
    TEMPLATES = TEMPLATES
    MAX_TOTAL_SEC = 120

    def _get_logo_path(self) -> str:
        return _LOGO_PATH if os.path.exists(_LOGO_PATH) else None
