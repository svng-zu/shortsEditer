# backend/app/services/editor_base.py
"""공통 편집 로직"""

import os
import json
import subprocess
import uuid
import cv2
from pathlib import Path

from app.config import settings

CANVAS_W = 1080
CANVAS_H = 1920
VIDEO_W = 1080
VIDEO_H = 810

REMAINING_H = CANVAS_H - VIDEO_H
TOP_H = int(REMAINING_H * 0.50)
BOTTOM_H = REMAINING_H - TOP_H
VIDEO_Y = TOP_H

BUFFER_SEC = 2
MIN_SEGMENT_SEC = 5
MAX_TOTAL_SEC = 120
FACE_SAMPLE_FRAMES = 10

TEMP_DIR = settings.BASE_DIR / "data" / "temp"
TEMP_DIR.mkdir(parents=True, exist_ok=True)


def _srt_time(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int((seconds % 1) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


class EditorBase:
    """카테고리별 에디터가 상속하는 공통 클래스"""

    TEMPLATES: dict = {}
    MAX_TOTAL_SEC: int = MAX_TOTAL_SEC

    def __init__(self, template_id: int = None, session_dirs=None):
        self._check_ffmpeg()
        self._face_cascade = cv2.CascadeClassifier(
            cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        )
        # 세션 경로 (없으면 기본 settings 경로 사용)
        self._sd = session_dirs
        self.font = self._resolve_font()
        templates = self.__class__.TEMPLATES
        if template_id is not None and template_id in templates:
            self.template = templates[template_id]
        else:
            self.template = templates.get(1, next(iter(templates.values())) if templates else {})
        if self.template:
            print(f"[Editor] 템플릿: {self.template.get('name', 'default')}")

    def _check_ffmpeg(self):
        r = subprocess.run(["ffmpeg", "-version"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if r.returncode != 0:
            raise RuntimeError("FFmpeg가 설치되어 있지 않습니다.")

    FONT_MAP = {
        "NanumSquareRoundEB": "/usr/share/fonts/truetype/nanum/NanumSquareRoundEB.ttf",
        "NanumSquareRoundB":  "/usr/share/fonts/truetype/nanum/NanumSquareRoundB.ttf",
        "NanumSquareB":       "/usr/share/fonts/truetype/nanum/NanumSquareB.ttf",
        "NanumGothicBold":    "/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf",
    }

    def _resolve_font(self, font_name: str = None):
        candidates = []
        if font_name and font_name in self.FONT_MAP:
            candidates.append(self.FONT_MAP[font_name])
        candidates += list(self.FONT_MAP.values()) + [
            "C:/Windows/Fonts/malgunbd.ttf",
            "C:/Windows/Fonts/malgun.ttf",
        ]
        for p in candidates:
            if os.path.exists(p):
                print(f"[Editor] 폰트: {p}")
                return p
        return None

    @staticmethod
    def _css_to_ffmpeg(color: str) -> str:
        return "0x" + color.lstrip("#").upper()

    @staticmethod
    def _css_to_ass(color: str) -> str:
        h = color.lstrip("#")
        r, g, b = h[0:2], h[2:4], h[4:6]
        return f"&H{b}{g}{r}"

    def _find_video_path(self, transcript_path):
        base = os.path.splitext(os.path.basename(transcript_path))[0]
        download_dir = self._sd.download_dir if self._sd else settings.DOWNLOAD_DIR
        for f in os.listdir(download_dir):
            if f.endswith(".mp4") and base in f:
                return str(download_dir / f)
        return None

    def _get_video_duration(self, video_path):
        cmd = ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", video_path]
        try:
            out = subprocess.run(cmd, capture_output=True, text=True).stdout
            return float(json.loads(out)["format"]["duration"])
        except Exception as e:
            raise RuntimeError(f"ffprobe duration 실패 ({os.path.basename(str(video_path))}): {e}")

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
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            faces = self._face_cascade.detectMultiScale(
                gray, scaleFactor=1.1, minNeighbors=5, minSize=(30, 30)
            )
            for (x, y, w, h) in faces:
                cx_list.append(x + w // 2)
                cy_list.append(y + h // 2)
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
        if max_len <= 7:
            auto_size = fontsize
        elif max_len <= 10:
            auto_size = int(fontsize * 0.88)
        elif max_len <= 13:
            auto_size = int(fontsize * 0.75)
        elif max_len <= 16:
            auto_size = int(fontsize * 0.63)
        else:
            auto_size = int(fontsize * 0.54)

        scale = s.get("title_fontsize_scale", 1.0)
        auto_size = max(30, int(auto_size * scale))

        c1 = self._css_to_ffmpeg(s.get("title1_color", "#FFD700"))
        c2 = self._css_to_ffmpeg(s.get("title2_color", "#FFFFFF"))
        line_colors = [c1, c2]

        line_h = auto_size + 20
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

    def _color_filter_str(self, style=None):
        """캡컷 스타일 색감 보정 — 기본값(변화 없음)이면 None을 반환해 필터 체인에 끼워 넣지 않는다."""
        s = style or {}
        b = s.get("brightness", 0.0)
        c = s.get("contrast", 1.0)
        sat = s.get("saturation", 1.0)
        if b == 0.0 and c == 1.0 and sat == 1.0:
            return None
        return f"eq=brightness={b}:contrast={c}:saturation={sat}"

    def _volume_value(self, style=None):
        s = style or {}
        v = s.get("volume", 1.0)
        return v if v != 1.0 else None

    def _build_segment_vf(self, crop_w, crop_h, crop_x, crop_y):
        return (
            f"crop={crop_w}:{crop_h}:{crop_x}:{crop_y},"
            f"scale={VIDEO_W}:{VIDEO_H},"
            f"setsar=1"
        )

    def _build_overlay_vf(self, title_text, style=None):
        t = self.template
        s = style or {}
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
        channel = (s.get("channel_name") or "").strip()
        if channel:
            esc = channel.replace("'", "\\'").replace(":", "\\:").replace("%", "\\%")
            font_opt = f":fontfile='{self.font}'" if self.font else ""
            ch_fontsize = 36
            cy = VIDEO_Y + VIDEO_H + (BOTTOM_H - ch_fontsize) // 2
            filters.append(
                f"drawtext=text='{esc}'"
                f"{font_opt}"
                f":fontsize={ch_fontsize}:fontcolor=white@0.75"
                f":borderw=2:bordercolor=black@0.6"
                f":x=(w-text_w)/2:y={cy}"
            )
        return ",".join(filters)

    def _build_text_filters(self, title_text, style=None):
        t = self.template
        s = style or {}
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
        channel = (s.get("channel_name") or "").strip()
        if channel:
            esc = channel.replace("'", "\\'").replace(":", "\\:").replace("%", "\\%")
            font_opt = f":fontfile='{self.font}'" if self.font else ""
            ch_fontsize = 36
            cy = VIDEO_Y + VIDEO_H + (BOTTOM_H - ch_fontsize) // 2
            filters.append(
                f"drawtext=text='{esc}'"
                f"{font_opt}"
                f":fontsize={ch_fontsize}:fontcolor=white@0.75"
                f":borderw=2:bordercolor=black@0.6"
                f":x=(w-text_w)/2:y={cy}"
            )
        return filters

    def _generate_sub_entries(self, analysis_path):
        with open(analysis_path, "r", encoding="utf-8") as f:
            analysis = json.load(f)
        raw_segments = analysis.get("raw_segments", [])
        transcript_path = analysis.get("transcript_path", "")
        if not raw_segments or not os.path.exists(transcript_path):
            return []
        with open(transcript_path, "r", encoding="utf-8") as f:
            transcript = json.load(f)
        seg_list = transcript.get("segments", [])
        entries = []
        for rs in raw_segments:
            orig_start = rs["orig_start"]
            orig_end = rs["orig_end"]
            raw_start = rs["raw_start"]
            for seg in seg_list:
                if seg["start"] >= orig_start and seg["end"] <= orig_end:
                    offset = raw_start - orig_start
                    entries.append((
                        seg["start"] + offset,
                        seg["end"] + offset,
                        seg["text"].strip()
                    ))
        return entries

    @staticmethod
    def _split_subtitle_line(text, max_chars=20):
        if len(text) <= max_chars:
            return [text]
        mid = len(text) // 2
        for delta in range(mid):
            for pos in [mid - delta, mid + delta]:
                if 0 < pos < len(text) and text[pos] == " ":
                    return [text[:pos].strip(), text[pos:].strip()]
        return [text[:mid], text[mid:]]

    def _build_sub_drawtext_filters(self, entries, style=None):
        if not entries:
            return []
        s = style or {}
        fontsize = min(s.get("sub_fontsize", 68), 88)
        margin_v = s.get("sub_margin_v", 110)
        font_opt = f":fontfile='{self.font}'" if self.font else ""
        line_h = int(fontsize * 1.35)
        base_y = VIDEO_Y + VIDEO_H - margin_v

        filters = []
        for (t_start, t_end, text) in entries:
            raw_lines = [l for l in text.replace("\\n", "\n").split("\n") if l.strip()]
            lines = []
            for l in raw_lines:
                lines.extend(self._split_subtitle_line(l, max_chars=20))
            if not lines:
                continue
            n = min(len(lines), 2)
            lines = lines[:n]
            enable = f"between(t,{t_start:.3f},{t_end:.3f})"
            for i, line in enumerate(lines):
                y = base_y - (n - i) * line_h
                esc = line.replace("'", "\\'").replace(":", "\\:").replace("%", "\\%")
                filters.append(
                    f"drawtext=text='{esc}'{font_opt}"
                    f":fontsize={fontsize}:fontcolor=white"
                    f":borderw=4:bordercolor=black@0.95"
                    f":shadowx=3:shadowy=3:shadowcolor=black@0.7"
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

    def _resolve_bg_path(self, category: str, bg_image: str = None) -> str | None:
        # bg_image == "" → 사용자가 "단색 배경"을 명시적으로 선택한 것 (이미지 없이 단색으로)
        # bg_image is None → 선택하지 않음 (카테고리 기본 배경 이미지 사용)
        if bg_image == "":
            return None
        stem = bg_image if bg_image else category
        return str(settings.STATIC_DIR / "backgrounds" / f"{stem}.png")

    def _get_logo_path(self) -> str:
        return None

    def edit_video(self, analysis_path) -> str:
        with open(analysis_path, "r", encoding="utf-8") as f:
            analysis = json.load(f)

        transcript_path = analysis.get("transcript_path", "")
        candidates = analysis.get("candidates", [])

        if not candidates:
            print(f"[Editor] 후보 없음: {analysis_path}")
            return None

        video_path = self._find_video_path(transcript_path)
        if not video_path:
            print(f"[Editor] 원본 영상 없음")
            return None

        # 편집마다 고유 temp 디렉토리 사용 (동시 실행 충돌 방지)
        job_temp = TEMP_DIR / uuid.uuid4().hex[:12]
        job_temp.mkdir(parents=True, exist_ok=True)

        print(f"\n[Stage 1] {os.path.basename(video_path)}")
        src_w, src_h = self._get_video_info(video_path)
        video_duration = self._get_video_duration(video_path)

        parts = []
        total_sec = 0.0
        raw_time = 0.0
        raw_segments = []

        for i, candidate in enumerate(candidates):
            start = candidate["start"]
            end = candidate["end"]
            edit_order = candidate.get("edit_order", i + 1)

            if (end - start) < MIN_SEGMENT_SEC:
                continue

            buffered_start = max(0, start - BUFFER_SEC)
            buffered_end = min(video_duration, end + BUFFER_SEC)
            duration = buffered_end - buffered_start

            if total_sec >= self.MAX_TOTAL_SEC:
                break
            remaining = self.MAX_TOTAL_SEC - total_sec
            if duration > remaining:
                duration = remaining
                buffered_end = buffered_start + duration

            print(f"  [{edit_order}] {buffered_start:.1f}s~{buffered_end:.1f}s ({duration:.1f}s)")

            cx, cy, cw, ch = self._detect_face_crop(video_path, buffered_start, src_w, src_h)
            vf = self._build_segment_vf(cw, ch, cx, cy)
            seg_path = str(job_temp / f"seg_{edit_order}.mp4")
            self._render_clip(video_path, buffered_start, duration, vf, seg_path)
            parts.append(seg_path)

            raw_segments.append({
                "raw_start": round(raw_time, 3),
                "raw_end": round(raw_time + duration, 3),
                "orig_start": round(buffered_start, 3),
                "orig_end": round(buffered_end, 3),
            })
            raw_time += duration
            total_sec += duration

        if not parts:
            print("[Stage 1] 편집할 구간 없음")
            return None

        base_name = os.path.splitext(os.path.basename(analysis_path))[0]
        raw_dir = self._sd.raw_dir if self._sd else settings.RAW_DIR
        raw_path = str(raw_dir / f"{base_name}_raw.mp4")
        self._concat_raw(parts, raw_path)

        analysis["raw_segments"] = raw_segments
        with open(analysis_path, "w", encoding="utf-8") as f:
            json.dump(analysis, f, ensure_ascii=False, indent=2)

        for f_name in os.listdir(job_temp):
            fp = job_temp / f_name
            if fp.is_file():
                fp.unlink()
        try:
            job_temp.rmdir()
        except Exception:
            pass

        print(f"  [Stage 1] 완료 → {os.path.basename(raw_path)}")
        return raw_path

    def apply_overlay(self, raw_path, analysis_path,
                      title_override: str = None,
                      subtitles: bool = False,
                      style: dict = None,
                      bg_image: str = None,
                      narration: bool = False,
                      narration_voice: str = "female") -> str:
        # style의 font_name으로 폰트 갱신
        if style and style.get("font_name"):
            self.font = self._resolve_font(style["font_name"])
        with open(analysis_path, "r", encoding="utf-8") as f:
            analysis = json.load(f)

        title = title_override if title_override is not None else analysis.get("intro_text", "")
        category = analysis.get("category", "")

        base_name = os.path.splitext(os.path.basename(raw_path))[0].replace("_raw", "")
        shorts_dir = self._sd.shorts_dir if self._sd else settings.SHORTS_DIR
        output_path = str(shorts_dir / f"{base_name}_shorts.mp4")

        sub_entries = self._generate_sub_entries(analysis_path) if subtitles else []
        sub_filters = self._build_sub_drawtext_filters(sub_entries, style)
        sub_str = ",".join(sub_filters)

        print(f"  [Stage 2] '{title[:20]}' | 자막={'O' if sub_entries else 'X'}")

        bg_path = self._resolve_bg_path(category, bg_image)
        logo_path = self._get_logo_path()
        has_logo = bool(logo_path and os.path.exists(logo_path))

        color_f = self._color_filter_str(style)
        volume = self._volume_value(style)
        af_opts = ["-af", f"volume={volume}"] if volume is not None else []

        if bg_path and os.path.exists(bg_path):
            text_filters = self._build_text_filters(title, style=style)
            parts = [f for f in [",".join(text_filters), sub_str] if f]
            all_vf_str = ",".join(parts)
            mid = "prelogo" if has_logo else "out"

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

            vid_chain = "setsar=1" + (f",{color_f}" if color_f else "")
            fc = (
                f"[1]scale={CANVAS_W}:{CANVAS_H},setsar=1[bg];"
                f"[0]{vid_chain}[vid];"
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
                 "-c:a", "aac", "-b:a", "128k"] + af_opts +
                [output_path]
            )
        else:
            # 블러 배경: raw 영상을 확대/블러해서 배경으로 사용
            text_filters = self._build_text_filters(title, style=style)
            all_filters = text_filters + sub_filters
            all_str = ",".join(all_filters) if all_filters else "setsar=1"
            mid_label = "prelogo" if has_logo else "out"
            color_pre = f"{color_f}," if color_f else ""

            fc = (
                f"[0:v]{color_pre}split=2[orig][blurin];"
                f"[blurin]scale={CANVAS_W}:{CANVAS_H}:force_original_aspect_ratio=increase,"
                f"crop={CANVAS_W}:{CANVAS_H},"
                f"boxblur=luma_radius=25:luma_power=3[blurbg];"
                f"[orig]setsar=1[fg];"
                f"[blurbg][fg]overlay=0:{VIDEO_Y}[base];"
                f"[base]{all_str}[{mid_label}]"
            )
            inputs = ["-i", raw_path]
            if has_logo:
                fc += (
                    f";[1]scale=200:-1[logo]"
                    f";[prelogo][logo]overlay=W-w-16:{VIDEO_Y+16}[out]"
                )
                inputs += ["-i", logo_path]

            cmd = (
                ["ffmpeg", "-y"] + inputs +
                ["-filter_complex", fc,
                 "-map", "[out]", "-map", "0:a?",
                 "-c:v", "libx264", "-preset", "fast", "-crf", "23",
                 "-c:a", "aac", "-b:a", "128k"] + af_opts +
                [output_path]
            )

        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        print(f"  [Stage 2] 완료 → {os.path.basename(output_path)}")

        # 나레이션 믹싱
        if narration and title:
            print(f"  [TTS] 나레이션 생성 중: '{title[:30]}'")
            from app.services.tts import generate_narration, mix_narration
            narr_path = output_path.replace("_shorts.mp4", "_narr.mp3")
            mixed_path = output_path.replace("_shorts.mp4", "_shorts_narr.mp4")
            if generate_narration(title, narr_path, narration_voice):
                if mix_narration(output_path, narr_path, mixed_path):
                    import shutil
                    shutil.move(mixed_path, output_path)
                    print(f"  [TTS] 믹싱 완료 → {os.path.basename(output_path)}")
                try:
                    Path(narr_path).unlink(missing_ok=True)
                except Exception:
                    pass
            else:
                print(f"  [TTS] 나레이션 생성 실패, 원본 유지")

        return output_path

    def preview_frame(self, raw_path, analysis_path, title=None, style=None, seek=2.0, bg_image=None):
        if style and style.get("font_name"):
            self.font = self._resolve_font(style["font_name"])
        with open(analysis_path, "r", encoding="utf-8") as f:
            analysis = json.load(f)

        if title is None:
            title = analysis.get("intro_text", "")
        category = analysis.get("category", "")

        preview_path = str(TEMP_DIR / "preview_frame.png")
        bg_path = self._resolve_bg_path(category, bg_image)
        logo_path = self._get_logo_path()
        has_logo = bool(logo_path and os.path.exists(logo_path))

        color_f = self._color_filter_str(style)

        if bg_path and os.path.exists(bg_path):
            text_filters = self._build_text_filters(title, style=style)
            text_str = ",".join(text_filters) if text_filters else "null"
            mid = "prelogo" if has_logo else "out"
            logo_filter = (
                f";[2]scale=200:-1[logo];[prelogo][logo]overlay=W-w-16:{VIDEO_Y+16}[out]"
                if has_logo else ""
            )
            vid_chain = "setsar=1" + (f",{color_f}" if color_f else "")
            fc = (
                f"[1]scale={CANVAS_W}:{CANVAS_H},setsar=1[bg];"
                f"[0]{vid_chain}[vid];"
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
            if color_f:
                vf = f"{color_f},{vf}"
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

    def rerender(self, analysis_path, title_override=None, subtitles=False, style=None, bg_image=None):
        with open(analysis_path, "r", encoding="utf-8") as f:
            analysis = json.load(f)
        base_name = os.path.splitext(os.path.basename(analysis_path))[0]
        raw_dir = self._sd.raw_dir if self._sd else settings.RAW_DIR
        raw_path = str(raw_dir / f"{base_name}_raw.mp4")
        if not os.path.exists(raw_path):
            print(f"[Editor] raw 파일 없음: {raw_path}")
            return None
        return self.apply_overlay(raw_path, analysis_path,
                                  title_override=title_override,
                                  subtitles=subtitles,
                                  style=style,
                                  bg_image=bg_image)

    def edit(self, analysis_path):
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
