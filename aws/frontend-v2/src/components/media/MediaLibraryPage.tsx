import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, DownloadInfo, RawInfo, ShortInfo } from '../../services/api'
import GlassPanel from '../ui/GlassPanel'
import Icon from '../ui/Icon'
import ProgressBar from '../ui/ProgressBar'

type Tab = 'downloads' | 'raws' | 'shorts'
type ViewMode = 'grid' | 'list'

const CAT_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  sports:   { bg: 'bg-tertiary/10', text: 'text-tertiary', label: '스포츠' },
  economy:  { bg: 'bg-primary/10', text: 'text-primary', label: '경제' },
  politics: { bg: 'bg-error/10', text: 'text-error', label: '정치' },
}

function fmtDur(sec?: number | null): string {
  if (sec == null) return '--:--'
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function fmtSize(bytes?: number | null): string {
  if (bytes == null) return ''
  if (bytes > 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
  if (bytes > 1e6) return `${(bytes / 1e6).toFixed(0)} MB`
  return `${(bytes / 1e3).toFixed(0)} KB`
}

/* ── Tab Button ──────────────────────────────────────────── */

function TabButton({ active, icon, label, count, onClick }: {
  active: boolean; icon: string; label: string; count: number; onClick: () => void
}) {
  return (
    <button onClick={onClick} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all ${
      active ? 'bg-primary/10 text-primary border border-primary/30' : 'text-on-surface-variant hover:bg-surface-bright/10 border border-transparent'
    }`}>
      <Icon name={icon} size={20} className={active ? 'text-primary' : ''} />
      <span className="text-label-md font-semibold">{label}</span>
      <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${
        active ? 'bg-primary/20 text-primary' : 'bg-surface-variant text-on-surface-variant'
      }`}>{count}</span>
    </button>
  )
}

/* ── Download Card ───────────────────────────────────────── */

function DownloadCard({ item, selected, onToggle, onProcess, onDelete, onPlay, viewMode }: {
  item: DownloadInfo; selected: boolean; onToggle: () => void
  onProcess: () => void; onDelete: () => void; onPlay: () => void; viewMode: ViewMode
}) {
  const cat = CAT_STYLE[item.category] || { bg: 'bg-surface-variant', text: 'text-on-surface-variant', label: item.category }

  if (viewMode === 'list') {
    return (
      <div onClick={onPlay} className="glass-panel rounded-xl p-3 flex items-center gap-3 group hover:border-primary/30 transition-colors cursor-pointer">
        <input type="checkbox" checked={selected} onClick={e => e.stopPropagation()} onChange={onToggle}
          className="w-4 h-4 rounded accent-primary cursor-pointer flex-shrink-0" />
        <div className="w-12 h-12 rounded-lg overflow-hidden bg-surface-container-highest flex-shrink-0">
          {item.thumbnail_url ? (
            <img src={item.thumbnail_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Icon name="videocam" size={20} className="text-outline-variant" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-label-md text-on-surface truncate">{item.filename}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border ${cat.bg} ${cat.text} border-current/20`}>
              {cat.label}
            </span>
            {item.channel_name && (
              <span className="text-code-sm text-on-surface-variant truncate">{item.channel_name}</span>
            )}
            <span className="text-code-sm text-outline">{fmtDur(item.duration)}</span>
          </div>
        </div>
        <button onClick={e => { e.stopPropagation(); onProcess() }}
          className="opacity-0 group-hover:opacity-100 p-2 rounded-lg text-primary hover:bg-primary/10 transition-all">
          <Icon name="auto_awesome" size={18} />
        </button>
        <button onClick={e => { e.stopPropagation(); onDelete() }}
          className="opacity-0 group-hover:opacity-100 p-2 rounded-lg text-error hover:bg-error/10 transition-all">
          <Icon name="delete" size={18} />
        </button>
      </div>
    )
  }

  return (
    <GlassPanel className="rounded-xl overflow-hidden group hover:border-primary/30 transition-colors cursor-pointer" onClick={onPlay}>
      <div className="relative aspect-video bg-surface-container-highest">
        {item.thumbnail_url ? (
          <img src={item.thumbnail_url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Icon name="videocam" size={40} className="text-outline-variant/40" />
          </div>
        )}
        <div className="absolute top-2 left-2">
          <input type="checkbox" checked={selected} onClick={e => e.stopPropagation()} onChange={onToggle}
            className="w-4 h-4 rounded accent-primary cursor-pointer" />
        </div>
        <div className="absolute top-2 right-2">
          <span className="bg-surface-dim/70 backdrop-blur-md text-on-surface text-[10px] px-2 py-1 rounded-md font-bold">
            {fmtDur(item.duration)}
          </span>
        </div>
        <div className="absolute inset-0 bg-primary/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          <button onClick={e => { e.stopPropagation(); onProcess() }} className="bg-primary text-on-primary p-2.5 rounded-full shadow-xl">
            <Icon name="auto_awesome" size={20} />
          </button>
          <button onClick={e => { e.stopPropagation(); onDelete() }} className="bg-error text-on-error p-2.5 rounded-full shadow-xl">
            <Icon name="delete" size={20} />
          </button>
        </div>
      </div>
      <div className="p-3">
        <div className="flex items-center gap-2 mb-1.5">
          <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded border ${cat.bg} ${cat.text} border-current/20`}>
            {cat.label}
          </span>
          {item.channel_name && (
            <div className="flex items-center gap-1 min-w-0">
              {item.channel_thumbnail_url && (
                <img src={item.channel_thumbnail_url} alt="" className="w-3.5 h-3.5 rounded-full" />
              )}
              <span className="text-code-sm text-on-surface-variant truncate">{item.channel_name}</span>
            </div>
          )}
        </div>
        <p className="text-label-md text-on-surface truncate">{item.filename}</p>
      </div>
    </GlassPanel>
  )
}

/* ── Raw / Short Card ────────────────────────────────────── */

function MediaCard({ item, type, selected, onToggle, onSelect, onDelete, viewMode }: {
  item: RawInfo | ShortInfo; type: 'raw' | 'short'; selected: boolean
  onToggle: () => void; onSelect: () => void; onDelete: () => void; viewMode: ViewMode
}) {
  const cat = CAT_STYLE[item.category] || { bg: 'bg-surface-variant', text: 'text-on-surface-variant', label: item.category }
  const duration = 'duration' in item ? (item as RawInfo).duration : null

  if (viewMode === 'list') {
    return (
      <div onClick={onSelect}
        className="glass-panel rounded-xl p-3 flex items-center gap-3 group hover:border-primary/30 transition-colors cursor-pointer">
        <input type="checkbox" checked={selected} onClick={e => e.stopPropagation()} onChange={onToggle}
          className="w-4 h-4 rounded accent-primary cursor-pointer flex-shrink-0" />
        <div className="w-12 h-12 rounded-lg overflow-hidden bg-surface-container-highest flex-shrink-0">
          <video src={`${item.url}#t=1`} className="w-full h-full object-cover" muted />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-label-md text-on-surface truncate">{item.title || item.filename}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border ${cat.bg} ${cat.text} border-current/20`}>
              {cat.label}
            </span>
            {item.channel_name && <span className="text-code-sm text-on-surface-variant truncate">{item.channel_name}</span>}
            {duration != null && <span className="text-code-sm text-outline">{fmtDur(duration)}</span>}
            {type === 'short' && <Icon name="verified" size={14} className="text-tertiary" />}
          </div>
        </div>
        {type === 'short' && (
          <a href={`${item.url}/download`} download={item.filename} onClick={e => e.stopPropagation()}
            className="opacity-0 group-hover:opacity-100 p-2 rounded-lg text-primary hover:bg-primary/10 transition-all">
            <Icon name="download" size={18} />
          </a>
        )}
        <button onClick={e => { e.stopPropagation(); onDelete() }}
          className="opacity-0 group-hover:opacity-100 p-2 rounded-lg text-error hover:bg-error/10 transition-all">
          <Icon name="delete" size={18} />
        </button>
      </div>
    )
  }

  return (
    <GlassPanel className="rounded-xl overflow-hidden group hover:border-primary/30 transition-colors cursor-pointer" onClick={onSelect}>
      <div className="relative aspect-video bg-surface-container-highest">
        <video src={`${item.url}#t=1`} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" muted />
        <div className="absolute top-2 left-2">
          <input type="checkbox" checked={selected} onClick={e => e.stopPropagation()} onChange={onToggle}
            className="w-4 h-4 rounded accent-primary cursor-pointer" />
        </div>
        {duration != null && (
          <div className="absolute top-2 right-2">
            <span className="bg-surface-dim/70 backdrop-blur-md text-on-surface text-[10px] px-2 py-1 rounded-md font-bold">
              {fmtDur(duration)}
            </span>
          </div>
        )}
        {type === 'short' && (
          <div className="absolute bottom-2 left-2">
            <span className="bg-tertiary/20 backdrop-blur-md text-tertiary text-[10px] px-2 py-0.5 rounded-full border border-tertiary/30 font-bold">
              RENDERED
            </span>
          </div>
        )}
        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
          <span className="bg-primary/90 text-on-primary p-3 rounded-full shadow-xl cursor-pointer hover:bg-primary transition-colors">
            <Icon name={type === 'raw' ? 'edit' : 'play_arrow'} size={24} />
          </span>
          <span onClick={e => { e.stopPropagation(); onDelete() }}
            className="bg-error/90 text-on-error p-3 rounded-full shadow-xl cursor-pointer hover:bg-error transition-colors">
            <Icon name="delete" size={24} />
          </span>
        </div>
      </div>
      <div className="p-3">
        <div className="flex items-center gap-2 mb-1.5">
          <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded border ${cat.bg} ${cat.text} border-current/20`}>
            {cat.label}
          </span>
          {item.channel_name && (
            <div className="flex items-center gap-1 min-w-0">
              {item.channel_thumbnail_url && <img src={item.channel_thumbnail_url} alt="" className="w-3.5 h-3.5 rounded-full" />}
              <span className="text-code-sm text-on-surface-variant truncate">{item.channel_name}</span>
            </div>
          )}
        </div>
        <p className="text-label-md text-on-surface truncate">{item.title || item.filename}</p>
      </div>
    </GlassPanel>
  )
}

/* ── Video Player Modal ──────────────────────────────────── */

function VideoPlayerModal({ url, title, downloadUrl, onClose }: {
  url: string; title: string; downloadUrl?: string; onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center" onClick={onClose}>
      <div className="relative max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
        <button onClick={onClose}
          className="absolute -top-10 right-0 text-white/70 hover:text-white">
          <Icon name="close" size={28} />
        </button>
        <div className="rounded-2xl overflow-hidden bg-black shadow-2xl">
          <video src={url} controls autoPlay playsInline className="w-full max-h-[70vh] object-contain" />
        </div>
        <div className="mt-3 flex items-center justify-between">
          <p className="text-label-md text-white truncate flex-1">{title}</p>
          {downloadUrl && (
            <a href={downloadUrl} download
              className="ml-3 bg-primary text-on-primary px-4 py-2 rounded-xl text-label-sm font-bold flex items-center gap-1.5">
              <Icon name="download" size={16} /> Download
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Main Page ───────────────────────────────────────────── */

export default function MediaLibraryPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('downloads')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [downloads, setDownloads] = useState<DownloadInfo[]>([])
  const [raws, setRaws] = useState<RawInfo[]>([])
  const [shorts, setShorts] = useState<ShortInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [processing, setProcessing] = useState(false)
  const [processMsg, setProcessMsg] = useState('')
  const [playingShort, setPlayingShort] = useState<ShortInfo | null>(null)
  const [playingVideo, setPlayingVideo] = useState<{ url: string; title: string } | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [dlRes, rawRes, shortRes] = await Promise.all([
        api.getDownloads(), api.getRaws(), api.getShorts(),
      ])
      setDownloads(dlRes.downloads)
      setRaws(rawRes.raws)
      setShorts(shortRes.shorts)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const toggle = (fn: string) => setSelected(prev => {
    const s = new Set(prev); s.has(fn) ? s.delete(fn) : s.add(fn); return s
  })
  const toggleAll = () => {
    const items = tab === 'downloads' ? downloads.map(d => d.filename) : tab === 'raws' ? raws.map(r => r.filename) : shorts.map(s => s.filename)
    setSelected(prev => prev.size === items.length ? new Set() : new Set(items))
  }

  const handleDeleteSelected = async () => {
    if (selected.size === 0) return
    if (!confirm(`${selected.size}개 항목을 삭제하시겠습니까?`)) return
    const fn = tab === 'downloads' ? api.deleteDownload : tab === 'raws' ? api.deleteRaw : api.deleteShort
    await Promise.all([...selected].map(f => fn(f)))
    setSelected(new Set())
    loadData()
  }

  const handleProcessSelected = async () => {
    const items = downloads.filter(d => selected.has(d.filename))
    if (items.length === 0) return
    setProcessing(true); setProcessMsg('')
    try {
      await api.processSelected(items.map(d => ({ filename: d.filename, category: d.category })))
      setProcessMsg(`${items.length}개 영상 처리 시작`)
      setSelected(new Set())
    } catch (e: any) {
      setProcessMsg(`실패: ${e?.response?.data?.detail || e.message}`)
    } finally { setProcessing(false) }
  }

  const handleDownloadSelected = () => {
    const items = shorts.filter(s => selected.has(s.filename))
    items.forEach((s, i) => {
      setTimeout(() => {
        const a = document.createElement('a')
        a.href = `${s.url}/download`; a.download = s.filename
        document.body.appendChild(a); a.click(); document.body.removeChild(a)
      }, i * 400)
    })
  }

  // Filter by search
  const filterBySearch = <T extends { filename: string; title?: string; channel_name?: string }>(items: T[]) => {
    if (!searchQuery) return items
    const q = searchQuery.toLowerCase()
    return items.filter(i =>
      i.filename.toLowerCase().includes(q) ||
      (i.title && i.title.toLowerCase().includes(q)) ||
      (i.channel_name && i.channel_name.toLowerCase().includes(q))
    )
  }

  const filteredDownloads = filterBySearch(downloads)
  const filteredRaws = filterBySearch(raws)
  const filteredShorts = filterBySearch(shorts)

  const totalSize = downloads.length + raws.length + shorts.length

  return (
    <div className="space-y-6 pb-16 md:pb-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-headline-lg font-bold text-on-surface tracking-tight">Media Library</h1>
          <p className="text-on-surface-variant text-body-md mt-1">
            {totalSize}개 미디어 파일 관리
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative flex-1 sm:w-64">
            <Icon name="search" size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
            <input type="text" placeholder="검색..."
              className="w-full bg-surface-container-low border border-outline-variant/30 rounded-full py-2 pl-9 pr-4 text-label-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/50"
              value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          </div>
          <button onClick={() => loadData()}
            className="p-2.5 rounded-xl bg-surface-container-high hover:bg-surface-bright/30 text-on-surface-variant transition-colors">
            <Icon name="refresh" size={20} />
          </button>
        </div>
      </div>

      {/* Stats Row — desktop only */}
      <div className="hidden md:grid md:grid-cols-3 gap-3">
        <GlassPanel className="rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Icon name="download" size={22} className="text-primary" />
          </div>
          <div>
            <p className="text-headline-lg-mobile font-bold text-primary">{downloads.length}</p>
            <p className="text-label-sm text-on-surface-variant">수집 영상</p>
          </div>
        </GlassPanel>
        <GlassPanel className="rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-secondary-container/10 flex items-center justify-center">
            <Icon name="movie_edit" size={22} className="text-secondary-container" />
          </div>
          <div>
            <p className="text-headline-lg-mobile font-bold text-secondary-container">{raws.length}</p>
            <p className="text-label-sm text-on-surface-variant">편집본</p>
          </div>
        </GlassPanel>
        <GlassPanel className="rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-tertiary/10 flex items-center justify-center">
            <Icon name="auto_awesome" size={22} className="text-tertiary" />
          </div>
          <div>
            <p className="text-headline-lg-mobile font-bold text-tertiary">{shorts.length}</p>
            <p className="text-label-sm text-on-surface-variant">쇼츠</p>
          </div>
        </GlassPanel>
      </div>

      {/* Tabs + View Toggle + Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 overflow-x-auto">
          <TabButton active={tab === 'downloads'} icon="download" label="수집 영상" count={filteredDownloads.length}
            onClick={() => { setTab('downloads'); setSelected(new Set()) }} />
          <TabButton active={tab === 'raws'} icon="movie_edit" label="편집본" count={filteredRaws.length}
            onClick={() => { setTab('raws'); setSelected(new Set()) }} />
          <TabButton active={tab === 'shorts'} icon="auto_awesome" label="쇼츠" count={filteredShorts.length}
            onClick={() => { setTab('shorts'); setSelected(new Set()) }} />
        </div>
        <div className="flex items-center gap-2">
          {/* Bulk Actions */}
          {selected.size > 0 && (
            <div className="flex items-center gap-2 mr-2">
              <span className="text-label-sm text-primary font-bold">{selected.size}개 선택</span>
              {tab === 'downloads' && (
                <button onClick={handleProcessSelected} disabled={processing}
                  className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-label-sm font-bold hover:bg-primary/20 transition-colors disabled:opacity-50">
                  <Icon name="auto_awesome" size={14} className="mr-1 inline" />처리
                </button>
              )}
              {tab === 'shorts' && (
                <button onClick={handleDownloadSelected}
                  className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-label-sm font-bold hover:bg-primary/20 transition-colors">
                  <Icon name="download" size={14} className="mr-1 inline" />다운로드
                </button>
              )}
              <button onClick={handleDeleteSelected}
                className="px-3 py-1.5 rounded-lg bg-error/10 text-error text-label-sm font-bold hover:bg-error/20 transition-colors">
                삭제
              </button>
            </div>
          )}
          {/* Select All */}
          <button onClick={toggleAll}
            className="p-2 rounded-lg text-on-surface-variant hover:bg-surface-bright/10 transition-colors">
            <Icon name={selected.size > 0 ? 'deselect' : 'select_all'} size={20} />
          </button>
          {/* View mode */}
          <div className="flex border border-outline-variant/30 rounded-lg overflow-hidden">
            <button onClick={() => setViewMode('grid')}
              className={`p-2 transition-colors ${viewMode === 'grid' ? 'bg-primary/10 text-primary' : 'text-on-surface-variant hover:bg-surface-bright/10'}`}>
              <Icon name="grid_view" size={18} />
            </button>
            <button onClick={() => setViewMode('list')}
              className={`p-2 transition-colors ${viewMode === 'list' ? 'bg-primary/10 text-primary' : 'text-on-surface-variant hover:bg-surface-bright/10'}`}>
              <Icon name="view_list" size={18} />
            </button>
          </div>
        </div>
      </div>

      {processMsg && (
        <div className={`p-3 rounded-xl text-label-sm font-medium ${
          processMsg.includes('실패') ? 'bg-error-container/20 text-error' : 'bg-tertiary/10 text-tertiary'
        }`}>{processMsg}</div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-on-surface-variant text-label-md">Loading media...</p>
        </div>
      ) : (
        <>
          {/* Downloads */}
          {tab === 'downloads' && (
            filteredDownloads.length === 0 ? (
              <GlassPanel className="rounded-2xl p-16 text-center">
                <Icon name="cloud_download" size={56} className="text-on-surface-variant/20 mx-auto mb-4" />
                <p className="text-title-md text-on-surface mb-2">수집된 영상 없음</p>
                <p className="text-body-md text-on-surface-variant mb-6">채널을 추가하거나 URL로 영상을 다운로드하세요.</p>
                <button onClick={() => navigate('/channels')}
                  className="bg-primary text-on-primary px-6 py-2.5 rounded-xl font-bold text-label-md inline-flex items-center gap-2">
                  <Icon name="add" size={18} /> 채널 추가
                </button>
              </GlassPanel>
            ) : (
              <div className={viewMode === 'grid'
                ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'
                : 'flex flex-col gap-2'
              }>
                {filteredDownloads.map(d => (
                  <DownloadCard key={d.filename} item={d} selected={selected.has(d.filename)}
                    onToggle={() => toggle(d.filename)} viewMode={viewMode}
                    onPlay={() => setPlayingVideo({
                      url: `/api/media/download/${encodeURIComponent(d.filename)}`,
                      title: d.filename,
                    })}
                    onProcess={() => {
                      api.processSelected([{ filename: d.filename, category: d.category }])
                        .then(() => setProcessMsg(`${d.filename} 처리 시작`))
                    }}
                    onDelete={async () => {
                      if (!confirm('삭제하시겠습니까?')) return
                      await api.deleteDownload(d.filename); loadData()
                    }}
                  />
                ))}
              </div>
            )
          )}

          {/* Raws */}
          {tab === 'raws' && (
            filteredRaws.length === 0 ? (
              <GlassPanel className="rounded-2xl p-16 text-center">
                <Icon name="movie_edit" size={56} className="text-on-surface-variant/20 mx-auto mb-4" />
                <p className="text-title-md text-on-surface mb-2">편집본 없음</p>
                <p className="text-body-md text-on-surface-variant">수집된 영상을 처리하면 편집본이 여기에 표시됩니다.</p>
              </GlassPanel>
            ) : (
              <div className={viewMode === 'grid'
                ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'
                : 'flex flex-col gap-2'
              }>
                {filteredRaws.map(r => (
                  <MediaCard key={r.filename} item={r} type="raw" selected={selected.has(r.filename)}
                    onToggle={() => toggle(r.filename)} viewMode={viewMode}
                    onSelect={() => navigate(`/editor/${encodeURIComponent(r.filename)}`)}
                    onDelete={async () => {
                      if (!confirm('삭제하시겠습니까?')) return
                      await api.deleteRaw(r.filename); loadData()
                    }}
                  />
                ))}
              </div>
            )
          )}

          {/* Shorts */}
          {tab === 'shorts' && (
            filteredShorts.length === 0 ? (
              <GlassPanel className="rounded-2xl p-16 text-center">
                <Icon name="auto_awesome" size={56} className="text-on-surface-variant/20 mx-auto mb-4" />
                <p className="text-title-md text-on-surface mb-2">쇼츠 없음</p>
                <p className="text-body-md text-on-surface-variant">편집본을 렌더링하면 쇼츠가 여기에 표시됩니다.</p>
              </GlassPanel>
            ) : (
              <div className={viewMode === 'grid'
                ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'
                : 'flex flex-col gap-2'
              }>
                {filteredShorts.map(s => (
                  <MediaCard key={s.filename} item={s} type="short" selected={selected.has(s.filename)}
                    onToggle={() => toggle(s.filename)} viewMode={viewMode}
                    onSelect={() => setPlayingShort(s)}
                    onDelete={async () => {
                      if (!confirm('삭제하시겠습니까?')) return
                      await api.deleteShort(s.filename); loadData()
                    }}
                  />
                ))}
              </div>
            )
          )}
        </>
      )}

      {/* Video Player Modal — for shorts */}
      {playingShort && (
        <VideoPlayerModal
          url={playingShort.url}
          title={playingShort.title || playingShort.filename}
          downloadUrl={`${playingShort.url}/download`}
          onClose={() => setPlayingShort(null)}
        />
      )}
      {/* Video Player Modal — for downloads/raws */}
      {playingVideo && (
        <VideoPlayerModal
          url={playingVideo.url}
          title={playingVideo.title}
          onClose={() => setPlayingVideo(null)}
        />
      )}
    </div>
  )
}
