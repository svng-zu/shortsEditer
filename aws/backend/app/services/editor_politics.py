# backend/app/services/editor_politics.py
"""정치 카테고리 에디터"""

import os
from app.services.editor_base import EditorBase
from app.config import settings

TEMPLATES = {
    1: {
        "name": "정치 다크 (진빨강 배경+빨강 포인트)",
        "bg_color": "0x0d0505",
        "top_bg_color": None,
        "title_color": "0xFFFFFF",
        "title_border": "0xFF3D3D",
        "title_fontsize": 115,
        "divider": True,
        "divider_color": "0xFF3D3D",
    },
    2: {
        "name": "정치 미니멀 (흰배경+검정글)",
        "bg_color": "0xf5f5f5",
        "top_bg_color": None,
        "title_color": "0x111111",
        "title_border": "0xCC0000",
        "title_fontsize": 115,
        "divider": True,
        "divider_color": "0xCC0000",
    },
    3: {
        "name": "정치 그레이 (진회색+흰글+빨강 포인트)",
        "bg_color": "0x111111",
        "top_bg_color": None,
        "title_color": "0xFFFFFF",
        "title_border": "0xFF3D3D",
        "title_fontsize": 115,
        "divider": True,
        "divider_color": "0xFF3D3D",
    },
}

_LOGO_PATH = str(settings.STATIC_DIR / "logos" / "politics_emblem.png")


class PoliticsEditor(EditorBase):
    """정치 에디터"""
    TEMPLATES = TEMPLATES
    MAX_TOTAL_SEC = 120

    def _get_logo_path(self) -> str:
        return _LOGO_PATH if os.path.exists(_LOGO_PATH) else None
