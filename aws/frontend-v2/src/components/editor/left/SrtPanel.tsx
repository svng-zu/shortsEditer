import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '../../../services/api'
import { useEditor } from '../../../contexts/EditorContext'

function secToSrtTime(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  const ms = Math.round((sec % 1) * 1000)
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')},${String(ms).padStart(3,'0')}`
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = (sec % 60).toFixed(1)
  return `${String(m).padStart(2,'0')}:${s.padStart(4,'0')}`
}

export default function SrtPanel() {
  const { selectedRaw, subEntries, setSubEntries, hidVidRef, setShowSrt } = useEditor()
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [currentTime, setCurrentTime] = useState(0)
  const activeRef = useRef<HTMLDivElement>(null)
  const textareaRefs = useRef<(HTMLTextAreaElement | null)[]>([])
  const focusAfterSplitRef = useRef<{ idx: number; pos: number } | null>(null)
  const msgTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const stem = selectedRaw?.filename.replace(/_raw\.\w+$/, '') || ''

  // Track video time for active subtitle highlight
  useEffect(() => {
    const vid = hidVidRef.current
    if (!vid) return
    const update = () => setCurrentTime(vid.currentTime)
    vid.addEventListener('timeupdate', update)
    return () => vid.removeEventListener('timeupdate', update)
  }, [hidVidRef])

  const activeIndex = subEntries.findIndex(e => currentTime >= e.start && currentTime <= e.end)

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [activeIndex])

  // Focus the new entry after split
  useEffect(() => {
    if (!focusAfterSplitRef.current) return
    const { idx, pos } = focusAfterSplitRef.current
    focusAfterSplitRef.current = null
    requestAnimationFrame(() => {
      const el = textareaRefs.current[idx]
      if (el) { el.focus(); el.setSelectionRange(pos, pos) }
    })
  }, [subEntries])

  const seekToEntry = (i: number) => {
    if (hidVidRef.current) hidVidRef.current.currentTime = subEntries[i].start
  }

  const updateText = (i: number, text: string) => {
    setSubEntries(prev => prev.map((e, j) => j === i ? { ...e, text } : e))
  }

  // Split on Enter: proportionally divide time between before/after text
  const splitEntry = useCallback((idx: number, cursorPos: number, fullText: string) => {
    const before = fullText.slice(0, cursorPos).trim()
    const after = fullText.slice(cursorPos).trim()
    if (!before || !after) return false

    setSubEntries(prev => {
      const entry = prev[idx]
      const ratio = before.length / (before.length + after.length)
      const splitTime = Math.round((entry.start + (entry.end - entry.start) * ratio) * 100) / 100

      return [
        ...prev.slice(0, idx),
        { ...entry, end: splitTime, text: before },
        { index: entry.index + 1, start: splitTime, end: entry.end, text: after },
        ...prev.slice(idx + 1).map(e => ({ ...e, index: e.index + 1 })),
      ]
    })

    focusAfterSplitRef.current = { idx: idx + 1, pos: 0 }
    return true
  }, [setSubEntries])

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>, i: number) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      splitEntry(i, e.currentTarget.selectionStart, e.currentTarget.value)
    }
  }

  const addEntry = () => {
    const last = subEntries[subEntries.length - 1]
    const start = last ? last.end : 0
    setSubEntries(prev => [...prev, { index: prev.length, start, end: start + 2, text: '' }])
    requestAnimationFrame(() => {
      const el = textareaRefs.current[subEntries.length]
      el?.focus()
    })
  }

  const removeEntry = (i: number) => {
    setSubEntries(prev => prev.filter((_, j) => j !== i).map((e, j) => ({ ...e, index: j })))
  }

  // Save: convert numeric subEntries back to SRT string format
  const save = async () => {
    setSaving(true); setMsg('')
    try {
      const srtEntries = subEntries.map((e, i) => ({
        index: String(i + 1),
        times: `${secToSrtTime(e.start)} --> ${secToSrtTime(e.end)}`,
        text: e.text,
      }))
      await api.saveSrt(stem, srtEntries)
      setMsg('저장 완료!')
    } catch {
      setMsg('저장 실패')
    } finally {
      setSaving(false)
      if (msgTimerRef.current) clearTimeout(msgTimerRef.current)
      msgTimerRef.current = setTimeout(() => setMsg(''), 3000)
    }
  }

  return (
    <div className="glass-panel rounded-2xl flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant/20 shrink-0">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary" style={{ fontSize: 20 }}>closed_caption</span>
          <span className="text-label-md font-bold text-on-surface">자막 텍스트 편집</span>
          {subEntries.length > 0 && (
            <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-primary/15 text-primary">
              {subEntries.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={addEntry}
            className="px-2.5 py-1 text-[12px] font-semibold border border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary rounded-lg transition-colors"
          >
            + 추가
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="px-3 py-1 text-[12px] font-semibold bg-primary text-on-primary rounded-lg disabled:opacity-50 transition-colors"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
          <button
            onClick={() => setShowSrt(false)}
            className="w-7 h-7 rounded-full bg-surface-container-high flex items-center justify-center hover:bg-error/10 transition-colors"
          >
            <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: 16 }}>close</span>
          </button>
        </div>
      </div>

      {/* Hint */}
      <div className="px-4 py-2 text-[11px] text-on-surface-variant/60 bg-surface-container-low/40 border-b border-outline-variant/10 shrink-0">
        <span className="font-semibold text-primary/70">Enter</span> = 자막 분할 &nbsp;·&nbsp;
        <span className="font-semibold text-primary/70">Shift+Enter</span> = 줄바꿈 &nbsp;·&nbsp;
        구간 조절은 아래 타임라인에서
      </div>

      {/* Status */}
      {msg && (
        <div className={`px-4 py-1.5 text-[12px] shrink-0 ${
          msg.includes('실패') ? 'text-error bg-error/10' : 'text-tertiary bg-tertiary/10'
        }`}>
          {msg}
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {subEntries.length === 0 ? (
          <div className="text-center py-16 text-on-surface-variant text-label-sm">
            자막이 없습니다
          </div>
        ) : (
          subEntries.map((e, i) => {
            const isActive = i === activeIndex

            return (
              <div
                key={i}
                ref={isActive ? activeRef : undefined}
                className={`rounded-xl p-3 border transition-all cursor-pointer ${
                  isActive
                    ? 'border-primary/60 bg-primary/10 shadow-sm shadow-primary/10'
                    : 'border-outline-variant/20 bg-surface-container-lowest hover:border-outline-variant/40'
                }`}
                onClick={() => seekToEntry(i)}
              >
                {/* Time range (read-only — edit via center timeline) */}
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-md ${
                    isActive
                      ? 'bg-primary/20 text-primary'
                      : 'bg-surface-variant text-on-surface-variant'
                  }`}>
                    {formatTime(e.start)} → {formatTime(e.end)}
                  </span>
                  {isActive && (
                    <span className="text-[10px] font-bold text-primary uppercase tracking-wider animate-pulse">
                      ▶ 재생 중
                    </span>
                  )}
                  <button
                    onClick={ev => { ev.stopPropagation(); removeEntry(i) }}
                    className="ml-auto w-5 h-5 rounded-full flex items-center justify-center hover:bg-error/20 transition-colors"
                  >
                    <span className="material-symbols-outlined text-error" style={{ fontSize: 13 }}>close</span>
                  </button>
                </div>

                {/* Text */}
                <textarea
                  ref={el => { textareaRefs.current[i] = el }}
                  value={e.text}
                  rows={2}
                  onClick={ev => ev.stopPropagation()}
                  onKeyDown={ev => handleTextareaKeyDown(ev, i)}
                  onChange={ev => updateText(i, ev.target.value)}
                  className={`w-full bg-transparent rounded-lg px-2 py-1.5 text-body-md resize-none focus:outline-none transition-colors ${
                    isActive
                      ? 'text-on-surface border border-primary/30 focus:border-primary/60'
                      : 'text-on-surface border border-transparent focus:border-outline-variant'
                  }`}
                />
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
