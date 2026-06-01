import { useState, useEffect } from 'react'
import { ShortInfo, RawInfo } from '../services/api'

interface DetailPanelProps {
  selectedShort: ShortInfo | null
  selectedRaw: RawInfo | null
  activeTab: 'raws' | 'shorts'
  onUpdateTitle: (filename: string, title: string) => Promise<void>
}

export default function DetailPanel({
  selectedShort,
  selectedRaw,
  activeTab,
  onUpdateTitle,
}: DetailPanelProps) {
  const [title, setTitle] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const current = activeTab === 'shorts' ? selectedShort : null

  useEffect(() => {
    if (current) {
      setTitle(current.title || '')
      setSaved(false)
    }
  }, [current])

  const handleSave = async () => {
    if (!current) return
    setIsSaving(true)
    try {
      await onUpdateTitle(current.filename, title)
      setSaved(true)
    } finally {
      setIsSaving(false)
    }
  }

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    return `${m}:${String(s).padStart(2, '0')}`
  }

  return (
    <div className="bg-surface border-l border-border flex flex-col overflow-hidden">
      <div className="px-4 py-3 font-bold text-[11px] tracking-wider uppercase text-muted border-b border-border">
        상세 정보
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Title Section */}
        <div className="p-4 border-b border-border">
          <div className="text-[10px] font-bold tracking-wide uppercase text-muted mb-2">
            제목
            {saved && <span className="text-success ml-2">✓ 저장됨</span>}
          </div>
          <textarea
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              setSaved(false)
            }}
            placeholder="쇼츠를 선택하면 제목이 표시됩니다"
            rows={3}
            className="w-full bg-surface2 border border-border rounded-lg p-3 text-sm text-white resize-y"
          />
          {current && title !== current.title && (
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="mt-2 w-full py-2 bg-accent text-black font-bold text-xs rounded-lg"
            >
              {isSaving ? '저장 중...' : '저장 (재편집 시 반영)'}
            </button>
          )}
        </div>

        {/* Timeline Section */}
        <div className="p-4">
          <div className="text-[10px] font-bold tracking-wide uppercase text-muted mb-2">
            편집 구간 타임라인
          </div>

          {current?.candidates && current.candidates.length > 0 ? (
            <div className="space-y-2">
              {current.candidates.map((c, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 py-2 border-b border-border last:border-b-0"
                >
                  <div className="w-5 h-5 rounded-full bg-accent text-black text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5">
                    {c.edit_order || i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] text-accent font-bold">
                      {formatTime(c.start)} ~ {formatTime(c.end)}
                    </div>
                    <div className="text-[11px] text-muted mt-0.5 leading-relaxed">
                      {c.reason}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted">
              <p className="text-[11px]">
                쇼츠를 선택하면
                <br />
                타임라인이 표시됩니다.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
