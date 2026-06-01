# backend/app/models/schemas.py
from pydantic import BaseModel
from typing import Optional, List
from enum import Enum


class PipelineStep(str, Enum):
    IDLE = "idle"
    COLLECTING = "collecting"
    TRANSCRIBING = "transcribing"
    ANALYZING = "analyzing"
    EDITING = "editing"
    DONE = "done"
    ERROR = "error"


class PipelineStatus(BaseModel):
    step: PipelineStep = PipelineStep.IDLE
    message: str = ""
    progress: int = 0


class CollectRequest(BaseModel):
    clear_existing: bool = True


class EditRequest(BaseModel):
    template_id: int = 1


class StyleParams(BaseModel):
    title1_color: str = "#FFD700"
    title2_color: str = "#FFFFFF"
    title_y_extra: int = 0
    title_fontsize_scale: float = 1.0
    sub_fontsize: int = 28
    sub_color: str = "#FFFFFF"
    sub_margin_v: int = 20


class RenderRequest(BaseModel):
    filename: str
    title: str = ""
    subtitles: bool = False
    template_id: int = 1
    style: StyleParams = StyleParams()
    bg_image: Optional[str] = None


class PreviewRequest(BaseModel):
    filename: str
    title: str = ""
    style: StyleParams = StyleParams()
    seek: float = 2.0
    bg_image: Optional[str] = None


class UpdateTitleRequest(BaseModel):
    filename: str
    intro_text: str


class SrtEntry(BaseModel):
    index: str
    times: str
    text: str


class SrtSaveRequest(BaseModel):
    stem: str
    entries: List[SrtEntry]


class Candidate(BaseModel):
    start: float
    end: float
    reason: str
    score: int
    edit_order: int
    connection_note: Optional[str] = None


class ShortInfo(BaseModel):
    filename: str
    url: str
    title: str
    category: str
    candidates: List[Candidate] = []


class RawInfo(BaseModel):
    filename: str
    url: str
    title: str
    category: str
