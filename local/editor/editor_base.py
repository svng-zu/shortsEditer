# editor/editor_base.py — 공통 편집 로직

import os
import json
import subprocess
import sys
import cv2

os.environ["GLOG_minloglevel"] = "3"
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"

import mediapipe as mp

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from llm.gemini_client import call_gemini

# local/editor/ → local/ → edit_tool/
LOCAL_DIR     = os.path.dirname(os.path.dirname(__file__))
BASE_DIR      = os.path.dirname(LOCAL_DIR)
DOWNLOAD_DIR  = os.path.join(BASE_DIR, "downloads")
ANALYSIS_DIR  = os.path.join(BASE_DIR, "outputs", "analysis")
TRANSCRIPT_DIR= os.path.join(BASE_DIR, "outputs", "transcripts")
SHORTS_DIR    = os.path.join(BASE_DIR, "outputs", "shorts")
RAW_DIR       = os.path.join(BASE_DIR, "outputs", "raw")
TEMP_DIR      = os.path.join(BASE_DIR, "temp")
STATIC_DIR    = os.path.join(LOCAL_DIR, "static")  # local/static (배경, 로고)

for _d in [SHORTS_DIR, RAW_DIR, TEMP_DIR]:
    os.makedirs(_d, exist_ok=True)

CANVAS_W = 1080
CANVAS_H = 1920
VIDEO_W  = 1080
VIDEO_H  = 810

REMAINING_H = CANVAS_H - VIDEO_H
TOP_H    = int(REMAINING_H * 0.50)
BOTTOM_H = REMAINING_H - TOP_H
VIDEO_Y  = TOP_H

BUFFER_SEC         = 2
MIN_SEGMENT_SEC    = 5
MAX_TOTAL_SEC      = 120
FACE_SAMPLE_FRAMES = 10

_SUBTITLE_PROMPT = """당신은 유튜브 쇼츠 자막 전문가다.

핵심 원칙:
- 원본 텍스트의 내용을 절대 바꾸거나 재창조하지 않는다
- 오직 한 화면에 보여줄 단위로 자르는 역할만 한다
- 단어를 추가하거나 삭제하지 않는다 (조사 생략은 허용)

규칙:
1. 1줄은 최대 12자
2. 의미 단위로 끊는다
3. 조사 생략 가능 (내용 변경은 불가)
4. 핵심 키워드는 한 줄에 온전히 포함
5. JSON 배열만 출력 (입력과 동일한 개수)
6. 설명 금지
7. 여러 줄은 \\n으로 구분

입력:
{texts}"""


def _reformat_subtitles_llm(texts: list) -> list:
    """Whisper 자막 텍스트를 쇼츠용으로 Gemini 리포맷. 실패 시 원본 반환."""
    if not texts:
        return texts
    try:
        prompt = _SUBTITLE_PROMPT.format(texts=json.dumps(texts, ensure_ascii=False))
        raw = call_gemini(prompt, max_tokens=1024).strip()
        if "```" in raw:
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        result = json.loads(raw.strip())
        if isinstance(result, list) and len(result) == len(texts):
            return [str(r) for r in result]
        print(f"[Editor] 자막 LLM 반환 개수 불일치: {len(result)} vs {len(texts)}")
    except Exception as e:
        print(f"[Editor] 자막 LLM 실패: {e}")
    return texts


