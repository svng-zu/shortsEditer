import { useState } from 'react'
import { api } from '../../../services/api'
import { useEditor } from '../../../contexts/EditorContext'

function fmtDuration(sec?: number | null): string {
  if (sec == null) return ''
  const m = Math.floor(sec / 60), s = Math.round(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

const CAT_COLORS: Record<string, string> = {
  sports: 'bg-tertiary/10 text-tertiary border-tertiary/20',
  economy: 'bg-secondary-container/10 text-secondary-fixed-dim border-secondary-fixed/20',
  politics: 'bg-error/10 text-error border-error/20',
}

const CB = "w-4 h-4 rounded cursor-pointer flex-shrink-0"
const CB_STYLE = { accentColor: '#adc6ff' }

export default function MediaList() {
  const { activeTab, setActiveTab, raws, shorts, setSelectedRaw, setSelectedShort, refreshLists } = useEditor()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkMsg, setBulkMsg] = useState('')

  const items = activeTab === 'raws' ? raws : shorts
  const toggleItem = (fn: string) => setSelected(prev => {
    const s = new Set(prev); s.has(fn) ? s.delete(fn) : s.add(fn); return s
  })
  const toggleAll = () => setSelected(prev =>
    prev.size === items.length ? new Set() : new Set(items.map(i => i.filename))
  )

  const handleDelete = async () => {
    if (selected.size === 0) return
    if (!confirm(`${selected.size}개 항목을 삭제하시겠습니까?`)) return
    setBulkMsg('삭제 중...')
    const fn = activeTab === 'raws' ? api.deleteRaw : api.deleteShort
    await Promise.all([...selected].map(f => fn(f).catch(() => {})))
    setSelected(new Set())
    setBulkMsg('')
    refreshLists()
  }

  const handleDownload = async () => {
    if (selected.size === 0) return
    setBulkMsg(`${selected.size}개 다운로드 중...`)
    for (const filename of selected) {
      const item = items.find(i => i.filename === filename)
      if (!item) continue
      try {
        const a = document.createElement('a')
        a.href = item.url
        a.download = filename
        a.target = '_blank'
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        await new Promise(r => setTimeout(r, 300))
      } catch {}
    }
    setBulkMsg('')
  }

  const handleSelect = (item: typeof items[0]) => {
    if (activeTab === 'raws') setSelectedRaw(item as any)
    else setSelectedShort(item as any)
  }

  return (
    <section className="glass-panel rounded-xl flex flex-col overflow-hidden flex-1">
      {/* Tab Header */}
      <div className="flex border-b border-outline-variant/20">
        {(['raws', 'shorts'] as const).map(tab => (
          <button key={tab} onClick={() => { setActiveTab(tab); setSelected(new Set()) }}
            className={`flex-1 py-3 text-label-md font-bold transition-colors ${
              activeTab === tab
                ? 'text-primary border-b-2 border-primary'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}>
            {tab === 'raws' ? '✂️ Raws' : '🎬 Shorts'}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      {items.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-2 bg-surface-container-low/50 border-b border-outline-variant/10">
          <input type="checkbox"
            checked={selected.size === items.length && items.length > 0}
            onChange={toggleAll}
            className={CB} style={CB_STYLE} />
          <span className="text-label-sm text-on-surface-variant flex-1">
            {bulkMsg || (selected.size > 0 ? `${selected.size}개 선택` : '전체 선택')}
          </span>
          {selected.size > 0 && (
            <div className="flex gap-1">
              <button onClick={handleDownload}
                className="text-label-sm px-3 py-1 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
                다운로드
              </button>
              <button onClick={handleDelete}
                className="text-label-sm px-3 py-1 rounded-lg bg-error/10 text-error hover:bg-error/20 transition-colors">
                삭제
              </button>
            </div>
          )}
        </div>
      )}

      {/* Item List */}
      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="text-center py-12 text-on-surface-variant">
            <span className="material-symbols-outlined text-4xl opacity-30 mb-2 block">
              {activeTab === 'raws' ? 'movie_edit' : 'auto_awesome'}
            </span>
            <p className="text-label-md">{activeTab === 'raws' ? '편집된 영상 없음' : '쇼츠 없음'}</p>
          </div>
        ) : (
          items.map(item => (
            <div key={item.filename}
              className={`flex items-center gap-3 px-4 py-3 border-b border-outline-variant/10 hover:bg-surface-bright/5 cursor-pointer transition-colors ${
                selected.has(item.filename) ? 'bg-primary/5' : ''
              }`}
              onClick={() => handleSelect(item)}>
              <input type="checkbox"
                checked={selected.has(item.filename)}
                onClick={e => e.stopPropagation()}
                onChange={() => toggleItem(item.filename)}
                className={CB} style={CB_STYLE} />

              <div className="w-10 h-10 rounded-lg bg-surface-container-highest overflow-hidden flex-shrink-0 flex items-center justify-center">
                <video src={`${item.url}#t=1`} className="w-full h-full object-cover" muted />
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-label-md text-on-surface truncate">
                  {item.title || item.filename}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  {'category' in item && item.category && (
                    <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border ${CAT_COLORS[item.category] || 'text-on-surface-variant'}`}>
                      {item.category}
                    </span>
                  )}
                  {'duration' in item && item.duration != null && (
                    <span className="text-code-sm text-on-surface-variant">{fmtDuration(item.duration as number)}</span>
                  )}
                </div>
              </div>

              <span className="material-symbols-outlined text-outline text-[18px]">chevron_right</span>
            </div>
          ))
        )}
      </div>
    </section>
  )
}
