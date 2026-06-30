import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react'
import { useEditor } from '../../../contexts/EditorContext'

/* ── Constants ── */
const RULER_H = 18
const SUB_TRACK_H = 44
const SFX_TRACK_H = 12

/* ── Helpers ── */
function formatTime(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = (sec % 60).toFixed(1)
  return `${String(m).padStart(2, '0')}:${s.padStart(4, '0')}`
}

interface DragState {
  type: 'block-left' | 'block-right' | 'block-move' | 'playhead'
  idx: number
  startX: number
  origStart: number
  origEnd: number
}

export default function Timeline() {
  const { hidVidRef, subEntries, setSubEntries, hookSfx, selectedRaw } = useEditor()

  const wrapRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const subEntriesRef = useRef(subEntries)

  const [playheadTime, setPlayheadTime] = useState(0)
  const [selectedIdx, setSelectedIdx] = useState(-1)
  const [zoom, setZoom] = useState(1)
  const [containerWidth, setContainerWidth] = useState(600)
  const [vidDuration, setVidDuration] = useState(0)
  const [tooltip, setTooltip] = useState<{ text: string; x: number } | null>(null)

  // Read duration directly from video element (reliable, no stale context values)
  useEffect(() => {
    const vid = hidVidRef.current
    if (!vid) return
    const update = () => { if (vid.duration && isFinite(vid.duration)) setVidDuration(vid.duration) }
    update()
    vid.addEventListener('loadedmetadata', update)
    vid.addEventListener('durationchange', update)
    return () => {
      vid.removeEventListener('loadedmetadata', update)
      vid.removeEventListener('durationchange', update)
    }
  }, [hidVidRef, selectedRaw])

  // Keep entries ref in sync for drag handlers
  useEffect(() => { subEntriesRef.current = subEntries }, [subEntries])

  // Track container width for auto-fit zoom
  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(es => setContainerWidth(es[0].contentRect.width))
    ro.observe(el)
    setContainerWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  // PPS: at zoom=1, the full video fits in the container
  const dur = vidDuration > 0 ? vidDuration : 60
  const pps = (containerWidth / dur) * zoom
  const totalWidth = Math.max(dur * pps + 40, containerWidth)

  // Time ruler tick interval
  const tickSec = pps < 15 ? 30 : pps < 30 ? 10 : pps < 70 ? 5 : pps < 150 ? 2 : pps < 300 ? 1 : 0.5
  const numTicks = Math.ceil(dur / tickSec) + 1

  /* ── Playhead RAF animation ── */
  useEffect(() => {
    const vid = hidVidRef.current
    if (!vid) return
    let raf: number
    const update = () => {
      setPlayheadTime(vid.currentTime)
      raf = requestAnimationFrame(update)
    }
    raf = requestAnimationFrame(update)
    return () => cancelAnimationFrame(raf)
  }, [hidVidRef, selectedRaw])

  /* ── Auto-scroll to keep playhead visible ── */
  useEffect(() => {
    const el = scrollRef.current
    if (!el || dragRef.current) return
    const px = playheadTime * pps
    const { scrollLeft, clientWidth } = el
    if (px < scrollLeft + 16 || px > scrollLeft + clientWidth - 16) {
      el.scrollLeft = Math.max(0, px - clientWidth / 2)
    }
  }, [playheadTime, pps])

  /* ── Ctrl+Wheel zoom ── */
  const handleWheel = useCallback((e: WheelEvent) => {
    if (!e.ctrlKey) return
    e.preventDefault()
    const factor = e.deltaY < 0 ? 1.3 : 1 / 1.3
    setZoom(prev => Math.max(0.5, Math.min(30, prev * factor)))
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [handleWheel])

  /* ── Global drag handlers ── */
  useEffect(() => {
    const getTooltipX = (clientX: number) => {
      const rect = wrapRef.current?.getBoundingClientRect()
      return rect ? clientX - rect.left : 0
    }

    const onMove = (e: MouseEvent) => {
      const drag = dragRef.current
      if (!drag) return

      if (drag.type === 'playhead') {
        const el = scrollRef.current
        if (!el) return
        const rect = el.getBoundingClientRect()
        const x = e.clientX - rect.left + el.scrollLeft
        const t = Math.max(0, Math.min(dur, x / pps))
        if (hidVidRef.current) hidVidRef.current.currentTime = t
        setTooltip({ text: formatTime(t), x: getTooltipX(e.clientX) })
        return
      }

      const entries = subEntriesRef.current
      const entry = entries[drag.idx]
      if (!entry) return

      const dt = (e.clientX - drag.startX) / pps
      let ns = drag.origStart, ne = drag.origEnd

      if (drag.type === 'block-left') {
        ns = Math.round(Math.max(0, Math.min(ne - 0.1, drag.origStart + dt)) * 10) / 10
        setTooltip({ text: formatTime(ns), x: getTooltipX(e.clientX) })
      } else if (drag.type === 'block-right') {
        ne = Math.round(Math.max(ns + 0.1, Math.min(dur, drag.origEnd + dt)) * 10) / 10
        setTooltip({ text: formatTime(ne), x: getTooltipX(e.clientX) })
      } else {
        const len = ne - ns
        ns = Math.round(Math.max(0, Math.min(dur - len, drag.origStart + dt)) * 10) / 10
        ne = Math.round((ns + len) * 10) / 10
        setTooltip({ text: `${formatTime(ns)} → ${formatTime(ne)}`, x: getTooltipX(e.clientX) })
      }

      setSubEntries(prev => prev.map((en, j) => j === drag.idx ? { ...en, start: ns, end: ne } : en))
    }

    const onUp = () => {
      dragRef.current = null
      setTooltip(null)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [pps, dur, setSubEntries, hidVidRef])

  /* ── Interaction handlers ── */
  const startBlockDrag = (
    e: React.MouseEvent,
    idx: number,
    type: 'block-left' | 'block-right' | 'block-move',
  ) => {
    e.stopPropagation()
    e.preventDefault()
    const entry = subEntries[idx]
    dragRef.current = { type, idx, startX: e.clientX, origStart: entry.start, origEnd: entry.end }
    setSelectedIdx(idx)
    if (type === 'block-move' && hidVidRef.current) hidVidRef.current.currentTime = entry.start
  }

  const startPlayheadDrag = (e: React.MouseEvent) => {
    e.stopPropagation()
    dragRef.current = { type: 'playhead', idx: -1, startX: e.clientX, origStart: 0, origEnd: 0 }
  }

  const handleTimelineClick = (e: React.MouseEvent) => {
    if (dragRef.current) return
    const el = scrollRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const x = e.clientX - rect.left + el.scrollLeft
    const t = Math.max(0, Math.min(dur, x / pps))
    if (hidVidRef.current) hidVidRef.current.currentTime = t
  }

  if (!selectedRaw) return null

  const totalH = RULER_H + SUB_TRACK_H + SFX_TRACK_H + 10

  return (
    <div ref={wrapRef} className="w-full relative">
      <div className="bg-surface-container rounded-xl border border-outline-variant/30 overflow-visible">

        {/* Header bar */}
        <div className="flex items-center justify-between px-3 h-7 border-b border-outline-variant/20 bg-surface-container-low/60 rounded-t-xl">
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-primary" style={{ fontSize: 14 }}>movie_edit</span>
            <span className="text-[10px] font-semibold text-on-surface-variant/70 uppercase tracking-wide">
              자막 타임라인
            </span>
            {subEntries.length > 0 && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-primary/15 text-primary">
                {subEntries.length}
              </span>
            )}
            <span className="text-[9px] text-on-surface-variant/30 ml-1 hidden sm:inline">
              · Ctrl+휠 확대 · 블록 드래그로 구간 편집
            </span>
          </div>
          <div className="flex items-center gap-0.5">
            <button
              onMouseDown={e => e.preventDefault()}
              onClick={() => setZoom(prev => Math.max(0.5, prev / 1.4))}
              className="w-5 h-5 flex items-center justify-center rounded text-on-surface-variant hover:text-primary hover:bg-surface-container-high transition-colors text-[14px] font-bold leading-none"
            >−</button>
            <span className="text-[9px] font-mono text-on-surface-variant/60 w-8 text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onMouseDown={e => e.preventDefault()}
              onClick={() => setZoom(prev => Math.min(30, prev * 1.4))}
              className="w-5 h-5 flex items-center justify-center rounded text-on-surface-variant hover:text-primary hover:bg-surface-container-high transition-colors text-[14px] font-bold leading-none"
            >+</button>
            <button
              onMouseDown={e => e.preventDefault()}
              onClick={() => setZoom(1)}
              title="전체 맞춤"
              className="ml-1 px-1.5 h-5 flex items-center justify-center rounded text-[9px] font-semibold text-on-surface-variant/60 hover:text-primary hover:bg-surface-container-high transition-colors"
            >fit</button>
          </div>
        </div>

        {/* Scrollable timeline */}
        <div
          ref={scrollRef}
          className="overflow-x-auto overflow-y-hidden cursor-crosshair rounded-b-xl"
          style={{ height: totalH }}
          onClick={handleTimelineClick}
        >
          <div className="relative select-none" style={{ width: totalWidth, height: totalH }}>

            {/* ── Time ruler ── */}
            {Array.from({ length: numTicks }).map((_, ti) => {
              const t = ti * tickSec
              const x = t * pps
              return (
                <div key={ti} className="absolute top-0" style={{ left: x }}>
                  <div className="w-px bg-outline-variant/25" style={{ height: 5 }} />
                  <span
                    className="text-[8px] font-mono text-on-surface-variant/35 pl-0.5"
                    style={{ whiteSpace: 'nowrap' }}
                  >
                    {formatTime(t)}
                  </span>
                </div>
              )
            })}

            {/* ── Subtitle track background ── */}
            <div
              className="absolute left-0 bg-surface-container-highest/30 rounded-sm"
              style={{ top: RULER_H, height: SUB_TRACK_H, width: totalWidth }}
            />

            {/* ── Subtitle blocks ── */}
            {subEntries.map((entry, idx) => {
              const x = Math.max(0, entry.start * pps)
              const w = Math.max((entry.end - entry.start) * pps, 6)
              const isSel = idx === selectedIdx
              const overlap = subEntries.some((o, j) =>
                j !== idx && o.start < entry.end && o.end > entry.start
              )

              return (
                <div
                  key={idx}
                  title={entry.text}
                  className={`absolute flex items-center rounded-sm transition-colors cursor-grab active:cursor-grabbing ${
                    isSel
                      ? 'bg-primary z-10 shadow-md shadow-primary/30'
                      : overlap
                        ? 'bg-error/50 hover:bg-error/70'
                        : 'bg-primary/30 hover:bg-primary/50'
                  }`}
                  style={{ left: x, top: RULER_H + 2, width: w, height: SUB_TRACK_H - 4 }}
                  onMouseDown={e => startBlockDrag(e, idx, 'block-move')}
                  onClick={e => { e.stopPropagation(); setSelectedIdx(idx) }}
                >
                  {/* Left resize handle */}
                  <div
                    className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30 rounded-l-sm z-10"
                    onMouseDown={e => startBlockDrag(e, idx, 'block-left')}
                  />

                  {/* Text label */}
                  {w > 24 && (
                    <span className={`text-base font-semibold truncate px-2.5 pointer-events-none leading-tight ${
                      isSel ? 'text-on-primary' : 'text-on-surface'
                    }`}>
                      {entry.text.split('\n')[0].slice(0, 40)}
                    </span>
                  )}

                  {/* Right resize handle */}
                  <div
                    className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30 rounded-r-sm z-10"
                    onMouseDown={e => startBlockDrag(e, idx, 'block-right')}
                  />

                  {/* Overlap indicator */}
                  {overlap && isSel && (
                    <span className="absolute -top-4 left-0 text-[8px] font-bold text-error bg-surface-container border border-error/40 px-1 py-px rounded pointer-events-none whitespace-nowrap z-20">
                      겹침!
                    </span>
                  )}
                </div>
              )
            })}

            {/* ── SFX track ── */}
            {hookSfx.customSfx.map((sfx, i) => (
              <div
                key={`sfx-${i}`}
                className="absolute rounded-sm bg-amber-400/50 border border-amber-400/70"
                style={{
                  left: sfx.time * pps,
                  top: RULER_H + SUB_TRACK_H + 3,
                  width: 3,
                  height: SFX_TRACK_H - 2,
                }}
                title={`SFX @ ${formatTime(sfx.time)}`}
              />
            ))}

            {/* ── Playhead ── */}
            <div
              className="absolute top-0 bottom-0 w-px bg-red-400 z-20 cursor-ew-resize"
              style={{ left: playheadTime * pps }}
              onMouseDown={startPlayheadDrag}
              onClick={e => e.stopPropagation()}
            >
              {/* Draggable head */}
              <div
                className="absolute top-0 left-1/2 -translate-x-1/2 w-3 h-3 bg-red-400 rounded-full cursor-ew-resize shadow-sm"
                style={{ marginTop: -1 }}
              />
              {/* Tail line */}
              <div className="absolute top-2.5 bottom-0 left-0 w-px bg-red-400/60" />
            </div>

          </div>
        </div>
      </div>

      {/* Drag tooltip */}
      {tooltip && (
        <div
          className="absolute bottom-full mb-1.5 px-2 py-0.5 bg-surface-container-high border border-outline-variant/40 rounded-md text-[11px] font-mono text-on-surface shadow-lg z-30 pointer-events-none whitespace-nowrap"
          style={{
            left: Math.min(Math.max(tooltip.x, 30), containerWidth - 30),
            transform: 'translateX(-50%)',
          }}
        >
          {tooltip.text}
        </div>
      )}

      {/* Selected entry info bar */}
      {selectedIdx >= 0 && subEntries[selectedIdx] && (
        <div className="mt-1 flex items-center gap-2 px-2">
          <span className="text-[10px] font-mono text-primary/70">
            {formatTime(subEntries[selectedIdx].start)} → {formatTime(subEntries[selectedIdx].end)}
          </span>
          <span className="text-[10px] text-on-surface-variant/50 truncate flex-1">
            {subEntries[selectedIdx].text.split('\n')[0].slice(0, 50)}
          </span>
          <button
            onClick={() => setSelectedIdx(-1)}
            className="text-[9px] text-on-surface-variant/40 hover:text-on-surface-variant transition-colors"
          >✕</button>
        </div>
      )}
    </div>
  )
}
