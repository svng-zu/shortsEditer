import { useState, useEffect } from 'react'
import { api, ShortInfo, RawInfo } from '../services/api'

interface Props {
  activeTab: 'raws' | 'shorts'
  selectedShort: ShortInfo | null
  selectedRaw: RawInfo | null
  onUpdateTitle: (filename: string, title: string) => Promise<void>
  onStartPolling: () => void
}

export default function DetailPanel({ activeTab, selectedShort, selectedRaw, onUpdateTitle, onStartPolling }: Props) {
  const [title, setTitle]     = useState('')
  const [origTitle, setOrig]  = useState('')
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)

  const item = activeTab === 'raws' ? selectedRaw : selectedShort
  const candidates = activeTab === 'shorts' && selectedShort?.candidates ? selectedShort.candidates : []

  useEffect(() => {
    if (item) { setTitle(item.title || ''); setOrig(item.title || ''); setSaved(false) }
  }, [item?.filename])

  const isDirty = title !== origTitle

  const handleSave = async () => {
    if (!item || !isDirty) return
    setSaving(true); setSaved(false)
    try {
      await onUpdateTitle(item.filename, title)
      setOrig(title); setSaved(true)
      if (activeTab === 'shorts') { await api.rerender(1); onStartPolling() }
    } finally { setSaving(false) }
  }

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

  return (
    <aside className="card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* 헤더 */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>상세 정보</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* 제목 편집 */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span className="section-label">제목</span>
            {saved && <span style={{ fontSize: 11, color: 'var(--success)', fontWeight: 600 }}>✓ 저장됨</span>}
          </div>
          <textarea
            value={title} rows={4}
            placeholder={item ? '' : '영상을 선택하면 제목이 표시됩니다'}
            onChange={e => { setTitle(e.target.value); setSaved(false) }}
            className="input-field"
            style={{ resize: 'vertical', lineHeight: 1.6, fontSize: 12 }}
          />
          {isDirty && (
            <button onClick={handleSave} disabled={saving} className="btn-primary"
              style={{ marginTop: 8, width: '100%', padding: '8px 0' }}>
              {saving
                ? <><div className="spinner spinner-sm" style={{ borderTopColor: 'white', marginRight: 6 }} />저장 중...</>
                : activeTab === 'shorts' ? '저장 (재렌더링)' : '저장'
              }
            </button>
          )}
        </div>

        {/* 타임라인 */}
        <div>
          <span className="section-label">편집 구간</span>
          {candidates.length === 0
            ? <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
                {item ? '타임라인 정보 없음' : '쇼츠를 선택하면 표시됩니다'}
              </div>
            : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {candidates.map((c, i) => (
                  <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, background: 'var(--surface2)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--primary)', color: 'white', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {c.edit_order || i + 1}
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--primary)' }}>
                        {fmt(c.start)} ~ {fmt(c.end)}
                      </span>
                      {c.score !== undefined && (
                        <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 600, color: 'white', background: c.score >= 80 ? 'var(--success)' : c.score >= 60 ? 'var(--warn)' : 'var(--muted)', padding: '1px 6px', borderRadius: 10 }}>
                          {c.score}점
                        </span>
                      )}
                    </div>
                    {c.score !== undefined && (
                      <div style={{ height: 4, background: '#e8eaed', borderRadius: 2, overflow: 'hidden', marginBottom: 6 }}>
                        <div style={{ height: '100%', width: `${Math.min(c.score, 100)}%`, background: c.score >= 80 ? 'var(--success)' : c.score >= 60 ? 'var(--warn)' : 'var(--primary)', borderRadius: 2 }} />
                      </div>
                    )}
                    {c.reason && <p style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.5 }}>{c.reason}</p>}
                  </div>
                ))}
              </div>
          }
        </div>
      </div>
    </aside>
  )
}
