import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { api, PipelineStatus, Quota, ShortInfo, DownloadInfo } from '../../services/api'
import GlassPanel from '../ui/GlassPanel'
import Icon from '../ui/Icon'
import Badge from '../ui/Badge'
import Button from '../ui/Button'
import ProgressBar from '../ui/ProgressBar'
import QuotaLimitModal from '../ui/QuotaLimitModal'

/* ── Helpers ─────────────────────────────────────────────── */

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return '--:--'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function categoryBadgeVariant(cat: string): 'sports' | 'economy' | 'politics' | 'tech' {
  if (cat === 'sports') return 'sports'
  if (cat === 'economy') return 'economy'
  if (cat === 'politics') return 'politics'
  return 'tech'
}

function truncateFilename(filename: string, maxLen = 40): string {
  const name = filename.replace(/\.[^/.]+$/, '')
  return name.length > maxLen ? name.slice(0, maxLen) + '...' : name
}

/* ── Pipeline Overview ───────────────────────────────────── */

function PipelineOverview({ status }: { status: PipelineStatus }) {
  const isActive = status.step !== 'idle' && status.step !== 'done'
  const isError = status.step === 'error'
  const isDone = status.step === 'done'

  const stepLabel: Record<string, string> = {
    idle: 'Waiting for tasks',
    collecting: 'Collecting videos...',
    transcribing: 'Generating transcripts...',
    analyzing: 'Analyzing content...',
    editing: 'Editing shorts...',
    done: 'Pipeline complete',
    error: 'Pipeline error',
  }

  // Estimate queueing / finished from progress
  const totalSteps = 4
  const completedSteps = isDone
    ? totalSteps
    : isError
      ? 0
      : Math.floor((status.progress / 100) * totalSteps)
  const queueSteps = totalSteps - completedSteps

  return (
    <GlassPanel className="rounded-xl p-6">
      {/* Header row */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Icon
            name="sync"
            size={28}
            className={`text-primary ${isActive ? 'animate-spin' : ''}`}
            {...(isActive ? { style: { animationDuration: '3s' } } : {})}
          />
          <div>
            <h2 className="text-title-md text-on-surface">Pipeline Overview</h2>
            <p className="text-label-sm text-primary">
              {status.message || stepLabel[status.step] || status.step}
            </p>
          </div>
        </div>

        <span
          className={`
            text-label-md font-bold px-4 py-1.5 rounded-full
            ${isError
              ? 'bg-error/10 text-error'
              : isDone
                ? 'bg-tertiary/10 text-tertiary'
                : 'bg-primary/10 text-primary'
            }
          `}
        >
          {Math.round(status.progress)}% Complete
        </span>
      </div>

      {/* Progress bar */}
      <ProgressBar
        progress={status.progress}
        color={isError ? 'secondary' : isDone ? 'tertiary' : 'primary'}
        glow={isActive}
        className="mb-4"
      />

      {/* Bottom stats */}
      <div className="flex items-center gap-6 text-label-sm text-on-surface-variant">
        <span className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-primary inline-block" />
          {queueSteps} Queueing
        </span>
        <span className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-tertiary inline-block" />
          {completedSteps} Finished
        </span>
        <span className="flex items-center gap-2">
          <Icon name="timer" size={16} />
          Est. {isActive ? '~2 min' : isDone ? '0 min' : '--'}
        </span>
      </div>
    </GlassPanel>
  )
}

/* ── Quick Quota Card ────────────────────────────────────── */

function QuickQuotaCard({
  quota,
  onQuotaExceeded,
}: {
  quota: Quota | null
  onQuotaExceeded: () => void
}) {
  const navigate = useNavigate()
  const used = quota?.used ?? 0
  const limit = quota?.limit ?? 10
  const plan = quota?.plan_display ?? quota?.plan ?? 'Free'
  const isExceeded = limit !== null && used >= limit

  return (
    <GlassPanel className="rounded-xl p-6 flex flex-col justify-between h-full">
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-label-sm uppercase tracking-widest text-on-surface-variant">
            Quick Quota
          </h3>
          <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
            {plan}
          </span>
        </div>
        <div className="flex items-baseline gap-1 mb-1">
          <span className={`text-headline-xl ${isExceeded ? 'text-error' : 'text-primary'}`}>{used}</span>
          <span className="text-headline-lg text-on-surface-variant/50">/ {limit ?? '∞'}</span>
        </div>
        <p className="text-label-sm text-on-surface-variant">
          {isExceeded ? '한도에 도달했습니다' : '이번 달 사용량'}
        </p>
      </div>

      {isExceeded ? (
        <Button variant="secondary" className="mt-6 w-full" onClick={onQuotaExceeded}>
          <Icon name="warning" size={18} />
          플랜 업그레이드
        </Button>
      ) : (
        <Button variant="secondary" className="mt-6 w-full" onClick={() => navigate('/pricing')}>
          <Icon name="bolt" size={18} />
          Upgrade to Pro
        </Button>
      )}
    </GlassPanel>
  )
}

/* ── Shorts Gallery Preview ──────────────────────────────── */

function ShortsGalleryPreview({ shorts }: { shorts: ShortInfo[] }) {
  return (
    <GlassPanel className="rounded-xl p-6 h-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-title-md text-on-surface">Shorts Gallery Preview</h3>
        <Link
          to="/editor"
          className="text-label-sm text-primary hover:text-primary/80 transition-colors"
        >
          View All
        </Link>
      </div>

      {shorts.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-on-surface-variant/50">
          <div className="text-center">
            <Icon name="movie" size={48} className="mb-2 opacity-30" />
            <p className="text-label-sm">No shorts yet. Run the pipeline to generate shorts.</p>
          </div>
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1">
          {shorts.slice(0, 10).map((short) => (
            <Link
              key={short.filename}
              to={`/editor/${encodeURIComponent(short.filename)}`}
              className="flex-shrink-0 w-40 group"
            >
              <div className="relative rounded-xl overflow-hidden bg-surface-container-highest aspect-[9/16]">
                {short.url ? (
                  <video
                    src={short.url}
                    className="w-full h-full object-cover"
                    muted
                    preload="metadata"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Icon name="movie" size={36} className="text-on-surface-variant/30" />
                  </div>
                )}
                {/* Gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                {/* Title */}
                <div className="absolute bottom-0 left-0 right-0 p-3">
                  <p className="text-[11px] font-medium text-white leading-tight line-clamp-2">
                    {short.title || truncateFilename(short.filename, 30)}
                  </p>
                </div>
                {/* Hover play icon */}
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center">
                    <Icon name="play_arrow" size={24} filled className="text-white" />
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </GlassPanel>
  )
}

/* ── Recent Downloads Grid ───────────────────────────────── */

function RecentDownloadsGrid({
  downloads,
  onProcess,
}: {
  downloads: DownloadInfo[]
  onProcess: (filename: string, category: string) => void
}) {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-title-md text-on-surface">Recent Downloads</h3>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-1.5 rounded-lg transition-colors ${
              viewMode === 'grid' ? 'text-primary bg-primary/10' : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <Icon name="grid_view" size={20} />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-1.5 rounded-lg transition-colors ${
              viewMode === 'list' ? 'text-primary bg-primary/10' : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <Icon name="view_list" size={20} />
          </button>
        </div>
      </div>

      {downloads.length === 0 ? (
        <GlassPanel className="rounded-xl p-12 text-center">
          <Icon name="cloud_download" size={48} className="text-on-surface-variant/30 mb-3 mx-auto block" />
          <p className="text-label-sm text-on-surface-variant">
            No downloads yet. Add a channel or download a video URL.
          </p>
        </GlassPanel>
      ) : (
        <div
          className={
            viewMode === 'grid'
              ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4'
              : 'flex flex-col gap-3'
          }
        >
          {downloads.map((dl) => (
            <GlassPanel key={dl.filename} className="rounded-xl overflow-hidden group">
              {/* Thumbnail area */}
              <div className="relative aspect-video bg-surface-container-highest">
                {dl.thumbnail_url ? (
                  <img
                    src={dl.thumbnail_url}
                    alt={dl.filename}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Icon name="video_file" size={36} className="text-on-surface-variant/30" />
                  </div>
                )}

                {/* Duration badge */}
                {dl.duration != null && (
                  <span className="absolute bottom-2 right-2 bg-black/70 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                    {formatDuration(dl.duration)}
                  </span>
                )}

                {/* Category badge */}
                <span className="absolute top-2 left-2">
                  <Badge variant={categoryBadgeVariant(dl.category)}>
                    {dl.category}
                  </Badge>
                </span>
              </div>

              {/* Info area */}
              <div className="p-4">
                <p className="text-label-md text-on-surface line-clamp-2 mb-3" title={dl.filename}>
                  {truncateFilename(dl.filename)}
                </p>

                <Button
                  variant="ghost"
                  className="w-full text-label-sm"
                  onClick={() => onProcess(dl.filename, dl.category)}
                >
                  <Icon name="auto_awesome" size={16} />
                  Process
                </Button>
              </div>
            </GlassPanel>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Floating Action Button ──────────────────────────────── */

function FAB() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const fabRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (fabRef.current && !fabRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={fabRef} className="fixed bottom-24 md:bottom-8 right-6 md:right-8 z-40 flex flex-col items-end gap-3">
      {/* Menu items */}
      {open && (
        <div className="flex flex-col gap-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <button
            onClick={() => { setOpen(false); navigate('/channels') }}
            className="
              flex items-center gap-3 pl-4 pr-5 py-3 rounded-2xl
              glass-panel-elevated text-on-surface text-label-md
              hover:bg-primary/10 transition-all whitespace-nowrap
            "
          >
            <Icon name="link" size={20} className="text-primary" />
            Download URL
          </button>
          <button
            onClick={() => { setOpen(false); navigate('/channels') }}
            className="
              flex items-center gap-3 pl-4 pr-5 py-3 rounded-2xl
              glass-panel-elevated text-on-surface text-label-md
              hover:bg-primary/10 transition-all whitespace-nowrap
            "
          >
            <Icon name="subscriptions" size={20} className="text-tertiary" />
            Add Channel
          </button>
        </div>
      )}

      {/* Main FAB */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={`
          w-16 h-16 rounded-full bg-primary text-on-primary
          flex items-center justify-center
          shadow-lg shadow-primary/20 hover:brightness-110 active:scale-95
          transition-all duration-200
          ${open ? 'rotate-45' : ''}
        `}
      >
        <Icon name="add" size={32} />
      </button>
    </div>
  )
}

/* ── Dashboard Page ──────────────────────────────────────── */

export default function DashboardPage() {
  const navigate = useNavigate()

  const [status, setStatus] = useState<PipelineStatus>({ step: 'idle', message: '', progress: 0 })
  const [quota, setQuota] = useState<Quota | null>(null)
  const [shorts, setShorts] = useState<ShortInfo[]>([])
  const [downloads, setDownloads] = useState<DownloadInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [showQuotaModal, setShowQuotaModal] = useState(false)

  // Initial data fetch
  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const [statusRes, quotaRes, shortsRes, downloadsRes] = await Promise.allSettled([
          api.getStatus(),
          api.getQuota(),
          api.getShorts(),
          api.getDownloads(),
        ])

        if (cancelled) return

        if (statusRes.status === 'fulfilled') setStatus(statusRes.value)
        if (quotaRes.status === 'fulfilled') setQuota(quotaRes.value)
        if (shortsRes.status === 'fulfilled') setShorts(shortsRes.value.shorts)
        if (downloadsRes.status === 'fulfilled') setDownloads(downloadsRes.value.downloads)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [])

  // Poll status when pipeline is active
  useEffect(() => {
    const isActive = status.step !== 'idle' && status.step !== 'done' && status.step !== 'error'
    if (!isActive) return

    const interval = setInterval(async () => {
      try {
        const s = await api.getStatus()
        setStatus(s)

        // Refresh downloads and shorts when pipeline finishes
        if (s.step === 'done' || s.step === 'idle') {
          const [shortsRes, downloadsRes] = await Promise.allSettled([
            api.getShorts(),
            api.getDownloads(),
          ])
          if (shortsRes.status === 'fulfilled') setShorts(shortsRes.value.shorts)
          if (downloadsRes.status === 'fulfilled') setDownloads(downloadsRes.value.downloads)
        }
      } catch {
        // Ignore polling errors
      }
    }, 2000)

    return () => clearInterval(interval)
  }, [status.step])

  const handleProcess = useCallback(
    async (filename: string, category: string) => {
      try {
        await api.processSelected([{ filename, category }])
        // Refresh status to start polling
        const s = await api.getStatus()
        setStatus(s)
      } catch {
        // Error handling could be improved with toast notifications
      }
    },
    [],
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Icon name="sync" size={32} className="text-primary animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-[1400px]">
      {/* Pipeline Overview — full width */}
      <PipelineOverview status={status} />

      {/* Two-column: Quota (1/3) + Shorts Gallery (2/3) — stacked on mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <QuickQuotaCard quota={quota} onQuotaExceeded={() => setShowQuotaModal(true)} />
        <div className="col-span-1 lg:col-span-2">
          <ShortsGalleryPreview shorts={shorts} />
        </div>
      </div>

      {/* Recent Downloads — full width */}
      <RecentDownloadsGrid downloads={downloads} onProcess={handleProcess} />

      {/* FAB */}
      <FAB />

      {/* Quota Limit Modal */}
      <QuotaLimitModal open={showQuotaModal} onClose={() => setShowQuotaModal(false)} />
    </div>
  )
}
