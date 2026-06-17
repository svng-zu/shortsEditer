import { useState, useEffect } from 'react'
import { api, Candidate } from '../../../services/api'
import { useEditor } from '../../../contexts/EditorContext'

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function CandidatesList() {
  const { selectedRaw } = useEditor()
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [activeIdx, setActiveIdx] = useState(0)

  useEffect(() => {
    if (!selectedRaw) return
    const stem = selectedRaw.filename.replace(/_raw\.\w+$/, '')
    api.getFiles().then(files => {
      const analyses = files.analyses || []
      const match = analyses.find((a: string) => a.includes(stem))
      if (!match) return
      return fetch(`/api/analysis/${encodeURIComponent(match)}`).then(r => r.json())
    }).then(data => {
      if (data?.candidates) {
        setCandidates(data.candidates.sort((a: Candidate, b: Candidate) => b.score - a.score))
        setActiveIdx(0)
      }
    }).catch(() => setCandidates([]))
  }, [selectedRaw])

  return (
    <section className="glass-panel p-5 rounded-xl space-y-4 flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-outline-variant/20 pb-2 mb-2">
        <div className="flex items-center gap-2 text-tertiary">
          <span className="material-symbols-outlined">auto_awesome</span>
          <h2 className="text-title-md font-semibold">Candidates</h2>
        </div>
        <span className="bg-surface-container-highest px-2 py-1 rounded text-[10px] font-bold text-on-surface-variant uppercase">
          {candidates.length} Found
        </span>
      </div>

      <div className="space-y-3 overflow-y-auto flex-1 pr-1">
        {candidates.length === 0 ? (
          <div className="text-center py-8 text-on-surface-variant">
            <span className="material-symbols-outlined text-4xl opacity-30 mb-2 block">search_off</span>
            <p className="text-label-md">분석 결과 없음</p>
          </div>
        ) : (
          candidates.map((c, i) => (
            <div key={i} onClick={() => setActiveIdx(i)}
              className={`p-3 rounded-xl relative group cursor-pointer transition-all ${
                i === activeIdx
                  ? 'bg-primary/5 border border-primary/20 hover:bg-primary/10'
                  : 'bg-surface-container-lowest border border-outline-variant/30 hover:border-primary/50 opacity-80'
              }`}>
              <div className="flex justify-between items-start mb-2">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  i === activeIdx
                    ? 'bg-primary text-on-primary'
                    : 'text-on-surface-variant border border-outline-variant'
                }`}>
                  {i === activeIdx ? 'ACTIVE' : 'IDLE'}
                </span>
                <div className="flex items-center gap-1 text-on-surface-variant">
                  <span className="material-symbols-outlined text-[14px]"
                    style={i === activeIdx ? { fontVariationSettings: "'FILL' 1", color: '#4edea3' } : {}}>
                    star
                  </span>
                  <span className="font-bold text-sm">{c.score.toFixed(1)}</span>
                </div>
              </div>
              <p className="text-label-md text-on-surface line-clamp-1">{c.title || c.reason}</p>
              <p className="text-code-sm font-mono text-on-surface-variant mt-1">
                {fmtTime(c.start)} - {fmtTime(c.end)}
              </p>
            </div>
          ))
        )}
      </div>
    </section>
  )
}