def _srt_time(seconds: float) -> str:
    h  = int(seconds // 3600)
    m  = int((seconds % 3600) // 60)
    s  = int(seconds % 60)
    ms = int((seconds % 1) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


class EditorBase:
    """카테고리별 에디터가 상속하는 공통 클래스. 서브클래스에서 TEMPLATES를 정의."""

    TEMPLATES: dict = {}
    MAX_TOTAL_SEC: int = MAX_TOTAL_SEC

    def __init__(self, template_id: int = None):
        self._check_ffmpeg()
        self.face_detection = mp.solutions.face_detection.FaceDetection(
            model_selection=1, min_detection_confidence=0.5
        )
        self.font = self._resolve_font()
        templates = self.__class__.TEMPLATES
        if template_id is not None and template_id in templates:
            self.template = templates[template_id]
        else:
            self.template = templates.get(1, next(iter(templates.values())))
        print(f"[Editor] 템플릿: {self.template['name']}")

    # ── 내부 유틸 ─────────────────────────────────────────────

    def _check_ffmpeg(self):
        r = subprocess.run(["ffmpeg", "-version"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if r.returncode != 0:
            raise RuntimeError("FFmpeg가 설치되어 있지 않습니다.")

    def _resolve_font(self):
        for p in [
            "/usr/share/fonts/truetype/nanum/NanumSquareRoundEB.ttf",
            "/usr/share/fonts/truetype/nanum/NanumSquareRoundB.ttf",
            "/usr/share/fonts/truetype/nanum/NanumSquareB.ttf",
            "/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf",
            "C:/Windows/Fonts/malgunbd.ttf",
            "C:/Windows/Fonts/malgun.ttf",
        ]:
            if os.path.exists(p):
                print(f"[Editor] 폰트: {p}")
                return p
        return None

    @staticmethod
    def _css_to_ffmpeg(color: str) -> str:
        """#RRGGBB → 0xRRGGBB"""
        return "0x" + color.lstrip("#").upper()

    @staticmethod
    def _css_to_ass(color: str) -> str:
        """#RRGGBB → ASS &HBBGGRR (FFmpeg subtitles용)"""
        h = color.lstrip("#")
        r, g, b = h[0:2], h[2:4], h[4:6]
        return f"&H{b}{g}{r}"

    def _find_video_path(self, transcript_path):
        base = os.path.splitext(os.path.basename(transcript_path))[0]
        for f in os.listdir(DOWNLOAD_DIR):
            if f.endswith(".mp4") and base in f:
                return os.path.join(DOWNLOAD_DIR, f)
        return None

    def _get_video_duration(self, video_path):
        cmd = ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", video_path]
        return float(json.loads(subprocess.run(cmd, capture_output=True, text=True).stdout)["format"]["duration"])

    def _get_video_info(self, video_path):
        cmd = ["ffprobe", "-v", "error", "-select_streams", "v:0",
               "-show_entries", "stream=width,height", "-of", "json", video_path]
        info = json.loads(subprocess.run(cmd, capture_output=True, text=True).stdout)
        return info["streams"][0]["width"], info["streams"][0]["height"]

    def _detect_face_crop(self, video_path, start, src_w, src_h):
        crop_w = int(src_h * VIDEO_W / VIDEO_H)
        crop_h = src_h
        if crop_w > src_w:
            crop_w = src_w
            crop_h = int(src_w * VIDEO_H / VIDEO_W)

        cap = cv2.VideoCapture(video_path)
        fps = cap.get(cv2.CAP_PROP_FPS) or 30
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(start * fps))

        cx_list, cy_list = [], []
        for _ in range(FACE_SAMPLE_FRAMES):
            ret, frame = cap.read()
            if not ret:
                break
            res = self.face_detection.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
            if res.detections:
                for d in res.detections:
                    bb = d.location_data.relative_bounding_box
                    cx_list.append(int((bb.xmin + bb.width  / 2) * src_w))
                    cy_list.append(int((bb.ymin + bb.height / 2) * src_h))
        cap.release()

        if cx_list:
            avg_cx = int(sum(cx_list) / len(cx_list))
            avg_cy = int(sum(cy_list) / len(cy_list))
            crop_x = max(0, min(avg_cx - crop_w // 2, src_w - crop_w))
            crop_y = max(0, min(avg_cy - int(crop_h * 0.30), src_h - crop_h))
        else:
            crop_x = (src_w - crop_w) // 2
            crop_y = src_h // 8

        return crop_x, crop_y, crop_w, crop_h

    def _build_drawtext(self, text, y_center, fontsize, color, border_color="0xFFD700", style=None):
        s = style or {}
        lines = [l.strip() for l in text.replace("\\n", "\n").split("\n") if l.strip()][:2]
        if not lines:
            return []

        max_len = max(len(l) for l in lines)
        if max_len <= 7:   auto_size = fontsize
        elif max_len <= 10: auto_size = int(fontsize * 0.88)
        elif max_len <= 13: auto_size = int(fontsize * 0.75)
        elif max_len <= 16: auto_size = int(fontsize * 0.63)
        else:               auto_size = int(fontsize * 0.54)

        scale = s.get("title_fontsize_scale", 1.0)
        auto_size = max(30, int(auto_size * scale))

        # 색상: style 우선, 없으면 기본값
        c1 = self._css_to_ffmpeg(s.get("title1_color", "#FFD700"))
        c2 = self._css_to_ffmpeg(s.get("title2_color", "#FFFFFF"))
        line_colors = [c1, c2]

        line_h  = auto_size + 20
        y_extra = s.get("title_y_extra", 0)
        start_y = (y_center + y_extra) - (len(lines) * line_h) // 2
        font_opt = f":fontfile='{self.font}'" if self.font else ""

        filters = []
        for i, line in enumerate(lines):
            esc = line.replace("'", "\\'").replace(":", "\\:").replace("%", "\\%")
            fc = line_colors[i] if i < len(line_colors) else "0xFFFFFF"
            filters.append(
                f"drawtext=text='{esc}'"
                f"{font_opt}"
                f":fontsize={auto_size}"
                f":fontcolor={fc}"
                f":borderw=2:bordercolor={fc}"
                f":shadowx=3:shadowy=3:shadowcolor=black@0.8"
                f":x=(w-text_w)/2:y={start_y + i * line_h}"
            )
        return filters

    def _build_segment_vf(self, crop_w, crop_h, crop_x, crop_y):
        return (
            f"crop={crop_w}:{crop_h}:{crop_x}:{crop_y},"
            f"scale={VIDEO_W}:{VIDEO_H},"
            f"setsar=1"
        )

    def _build_overlay_vf(self, title_text, style=None):
        t = self.template
        filters = [f"pad={CANVAS_W}:{CANVAS_H}:0:{VIDEO_Y}:color={t['bg_color']}"]
        if t.get("top_bg_color"):
            filters.append(f"drawbox=x=0:y=0:w={CANVAS_W}:h={TOP_H}:color={t['top_bg_color']}:t=fill")
        if t.get("divider"):
            dc = t["divider_color"]
            filters.append(f"drawbox=x=0:y={VIDEO_Y}:w={CANVAS_W}:h=4:color={dc}:t=fill")
            filters.append(f"drawbox=x=0:y={VIDEO_Y+VIDEO_H-4}:w={CANVAS_W}:h=4:color={dc}:t=fill")
        if title_text:
            filters += self._build_drawtext(
                title_text, TOP_H // 2 + 140,
                t["title_fontsize"], t["title_color"], t.get("title_border", "0xFFD700"),
                style=style
            )
        return ",".join(filters)

    def _build_text_filters(self, title_text, style=None):
        t = self.template
        filters = []
        if t.get("divider"):
            dc = t["divider_color"]
            filters.append(f"drawbox=x=0:y={VIDEO_Y}:w={CANVAS_W}:h=4:color={dc}:t=fill")
            filters.append(f"drawbox=x=0:y={VIDEO_Y+VIDEO_H-4}:w={CANVAS_W}:h=4:color={dc}:t=fill")
        if title_text:
            filters += self._build_drawtext(
                title_text, TOP_H // 2 + 140,
                t["title_fontsize"], t["title_color"], t.get("title_border", "0xFFD700"),
                style=style
            )
        return filters

    def _generate_sub_entries(self, analysis_path):
        """자막 (start, end, text) 리스트 반환. LLM 리포맷 포함."""
        with open(analysis_path, "r", encoding="utf-8") as f:
            analysis = json.load(f)
        raw_segments    = analysis.get("raw_segments", [])
        transcript_path = analysis.get("transcript_path", "")
        if not raw_segments or not os.path.exists(transcript_path):
            return []
        with open(transcript_path, "r", encoding="utf-8") as f:
            transcript = json.load(f)
        seg_list = transcript.get("segments", [])
        entries = []
        for rs in raw_segments:
            orig_start = rs["orig_start"]
            orig_end   = rs["orig_end"]
            raw_start  = rs["raw_start"]
            for seg in seg_list:
                if seg["start"] >= orig_start and seg["end"] <= orig_end:
                    offset = raw_start - orig_start
                    entries.append((
                        seg["start"] + offset,
                        seg["end"]   + offset,
                        seg["text"].strip()
                    ))
        if not entries:
            return []
        print(f"  [Subtitle] LLM 자막 리포맷 중 ({len(entries)}개)...")
        reformed = _reformat_subtitles_llm([t for _, _, t in entries])
        return [(s, e, r) for (s, e, _), r in zip(entries, reformed)]

    @staticmethod
    def _split_subtitle_line(text, max_chars=16):
        """16자 초과 한 줄 텍스트를 중간 공백 기준으로 2줄로 분리."""
        if len(text) <= max_chars:
            return [text]
        mid = len(text) // 2
        # 중간에서 가장 가까운 공백 탐색 (앞뒤로)
        for delta in range(mid):
            for pos in [mid - delta, mid + delta]:
                if 0 < pos < len(text) and text[pos] == " ":
                    return [text[:pos].strip(), text[pos:].strip()]
        # 공백 없으면 그냥 중간 자르기
        return [text[:mid], text[mid:]]

    def _build_sub_drawtext_filters(self, entries, style=None):
        """자막 entries → drawtext 박스 필터 리스트 반환."""
        if not entries:
            return []
        s        = style or {}
        fontsize = s.get("sub_fontsize", 52)
        fontsize = min(fontsize, 80)
        margin_v = s.get("sub_margin_v", 30)
        font_opt = f":fontfile='{self.font}'" if self.font else ""
        line_h   = int(fontsize * 1.45)
        base_y   = VIDEO_Y + VIDEO_H - margin_v

        filters = []
        for (t_start, t_end, text) in entries:
            # LLM이 \n으로 나눈 줄 + 긴 줄은 자동 2줄 분리
            raw_lines = [l for l in text.replace("\\n", "\n").split("\n") if l.strip()]
            lines = []
            for l in raw_lines:
                lines.extend(self._split_subtitle_line(l))
            if not lines:
                continue
            n      = len(lines)
            enable = f"between(t,{t_start:.3f},{t_end:.3f})"
            for i, line in enumerate(lines):
                y   = base_y - (n - i) * line_h
                esc = line.replace("'", "\\'").replace(":", "\\:").replace("%", "\\%")
                filters.append(
                    f"drawtext=text='{esc}'{font_opt}"
                    f":fontsize={fontsize}:fontcolor=white"
                    f":box=1:boxcolor=black@0.5:boxborderw=14"
                    f":x=(w-text_w)/2:y={y}"
                    f":enable='{enable}'"
                )
        return filters

    def _render_clip(self, video_path, seek, duration, vf, output_path):
        cmd = [
            "ffmpeg", "-y", "-ss", str(seek), "-i", video_path,
            "-t", str(duration), "-vf", vf,
            "-c:v", "libx264", "-preset", "fast", "-crf", "23",
            "-c:a", "aac", "-b:a", "128k",
            output_path
        ]
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    def _concat_raw(self, video_paths, output_path, fade_sec=0.5):
        if len(video_paths) == 1:
            cmd = ["ffmpeg", "-y", "-i", video_paths[0], "-c", "copy", output_path]
            subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            return

        durations = [self._get_video_duration(p) for p in video_paths]
        n = len(video_paths)

        inputs = []
        for p in video_paths:
            inputs += ["-i", p]

        fc_parts = []
        cumulative = 0.0
        prev_v = "[0:v]"
        prev_a = "[0:a]"

        for i in range(1, n):
            cumulative += durations[i - 1]
            offset = max(0.0, cumulative - fade_sec * i)
            out_v = "[vout]" if i == n - 1 else f"[v{i}]"
            out_a = "[aout]" if i == n - 1 else f"[a{i}]"

            fc_parts.append(
                f"{prev_v}[{i}:v]xfade=transition=fade:duration={fade_sec}:offset={offset:.3f}{out_v}"
            )
            fc_parts.append(
                f"{prev_a}[{i}:a]acrossfade=d={fade_sec}{out_a}"
            )
            prev_v = out_v
            prev_a = out_a

        cmd = (
            ["ffmpeg", "-y"] + inputs +
            ["-filter_complex", ";".join(fc_parts),
             "-map", "[vout]", "-map", "[aout]",
             "-c:v", "libx264", "-preset", "fast", "-crf", "23",
             "-c:a", "aac", "-b:a", "128k",
             output_path]
        )
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    def _generate_srt(self, analysis_path, srt_path):
        entries = self._generate_sub_entries(analysis_path)
        if not entries:
            return False
        with open(srt_path, "w", encoding="utf-8") as f:
            for i, (s, e, text) in enumerate(entries, 1):
                f.write(f"{i}\n{_srt_time(s)} --> {_srt_time(e)}\n{text}\n\n")
        return True

    # ── 공개 API ───────────────────────────────────────────────

    def edit_video(self, analysis_path) -> str | None:
        """Stage 1: 영상 크롭+편집 → outputs/raw/ 저장, 타임맵도 analysis JSON에 기록"""
        with open(analysis_path, "r", encoding="utf-8") as f:
            analysis = json.load(f)

        transcript_path = analysis.get("transcript_path", "")
        candidates      = analysis.get("candidates", [])

        if not candidates:
            print(f"[Editor] 후보 없음: {analysis_path}")
            return None

        video_path = self._find_video_path(transcript_path)
        if not video_path:
            print(f"[Editor] 원본 영상 없음")
            return None

        print(f"\n[Stage 1] {os.path.basename(video_path)}")
        src_w, src_h   = self._get_video_info(video_path)
        video_duration = self._get_video_duration(video_path)

        parts        = []
        total_sec    = 0.0
        raw_time     = 0.0
        raw_segments = []

        for i, candidate in enumerate(candidates):
            start      = candidate["start"]
            end        = candidate["end"]
            edit_order = candidate.get("edit_order", i + 1)

            if (end - start) < MIN_SEGMENT_SEC:
                continue

            buffered_start = max(0, start - BUFFER_SEC)
            buffered_end   = min(video_duration, end + BUFFER_SEC)
            duration       = buffered_end - buffered_start

            if total_sec >= self.MAX_TOTAL_SEC:
                break
            remaining = self.MAX_TOTAL_SEC - total_sec
            if duration > remaining:
                duration = remaining
                buffered_end = buffered_start + duration

            print(f"  [{edit_order}] {buffered_start:.1f}s~{buffered_end:.1f}s ({duration:.1f}s)")

            cx, cy, cw, ch = self._detect_face_crop(video_path, buffered_start, src_w, src_h)
            vf       = self._build_segment_vf(cw, ch, cx, cy)
            seg_path = os.path.join(TEMP_DIR, f"seg_{edit_order}.mp4")
            self._render_clip(video_path, buffered_start, duration, vf, seg_path)
            parts.append(seg_path)

            raw_segments.append({
                "raw_start":  round(raw_time, 3),
                "raw_end":    round(raw_time + duration, 3),
                "orig_start": round(buffered_start, 3),
                "orig_end":   round(buffered_end, 3),
            })
            raw_time  += duration
            total_sec += duration

        if not parts:
            print("[Stage 1] 편집할 구간 없음")
            return None

        base_name = os.path.splitext(os.path.basename(analysis_path))[0]
        raw_path  = os.path.join(RAW_DIR, f"{base_name}_raw.mp4")
        self._concat_raw(parts, raw_path)

        analysis["raw_segments"] = raw_segments
        with open(analysis_path, "w", encoding="utf-8") as f:
            json.dump(analysis, f, ensure_ascii=False, indent=2)

        for f in os.listdir(TEMP_DIR):
            fp = os.path.join(TEMP_DIR, f)
            if os.path.isfile(fp):
                os.remove(fp)

        print(f"  [Stage 1] 완료 → {os.path.basename(raw_path)}")
        return raw_path

    def _resolve_bg_path(self, category: str, bg_image: str = None) -> str:
        """배경 이미지 경로 결정. bg_image 지정 시 우선, 없으면 category 기반."""
        stem = bg_image if bg_image else category
        return os.path.join(STATIC_DIR, "backgrounds", f"{stem}.png")

    def _get_logo_path(self) -> str | None:
        """로고 오버레이 경로. 서브클래스에서 재정의."""
        return None

    def apply_overlay(self, raw_path, analysis_path,
                      title_override: str = None,
                      subtitles: bool = False,
                      style: dict = None,
                      bg_image: str = None) -> str | None:
        """Stage 2: raw 영상 + 배경/제목(+자막) → outputs/shorts/ 저장"""
        with open(analysis_path, "r", encoding="utf-8") as f:
            analysis = json.load(f)

        title    = title_override if title_override is not None else analysis.get("intro_text", "")
        category = analysis.get("category", "")

        base_name   = os.path.splitext(os.path.basename(raw_path))[0].replace("_raw", "")
        output_path = os.path.join(SHORTS_DIR, f"{base_name}_shorts.mp4")

        sub_entries  = self._generate_sub_entries(analysis_path) if subtitles else []
        sub_filters  = self._build_sub_drawtext_filters(sub_entries, style)
        sub_str      = ",".join(sub_filters)

        print(f"  [Stage 2] '{title[:20]}' | 자막={'O' if sub_entries else 'X'}")

        bg_path   = self._resolve_bg_path(category, bg_image)
        logo_path = self._get_logo_path()
        has_logo  = bool(logo_path and os.path.exists(logo_path))

        if os.path.exists(bg_path):
            text_filters = self._build_text_filters(title, style=style)
            parts        = [f for f in [",".join(text_filters), sub_str] if f]
            all_vf_str   = ",".join(parts)
            mid          = "prelogo" if has_logo else "out"

            if all_vf_str:
                overlay_str = f"[base]{all_vf_str}[{mid}]"
            else:
                overlay_str = f"[base]null[{mid}]"

            logo_idx = 2
            if has_logo:
                overlay_str += (
                    f";[{logo_idx}]scale=200:-1[logo]"
                    f";[prelogo][logo]overlay=W-w-16:{VIDEO_Y+16}[out]"
                )

            fc = (
                f"[1]scale={CANVAS_W}:{CANVAS_H},setsar=1[bg];"
                f"[0]setsar=1[vid];"
                f"[bg][vid]overlay=0:{VIDEO_Y}[base];"
                f"{overlay_str}"
            )
            inputs = ["-i", raw_path, "-i", bg_path]
            if has_logo:
                inputs += ["-i", logo_path]
            cmd = (
                ["ffmpeg", "-y"] + inputs +
                ["-filter_complex", fc,
                 "-map", "[out]", "-map", "0:a?",
                 "-c:v", "libx264", "-preset", "fast", "-crf", "23",
                 "-c:a", "aac", "-b:a", "128k",
                 output_path]
            )
        else:
            vf = self._build_overlay_vf(title, style=style)
            if sub_str:
                vf += f",{sub_str}"
            cmd = [
                "ffmpeg", "-y", "-i", raw_path,
                "-vf", vf,
                "-c:v", "libx264", "-preset", "fast", "-crf", "23",
                "-c:a", "aac", "-b:a", "128k",
                output_path
            ]

        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        print(f"  [Stage 2] 완료 → {os.path.basename(output_path)}")
        return output_path

    def preview_frame(self, raw_path, analysis_path,
                      title: str = None,
                      style: dict = None,
                      seek: float = 2.0,
                      bg_image: str = None) -> str | None:
        """미리보기: raw 영상에서 한 프레임 추출 후 오버레이 적용 → PNG 반환"""
        with open(analysis_path, "r", encoding="utf-8") as f:
            analysis = json.load(f)

        if title is None:
            title = analysis.get("intro_text", "")
        category = analysis.get("category", "")

        preview_path = os.path.join(TEMP_DIR, "preview_frame.png")
        bg_path      = self._resolve_bg_path(category, bg_image)
        logo_path    = self._get_logo_path()
        has_logo     = bool(logo_path and os.path.exists(logo_path))

        if os.path.exists(bg_path):
            text_filters = self._build_text_filters(title, style=style)
            text_str     = ",".join(text_filters) if text_filters else "null"
            mid          = "prelogo" if has_logo else "out"
            logo_filter  = (
                f";[2]scale=200:-1[logo];[prelogo][logo]overlay=W-w-16:{VIDEO_Y+16}[out]"
                if has_logo else ""
            )
            fc = (
                f"[1]scale={CANVAS_W}:{CANVAS_H},setsar=1[bg];"
                f"[0]setsar=1[vid];"
                f"[bg][vid]overlay=0:{VIDEO_Y}[base];"
                f"[base]{text_str}[{mid}]"
                f"{logo_filter}"
            )
            inputs = ["-ss", str(seek), "-i", raw_path, "-i", bg_path]
            if has_logo:
                inputs += ["-i", logo_path]
            cmd = (
                ["ffmpeg", "-y"] + inputs +
                ["-filter_complex", fc, "-map", "[out]",
                 "-vframes", "1", "-update", "1", preview_path]
            )
        else:
            vf = self._build_overlay_vf(title, style=style)
            cmd = [
                "ffmpeg", "-y", "-ss", str(seek), "-i", raw_path,
                "-vf", vf,
                "-vframes", "1", "-update", "1",
                preview_path
            ]

        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            print(f"[Preview] FFmpeg 오류:\n{result.stderr[-800:]}")
            return None
        return preview_path if os.path.exists(preview_path) else None

    def rerender(self, analysis_path,
                 title_override: str = None,
                 subtitles: bool = False,
                 style: dict = None,
                 bg_image: str = None) -> str | None:
        """Stage 2만 재실행"""
        with open(analysis_path, "r", encoding="utf-8") as f:
            analysis = json.load(f)
        base_name = os.path.splitext(os.path.basename(analysis_path))[0]
        raw_path  = os.path.join(RAW_DIR, f"{base_name}_raw.mp4")
        if not os.path.exists(raw_path):
            print(f"[Editor] raw 파일 없음: {raw_path}")
            return None
        return self.apply_overlay(raw_path, analysis_path,
                                  title_override=title_override,
                                  subtitles=subtitles,
                                  style=style,
                                  bg_image=bg_image)

    def edit(self, analysis_path) -> str | None:
        raw_path = self.edit_video(analysis_path)
        if not raw_path:
            return None
        return self.apply_overlay(raw_path, analysis_path)

    def run(self, analysis_paths: list):
        results = []
        for path in analysis_paths:
            try:
                out = self.edit(path)
                if out:
                    results.append(out)
            except Exception as e:
                print(f"[Editor] ERROR {path}: {e}")
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
                print(f"[Editor] ERROR {path}: {e}")
        print(f"\n✅ 재렌더링 완료 | {len(results)}개 쇼츠")
        return results
