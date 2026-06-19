import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { api, DownloadInfo, RawInfo, ShortInfo, PipelineStatus } from '../../services/api'
import { useT } from '../../i18n'
import GlassPanel from '../ui/GlassPanel'
import Icon from '../ui/Icon'
import Badge from '../ui/Badge'
import Button from '../ui/Button'
import Input from '../ui/Input'
import ProgressBar from '../ui/ProgressBar'

/* ── Types ───────────────────────────────────────────────── */

interface Channel {
  url: string
  category: string
  thumbnail_url?: string
}

interface DownloadStatus {
  status: string
  message: string
  filename: string | null
  error: string | null
}

type Category = 'economy' | 'politics' | 'sports'
type ActiveTab = 'manage' | 'downloads' | 'raws' | 'shorts'
type ViewMode = 'grid' | 'list'

function getCategories(t: ReturnType<typeof useT>): { value: Category; label: string }[] {
  return [
    { value: 'economy', label: t.categoryEconomy },
    { value: 'politics', label: t.categoryPolitics },
    { value: 'sports', label: t.categorySports },
  ]
}

/* ── Helpers (Channels) ──────────────────────────────────── */

function extractChannelName(url: string): string {
  try {
    const u = new URL(url)
    const parts = u.pathname.split('/').filter(Boolean)
    // /@channelName or /c/channelName or /channel/id
    if (parts[0]?.startsWith('@')) return parts[0]
    if (parts.length >= 2) return parts[1]
    return u.hostname
  } catch {
    return url.slice(0, 30)
  }
}

function categoryBadgeVariant(cat: string): 'sports' | 'economy' | 'politics' | 'tech' {
  if (cat === 'sports') return 'sports'
  if (cat === 'economy') return 'economy'
  if (cat === 'politics') return 'politics'
  return 'tech'
}

function statusPillStyle(status: string): string {
  switch (status) {
    case 'done':
    case 'complete':
      return 'bg-tertiary/10 text-tertiary'
    case 'downloading':
    case 'processing':
      return 'bg-primary/10 text-primary'
    case 'error':
    case 'failed':
      return 'bg-error/10 text-error'
    default:
      return 'bg-surface-container-highest text-on-surface-variant'
  }
}

/* ── Helpers (Media) ─────────────────────────────────────── */

