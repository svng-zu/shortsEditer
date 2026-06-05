import { useState, useEffect, useCallback } from 'react'
import { api, ShortInfo, RawInfo, StyleParams, Candidate } from '../services/api'
import YouTubeUploadModal from './YouTubeUploadModal'

interface Props {
  activeTab: 'raws' | 'shorts'
  onTabChange: (t: 'raws' | 'shorts') => void
  raws: RawInfo[]
  shorts: ShortInfo[]
  selectedRaw: RawInfo | null
  selectedShort: ShortInfo | null
  onSelectRaw: (r: RawInfo) => void
  onSelectShort: (s: ShortInfo) => void
  onRefresh: () => void
  onStartPolling: () => void
  onUpdateTitle: (filename: string, title: string) => Promise<void>
  mobile?: boolean
  [key: string]: unknown
}

const DEFAULT_STYLE: StyleParams = {
  title1_color: '#FFD700', title2_color: '#FFFFFF',
  title_y_extra: 0, title_fontsize_scale: 1.0,
  sub_fontsize: 66, sub_color: '#FFFFFF', sub_margin_v: 110,
  font_name: 'NanumSquareRoundEB',
}
const FONTS = [
  { value: 'NanumSquareRoundEB', label: '나눔스퀘어 라운드 EB' },
  { value: 'NanumSquareRoundB',  label: '나눔스퀘어 라운드 B' },
  { value: 'NanumSquareB',       label: '나눔스퀘어 Bold' },
  { value: 'NanumGothicBold',    label: '나눔고딕 Bold' },
]

