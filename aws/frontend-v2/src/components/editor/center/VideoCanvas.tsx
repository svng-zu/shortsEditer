import { useEffect, useRef, useState } from 'react'
import { useEditor, CV_W, CV_H, SCALE, VID_Y_PX, VID_H_PX, TMPL_COLORS } from '../../../contexts/EditorContext'
import { useT } from '../../../i18n'

const FONT_CSS_NAME: Record<string, string> = {
  BlackHanSans: 'Black Han Sans',
  NotoSerifKRBold: 'Noto Serif KR',
  NotoSansKRBold: 'Noto Sans KR',
}
const toCssFontFamily = (key: string) => FONT_CSS_NAME[key] ?? key

function wrapSubtitlePx(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: 1 | 2 = 2): string[] {
  if (ctx.measureText(text).width <= maxWidth) return [text]
  const lines: string[] = []
  let cur = ''
  for (const ch of text) {
    if (ctx.measureText(cur + ch).width > maxWidth && cur) {
      lines.push(cur); cur = ch
    } else { cur += ch }
  }
  if (cur) lines.push(cur)
  if (lines.length <= maxLines) return lines
  const sliced = lines.slice(0, maxLines)
  let last = sliced[maxLines - 1]
  while (last.length > 1 && ctx.measureText(last + '…').width > maxWidth) last = last.slice(0, -1)
  sliced[maxLines - 1] = last + '…'
  return sliced
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
    title, subtitle, setSubtitle, channel, bg, textOverlays, subEntries,
  } = useEditor()
  const t = useT()

  const [showDeadZone, setShowDeadZone] = useState(false)

  const rafRef = useRef<number>(0)
  const avatarImgRef = useRef<HTMLImageElement | null>(null)

  useEffect(() => {
    if (!channel.imageUrl) { avatarImgRef.current = null; return }
    const img = new Image(); img.crossOrigin = 'anonymous'
    img.onload = () => { avatarImgRef.current = img }
    img.src = channel.imageUrl
  }, [channel.imageUrl])

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
    const { selectedRaw: raw, title, subtitle, channel, bg, textOverlays, subEntries } = stateRef.current
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
          ctx.save()
          ctx.filter = 'blur(20px)'
          const scale = Math.max(CV_W / vw, CV_H / vh)
          const sw = vw * scale, sh = vh * scale
          ctx.drawImage(vid, (CV_W - sw) / 2, (CV_H - sh) / 2, sw, sh)
          ctx.filter = 'none'
          ctx.restore()
        }
        const targetW = CV_W, targetH = VID_H_PX
        const srcAsp = vw / vh, dstAsp = targetW / targetH
        let sx = 0, sy = 0, sw = vw, sh = vh
        if (srcAsp > dstAsp) { sw = vh * dstAsp; sx = (vw - sw) / 2 }
        else { sh = vw / dstAsp; sy = (vh - sh) / 2 }
        ctx.drawImage(vid, sx, sy, sw, sh, 0, VID_Y_PX, targetW, targetH)
      }
    }

    // Title — match backend _build_drawtext layout (y_center = TOP_H/2 + 140)
    const lines = [
      { t: title.title1.trim(), c: title.t1Color },
      { t: title.title2.trim(), c: title.t2Color },
    ].filter(l => l.t)
    if (lines.length) {
      const maxLen = Math.max(...lines.map(l => l.t.length))
      let baseFsz = maxLen <= 7 ? 115 : maxLen <= 10 ? 101 : maxLen <= 13 ? 86 : maxLen <= 16 ? 72 : 62
      const sz = Math.max(8, Math.round((baseFsz + title.titleFontSizeDelta) * SCALE))
      const lineH = sz + Math.round(20 * SCALE)
      const yCenter = Math.round((555 / 2 + 140 + title.titleY) * SCALE)
      const startY = yCenter - (lines.length * lineH) / 2
      const fontFam = toCssFontFamily(title.titleFont)
      ctx.textAlign = 'center'; ctx.textBaseline = 'top'
      ctx.font = `900 ${sz}px '${fontFam}','Malgun Gothic',sans-serif`
      ;(ctx as any).letterSpacing = `${(title.titleLetterSpacing ?? -0.5) * SCALE}px`
      const lineBg = [
        { enabled: title.title1BgEnabled, color: title.title1BgColor, opacity: title.title1BgOpacity },
        { enabled: title.title2BgEnabled, color: title.title2BgColor, opacity: title.title2BgOpacity },
      ]
      const bgPadX = Math.round(16 * SCALE)
      const bgRadius = Math.round(8 * SCALE)
      lines.forEach((line, i) => {
        const bg = lineBg[i]
        if (bg?.enabled) {
          const m = ctx.measureText(line.t)
          const asc = m.actualBoundingBoxAscent ?? 0
          const desc = m.actualBoundingBoxDescent ?? sz
          const bgPadY = Math.round(1.5 * SCALE)
          const textTop = startY + i * lineH - asc - bgPadY
          const tw = m.width + bgPadX * 2
          ctx.fillStyle = hexToRgba(bg.color, bg.opacity)
          ctx.beginPath()
          ctx.roundRect(CV_W / 2 - tw / 2, textTop, tw, asc + desc + bgPadY * 2, bgRadius)
          ctx.fill()
        }
      })
      const lineBorderWidths = [title.title1BorderWidth, title.title2BorderWidth]
      const lineBorderColors = [title.title1BorderColor, title.title2BorderColor]
      lines.forEach((line, i) => {
        ctx.shadowColor = 'rgba(0,0,0,0.85)'; ctx.shadowBlur = 3
        const bw = lineBorderWidths[i] ?? 3
        if (bw > 0) {
          ctx.lineWidth = bw * 2 * SCALE
          ctx.lineJoin = 'round'
          ctx.strokeStyle = hexToRgba(lineBorderColors[i] ?? '#000000', 0.85)
          ctx.strokeText(line.t, CV_W / 2, startY + i * lineH)
        }
        ctx.fillStyle = line.c; ctx.fillText(line.t, CV_W / 2, startY + i * lineH)
      })
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0
      ;(ctx as any).letterSpacing = '0px'
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
        const subMaxW = CV_W * 0.9
        const lines = wrapSubtitlePx(ctx, entry.text, subMaxW, subtitle.maxLines)
        const lineH = Math.round(subFsz * 1.35)
        const baseY = VID_Y_PX + VID_H_PX - Math.round(subtitle.y * SCALE) - subFsz - 4
        const centerX = CV_W / 2 + Math.round((subtitle.x ?? 0) * SCALE)

        if (subtitle.bgEnabled) {
          const padX = Math.round(28 * SCALE)
          const padY = Math.round(18 * SCALE)
          const radius = Math.round(14 * SCALE)
          const maxLineW = Math.max(...lines.map(l => ctx.measureText(l).width))
          const boxW = maxLineW + padX * 2
          const boxH = lines.length * lineH - (lineH - subFsz) + padY * 2
          const lastLineY = baseY
          const firstLineY = baseY - (lines.length - 1) * lineH
          const boxX = centerX - boxW / 2
          const boxY = firstLineY - subFsz - padY
          ctx.fillStyle = hexToRgba(subtitle.bgColor, subtitle.bgOpacity)
          ctx.beginPath()
          ctx.roundRect(boxX, boxY, boxW, boxH, radius)
          ctx.fill()
        }

        lines.forEach((line, i) => {
          const ly = baseY - (lines.length - 1 - i) * lineH
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

    // Channel name (bottom)
    const chName = channel.name.trim()
    if (chName) {
      const sz = Math.round(channel.fontsize * SCALE)
      const bottomH = CV_H - (VID_Y_PX + VID_H_PX)
      const cY = VID_Y_PX + VID_H_PX + Math.round((bottomH - sz) / 2) + Math.round(channel.y * SCALE)
      const cX = CV_W / 2 + Math.round(channel.x * SCALE)
      ctx.textAlign = 'center'; ctx.textBaseline = 'top'
      ctx.font = `bold ${sz}px '${toCssFontFamily(subtitle.font)}','Malgun Gothic',sans-serif`
      ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 2
      ctx.fillStyle = hexToRgba(channel.color, 0.75)
      ctx.fillText(chName, cX, cY)
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0
      if (avatarImgRef.current) {
        const avSize = sz * 2
        const tw = ctx.measureText(chName).width
        const avX = cX - tw / 2 - avSize - Math.round(6 * SCALE)
        const avY = cY + (sz - avSize) / 2
        ctx.save()
        ctx.beginPath(); ctx.arc(avX + avSize / 2, avY + avSize / 2, avSize / 2, 0, Math.PI * 2); ctx.clip()
        ctx.drawImage(avatarImgRef.current, avX, avY, avSize, avSize)
        ctx.restore()
      }
    }

    // Channel name (top-left)
    const topLeftText = channel.topLeftText.trim()
    if (topLeftText) {
      const sz = Math.round(channel.topLeftFontsize * SCALE)
      const x = Math.round(channel.topLeftX * SCALE)
      const y = VID_Y_PX + Math.round(channel.topLeftY * SCALE)
      ctx.textAlign = 'left'; ctx.textBaseline = 'top'
      ctx.font = `bold ${sz}px '${toCssFontFamily(subtitle.font)}','Malgun Gothic',sans-serif`
      ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 2
      ctx.fillStyle = channel.topLeftColor
      ctx.fillText(topLeftText, x, y)
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0
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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      e.preventDefault()
      togglePlay()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [togglePlay])

  const videoUrl = selectedRaw?.url || ''

  return (
    <div className="flex flex-col items-center gap-2 w-full h-full">

      {/* ── Display Options Bar ── */}
      <div className="flex items-center gap-3 px-3 py-1.5 rounded-xl bg-surface-container-low/60 border border-outline-variant/20 text-[15px] text-on-surface-variant w-full flex-wrap">
        <span className="material-symbols-outlined text-[16px] text-primary">visibility</span>
        <span className="font-semibold text-on-surface mr-1">표시 옵션</span>

        {/* Dead Zone toggle */}
        <button
          onClick={() => setShowDeadZone(v => !v)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-all ${
            showDeadZone
              ? 'border-red-500/60 bg-red-500/15 text-red-400'
              : 'border-outline-variant/30 hover:border-outline-variant text-on-surface-variant'
          }`}
        >
          <span className={`w-2 h-2 rounded-full ${showDeadZone ? 'bg-red-400' : 'bg-surface-variant'}`} />
          데드존
        </button>

        {/* Subtitle max lines */}
        <div className="flex items-center gap-1.5">
          <span className="text-on-surface-variant">자막 줄 수</span>
          <div className="flex rounded-lg border border-outline-variant/30 overflow-hidden">
            {([1, 2] as const).map(n => (
              <button
                key={n}
                onClick={() => setSubtitle(prev => ({ ...prev, maxLines: n }))}
                className={`px-2.5 py-1 text-[13px] font-semibold transition-all ${
                  subtitle.maxLines === n
                    ? 'bg-primary/20 text-primary'
                    : 'text-on-surface-variant hover:bg-surface-bright/10'
                }`}
              >
                {n}줄
              </button>
            ))}
          </div>
        </div>

      </div>

      {/* ── Video Canvas ── */}
      <div className="relative md:bg-surface-container-low md:rounded-2xl md:border md:border-outline-variant/20 overflow-hidden md:p-4 flex items-center justify-center flex-1 w-full min-h-0">
        <div className="relative group h-full flex items-center justify-center">

          {/* Canvas tight wrapper — overlays are positioned relative to this */}
          <div className="relative h-full" style={{ aspectRatio: '9/16' }}>
            <canvas
              ref={canvasRef as React.RefObject<HTMLCanvasElement>}
              width={CV_W} height={CV_H}
              className="md:rounded-[1.5rem] md:border-4 md:border-outline-variant/40 shadow-2xl cursor-pointer h-full w-full"
              onClick={togglePlay}
            />

            {/* ── Dead Zone Overlay ── */}
            {showDeadZone && (
              <div className="absolute inset-0 pointer-events-none rounded-[1.5rem] overflow-hidden">
                {/* Left strip */}
                <div className="absolute left-0 top-0 bottom-0 bg-red-500/25 border-r border-red-500/50"
                  style={{ width: `${(20 / CV_W) * 100}%` }} />
                {/* Right strip */}
                <div className="absolute right-0 top-0 bottom-0 bg-red-500/25 border-l border-red-500/50"
                  style={{ width: `${(20 / CV_W) * 100}%` }} />
                {/* Labels */}
                <div className="absolute left-0 top-1/2 -translate-y-1/2 flex flex-col items-center"
                  style={{ width: `${(20 / CV_W) * 100}%` }}>
                  <span className="text-red-300 font-bold rotate-90 whitespace-nowrap" style={{ fontSize: 8 }}>DEAD</span>
                </div>
                <div className="absolute right-0 top-1/2 -translate-y-1/2 flex flex-col items-center"
                  style={{ width: `${(20 / CV_W) * 100}%` }}>
                  <span className="text-red-300 font-bold -rotate-90 whitespace-nowrap" style={{ fontSize: 8 }}>DEAD</span>
                </div>
              </div>
            )}


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
      </div>

      {/* Hidden video/audio elements — 절대좌표로 화면 밖에 두어야 브라우저가 프레임을 디코딩함 */}
      <video
        ref={hidVidRef as React.RefObject<HTMLVideoElement>}
        src={videoUrl}
        className="absolute"
        style={{ left: '-9999px', top: 0, width: 1, height: 1 }}
        playsInline
        loop
        onLoadedMetadata={e => setVideoDuration((e.target as HTMLVideoElement).duration)}
      />
      <video ref={hookVidRef as React.RefObject<HTMLVideoElement>} className="hidden" muted playsInline />
      <audio ref={narrAudioRef as React.RefObject<HTMLAudioElement>} className="hidden" />
    </div>
  )
}