const CAT_STYLE: Record<string, { bg: string; text: string }> = {
  sports:   { bg: 'bg-tertiary/10', text: 'text-tertiary' },
  economy:  { bg: 'bg-primary/10', text: 'text-primary' },
  politics: { bg: 'bg-error/10', text: 'text-error' },
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

/* ── Add New Channel Form ────────────────────────────────── */

function AddChannelForm({ onAdded }: { onAdded: () => void }) {
  const t = useT()
  const [url, setUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim()) return

    setError(null)
    setSubmitting(true)
    try {
      await api.addChannel(url.trim(), 'sports')
      setUrl('')
      onAdded()
    } catch (err: any) {
      setError(err?.response?.data?.detail || t.failedAddChannel)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <GlassPanel className="rounded-2xl p-6">
      <div className="flex items-center gap-3 mb-5">
        <Icon name="add_circle" size={24} className="text-primary" />
        <h3 className="text-title-md text-on-surface">{t.addNewChannel}</h3>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          label={t.channelUrlLabel}
          placeholder={t.channelUrlPlaceholder}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />

        {error && (
          <p className="text-label-sm text-error">{error}</p>
        )}

        <Button variant="ghost" type="submit" disabled={submitting || !url.trim()}>
          <Icon name="save" size={18} />
          {submitting ? t.saving : t.saveToPipeline}
        </Button>
      </form>
    </GlassPanel>
  )
}

/* ── Global Collection Settings ──────────────────────────── */

function CollectionSettings({
  clearExisting,
  setClearExisting,
  limitPerChannel,
  setLimitPerChannel,
}: {
  clearExisting: boolean
  setClearExisting: (v: boolean) => void
  limitPerChannel: number
  setLimitPerChannel: (v: number) => void
}) {
  const t = useT()
  return (
    <GlassPanel className="rounded-2xl p-6">
      <div className="flex items-center gap-3 mb-5">
        <Icon name="settings" size={24} className="text-tertiary" />
        <h3 className="text-title-md text-on-surface">{t.globalSettings}</h3>
      </div>

      <div className="flex flex-col gap-5">
        {/* Clear existing toggle */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-label-md text-on-surface">{t.clearExisting}</p>
            <p className="text-label-sm text-on-surface-variant">{t.clearExistingDesc}</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={clearExisting}
            onClick={() => setClearExisting(!clearExisting)}
            className={`
              relative w-12 h-7 rounded-full transition-colors duration-200 shrink-0
              ${clearExisting ? 'bg-primary' : 'bg-surface-container-highest'}
            `}
          >
            <span
              className={`
                absolute top-1 left-1 w-5 h-5 rounded-full bg-white transition-transform duration-200
                ${clearExisting ? 'translate-x-5' : 'translate-x-0'}
              `}
            />
          </button>
        </div>

        {/* Limit per channel */}
        <div>
          <label className="text-label-sm text-on-surface-variant block mb-1.5">
            {t.limitPerChannel}
          </label>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={1}
              max={50}
              value={limitPerChannel}
              onChange={(e) => setLimitPerChannel(Math.max(1, parseInt(e.target.value) || 1))}
              className="
                bg-surface-container-lowest border border-outline-variant/50 rounded-xl
                px-4 py-3 text-on-surface text-body-md w-24
                focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none
                transition-colors
              "
            />
            <span className="text-label-sm text-on-surface-variant">{t.items}</span>
          </div>
        </div>
      </div>
    </GlassPanel>
  )
}

/* ── Channel Card ────────────────────────────────────────── */

function ChannelCard({
  channel,
  onDelete,
}: {
  channel: Channel
  onDelete: () => void
}) {
  const t = useT()
  const [deleting, setDeleting] = useState(false)
  const channelName = extractChannelName(channel.url)

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await api.removeChannel(channel.url)
      onDelete()
    } catch {
      // Ignore delete errors
    } finally {
      setDeleting(false)
    }
  }

  // Generate a subtle gradient based on category
  const gradientMap: Record<string, string> = {
    economy: 'from-amber-900/30 to-transparent',
    politics: 'from-rose-900/30 to-transparent',
    sports: 'from-emerald-900/30 to-transparent',
  }
  const gradient = gradientMap[channel.category] || 'from-blue-900/30 to-transparent'

  return (
    <GlassPanel className="rounded-2xl overflow-hidden group relative">
      {/* Banner */}
      <div className={`h-32 bg-gradient-to-br ${gradient} relative`}>
        {channel.thumbnail_url && (
          <img
            src={channel.thumbnail_url}
            alt=""
            className="w-full h-full object-cover opacity-30"
            loading="lazy"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[rgba(22,27,34,0.95)] via-transparent to-transparent" />

        {/* Delete button — hover reveal */}
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="
            absolute top-3 right-3 p-1.5 rounded-lg
            bg-error/10 text-error opacity-0 group-hover:opacity-100
            hover:bg-error/20 transition-all
          "
          title={t.removeChannel}
        >
          <Icon name="delete" size={18} />
        </button>
      </div>

      {/* Content */}
      <div className="p-4 -mt-8 relative z-10">
        {/* Avatar + Name */}
        <div className="flex items-center gap-3 mb-3">
          <div className="w-12 h-12 rounded-full bg-surface-container-highest border-2 border-surface-container flex items-center justify-center shrink-0">
            {channel.thumbnail_url ? (
              <img
                src={channel.thumbnail_url}
                alt={channelName}
                className="w-full h-full rounded-full object-cover"
              />
            ) : (
              <Icon name="person" size={24} className="text-on-surface-variant/50" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-label-md text-on-surface font-semibold truncate">
              {channelName}
            </p>
            <Badge variant={categoryBadgeVariant(channel.category)} className="mt-1">
              {channel.category}
            </Badge>
          </div>
        </div>

        {/* Bottom stats */}
        <div className="flex items-center justify-between text-label-sm text-on-surface-variant pt-3 border-t border-outline-variant/20">
          <span>{t.latestFetch}</span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-tertiary inline-block" />
            {t.active}
          </span>
        </div>
      </div>
    </GlassPanel>
  )
}

/* ── URL Direct Download ─────────────────────────────────── */

function UrlDirectDownload({ onComplete }: { onComplete: () => void }) {
  const t = useT()
  const [url, setUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [dlStatus, setDlStatus] = useState<DownloadStatus | null>(null)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [])

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
  }, [])

  const startPolling = useCallback(() => {
    stopPolling()
    pollingRef.current = setInterval(async () => {
      try {
        const res = await api.getDownloadUrlStatus()
        setDlStatus(res)

        if (res.status === 'downloading' || res.status === 'processing') {
          // Simulate progress since API may not provide exact progress
          setProgress((prev) => Math.min(prev + 5, 90))
        }

        if (res.status === 'done' || res.status === 'complete') {
          setProgress(100)
          stopPolling()
          onComplete()
        }

        if (res.status === 'error' || res.status === 'failed') {
          setError(res.error || t.failedDownload)
          stopPolling()
        }
      } catch {
        // Ignore polling errors
      }
    }, 2000)
  }, [stopPolling, onComplete])

  const handleDownload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim()) return

    setError(null)
    setDlStatus(null)
    setProgress(0)
    setSubmitting(true)

    try {
      // First check video info
      await api.getVideoInfo(url.trim())
      // Start download
      await api.downloadUrl(url.trim(), 'sports')
      setDlStatus({ status: 'pending', message: t.startingDownload, filename: null, error: null })
      startPolling()
    } catch (err: any) {
      setError(err?.response?.data?.detail || t.failedStartDownload)
    } finally {
      setSubmitting(false)
    }
  }

  const isDownloading = dlStatus != null && dlStatus.status !== 'done' && dlStatus.status !== 'complete' && dlStatus.status !== 'error' && dlStatus.status !== 'failed'

  return (
    <GlassPanel className="rounded-2xl p-6 bg-primary/5">
      <div className="flex items-center gap-3 mb-5">
        <Icon name="download" size={24} className="text-primary" />
        <h3 className="text-title-md text-on-surface">{t.urlDirectDownload}</h3>
        <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
          {t.fastTrack}
        </span>
      </div>

      <form onSubmit={handleDownload} className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="flex-1">
          <Input
            placeholder={t.urlPlaceholder}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </div>
        <Button
          variant="primary"
          type="submit"
          disabled={submitting || isDownloading || !url.trim()}
          className="shrink-0"
        >
          <Icon name="download" size={18} />
          {submitting ? t.starting : t.download}
        </Button>
      </form>

      {error && (
        <p className="text-label-sm text-error mb-3">{error}</p>
      )}

      {/* Status tracker */}
      {dlStatus && (
        <div className="glass-panel rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <Icon name="video_file" size={20} className="text-on-surface-variant shrink-0" />
              <span className="text-label-md text-on-surface truncate">
                {dlStatus.filename || t.preparing}
              </span>
            </div>
            <span
              className={`
                text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded
                ${statusPillStyle(dlStatus.status)}
              `}
            >
              {dlStatus.status === 'done' || dlStatus.status === 'complete'
                ? t.done
                : dlStatus.status === 'error' || dlStatus.status === 'failed'
                  ? t.failed
                  : dlStatus.status === 'downloading'
                    ? t.downloading
                    : t.pending}
            </span>
          </div>

          <ProgressBar
            progress={progress}
            color={
              dlStatus.status === 'error' || dlStatus.status === 'failed'
                ? 'secondary'
                : dlStatus.status === 'done' || dlStatus.status === 'complete'
                  ? 'tertiary'
                  : 'primary'
            }
            glow={isDownloading}
          />
        </div>
      )}
    </GlassPanel>
  )
}

