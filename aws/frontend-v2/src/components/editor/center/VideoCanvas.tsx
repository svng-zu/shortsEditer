import { useEffect, useRef } from 'react'
import { useEditor, CV_W, CV_H, SCALE, VID_Y_PX, VID_H_PX, TMPL_COLORS } from '../../../contexts/EditorContext'
import { useT } from '../../../i18n'

const FONT_CSS_NAME: Record<string, string> = {
  BlackHanSans: 'Black Han Sans',
  NotoSerifKRBold: 'Noto Serif KR',
  NotoSansKRBold: 'Noto Sans KR',
}
const toCssFontFamily = (key: string) => FONT_CSS_NAME[key] ?? key

function wrapSubtitle(text: string, maxChars = 12): string[] {
  const lines: string[] = []; let cur = ''
  for (const ch of text.split('')) {
    if ((cur + ch).length > maxChars) { if (cur) lines.push(cur); cur = ch }
    else cur += ch
  }
  if (cur) lines.push(cur)
  return lines.slice(0, 2)
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let cur = ''
  for (const word of words) {
    const test = cur ? `${cur} ${word}` : word
    if (ctx.measureText(test).width > maxWidth && cur) {
      lines.push(cur)
      cur = word
    } else {
      cur = test
    }
  }
  if (cur) lines.push(cur)
  if (lines.length === 1 && ctx.measureText(lines[0]).width > maxWidth) {
    const chars = lines[0]
    lines.length = 0
    cur = ''
    for (const ch of chars) {
      if (ctx.measureText(cur + ch).width > maxWidth && cur) {
        lines.push(cur)
        cur = ch
      } else {
        cur += ch
      }
    }
    if (cur) lines.push(cur)
  }
  return lines
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  return `rgba(${parseInt(h.slice(0, 2), 16) || 0},${parseInt(h.slice(2, 4), 16) || 0},${parseInt(h.slice(4, 6), 16) || 0},${alpha})`
}

const bgCache: Record<string, HTMLImageElement | null> = {}
function loadBg(name: string) {
  if (name in bgCache) return
  const img = new Image(); img.src = `/static/backgrounds/${name}.png`
  img.onload = () => { bgCache[name] = img }; img.onerror = () => { bgCache[name] = null }
  bgCache[name] = img
}

