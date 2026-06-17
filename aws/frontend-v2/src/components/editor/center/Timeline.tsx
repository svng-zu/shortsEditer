import { useEffect, useRef, useState } from 'react'
import { useEditor } from '../../../contexts/EditorContext'

export default function Timeline() {
  const { hidVidRef, videoDuration, subEntries, hookSfx, selectedRaw } = useEditor()
  const containerRef = useRef<HTMLDivElement>(null)
  const [playheadPct, setPlayheadPct] = useState(0)

  useEffect(() => {
    const vid = hidVidRef.current
    if (!vid) return
    const update = () => {
      if (vid.duration) setPlayheadPct((vid.currentTime / vid.duration) * 100)
      requestAnimationFrame(update)
    }
    const raf = requestAnimationFrame(update)
    return () => cancelAnimationFrame(raf)
  }, [hidVidRef, selectedRaw])

  const handleSeek = (e: React.MouseEvent) => {
    const vid = hidVidRef.current
    const el = containerRef.current
    if (!vid || !el || !vid.duration) return
    const rect = el.getBoundingClientRect()
    const pct = (e.clientX - rect.left) / rect.width
    vid.currentTime = pct * vid.duration
  }

  if (!selectedRaw) return null

  const dur = videoDuration || 1

  return (
    <div className="w-full max-w-2xl">
      <div className="bg-surface-container rounded-xl p-3 border border-outline-variant/30 flex items-center gap-3">
        <span className="material-symbols-outlined text-primary text-[20px]">analytics</span>

        <div ref={containerRef} className="flex-1 relative h-10 bg-surface-container-highest rounded cursor-pointer overflow-hidden"
          onClick={handleSeek}>

          {/* Subtitle track */}
          {subEntries.map((entry, i) => {
            const left = (entry.start / dur) * 100
            const width = ((entry.end - entry.start) / dur) * 100
            return (
              <div key={i}
                className="absolute top-0 h-1/3 bg-primary/30 border border-primary/50 rounded-sm"
                style={{ left: `${left}%`, width: `${width}%` }}
                title={entry.text} />
            )
          })}

          {/* SFX track */}
          {hookSfx.customSfx.map((sfx, i) => {
            const left = (sfx.time / dur) * 100
            return (
              <div key={`sfx-${i}`}
                className="absolute top-1/3 h-1/3 w-1 bg-secondary-container border border-secondary/50 rounded-sm"
                style={{ left: `${left}%` }}
                title={`SFX @ ${sfx.time}s`} />
            )
          })}

          {/* Playhead */}
          <div className="absolute top-0 bottom-0 w-0.5 bg-primary z-10 pointer-events-none"
            style={{ left: `${playheadPct}%` }}>
            <div className="w-2 h-2 bg-primary rounded-full -translate-x-[3px] -translate-y-1" />
          </div>
        </div>

        <span className="text-code-sm font-mono text-on-surface-variant min-w-[32px] text-right">
          {Math.floor(dur)}s
        </span>
      </div>
    </div>
  )
}