/* ── Download Card ───────────────────────────────────────── */

function DownloadCard({ item, selected, onToggle, onProcess, onDelete, onPlay, viewMode }: {
  item: DownloadInfo; selected: boolean; onToggle: () => void
  onProcess: () => void; onDelete: () => void; onPlay: () => void; viewMode: ViewMode
}) {
  const t = useT()
  const cat = CAT_STYLE[item.category] || { bg: 'bg-surface-variant', text: 'text-on-surface-variant' }
  const catLabelText = item.category === 'sports' ? t.catSports : item.category === 'economy' ? t.catEconomy : item.category === 'politics' ? t.catPolitics : item.category

  if (viewMode === 'list') {
    return (
      <div onClick={onPlay} className="glass-panel rounded-xl p-3 flex items-center gap-3 group hover:border-primary/30 transition-colors cursor-pointer">
        <input type="checkbox" checked={selected} onClick={e => e.stopPropagation()} onChange={onToggle}
          className="w-4 h-4 rounded cursor-pointer flex-shrink-0" style={{ accentColor: '#adc6ff' }} />
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
              {catLabelText}
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
            className="w-4 h-4 rounded cursor-pointer" style={{ accentColor: '#adc6ff' }} />
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
            {catLabelText}
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
  const t = useT()
  const cat = CAT_STYLE[item.category] || { bg: 'bg-surface-variant', text: 'text-on-surface-variant' }
  const catLabelText = item.category === 'sports' ? t.catSports : item.category === 'economy' ? t.catEconomy : item.category === 'politics' ? t.catPolitics : item.category
  const duration = 'duration' in item ? (item as RawInfo).duration : null

  if (viewMode === 'list') {
    return (
      <div onClick={onSelect}
        className="glass-panel rounded-xl p-3 flex items-center gap-3 group hover:border-primary/30 transition-colors cursor-pointer">
        <input type="checkbox" checked={selected} onClick={e => e.stopPropagation()} onChange={onToggle}
          className="w-4 h-4 rounded cursor-pointer flex-shrink-0" style={{ accentColor: '#adc6ff' }} />
        <div className="w-12 h-12 rounded-lg overflow-hidden bg-surface-container-highest flex-shrink-0">
          <video src={`${item.url}#t=1`} className="w-full h-full object-cover" muted />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-label-md text-on-surface truncate">{item.title || item.filename}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border ${cat.bg} ${cat.text} border-current/20`}>
              {catLabelText}
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
            className="w-4 h-4 rounded cursor-pointer" style={{ accentColor: '#adc6ff' }} />
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
              {t.rendered}
            </span>
          </div>
        )}
        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <span className="bg-primary/90 text-on-primary p-3 rounded-full shadow-xl">
            <Icon name={type === 'raw' ? 'edit' : 'play_arrow'} size={24} />
          </span>
        </div>
      </div>
      <div className="p-3">
        <div className="flex items-center gap-2 mb-1.5">
          <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded border ${cat.bg} ${cat.text} border-current/20`}>
            {catLabelText}
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
  const t = useT()
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
              <Icon name="download" size={16} /> {t.download}
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Content Management Page (Unified) ───────────────────── */

export default function ContentManagementPage() {
  const navigate = useNavigate()
  const t = useT()
  const [searchParams, setSearchParams] = useSearchParams()

  const activeTab = (searchParams.get('tab') as ActiveTab) || 'manage'
  const setActiveTab = (tab: ActiveTab) => {
    setSearchParams({ tab })
    setSelected(new Set())
  }

  /* ── Channel state ── */
  const [channels, setChannels] = useState<Channel[]>([])
  const [loading, setLoading] = useState(true)
  const [clearExisting, setClearExisting] = useState(true)
  const [limitPerChannel, setLimitPerChannel] = useState(3)
  const [collecting, setCollecting] = useState(false)

  /* ── Media state ── */
  const [downloads, setDownloads] = useState<DownloadInfo[]>([])
  const [raws, setRaws] = useState<RawInfo[]>([])
  const [shorts, setShorts] = useState<ShortInfo[]>([])
  const [mediaLoading, setMediaLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [processing, setProcessing] = useState(false)
  const [processMsg, setProcessMsg] = useState('')
  const [playingShort, setPlayingShort] = useState<ShortInfo | null>(null)
  const [playingVideo, setPlayingVideo] = useState<{ url: string; title: string } | null>(null)
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus | null>(null)

  /* ── Data loading ── */
  const loadChannels = useCallback(async () => {
    try {
      const res = await api.getChannels()
      setChannels(res.channels)
    } catch {
      // Ignore load errors
    }
  }, [])

  const loadMedia = useCallback(async () => {
    try {
      const [dlRes, rawRes, shortRes] = await Promise.all([
        api.getDownloads(), api.getRaws(), api.getShorts(),
      ])
      setDownloads(dlRes.downloads)
      setRaws(rawRes.raws)
      setShorts(shortRes.shorts)
    } catch { /* ignore */ }
  }, [])

  const loadAll = useCallback(async () => {
    setLoading(true)
    setMediaLoading(true)
    try {
      await Promise.all([loadChannels(), loadMedia()])
    } finally {
      setLoading(false)
      setMediaLoading(false)
    }
  }, [loadChannels, loadMedia])

  useEffect(() => { loadAll() }, [loadAll])

  // 파이프라인 상태 폴링
  useEffect(() => {
    let cancelled = false
    const poll = async () => {
      try {
        const s = await api.getStatus()
        if (!cancelled) {
          setPipelineStatus(s)
          if (s.step === 'done') loadMedia()
        }
      } catch { /* ignore */ }
    }
    poll()
    const iv = setInterval(poll, 3000)
    return () => { cancelled = true; clearInterval(iv) }
  }, [loadMedia])

  const pipelineActive = pipelineStatus != null &&
    pipelineStatus.step !== 'idle' && pipelineStatus.step !== 'done' && pipelineStatus.step !== 'error'

  const handleRefreshAll = useCallback(async () => {
    await Promise.all([loadChannels(), loadMedia()])
  }, [loadChannels, loadMedia])

  /* ── Pipeline action ── */
  const handleRunPipeline = async () => {
    setCollecting(true)
    try {
      await api.collect(clearExisting, limitPerChannel)
    } catch {
      // Error handling
    } finally {
      setCollecting(false)
    }
  }

  /* ── Media actions ── */
  const toggle = (fn: string) => setSelected(prev => {
    const s = new Set(prev); s.has(fn) ? s.delete(fn) : s.add(fn); return s
  })

  const toggleAll = () => {
    const items = activeTab === 'downloads' ? downloads.map(d => d.filename) : activeTab === 'raws' ? raws.map(r => r.filename) : shorts.map(s => s.filename)
    setSelected(prev => prev.size === items.length ? new Set() : new Set(items))
  }

  const handleDeleteSelected = async () => {
    if (selected.size === 0) return
    if (!confirm(`${selected.size}${t.deleteConfirm}`)) return
    const fn = activeTab === 'downloads' ? api.deleteDownload : activeTab === 'raws' ? api.deleteRaw : api.deleteShort
    await Promise.all([...selected].map(f => fn(f)))
    setSelected(new Set())
    loadMedia()
  }

  const handleProcessSelected = async () => {
    const items = downloads.filter(d => selected.has(d.filename))
    if (items.length === 0) return
    setProcessing(true); setProcessMsg('')
    try {
      await api.processSelected(items.map(d => ({ filename: d.filename, category: d.category })))
      setProcessMsg(`${items.length}${t.processStarted}`)
      setSelected(new Set())
    } catch (e: any) {
      setProcessMsg(`${t.failed}: ${e?.response?.data?.detail || e.message}`)
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

  /* ── Search filter ── */
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

  const isMediaTab = activeTab !== 'manage'

  if (loading && mediaLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Icon name="sync" size={32} className="text-primary animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-16 md:pb-0 max-w-[1400px]">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-headline-lg text-on-surface font-bold">{t.navContentManagement}</h1>
          <p className="text-body-md text-on-surface-variant mt-1">
            {t.channelsSubtitle}
          </p>
        </div>
        <Button
          variant="primary"
          onClick={handleRunPipeline}
          disabled={collecting}
          className="shrink-0"
        >
          <Icon name="play_arrow" size={20} />
          {collecting ? t.running : t.runPipeline}
        </Button>
      </div>

      {/* Tab bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 overflow-x-auto">
          <TabButton active={activeTab === 'manage'} icon="subscriptions" label={t.menuChannels} count={channels.length}
            onClick={() => setActiveTab('manage')} />
          <TabButton active={activeTab === 'downloads'} icon="download" label={t.collectedVideos} count={downloads.length}
            onClick={() => setActiveTab('downloads')} />
          <TabButton active={activeTab === 'raws'} icon="movie_edit" label={t.editedVideos} count={raws.length}
            onClick={() => setActiveTab('raws')} />
          <TabButton active={activeTab === 'shorts'} icon="auto_awesome" label={t.shorts} count={shorts.length}
            onClick={() => setActiveTab('shorts')} />
        </div>

        {/* Search bar + view toggle + bulk actions — only on media tabs */}
        {isMediaTab && (
          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative flex-1 sm:w-64">
              <Icon name="search" size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
              <input type="text" placeholder={t.search}
                className="w-full bg-surface-container-low border border-outline-variant/30 rounded-full py-2 pl-9 pr-4 text-label-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/50"
                value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            </div>
            {/* Refresh */}
            <button onClick={() => loadMedia()}
              className="p-2.5 rounded-xl bg-surface-container-high hover:bg-surface-bright/30 text-on-surface-variant transition-colors">
              <Icon name="refresh" size={20} />
            </button>
            {/* Bulk Actions */}
            {selected.size > 0 && (
              <div className="flex items-center gap-2 mr-2">
                <span className="text-label-sm text-primary font-bold">{selected.size}{t.selected}</span>
                {activeTab === 'downloads' && (
                  <button onClick={handleProcessSelected} disabled={processing}
                    className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-label-sm font-bold hover:bg-primary/20 transition-colors disabled:opacity-50">
                    <Icon name="auto_awesome" size={14} className="mr-1 inline" />{t.process}
                  </button>
                )}
                {activeTab === 'shorts' && (
                  <button onClick={handleDownloadSelected}
                    className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-label-sm font-bold hover:bg-primary/20 transition-colors">
                    <Icon name="download" size={14} className="mr-1 inline" />{t.download}
                  </button>
                )}
                <button onClick={handleDeleteSelected}
                  className="px-3 py-1.5 rounded-lg bg-error/10 text-error text-label-sm font-bold hover:bg-error/20 transition-colors">
                  {t.delete}
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
        )}
      </div>

      {processMsg && (
        <div className={`p-3 rounded-xl text-label-sm font-medium ${
          processMsg.includes(t.failed) ? 'bg-error-container/20 text-error' : 'bg-tertiary/10 text-tertiary'
        }`}>{processMsg}</div>
      )}

      {/* ═══════════ Tab Content ═══════════ */}

      {/* ── Manage Tab (Channels) ── */}
      {activeTab === 'manage' && (
        <>
          {/* URL Direct Download — full width, above bento grid */}
          <UrlDirectDownload onComplete={handleRefreshAll} />

          {/* Bento Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left column */}
            <div className="lg:col-span-4 space-y-6">
              <AddChannelForm onAdded={loadChannels} />
              <CollectionSettings
                clearExisting={clearExisting}
                setClearExisting={setClearExisting}
                limitPerChannel={limitPerChannel}
                setLimitPerChannel={setLimitPerChannel}
              />
            </div>

            {/* Right column */}
            <div className="lg:col-span-8 space-y-6">
              {/* Monitored Channels header */}
              <div className="flex items-center justify-between">
                <h3 className="text-title-md text-on-surface">
                  {t.monitoredChannels} ({channels.length})
                </h3>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setViewMode('grid')}
                    className={`p-1.5 rounded-lg transition-colors ${
                      viewMode === 'grid'
                        ? 'text-primary bg-primary/10'
                        : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    <Icon name="grid_view" size={20} />
                  </button>
                  <button
                    onClick={() => setViewMode('list')}
                    className={`p-1.5 rounded-lg transition-colors ${
                      viewMode === 'list'
                        ? 'text-primary bg-primary/10'
                        : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    <Icon name="view_list" size={20} />
                  </button>
                </div>
              </div>

              {/* Channel Cards */}
              {channels.length === 0 ? (
                <GlassPanel className="rounded-2xl p-12 text-center">
                  <Icon name="subscriptions" size={48} className="text-on-surface-variant/30 mb-3 mx-auto block" />
                  <p className="text-label-md text-on-surface-variant">
                    {t.noChannelsYet}
                  </p>
                </GlassPanel>
              ) : (
                <div
                  className={
                    viewMode === 'grid'
                      ? 'grid grid-cols-1 md:grid-cols-2 gap-4'
                      : 'flex flex-col gap-3'
                  }
                >
                  {channels.map((ch) => (
                    <ChannelCard
                      key={ch.url}
                      channel={ch}
                      onDelete={loadChannels}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Downloads Tab ── */}
      {activeTab === 'downloads' && (
        mediaLoading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-on-surface-variant text-label-md">{t.loadingMedia}</p>
          </div>
        ) : filteredDownloads.length === 0 ? (
          <GlassPanel className="rounded-2xl p-16 text-center">
            <Icon name="cloud_download" size={56} className="text-on-surface-variant/20 mx-auto mb-4" />
            <p className="text-title-md text-on-surface mb-2">{t.noCollectedVideos}</p>
            <p className="text-body-md text-on-surface-variant mb-6">{t.addChannelOrUrl}</p>
            <button onClick={() => navigate('/channels?tab=manage')}
              className="bg-primary text-on-primary px-6 py-2.5 rounded-xl font-bold text-label-md inline-flex items-center gap-2">
              <Icon name="add" size={18} /> {t.addChannelBtn}
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
                    .then(() => setProcessMsg(`${d.filename} ${t.processStarted}`))
                }}
                onDelete={async () => {
                  if (!confirm(t.deleteConfirmSingle)) return
                  await api.deleteDownload(d.filename); loadMedia()
                }}
              />
            ))}
          </div>
        )
      )}

      {/* ── Raws Tab ── */}
      {activeTab === 'raws' && (
        mediaLoading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-on-surface-variant text-label-md">{t.loadingMedia}</p>
          </div>
        ) : filteredRaws.length === 0 ? (
          <GlassPanel className="rounded-2xl p-16 text-center">
            <Icon name="movie_edit" size={56} className="text-on-surface-variant/20 mx-auto mb-4" />
            <p className="text-title-md text-on-surface mb-2">{t.noEditedVideos}</p>
            <p className="text-body-md text-on-surface-variant">{t.noEditedVideosDesc}</p>
          </GlassPanel>
        ) : (
          <div className={viewMode === 'grid'
            ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'
            : 'flex flex-col gap-2'
          }>
            {filteredRaws.map(r => (
              <MediaCard key={r.filename} item={r} type="raw" selected={selected.has(r.filename)}
                onToggle={() => toggle(r.filename)} viewMode={viewMode}
                onSelect={() => setPlayingVideo({ url: r.url, title: r.title || r.filename })}
                onDelete={async () => {
                  if (!confirm(t.deleteConfirmSingle)) return
                  await api.deleteRaw(r.filename); loadMedia()
                }}
              />
            ))}
          </div>
        )
      )}

      {/* ── Shorts Tab ── */}
      {activeTab === 'shorts' && (
        mediaLoading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-on-surface-variant text-label-md">{t.loadingMedia}</p>
          </div>
        ) : filteredShorts.length === 0 ? (
          <GlassPanel className="rounded-2xl p-16 text-center">
            <Icon name="auto_awesome" size={56} className="text-on-surface-variant/20 mx-auto mb-4" />
            <p className="text-title-md text-on-surface mb-2">{t.noShorts}</p>
            <p className="text-body-md text-on-surface-variant">{t.noShortsDesc}</p>
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
                  if (!confirm(t.deleteConfirmSingle)) return
                  await api.deleteShort(s.filename); loadMedia()
                }}
              />
            ))}
          </div>
        )
      )}

      {/* Video Player Modal -- for shorts */}
      {playingShort && (
        <VideoPlayerModal
          url={playingShort.url}
          title={playingShort.title || playingShort.filename}
          downloadUrl={`${playingShort.url}/download`}
          onClose={() => setPlayingShort(null)}
        />
      )}
      {/* Video Player Modal -- for downloads/raws */}
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
