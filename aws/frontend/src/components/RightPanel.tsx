import { useState, useEffect } from 'react'
import { api, ShortInfo, RawInfo } from '../services/api'

interface Props {
  activeTab: 'raws' | 'shorts'
  selectedRaw: RawInfo | null
  selectedShort: ShortInfo | null
  onUpdateTitle: (filename: string, title: string) => Promise<void>
  onStartPolling: () => void
  [key: string]: unknown
}

export default function RightPanel({ activeTab, selectedRaw, selectedShort, onUpdateTitle, onStartPolling }: Props) {
  const [title, setTitle]       = useState('')
  const [origTitle, setOrigTitle] = useState('')
  const [saving,  setSaving]    = useState(false)
  const [saved,   setSaved]     = useState(false)

  const item = activeTab === 'raws' ? selectedRaw : selectedShort

  useEffect(() => {
    if (item) {
      setTitle(item.title || '')
      setOrigTitle(item.title || '')
      setSaved(false)
    }
  }, [item])

  const isDirty = title !== origTitle

  const handleSave = async () => {
    if (!item || !isDirty) return
    setSaving(true); setSaved(false)
    try {
      await onUpdateTitle(item.filename, title)
      setOrigTitle(title); setSaved(true)
      // 재렌더링 (완성 쇼츠일 때)
      if (activeTab === 'shorts') {
        await api.rerender(1)
        onStartPolling()
      }
    } finally { setSaving(false) }
  }

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
  const candidates = (selectedShort?.candidates ?? (activeTab === 'raws' ? [] : []))

  return (
    <aside style={{
      width: 280, flexShrink: 0,
      background: 'var(--surface)', borderLeft: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* 헤더 */}
      <div style={{ padding: '14px 16px 10px', fontWeight: 700, fontSize: 13, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--muted)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        상세 정보
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>

        {/* ① 제목 편집 */}
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--muted)' }}>
            제목
            {saved && <span style={{ color: '#3ddc84', fontSize: 12 }}>✓ 저장됨</span>}
          </div>
          <textarea
            value={title}
            rows={3}
            placeholder={item ? '' : '선택하면 제목이 표시됩니다'}
            onChange={e => { setTitle(e.target.value); setSaved(false) }}
            style={{
              width: '100%',
              background: 'var(--surface2)', border: '1px solid var(--border)',
              borderRadius: 8, padding: '10px 12px',
              color: 'var(--text)', fontFamily: "'Noto Sans KR', sans-serif",
              fontSize: 15, lineHeight: 1.6, resize: 'vertical', outline: 'none',
              transition: 'border-color .2s',
            }}
            onFocus={e => { e.target.style.borderColor = 'var(--accent)' }}
            onBlur={e => { e.target.style.borderColor = 'var(--border)' }}
          />
          {isDirty && (
            <button onClick={handleSave} disabled={saving}
              style={{
                display: 'block', marginTop: 6, width: '100%',
                padding: '7px 0', background: saving ? 'var(--border)' : 'var(--accent)',
                color: saving ? 'var(--muted)' : '#000', border: 'none',
                borderRadius: 7, fontFamily: "'Noto Sans KR', sans-serif",
                fontWeight: 700, fontSize: 14, cursor: saving ? 'not-allowed' : 'pointer',
              }}>
              {saving ? '저장 중...' : activeTab === 'shorts' ? '저장 (재편집 시 반영)' : '저장'}
            </button>
          )}
        </div>

        {/* ② 편집 구간 타임라인 */}
        <div style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 10 }}>
            편집 구간 타임라인
          </div>
          {candidates.length === 0
            ? <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--muted)', fontSize: 13, lineHeight: 1.6 }}>
                {item ? '타임라인 정보 없음' : '쇼츠를 선택하면\n타임라인이 표시됩니다.'}
              </div>
            : candidates.map((c, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--accent)', color: '#000', fontSize: 12, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                    {c.edit_order || i + 1}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {c.title && (
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>
                        "{c.title}"
                      </div>
                    )}
                    <div style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 700 }}>
                      {fmt(c.start)} ~ {fmt(c.end)}
                      {c.score !== undefined && <span style={{ color: 'var(--muted)', fontWeight: 400, marginLeft: 6 }}>{c.score}점</span>}
                    </div>
                    {c.score !== undefined && (
                      <div style={{ height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden', margin: '4px 0' }}>
                        <div style={{ height: '100%', background: 'var(--accent)', borderRadius: 2, width: `${Math.min(c.score, 100)}%` }} />
                      </div>
                    )}
                    {c.reason && <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2, lineHeight: 1.4 }}>{c.reason}</div>}
                  </div>
                </div>
              ))
          }
        </div>

      </div>
    </aside>
  )
}