export default function VideoCanvas() {
  const {
    selectedRaw, canvasRef, hidVidRef, hookVidRef, narrAudioRef,
    isPlaying, togglePlay, setVideoDuration,
    title, subtitle, channel, bg, textOverlays, subEntries,
  } = useEditor()
  const t = useT()

  const rafRef = useRef<number>(0)

  // Use refs so the RAF loop always reads fresh state without re-creating the function
  const stateRef = useRef({ selectedRaw, title, subtitle, channel, bg, textOverlays, subEntries })
  stateRef.current = { selectedRaw, title, subtitle, channel, bg, textOverlays, subEntries }

  // Stable draw loop — never recreated
  useEffect(() => {
    let running = true
    const loop = () => {
      if (!running) return
      drawFrame()
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => { running = false; cancelAnimationFrame(rafRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function drawFrame() {
    const { selectedRaw: raw, title, subtitle, bg, textOverlays, subEntries } = stateRef.current
    const canvas = canvasRef.current
    const vid = hidVidRef.current
    if (!canvas || !vid) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const cat = raw?.category || 'sports'
    const tmpl = TMPL_COLORS[cat]?.[bg.templateId] || TMPL_COLORS.sports[1]

    // Background
    ctx.fillStyle = tmpl.bg
    ctx.fillRect(0, 0, CV_W, CV_H)

    if (bg.type === 'image' && bg.imageName) {
      loadBg(bg.imageName)
      const bgImg = bgCache[bg.imageName]
      if (bgImg) ctx.drawImage(bgImg, 0, 0, CV_W, CV_H)
    } else if (bg.type === 'solid') {
      ctx.fillStyle = bg.solidColor
      ctx.fillRect(0, 0, CV_W, CV_H)
    }

    // Video frame
    if (vid.readyState >= 2) {
      const vw = vid.videoWidth, vh = vid.videoHeight
      if (vw && vh) {
        if (bg.type === 'blur') {
          ctx.filter = 'blur(8px) brightness(0.4)'
          ctx.drawImage(vid, 0, 0, CV_W, CV_H)
          ctx.filter = 'none'
        }
        const targetW = CV_W, targetH = VID_H_PX
        const srcAsp = vw / vh, dstAsp = targetW / targetH
        let sx = 0, sy = 0, sw = vw, sh = vh
        if (srcAsp > dstAsp) { sw = vh * dstAsp; sx = (vw - sw) / 2 }
        else { sh = vw / dstAsp; sy = (vh - sh) / 2 }
        ctx.drawImage(vid, sx, sy, sw, sh, 0, VID_Y_PX, targetW, targetH)
      }
    }

    // Title 1 — auto wrap into multiple lines
    const titleFsz = Math.round((72 + title.titleFontSizeDelta) * SCALE)
    const fontFam = toCssFontFamily(title.titleFont)
    const lineGap = Math.round(titleFsz * 1.25)
    const maxTitleW = CV_W - 16

    if (title.title1) {
      const baseY = Math.round((160 + title.titleY) * SCALE)
      ctx.font = `900 ${titleFsz}px '${fontFam}'`
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      const t1Lines = wrapText(ctx, title.title1, maxTitleW)
      const t1TotalH = t1Lines.length * lineGap
      t1Lines.forEach((line, i) => {
        const ly = baseY - t1TotalH / 2 + lineGap / 2 + i * lineGap
        if (title.title1BgEnabled) {
          const tw = ctx.measureText(line).width + 16
          ctx.fillStyle = hexToRgba(title.title1BgColor, title.title1BgOpacity)
          ctx.fillRect(CV_W / 2 - tw / 2, ly - titleFsz / 2 - 4, tw, titleFsz + 8)
        }
        if (title.title1BorderWidth > 0) {
          ctx.strokeStyle = title.title1BorderColor
          ctx.lineWidth = title.title1BorderWidth * SCALE
          ctx.strokeText(line, CV_W / 2, ly)
        }
        ctx.fillStyle = title.t1Color
        ctx.fillText(line, CV_W / 2, ly)
      })
    }

    // Title 2 — same font size as Title 1, auto wrap
    if (title.title2) {
      const baseY2 = Math.round((260 + title.titleY) * SCALE)
      ctx.font = `900 ${titleFsz}px '${fontFam}'`
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      const t2Lines = wrapText(ctx, title.title2, maxTitleW)
      const t2TotalH = t2Lines.length * lineGap
      t2Lines.forEach((line, i) => {
        const ly = baseY2 - t2TotalH / 2 + lineGap / 2 + i * lineGap
        if (title.title2BgEnabled) {
          const tw = ctx.measureText(line).width + 12
          ctx.fillStyle = hexToRgba(title.title2BgColor, title.title2BgOpacity)
          ctx.fillRect(CV_W / 2 - tw / 2, ly - titleFsz / 2 - 3, tw, titleFsz + 6)
        }
        if (title.title2BorderWidth > 0) {
          ctx.strokeStyle = title.title2BorderColor
          ctx.lineWidth = title.title2BorderWidth * SCALE
          ctx.strokeText(line, CV_W / 2, ly)
        }
        ctx.fillStyle = title.t2Color
        ctx.fillText(line, CV_W / 2, ly)
      })
    }

    // Subtitles
    if (subtitle.enabled && subEntries.length > 0 && vid.currentTime) {
      const t = vid.currentTime
      const entry = subEntries.find(e => t >= e.start && t <= e.end)
      if (entry) {
        const subFsz = Math.round(subtitle.size * SCALE)
        const fontFam = toCssFontFamily(subtitle.font)
        ctx.font = `700 ${subFsz}px '${fontFam}'`
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
        const lines = wrapSubtitle(entry.text)
        const baseY = CV_H - Math.round(subtitle.y * SCALE)
        const centerX = CV_W / 2 + Math.round((subtitle.x ?? 0) * SCALE)
        lines.forEach((line, i) => {
          const ly = baseY - (lines.length - 1 - i) * (subFsz + 4)
          if (subtitle.bgEnabled) {
            const tw = ctx.measureText(line).width + 12
            ctx.fillStyle = hexToRgba(subtitle.bgColor, subtitle.bgOpacity)
            ctx.fillRect(centerX - tw / 2, ly - subFsz - 2, tw, subFsz + 8)
          }
          ctx.fillStyle = subtitle.color
          ctx.fillText(line, centerX, ly)
        })
      }
    }

    // Text overlays
    if (textOverlays.length > 0 && vid.currentTime) {
      const t = vid.currentTime
      for (const ov of textOverlays) {
        if (t < ov.start_time || t > ov.end_time) continue
        const fsz = Math.round(ov.font_size * SCALE)
        const fontFam = toCssFontFamily(ov.font_name)
        ctx.font = `700 ${fsz}px '${fontFam}'`
        ctx.textAlign = 'left'; ctx.textBaseline = 'top'
        const x = CV_W * ov.x_pct / 100, y = CV_H * ov.y_pct / 100
        if (ov.bg_enabled) {
          const tw = ctx.measureText(ov.text).width + 8
          ctx.fillStyle = hexToRgba(ov.bg_color, ov.bg_opacity)
          ctx.fillRect(x - 4, y - 2, tw, fsz + 6)
        }
        if (ov.border_width > 0) {
          ctx.strokeStyle = ov.border_color
          ctx.lineWidth = ov.border_width * SCALE
          ctx.strokeText(ov.text, x, y)
        }
        ctx.fillStyle = ov.font_color
        ctx.fillText(ov.text, x, y)
      }
    }

  }

  // Load fonts
  useEffect(() => {
    const fonts = [
      'NanumSquareRoundEB', 'NanumSquareRoundB', 'NanumSquareRoundR',
      'NanumSquareEB', 'NanumSquareB',
      'NanumGothicExtraBold', 'NanumGothicBold', 'NanumGothic',
      'NanumMyeongjoExtraBold', 'NanumMyeongjoBold',
      'NanumBrush', 'NanumPen',
      'Black Han Sans', 'Noto Serif KR', 'Noto Sans KR',
    ]
    for (const f of fonts) {
      document.fonts.load(`900 100px '${f}'`).catch(() => {})
    }
  }, [])

  const videoUrl = selectedRaw?.url || ''

  return (
    <div className="flex flex-col items-center gap-4 w-full h-full">
      {/* Video Canvas */}
      <div className="relative md:bg-surface-container-low md:rounded-2xl md:border md:border-outline-variant/20 overflow-hidden md:p-4 flex items-center justify-center flex-1 w-full">
        <div className="relative group">
          <canvas
            ref={canvasRef as React.RefObject<HTMLCanvasElement>}
            width={CV_W} height={CV_H}
            className="md:rounded-[1.5rem] md:border-4 md:border-outline-variant/40 shadow-2xl cursor-pointer max-h-[75vh] md:max-h-[80vh] w-auto"
            style={{ aspectRatio: '9/16' }}
            onClick={togglePlay}
          />

          {/* Play/Pause overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-[1.5rem] flex flex-col justify-end p-4 pointer-events-none">
            <div className="flex items-center justify-between text-white">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined cursor-pointer pointer-events-auto" onClick={e => { e.stopPropagation(); togglePlay() }}>
                  {isPlaying ? 'pause' : 'play_arrow'}
                </span>
              </div>
              <span className="text-code-sm font-mono">
                {hidVidRef.current ? `${Math.floor(hidVidRef.current.currentTime / 60)}:${String(Math.floor(hidVidRef.current.currentTime % 60)).padStart(2, '0')}` : '0:00'}
              </span>
            </div>
          </div>

          {!selectedRaw && (
            <div className="absolute inset-0 flex items-center justify-center rounded-[1.5rem] bg-surface-container-lowest/80">
              <div className="text-center text-on-surface-variant">
                <span className="material-symbols-outlined text-5xl mb-2 block opacity-30">movie</span>
                <p className="text-label-md">{t.selectVideoToEdit}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Hidden video element */}
      <video
        ref={hidVidRef as React.RefObject<HTMLVideoElement>}
        src={videoUrl}
        className="hidden"
        autoPlay
        playsInline
        loop
        onLoadedMetadata={e => setVideoDuration((e.target as HTMLVideoElement).duration)}
      />
      <video ref={hookVidRef as React.RefObject<HTMLVideoElement>} className="hidden" muted playsInline />
      <audio ref={narrAudioRef as React.RefObject<HTMLAudioElement>} className="hidden" />
    </div>
  )
}