export default function EditorWorkspace(props: Props) {
  const { activeTab, onTabChange, raws, shorts, selectedRaw, selectedShort,
          onSelectRaw, onSelectShort, onRefresh, onStartPolling, onUpdateTitle } = props

  /* ── 데스크탑: 3분할 고정 레이아웃 ── */
  return (
    <>
      {/* PC (lg+): height 100%, 내부 스크롤 */}
      <main className="hidden lg:flex flex-1 overflow-hidden p-5">
        <div className="flex-1 flex bg-white rounded-2xl" style={{ overflow: 'hidden' }}>
          {/* 좌: 영상 목록 */}
          <div className="w-52 shrink-0 flex flex-col border-r border-slate-100 overflow-hidden">
            <Tabs activeTab={activeTab} onTabChange={onTabChange} raws={raws} shorts={shorts} />
            <div className="flex-1 overflow-y-auto">
              {activeTab === 'raws'
                ? <RawList raws={raws} selected={selectedRaw} onSelect={onSelectRaw} />
                : <ShortList shorts={shorts} selected={selectedShort} onSelect={onSelectShort} onRefresh={onRefresh} />
              }
            </div>
          </div>

          {/* 우: 프리뷰(상단 고정) + 설정(하단 스크롤) */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {activeTab === 'raws'
              ? <RawPanel raw={selectedRaw} onStartPolling={onStartPolling} desktop />
              : <ShortPanel short={selectedShort} onUpdateTitle={onUpdateTitle} desktop />
            }
          </div>
        </div>
      </main>

      {/* 모바일 (< lg): 자연 흐름, 외부 컨테이너가 스크롤 */}
      <div className="lg:hidden">
        {/* 탭 */}
        <div className="bg-white mx-4 mt-4 rounded-2xl overflow-hidden">
          <Tabs activeTab={activeTab} onTabChange={onTabChange} raws={raws} shorts={shorts} />
        </div>

        {/* 프리뷰 + 설정 */}
        <div className="mt-3">
          {activeTab === 'raws'
            ? <RawPanel raw={selectedRaw} onStartPolling={onStartPolling} desktop={false} />
            : <ShortPanel short={selectedShort} onUpdateTitle={onUpdateTitle} desktop={false} />
          }
        </div>
      </div>
    </>
  )
}

/* ── 공통 탭 헤더 ── */
function Tabs({ activeTab, onTabChange, raws, shorts }: {
  activeTab: 'raws' | 'shorts', onTabChange: (t: 'raws' | 'shorts') => void,
  raws: RawInfo[], shorts: ShortInfo[]
}) {
  return (
    <div className="flex shrink-0 border-b border-slate-100">
      {(['raws', 'shorts'] as const).map(tab => (
        <button key={tab} onClick={() => onTabChange(tab)}
          className={`flex-1 py-3 text-xs font-semibold transition-colors border-b-2 ${
            activeTab === tab ? 'border-violet-500 text-violet-600' : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}>
          {tab === 'raws' ? '편집 영상' : '완성 쇼츠'}
          <span className={`ml-1 text-[10px] px-1.5 py-0.5 rounded-full ${
            activeTab === tab ? 'bg-violet-100 text-violet-600' : 'bg-slate-100 text-slate-400'
          }`}>{tab === 'raws' ? raws.length : shorts.length}</span>
        </button>
      ))}
    </div>
  )
}

/* ── 영상 목록 ── */
function RawList({ raws, selected, onSelect }: { raws: RawInfo[], selected: RawInfo | null, onSelect: (r: RawInfo) => void }) {
  if (!raws.length) return (
    <div className="flex flex-col items-center justify-center h-32 p-4 text-slate-400 text-center">
      <div className="text-2xl mb-1 opacity-20">🎞</div>
      <p className="text-xs">영상 편집을 먼저 실행하세요.</p>
    </div>
  )
  return (
    <div className="p-2 space-y-1">
      {raws.map(r => (
        <button key={r.filename} onClick={() => onSelect(r)}
          className={`w-full text-left p-2.5 rounded-xl border transition-all ${
            selected?.filename === r.filename ? 'border-violet-400 bg-violet-50' : 'border-transparent hover:bg-slate-50 hover:border-slate-200'
          }`}>
          <div className="text-xs font-medium text-slate-700 line-clamp-2 mb-1">{r.title || r.filename}</div>
          <CategoryPill category={r.category} />
        </button>
      ))}
    </div>
  )
}

function ShortList({ shorts, selected, onSelect, onRefresh }: {
  shorts: ShortInfo[], selected: ShortInfo | null, onSelect: (s: ShortInfo) => void, onRefresh: () => void
}) {
  const [uploadTarget, setUploadTarget] = useState<ShortInfo | null>(null)
  const handleDelete = async (fn: string, e: React.MouseEvent) => {
    e.stopPropagation(); if (!confirm(`삭제?`)) return
    await api.deleteShort(fn); onRefresh()
  }
  if (!shorts.length) return (
    <div className="flex flex-col items-center justify-center h-32 p-4 text-slate-400 text-center">
      <div className="text-2xl mb-1 opacity-20">🎬</div>
      <p className="text-xs">렌더링 후 표시됩니다.</p>
    </div>
  )
  return (
    <>
      {uploadTarget && <YouTubeUploadModal filename={uploadTarget.filename} defaultTitle={uploadTarget.title} onClose={() => setUploadTarget(null)} />}
      <div className="p-2 space-y-1">
        {shorts.map(s => (
          <button key={s.filename} onClick={() => onSelect(s)}
            className={`w-full text-left p-2 rounded-xl border transition-all ${
              selected?.filename === s.filename ? 'border-violet-400 bg-violet-50' : 'border-transparent hover:bg-slate-50'
            }`}>
            <div className="flex gap-2">
              <div className="w-9 h-14 bg-slate-900 rounded-lg overflow-hidden shrink-0">
                <video src={`${s.url}#t=1`} className="w-full h-full object-cover" muted />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-slate-700 line-clamp-2 mb-1">{s.title || s.filename}</div>
                <CategoryPill category={s.category} />
                <div className="flex gap-1 mt-1">
                  <a href={s.url} download={s.filename} onClick={e => e.stopPropagation()}
                    className="text-[9px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-600">다운</a>
                  <button onClick={e => { e.stopPropagation(); setUploadTarget(s) }}
                    className="text-[9px] px-1.5 py-0.5 rounded bg-red-100 text-red-600">YT</button>
                  <button onClick={e => handleDelete(s.filename, e)}
                    className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-400 ml-auto">삭제</button>
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </>
  )
}

/* ── Raw 편집 패널 ── */
function RawPanel({ raw, onStartPolling, desktop }: { raw: RawInfo | null, onStartPolling: () => void, desktop: boolean }) {
  const [title, setTitle]             = useState('')
  const [subtitles, setSubtitles]     = useState(false)
  const [templateId, setTemplateId]   = useState(1)
  const [style, setStyle]             = useState<StyleParams>({ ...DEFAULT_STYLE })
  const [bgList, setBgList]           = useState<string[]>([])
  const [bgImage, setBgImage]         = useState<string | undefined>(undefined)
  const [srtEntries, setSrtEntries]   = useState<{ index: string; times: string; text: string }[]>([])
  const [srtLoading, setSrtLoading]   = useState(false)
  const [previewUrl, setPreviewUrl]   = useState<string | null>(null)
  const [previewing, setPreviewing]   = useState(false)
  const [isRendering, setIsRendering] = useState(false)

  useEffect(() => { if (raw) setTitle(raw.title || '') }, [raw])
  useEffect(() => { api.getBackgrounds().then(r => setBgList(r.backgrounds)).catch(() => {}) }, [])
  useEffect(() => {
    if (!subtitles || !raw) { setSrtEntries([]); return }
    const stem = raw.filename.replace('_raw.mp4', '')
    setSrtLoading(true)
    api.getSrt(stem).then(r => setSrtEntries(r.entries)).catch(() => setSrtEntries([])).finally(() => setSrtLoading(false))
  }, [subtitles, raw])

  const updateStyle = (p: Partial<StyleParams>) => setStyle(prev => ({ ...prev, ...p }))

  const handlePreview = useCallback(async () => {
    if (!raw || previewing) return
    setPreviewing(true)
    try {
      const blob = await api.preview(raw.filename, title, style, 2.0, bgImage)
      setPreviewUrl(URL.createObjectURL(blob))
    } finally { setPreviewing(false) }
  }, [raw, title, style, bgImage, previewing])

  const handleRender = async () => {
    if (!raw || isRendering) return
    setIsRendering(true)
    try { await api.render(raw.filename, title || raw.title, subtitles, templateId, style, bgImage); onStartPolling() }
    finally { setIsRendering(false) }
  }

  if (!raw) return (
    <div className={`flex flex-col items-center justify-center text-slate-400 ${desktop ? 'flex-1' : 'py-16'}`}>
      <div className="text-4xl mb-3 opacity-20">▶</div>
      <p className="text-sm">왼쪽에서 영상을 선택하세요</p>
    </div>
  )

  const previewSection = (
    <div className="bg-slate-50 border-b border-slate-200 p-4 flex flex-col items-center gap-3">
      <div className="w-full flex items-center gap-2">
        <CategoryPill category={raw.category} />
        <span className="text-xs text-slate-600 font-medium truncate flex-1">{raw.title || raw.filename}</span>
      </div>
      <div className="flex justify-center">
        {previewUrl ? (
          <div className="relative">
            <img src={previewUrl} alt="preview" className="rounded-2xl shadow-lg max-h-64 object-contain" />
            <button onClick={() => setPreviewUrl(null)}
              className="absolute top-2 right-2 w-6 h-6 bg-black/50 text-white rounded-full text-xs flex items-center justify-center">✕</button>
          </div>
        ) : (
          <div className="bg-black rounded-2xl overflow-hidden shadow-lg" style={{ aspectRatio: '9/16', maxHeight: 240, width: 'auto' }}>
            <video key={raw.url} src={raw.url} controls className="h-full w-auto object-contain" style={{ maxHeight: 240 }} />
          </div>
        )}
      </div>
      <button onClick={handlePreview} disabled={previewing}
        className={`w-full py-2 rounded-xl border-2 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
          previewing ? 'border-slate-200 text-slate-400' : 'border-violet-300 text-violet-600 hover:bg-violet-50'
        }`}>
        {previewing ? <><div className="spinner" />생성 중...</> : '🖼 프리뷰 생성'}
      </button>
    </div>
  )

  const settingsSection = (
    <div className="p-4 space-y-5">
      {/* 제목 */}
      <S title="영상 제목">
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder={raw.title || '제목 입력...'}
          className="w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-all" />
      </S>
      {/* 자막 */}
      <S title="자막">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-slate-600">자막 포함</span>
          <Toggle value={subtitles} onChange={setSubtitles} />
        </div>
        {subtitles && (srtLoading
          ? <p className="text-xs text-slate-400 text-center py-2">로딩 중...</p>
          : srtEntries.length > 0 ? (
            <>
              <div className="max-h-40 overflow-y-auto space-y-1.5 mb-2">
                {srtEntries.map((e, i) => (
                  <div key={i} className="bg-slate-50 rounded-lg p-2 border border-slate-200">
                    <div className="text-[10px] text-slate-400 font-mono mb-0.5">{e.times}</div>
                    <textarea value={e.text} rows={1} onChange={ev => {
                      const u = [...srtEntries]; u[i] = { ...e, text: ev.target.value }; setSrtEntries(u)
                    }} className="w-full text-xs text-slate-700 bg-transparent resize-none focus:outline-none" />
                  </div>
                ))}
              </div>
              <button onClick={async () => { const stem = raw.filename.replace('_raw.mp4', ''); await api.saveSrt(stem, srtEntries) }}
                className="w-full py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-600 hover:border-violet-400 hover:text-violet-600 transition-all">
                자막 저장
              </button>
            </>
          ) : <p className="text-xs text-slate-400 text-center py-2">자막 생성 단계를 먼저 실행하세요.</p>
        )}
      </S>
      {/* 배경 */}
      <S title="배경 이미지">
        <div className="grid grid-cols-4 gap-1.5">
          <button onClick={() => setBgImage(undefined)}
            className={`aspect-square rounded-lg border-2 text-[10px] font-semibold transition-all ${
              !bgImage ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-slate-200 text-slate-400'
            }`}>기본</button>
          {bgList.map(bg => (
            <button key={bg} onClick={() => setBgImage(bg)}
              className={`aspect-square rounded-lg border-2 overflow-hidden transition-all ${
                bgImage === bg ? 'border-violet-500 ring-2 ring-violet-200' : 'border-slate-200'
              }`}>
              <img src={`/static/backgrounds/${bg}.png`} alt={bg} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      </S>
      {/* 스타일 */}
      <S title="스타일">
        <div className="grid grid-cols-2 gap-1 mb-3">
          {FONTS.map(f => (
            <button key={f.value} onClick={() => updateStyle({ font_name: f.value })}
              className={`py-1.5 px-2 rounded-lg border text-[11px] font-medium transition-all ${
                style.font_name === f.value ? 'border-violet-400 bg-violet-50 text-violet-700' : 'border-slate-200 text-slate-500'
              }`}>{f.label}</button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 mb-3">
          <ColorRow label="제목 색상 1" value={style.title1_color} onChange={v => updateStyle({ title1_color: v })} />
          <ColorRow label="제목 색상 2" value={style.title2_color} onChange={v => updateStyle({ title2_color: v })} />
        </div>
        <SliderRow label="제목 크기" display={`${Math.round(style.title_fontsize_scale * 100)}%`}
          min={0.5} max={1.5} step={0.05} val={style.title_fontsize_scale} onChange={v => updateStyle({ title_fontsize_scale: v })} />
        {subtitles && <>
          <SliderRow label="자막 크기" display={`${style.sub_fontsize}px`}
            min={30} max={88} step={2} val={style.sub_fontsize} onChange={v => updateStyle({ sub_fontsize: v })} />
          <SliderRow label="자막 위치" display={`${style.sub_margin_v}px`}
            min={20} max={250} step={10} val={style.sub_margin_v} onChange={v => updateStyle({ sub_margin_v: v })} />
        </>}
      </S>
      {/* 템플릿 */}
      <S title="템플릿">
        <div className="grid grid-cols-3 gap-1.5">
          {[{ id: 1, label: '다크' }, { id: 2, label: '화이트' }, { id: 3, label: '네이비' }].map(t => (
            <button key={t.id} onClick={() => setTemplateId(t.id)}
              className={`py-2 rounded-lg text-xs font-semibold border transition-all ${
                templateId === t.id ? 'border-violet-400 bg-violet-50 text-violet-700' : 'border-slate-200 text-slate-500'
              }`}>{t.label}</button>
          ))}
        </div>
      </S>
      {/* 렌더링 */}
      <button onClick={handleRender} disabled={isRendering}
        className={`w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${
          isRendering ? 'bg-slate-100 text-slate-400' : 'bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-200'
        }`}>
        {isRendering ? <><div className="spinner" />렌더링 중...</> : '▶  렌더링 시작'}
      </button>
    </div>
  )

  if (desktop) return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="shrink-0">{previewSection}</div>
      <div className="flex-1 overflow-y-auto">{settingsSection}</div>
    </div>
  )

  // 모바일: 자연 흐름
  return (
    <div className="mx-4 mb-4 bg-white rounded-2xl overflow-hidden">
      {previewSection}
      {settingsSection}
    </div>
  )
}

/* ── Short 편집 패널 ── */
function ShortPanel({ short, onUpdateTitle, desktop }: {
  short: ShortInfo | null, onUpdateTitle: (f: string, t: string) => Promise<void>, desktop: boolean
}) {
  const [title, setTitle]       = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [saved, setSaved]       = useState(false)
  useEffect(() => { if (short) { setTitle(short.title || ''); setSaved(false) } }, [short])
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

  if (!short) return (
    <div className={`flex flex-col items-center justify-center text-slate-400 ${desktop ? 'flex-1' : 'py-16 mx-4'}`}>
      <div className="text-4xl mb-3 opacity-20">🎬</div>
      <p className="text-sm">쇼츠를 선택하세요</p>
    </div>
  )

  const previewSection = (
    <div className="bg-slate-50 border-b border-slate-200 p-4 flex flex-col items-center gap-3">
      <div className="w-full flex items-center gap-2">
        <CategoryPill category={short.category} />
        <span className="text-xs text-slate-600 font-medium truncate flex-1">{short.title}</span>
        <a href={short.url} download={short.filename}
          className="text-[10px] px-2 py-1 rounded-lg bg-slate-200 hover:bg-violet-100 text-slate-600 hover:text-violet-600 font-medium shrink-0">⬇</a>
      </div>
      <div className="bg-black rounded-2xl overflow-hidden shadow-lg" style={{ aspectRatio: '9/16', maxHeight: 240, width: 'auto' }}>
        <video key={short.url} src={short.url} controls className="h-full w-auto object-contain" style={{ maxHeight: 240 }} />
      </div>
    </div>
  )

  const editSection = (
    <div className="p-4 space-y-4">
      <S title="제목 편집">
        <div className="flex justify-end mb-1">
          {saved && <span className="text-xs text-green-600 font-medium">✓ 저장됨</span>}
        </div>
        <textarea value={title} onChange={e => { setTitle(e.target.value); setSaved(false) }} rows={3}
          className="w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 resize-none" />
        {title !== short.title && (
          <button onClick={async () => { setIsSaving(true); try { await onUpdateTitle(short.filename, title); setSaved(true) } finally { setIsSaving(false) } }}
            disabled={isSaving}
            className="mt-2 w-full py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2">
            {isSaving ? <><div className="spinner" />저장 중...</> : '저장'}
          </button>
        )}
      </S>
      {short.candidates && short.candidates.length > 0 && (
        <S title="편집 구간">
          {short.candidates.map((c, i) => <CandidateCard key={i} candidate={c} index={i} fmt={fmt} />)}
        </S>
      )}
    </div>
  )

  if (desktop) return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="shrink-0">{previewSection}</div>
      <div className="flex-1 overflow-y-auto">{editSection}</div>
    </div>
  )
  return (
    <div className="mx-4 mb-4 bg-white rounded-2xl overflow-hidden">
      {previewSection}
      {editSection}
    </div>
  )
}

/* ── 공통 헬퍼 ── */
function S({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">{title}</h3>{children}</div>
}
function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)} className={`relative w-11 h-6 rounded-full transition-colors ${value ? 'bg-violet-600' : 'bg-slate-200'}`}>
      <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${value ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  )
}
function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-slate-500 mb-1">{label}</label>
      <div className="flex items-center gap-1.5">
        <input type="color" value={value} onChange={e => onChange(e.target.value)}
          className="w-9 h-8 rounded-lg border border-slate-300 cursor-pointer p-0.5" />
        <span className="text-[10px] text-slate-400 font-mono">{value}</span>
      </div>
    </div>
  )
}
function SliderRow({ label, display, min, max, step, val, onChange }: {
  label: string; display: string; min: number; max: number; step: number; val: number; onChange: (v: number) => void
}) {
  return (
    <div className="mb-3">
      <div className="flex justify-between text-[11px] mb-1">
        <span className="font-semibold text-slate-500">{label}</span>
        <span className="font-bold text-violet-600">{display}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={val}
        onChange={e => onChange(parseFloat(e.target.value))} className="w-full accent-violet-600" />
    </div>
  )
}
function CandidateCard({ candidate: c, index, fmt }: { candidate: Candidate; index: number; fmt: (s: number) => string }) {
  return (
    <div className="rounded-xl border border-slate-200 p-3 bg-slate-50 mb-2">
      <div className="flex items-center gap-2 mb-1.5">
        <div className="w-5 h-5 rounded-md bg-violet-600 text-white text-[10px] font-black flex items-center justify-center shrink-0">{c.edit_order || index + 1}</div>
        <span className="text-xs font-bold text-violet-700 tabular-nums">{fmt(c.start)} – {fmt(c.end)}</span>
        {c.score !== undefined && <span className="ml-auto text-[11px] text-slate-400">{c.score}점</span>}
      </div>
      {c.score !== undefined && <div className="h-1 bg-slate-200 rounded-full overflow-hidden mb-1.5"><div className="h-full bg-violet-500 rounded-full" style={{ width: `${Math.min(c.score, 100)}%` }} /></div>}
      <p className="text-[11px] text-slate-500 leading-relaxed">{c.reason}</p>
    </div>
  )
}
function CategoryPill({ category }: { category: string }) {
  const s: Record<string, string> = { sports: 'bg-blue-100 text-blue-600', economy: 'bg-emerald-100 text-emerald-600', politics: 'bg-pink-100 text-pink-600' }
  const l: Record<string, string> = { sports: '스포츠', economy: '경제', politics: '정치' }
  if (!category) return null
  return <span className={`inline-block text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase ${s[category] ?? 'bg-slate-100 text-slate-500'}`}>{l[category] ?? category}</span>
}
