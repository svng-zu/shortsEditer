# backend/app/models/schemas.py
from datetime import datetime

from pydantic import BaseModel, EmailStr
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
    limit_per_channel: int = 3
    channel_urls: Optional[list[str]] = None


class EditRequest(BaseModel):
    template_id: int = 1


class StyleParams(BaseModel):
    title1_color: str = "#FFD700"
    title2_color: str = "#FFFFFF"
    title_y_extra: int = 0
    title_fontsize_delta: int = 0
    title_font_name: str = "NanumSquareRoundEB"
    title1_border_width: float = 3.0
    title2_border_width: float = 3.0
    title1_border_color: str = "#000000"
    title2_border_color: str = "#000000"
    title1_bg_enabled: bool = False
    title1_bg_color: str = "#000000"
    title1_bg_opacity: float = 0.6
    title2_bg_enabled: bool = False
    title2_bg_color: str = "#000000"
    title2_bg_opacity: float = 0.6
    sub_fontsize: int = 68
    sub_color: str = "#FFFFFF"
    sub_margin_v: int = 20
    sub_bg_enabled: bool = False
    sub_bg_color: str = "#000000"
    sub_bg_opacity: float = 0.6
    channel_name: str = ""
    channel_color: str = "#FFFFFF"
    channel_x: int = 0
    channel_y: int = 0
    channel_fontsize: int = 36
    channel_image_url: str = ""
    channel_topleft_text: str = ""
    channel_topleft_color: str = "#FFFFFF"
    channel_topleft_fontsize: int = 32
    channel_topleft_x: int = 16
    channel_topleft_y: int = 16
    font_name: str = "NanumSquareRoundEB"
    brightness: float = 0.0
    contrast: float = 1.0
    saturation: float = 1.0
    volume: float = 1.0
    narration_volume: float = 1.2
    narration_video_volume: float = 0.3


class RenderRequest(BaseModel):
    filename: str
    title: str = ""
    subtitles: bool = False
    template_id: int = 1
    style: StyleParams = StyleParams()
    bg_image: Optional[str] = None
    bg_solid_color: Optional[str] = None
    narration: bool = False
    narration_voice: str = "female"
    narration_mode: str = "title"  # "title" | "script"
    narration_speed: float = 1.0


class PreviewRequest(BaseModel):
    filename: str
    title: str = ""
    style: StyleParams = StyleParams()
    seek: float = 2.0
    bg_image: Optional[str] = None
    bg_solid_color: Optional[str] = None
    subtitles: bool = False


class UpdateTitleRequest(BaseModel):
    filename: str
    intro_text: str


class GenerateScriptRequest(BaseModel):
    filename: str
    mode: str = "summary"  # "summary" | "style_convert"


class GenerateScriptResponse(BaseModel):
    narration_script: str
    sfx_placements: List[dict] = []


class UpdateNarrationScriptRequest(BaseModel):
    filename: str
    narration_script: str


class NarrationSubtitleEntry(BaseModel):
    start: float
    end: float
    text: str


class GenerateNarrationSubtitlesRequest(BaseModel):
    filename: str
    narration_voice: str = "female"
    narration_mode: str = "title"  # "title" | "script"
    narration_speed: float = 1.0


class GenerateNarrationSubtitlesResponse(BaseModel):
    subtitles: List[NarrationSubtitleEntry]


class NarrationPreviewResponse(BaseModel):
    audio_base64: str
    subtitles: List[NarrationSubtitleEntry]


class SrtEntry(BaseModel):
    index: str
    times: str
    text: str


class SrtSaveRequest(BaseModel):
    stem: str
    entries: List[SrtEntry]


class VideoInfoResponse(BaseModel):
    title: str
    duration: int
    thumbnail_url: str
    filesize_approx: Optional[int] = None
    video_id: str


class DownloadInfo(BaseModel):
    filename: str
    stem: str
    category: str
    thumbnail_url: Optional[str] = None
    duration: Optional[float] = None
    channel_name: str = ""
    channel_thumbnail_url: str = ""


class ProcessSelectedItem(BaseModel):
    filename: str
    category: str


class ProcessSelectedRequest(BaseModel):
    items: List[ProcessSelectedItem]
    template_id: int = 1


class Candidate(BaseModel):
    start: float
    end: float
    title: Optional[str] = None
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
    channel_name: str = ""
    channel_thumbnail_url: str = ""
    variant: int = 1


class RawInfo(BaseModel):
    filename: str
    url: str
    title: str
    category: str
    duration: Optional[float] = None
    channel_name: str = ""
    channel_thumbnail_url: str = ""
    variant: int = 1


# ── 사용자 계정 / 인증 ──────────────────────────────────────

class SignupRequest(BaseModel):
    email: EmailStr
    password: str
    name: Optional[str] = None
    session_id: str  # 가입 시점에 브라우저가 갖고 있던 기존 세션 ID (데이터 연결용)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


class MessageResponse(BaseModel):
    message: str


class UserResponse(BaseModel):
    id: str
    email: str
    name: Optional[str] = None
    provider: str
    is_admin: bool = False
    created_at: datetime

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


# ── Admin 대시보드 ──────────────────────────────────────────────────

class AdminUserInfo(BaseModel):
    id: str
    email: str
    name: Optional[str] = None
    provider: str
    is_admin: bool
    created_at: datetime
    session_id: str
    quota_used: int
    quota_limit: Optional[int] = None


class AdminUserUpdateRequest(BaseModel):
    is_admin: bool


class AdminStats(BaseModel):
    total_sessions: int
    total_users: int
    downloads: int
    transcripts: int
    analyses: int
    raws: int
    shorts: int
    category_counts: dict[str, int]


class AdminPipelineInfo(BaseModel):
    session_id: str
    step: PipelineStep
    message: str
    progress: int
    is_paused: bool
    user_email: Optional[str] = None
