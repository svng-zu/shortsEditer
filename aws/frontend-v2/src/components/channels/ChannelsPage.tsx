import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../../services/api'
import GlassPanel from '../ui/GlassPanel'
import Icon from '../ui/Icon'
import Badge from '../ui/Badge'
import Button from '../ui/Button'
import Input from '../ui/Input'
import Select from '../ui/Select'
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

const CATEGORIES: { value: Category; label: string }[] = [
  { value: 'economy', label: 'Economy' },
  { value: 'politics', label: 'Politics' },
  { value: 'sports', label: 'Sports' },
]

/* ── Helpers ─────────────────────────────────────────────── */

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

/* ── Add New Channel Form ────────────────────────────────── */

function AddChannelForm({ onAdded }: { onAdded: () => void }) {
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
      setError(err?.response?.data?.detail || 'Failed to add channel.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <GlassPanel className="rounded-2xl p-6">
      <div className="flex items-center gap-3 mb-5">
        <Icon name="add_circle" size={24} className="text-primary" />
        <h3 className="text-title-md text-on-surface">Add New Channel</h3>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          label="YouTube Channel URL"
          placeholder="https://youtube.com/@channel"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />

        {error && (
          <p className="text-label-sm text-error">{error}</p>
        )}

        <Button variant="ghost" type="submit" disabled={submitting || !url.trim()}>
          <Icon name="save" size={18} />
          {submitting ? 'Saving...' : 'Save to Pipeline'}
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
  return (
    <GlassPanel className="rounded-2xl p-6">
      <div className="flex items-center gap-3 mb-5">
        <Icon name="settings" size={24} className="text-tertiary" />
        <h3 className="text-title-md text-on-surface">Global Collection Settings</h3>
      </div>

      <div className="flex flex-col gap-5">
        {/* Clear existing toggle */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-label-md text-on-surface">Clear existing files</p>
            <p className="text-label-sm text-on-surface-variant">Remove old downloads before collecting</p>
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
            Limit per channel (Videos)
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
            <span className="text-label-sm text-on-surface-variant">Items</span>
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
          title="Remove channel"
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
          <span>Latest Fetch: --</span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-tertiary inline-block" />
            Active
          </span>
        </div>
      </div>
    </GlassPanel>
  )
}

/* ── URL Direct Download ─────────────────────────────────── */

function UrlDirectDownload({ onComplete }: { onComplete: () => void }) {
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
          setError(res.error || 'Download failed.')
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
      setDlStatus({ status: 'pending', message: 'Starting download...', filename: null, error: null })
      startPolling()
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to start download.')
    } finally {
      setSubmitting(false)
    }
  }

  const isDownloading = dlStatus != null && dlStatus.status !== 'done' && dlStatus.status !== 'complete' && dlStatus.status !== 'error' && dlStatus.status !== 'failed'

  return (
    <GlassPanel className="rounded-2xl p-6 bg-primary/5">
      <div className="flex items-center gap-3 mb-5">
        <Icon name="download" size={24} className="text-primary" />
        <h3 className="text-title-md text-on-surface">URL Direct Download</h3>
        <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
          Fast Track
        </span>
      </div>

      <form onSubmit={handleDownload} className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="flex-1">
          <Input
            placeholder="https://youtube.com/watch?v=..."
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
          {submitting ? 'Starting...' : 'Download'}
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
                {dlStatus.filename || 'Preparing...'}
              </span>
            </div>
            <span
              className={`
                text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded
                ${statusPillStyle(dlStatus.status)}
              `}
            >
              {dlStatus.status === 'done' || dlStatus.status === 'complete'
                ? 'Done'
                : dlStatus.status === 'error' || dlStatus.status === 'failed'
                  ? 'Failed'
                  : dlStatus.status === 'downloading'
                    ? 'Downloading'
                    : 'Pending'}
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

/* ── Channels Page ───────────────────────────────────────── */

export default function ChannelsPage() {
  const [channels, setChannels] = useState<Channel[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [clearExisting, setClearExisting] = useState(true)
  const [limitPerChannel, setLimitPerChannel] = useState(3)
  const [collecting, setCollecting] = useState(false)

  const loadChannels = useCallback(async () => {
    try {
      const res = await api.getChannels()
      setChannels(res.channels)
    } catch {
      // Ignore load errors
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadChannels()
  }, [loadChannels])

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Icon name="sync" size={32} className="text-primary animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-[1400px]">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-headline-lg text-on-surface font-bold">YouTube Channels</h1>
          <p className="text-body-md text-on-surface-variant mt-1">
            Manage your automated content collection pipeline.
          </p>
        </div>
        <Button
          variant="primary"
          onClick={handleRunPipeline}
          disabled={collecting}
          className="shrink-0"
        >
          <Icon name="play_arrow" size={20} />
          {collecting ? 'Running...' : 'Run Pipeline'}
        </Button>
      </div>

      {/* URL Direct Download — full width, above bento grid */}
      <UrlDirectDownload onComplete={loadChannels} />

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
              Monitored Channels ({channels.length})
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
                No channels added yet. Add your first channel above.
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
    </div>
  )
}
