import { useState, useEffect } from 'react'
import { api } from '../../../services/api'
import { useEditor } from '../../../contexts/EditorContext'
import { useT } from '../../../i18n'

interface SrtEntry {
  index: string
  times: string
  text: string
}

export default function SrtModal() {
  const { showSrt, setShowSrt, selectedRaw, setSubEntries } = useEditor()
  const t = useT()
  const [entries, setEntries] = useState<SrtEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const stem = selectedRaw?.filename.replace(/_raw\.\w+$/, '') || ''

  useEffect(() => {
    if (!showSrt || !stem) return
    setLoading(true)
    api.getSrt(stem)
      .then(r => setEntries(r.entries))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false))
  }, [showSrt, stem])

  if (!showSrt || !selectedRaw) return null

  const parseSrtTime = (ts: string): number => {
    const s = ts.trim().replace(',', '.')
    const p = s.split(':')
    return (+p[0]) * 3600 + (+p[1]) * 60 + parseFloat(p[2])
  }

  const save = async () => {
    setSaving(true); setMsg('')
    try {
      await api.saveSrt(stem, entries)
      setMsg(t.savedMsg)
      const parsed = entries.map((e, i) => {
        const [startStr, endStr] = e.times.split('-->').map(s => s.trim())
        return { start: parseSrtTime(startStr), end: parseSrtTime(endStr), text: e.text, index: i }
      })
      setSubEntries(parsed)
    } catch {
      setMsg(t.saveFailedMsg)
    } finally {
      setSaving(false)
    }
  }

  const addEntry = () => {
    const idx = entries.length ? String(parseInt(entries[entries.length - 1].index) + 1) : '1'
    setEntries([...entries, { index: idx, times: '00:00:00,000 --> 00:00:00,000', text: '' }])
  }

  const removeEntry = (i: number) => setEntries(entries.filter((_, j) => j !== i))

  const updateEntry = (i: number, patch: Partial<SrtEntry>) => {
    setEntries(entries.map((e, j) => j === i ? { ...e, ...patch } : e))
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) setShowSrt(false) }}
    >
      <div className="bg-surface-container rounded-2xl border border-outline-variant/30 shadow-2xl w-[560px] max-w-[95vw] max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/20">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">closed_caption</span>
            <span className="text-title-md font-bold text-on-surface">{t.editSubtitle}</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={addEntry}
              className="px-3 py-1.5 text-label-sm font-semibold border border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary rounded-lg transition-colors">
              {t.addBtn}
            </button>
            <button onClick={save} disabled={saving}
              className="px-4 py-1.5 text-label-sm font-semibold bg-primary text-on-primary rounded-lg disabled:opacity-50 transition-colors">
              {saving ? t.savingBtn : t.saveBtn}
            </button>
            <button onClick={() => setShowSrt(false)}
              className="w-8 h-8 rounded-full bg-surface-container-high flex items-center justify-center hover:bg-error/10 transition-colors">
              <span className="material-symbols-outlined text-on-surface-variant text-[18px]">close</span>
            </button>
          </div>
        </div>

        {/* Info bar */}
        <div className="px-5 py-2 text-label-sm text-on-surface-variant bg-surface-container-low/50 border-b border-outline-variant/10">
          {t.srtHelp}
        </div>

        {/* Entries */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <p className="text-center text-on-surface-variant py-8">{t.loading}</p>
          ) : entries.length === 0 ? (
            <p className="text-center text-on-surface-variant py-8">{t.noSubtitlesMsg}</p>
          ) : (
            entries.map((e, i) => (
              <div key={i} className="bg-surface-container-lowest border border-outline-variant/30 rounded-xl p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-code-sm text-on-surface-variant min-w-[24px]">{e.index}</span>
                  <input
                    value={e.times}
                    onChange={ev => updateEntry(i, { times: ev.target.value })}
                    className="flex-1 bg-transparent border border-outline-variant text-on-surface rounded-lg px-2 py-1 text-code-sm font-mono focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                  <button onClick={() => removeEntry(i)}
                    className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-error/10 transition-colors">
                    <span className="material-symbols-outlined text-error text-[16px]">close</span>
                  </button>
                </div>
                <textarea
                  value={e.text}
                  rows={2}
                  onChange={ev => updateEntry(i, { text: ev.target.value })}
                  className="w-full bg-transparent border border-outline-variant text-on-surface rounded-lg px-3 py-2 text-body-md resize-vertical focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>
            ))
          )}
        </div>

        {/* Status message */}
        {msg && (
          <div className={`px-5 py-2 text-label-sm border-t border-outline-variant/20 ${
            msg === t.saveFailedMsg ? 'text-error bg-error-container/20' : 'text-tertiary bg-tertiary/10'
          }`}>
            {msg}
          </div>
        )}
      </div>
    </div>
  )
}
