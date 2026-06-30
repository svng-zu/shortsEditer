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
    <button onClick={onClick} className={`flex items-center gap-2 px-5 py-3 rounded-xl transition-all ${
      active
        ? 'bg-primary/15 text-primary border border-primary/40 shadow-sm shadow-primary/10'
        : 'text-on-surface-variant hover:bg-surface-bright/10 border border-transparent hover:text-on-surface'
    }`}>
      <Icon name={icon} size={20} className={active ? 'text-primary' : ''} />
      <span className={`text-body-md font-semibold ${active ? 'font-bold' : ''}`}>{label}</span>
      <span className={`text-[12px] font-bold px-2 py-0.5 rounded-full ${
        active ? 'bg-primary/25 text-primary' : 'bg-surface-variant text-on-surface-variant'
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
    <GlassPanel className="rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon name="add_circle" size={22} className="text-primary" />
        <h3 className="text-[22px] font-bold text-on-surface">{t.addNewChannel}</h3>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2">
        <div className="flex-1">
          <Input
            placeholder={t.channelUrlPlaceholder}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </div>
        <Button variant="ghost" type="submit" disabled={submitting || !url.trim()} className="shrink-0">
          <Icon name="save" size={16} />
          {submitting ? t.saving : t.saveToPipeline}
        </Button>
      </form>
      {error && <p className="text-label-sm text-error mt-2">{error}</p>}
    </GlassPanel>
  )
}

/* ── Add Channel Modal ───────────────────────────────────── */

function AddChannelModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
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
      onAdded()
    } catch (err: any) {
      setError(err?.response?.data?.detail || t.failedAddChannel)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[300] bg-black/60 flex items-center justify-center px-4" onClick={onClose}>
      <div className="bg-surface-container rounded-2xl border border-outline-variant/30 shadow-2xl p-6 w-[440px] max-w-full" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-5">
          <span className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center">
            <Icon name="add_circle" size={20} className="text-primary" />
          </span>
          <h3 className="text-title-md font-bold text-on-surface">채널 추가</h3>
          <button onClick={onClose} className="ml-auto w-7 h-7 rounded-full hover:bg-surface-container-high flex items-center justify-center transition-colors">
            <Icon name="close" size={18} className="text-on-surface-variant" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className="text-label-md text-on-surface-variant mb-1.5 block">유튜브 채널 URL</label>
            <input
              type="text"
              placeholder={t.channelUrlPlaceholder}
              value={url}
              onChange={e => setUrl(e.target.value)}
              autoFocus
              className="w-full bg-surface-container-lowest border border-outline-variant/50 rounded-xl px-4 py-2.5 text-on-surface text-body-md focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-colors"
            />
          </div>
          {error && <p className="text-label-sm text-error">{error}</p>}
          <div className="flex gap-3 mt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-outline-variant text-on-surface font-semibold hover:bg-surface-bright/10 transition-colors">
              취소
            </button>
            <button type="submit" disabled={submitting || !url.trim()}
              className="flex-1 py-2.5 rounded-xl bg-primary text-on-primary font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50">
              {submitting ? '추가 중...' : '추가'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ── Global Collection Settings ──────────────────────────── */

function CollectionSettings({
  clearExisting,
  setClearExisting,
  limitPerChannel,
  setLimitPerChannel,
  onRun,
  isCollecting,
  pipelineStatus,
  channels,
}: {
  clearExisting: boolean
  setClearExisting: (v: boolean) => void
  limitPerChannel: number
  setLimitPerChannel: (v: number) => void
  onRun: () => void
  isCollecting: boolean
  pipelineStatus: PipelineStatus | null
  channels: Channel[]
}) {
  const t = useT()
  const step = pipelineStatus?.step
  const progress = pipelineStatus?.progress ?? 0
  const message = pipelineStatus?.message ?? ''

  const getChannelStatus = (idx: number): 'done' | 'checking' | 'waiting' => {
    if (step !== 'collecting') return 'waiting'
    const doneCount = Math.floor(progress / 100 * channels.length)
    if (idx < doneCount) return 'done'
    if (idx === doneCount) return 'checking'
    return 'waiting'
  }

  return (
    <GlassPanel className="rounded-2xl p-6 flex-1">
      <div className="flex flex-col gap-5">
        {/* Clear existing toggle */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-body-md font-medium text-on-surface">{t.clearExisting}</p>
            <p className="text-label-md text-on-surface-variant">{t.clearExistingDesc}</p>
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
          <label className="text-label-md text-on-surface-variant block mb-1.5">
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

        {/* Divider */}
        <div className="border-t border-outline-variant/20" />

        {/* Run button */}
        <button
          onClick={onRun}
          disabled={isCollecting}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-on-primary font-bold text-[16px] hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isCollecting ? (
            <>
              <div className="w-4 h-4 border-2 border-on-primary/50 border-t-on-primary rounded-full animate-spin" />
              최신 영상 수집 중...
            </>
          ) : (
            <>
              <Icon name="download" size={18} />
              최신 영상 수집하기
            </>
          )}
        </button>

        {/* 수집 진행 상태 */}
        {step === 'collecting' && (
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
            {/* 진행률 헤더 */}
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold text-primary flex-1 truncate">
                {message || `총 ${channels.length}개 채널 확인 중`}
              </span>
              <span className="text-[12px] font-mono text-primary/70">{Math.round(Math.max(progress, 2))}%</span>
            </div>
            {/* 진행바 */}
            <div className="w-full h-2 bg-surface-container-highest rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-700 ease-out"
                style={{ width: `${Math.max(progress, 2)}%` }}
              />
            </div>
            {/* 채널별 상태 */}
            {channels.length > 0 && (
              <div className="space-y-2 pt-1 border-t border-primary/10">
                {channels.map((ch, idx) => {
                  const cs = getChannelStatus(idx)
                  const name = extractChannelName(ch.url)
                  return (
                    <div key={ch.url} className="flex items-center gap-2">
                      {cs === 'done' ? (
                        <span className="material-symbols-outlined text-tertiary flex-shrink-0"
                          style={{ fontSize: 16, fontVariationSettings: "'FILL' 1" }}>
                          check_circle
                        </span>
                      ) : cs === 'checking' ? (
                        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin flex-shrink-0" />
                      ) : (
                        <span className="material-symbols-outlined text-on-surface-variant/30 flex-shrink-0"
                          style={{ fontSize: 16 }}>
                          radio_button_unchecked
                        </span>
                      )}
                      <span className={`text-[13px] flex-1 truncate ${
                        cs === 'done' ? 'text-tertiary' :
                        cs === 'checking' ? 'text-on-surface font-medium' :
                        'text-on-surface-variant/40'
                      }`}>{name}</span>
                      <span className={`text-[11px] flex-shrink-0 ${
                        cs === 'done' ? 'text-tertiary/70' :
                        cs === 'checking' ? 'text-primary/60' :
                        'text-on-surface-variant/25'
                      }`}>
                        {cs === 'done' ? '완료' : cs === 'checking' ? '확인 중...' : '대기 중'}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
            <p className="text-[11px] text-on-surface-variant/50 text-center">
              채널당 최대 {limitPerChannel}개 영상을 확인합니다
            </p>
          </div>
        )}
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
      <div className="flex items-center gap-2 mb-5">
        <Icon name="download" size={30} className="text-primary" />
        <h3 className="text-[22px] font-bold text-on-surface">{t.urlDirectDownload}</h3>
      </div>

      <form onSubmit={handleDownload} className="flex flex-col gap-4 mb-3">
        {/* URL 입력창 */}
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-[20px] text-on-surface-variant pointer-events-none select-none">
            link
          </span>
          <input
            type="url"
            placeholder={t.urlPlaceholder}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="
              w-full h-[58px] pl-11 pr-4
              bg-surface-container-lowest
              border border-outline-variant/50
              rounded-2xl
              text-on-surface text-body-md placeholder:text-on-surface-variant/50
              transition-all duration-200
              focus:outline-none focus:border-primary/60
              focus:ring-2 focus:ring-primary/25
              focus:shadow-[0_0_0_4px_rgba(100,140,255,0.15)]
            "
          />
        </div>

        {/* CTA 버튼 */}
        <button
          type="submit"
          disabled={submitting || isDownloading || !url.trim()}
          className="
            w-full h-[58px] rounded-2xl
            font-semibold text-[16px] text-white
            bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500
            hover:brightness-110 active:brightness-95
            disabled:opacity-40 disabled:cursor-not-allowed
            transition-all duration-200
            shadow-lg shadow-purple-500/20
            flex items-center justify-center gap-2
          "
        >
          {submitting || isDownloading ? (
            <>
              <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              {submitting ? t.starting : t.downloading}
            </>
          ) : (
            <span className="text-[21px] font-semibold">쇼츠로 변환하기 →</span>
          )}
        </button>
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

type CardProcessStatus = 'processing' | 'done' | 'failed'

type CollectToastState =
  | { type: 'done'; count: number }
  | { type: 'empty' }
  | { type: 'failed'; error?: string }

function ProcessOverlay({ status, onRetry }: { status: CardProcessStatus; onRetry: () => void }) {
  if (status === 'processing') return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/65 backdrop-blur-[2px]">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-2.5" />
      <p className="text-white text-[13px] font-bold">쇼츠 생성 중...</p>
    </div>
  )
  if (status === 'done') return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-green-900/70 backdrop-blur-[2px]">
      <span className="material-symbols-outlined text-green-300 mb-1.5" style={{ fontSize: 36, fontVariationSettings: "'FILL' 1" }}>check_circle</span>
      <p className="text-white text-[13px] font-bold">생성 완료!</p>
    </div>
  )
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-red-900/70 backdrop-blur-[2px]">
      <span className="material-symbols-outlined text-red-300 mb-1.5" style={{ fontSize: 36 }}>error</span>
      <p className="text-white text-[13px] font-bold mb-2">생성 실패</p>
      <button onClick={e => { e.stopPropagation(); onRetry() }}
        className="px-3 py-1 bg-primary rounded-lg text-white text-[12px] font-semibold hover:bg-primary/80 transition-colors">
        다시 시도
      </button>
    </div>
  )
}

function StatusBadge({ status }: { status: CardProcessStatus }) {
  const cfg = {
    processing: { label: '생성중', cls: 'bg-yellow-500/90 text-black' },
    done: { label: '완료', cls: 'bg-green-500/90 text-white' },
    failed: { label: '실패', cls: 'bg-red-500/90 text-white' },
  }[status]
  return (
    <span className={`absolute top-2 right-2 z-30 px-2 py-0.5 rounded-full text-[10px] font-bold ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}

function DownloadCard({ item, selected, onToggle, onProcess, onDelete, onPlay, viewMode, processingStatus }: {
  item: DownloadInfo; selected: boolean; onToggle: () => void
  onProcess: () => void; onDelete: () => void; onPlay: () => void; viewMode: ViewMode
  processingStatus?: CardProcessStatus
}) {
  const t = useT()
  const cat = CAT_STYLE[item.category] || { bg: 'bg-surface-variant', text: 'text-on-surface-variant' }
  const catLabelText = item.category === 'sports' ? t.catSports : item.category === 'economy' ? t.catEconomy : item.category === 'politics' ? t.catPolitics : item.category

  if (viewMode === 'list') {
    return (
      <div className="flex items-center gap-2">
        {/* 체크박스: 카드와 완전히 분리된 형제 노드 */}
        <button
          type="button"
          onClick={onToggle}
          onPointerDown={e => e.stopPropagation()}
          onMouseDown={e => e.stopPropagation()}
          onTouchStart={e => e.stopPropagation()}
          className={`w-10 h-10 flex items-center justify-center flex-shrink-0 rounded-xl transition-all ${
            selected ? 'bg-blue-500/20' : 'bg-white/5 hover:bg-blue-500/10'
          }`}
          style={{ touchAction: 'manipulation' }}
        >
          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
            selected ? 'bg-blue-500 border-blue-500' : 'border-white/30'
          }`}>
            {selected && <span className="material-symbols-outlined text-white" style={{ fontSize: 13, fontVariationSettings: "'FILL' 1" }}>check</span>}
          </div>
        </button>
        {/* 카드: 체크박스와 별개의 독립 영역 */}
        <div onClick={processingStatus === 'processing' ? undefined : onPlay}
          className={`glass-panel rounded-xl p-3 flex items-center gap-3 flex-1 min-w-0 transition-all ${
            processingStatus === 'processing' ? 'cursor-default opacity-90' : 'cursor-pointer'
          } ${selected ? 'border-blue-500 shadow-[0_0_0_2px_#3b82f6] bg-blue-500/5' : 'hover:border-primary/30'}`}>
          <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-surface-container-highest flex-shrink-0">
            {item.thumbnail_url ? (
              <img src={item.thumbnail_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Icon name="videocam" size={20} className="text-outline-variant" />
              </div>
            )}
            {processingStatus === 'processing' && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
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
          {processingStatus ? (
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0 ${
              processingStatus === 'processing' ? 'bg-yellow-500/20 text-yellow-400' :
              processingStatus === 'done' ? 'bg-green-500/20 text-green-400' :
              'bg-red-500/20 text-red-400'
            }`}>
              {processingStatus === 'processing' ? '생성중' : processingStatus === 'done' ? '완료' : '실패'}
            </span>
          ) : (
            <button onClick={e => { e.stopPropagation(); onProcess() }}
              className="p-2 rounded-lg text-primary hover:bg-primary/10 transition-all flex-shrink-0">
              <Icon name="auto_awesome" size={18} />
            </button>
          )}
          <button onClick={e => { e.stopPropagation(); onDelete() }}
            className="p-2 rounded-lg text-error hover:bg-error/10 transition-all flex-shrink-0">
            <Icon name="delete" size={18} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="relative">
      {/* 체크박스: GlassPanel 바깥 형제 노드 — 클릭이 카드로 절대 전파 안 됨 */}
      <button
        type="button"
        onClick={onToggle}
        onPointerDown={e => e.stopPropagation()}
        onMouseDown={e => e.stopPropagation()}
        onTouchStart={e => e.stopPropagation()}
        className={`absolute top-2 left-2 z-10 w-9 h-9 flex items-center justify-center rounded-xl transition-all ${
          selected ? 'bg-blue-500/30' : 'bg-black/40 hover:bg-blue-500/20'
        }`}
        style={{ touchAction: 'manipulation' }}
      >
        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
          selected ? 'bg-blue-500 border-blue-500' : 'border-white/70'
        }`}>
          {selected && <span className="material-symbols-outlined text-white" style={{ fontSize: 13, fontVariationSettings: "'FILL' 1" }}>check</span>}
        </div>
      </button>
      <GlassPanel
        className={`rounded-xl overflow-hidden transition-all ${
          selected ? 'border-blue-500 shadow-[0_0_0_2px_#3b82f6] bg-blue-500/5' : 'hover:border-primary/30'
        }`}
      >
        {/* 썸네일만 클릭 → 재생 (생성중엔 비활성) */}
        <div className="relative aspect-video bg-surface-container-highest"
          onClick={processingStatus === 'processing' ? undefined : onPlay}
          style={{ cursor: processingStatus === 'processing' ? 'default' : 'pointer' }}>
          {item.thumbnail_url ? (
            <img src={item.thumbnail_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Icon name="videocam" size={40} className="text-outline-variant/40" />
            </div>
          )}
          {/* 처리 상태 오버레이 */}
          {processingStatus && <ProcessOverlay status={processingStatus} onRetry={onProcess} />}
          {/* 재생시간 배지 (오버레이 없을 때만) */}
          {!processingStatus && (
            <div className="absolute top-2 right-2">
              <span className="bg-surface-dim/70 backdrop-blur-md text-on-surface text-[10px] px-2 py-1 rounded-md font-bold">
                {fmtDur(item.duration)}
              </span>
            </div>
          )}
          {/* 상태 배지 (우측 상단) */}
          {processingStatus && <StatusBadge status={processingStatus} />}
        </div>
        {/* 하단 영역: 버튼들만, 카드 클릭 없음 */}
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
          <p className="text-label-md text-on-surface truncate mb-2">{item.filename}</p>
          <div className="flex gap-2">
            <button
              onClick={onProcess}
              disabled={processingStatus === 'processing'}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[13px] font-semibold transition-colors ${
                processingStatus === 'processing'
                  ? 'bg-surface-container-high text-on-surface-variant cursor-default'
                  : 'bg-primary/15 text-primary hover:bg-primary/25'
              }`}
            >
              {processingStatus === 'processing' ? (
                <><div className="w-3.5 h-3.5 border-2 border-primary/50 border-t-transparent rounded-full animate-spin" />생성중...</>
              ) : (
                <><Icon name="auto_awesome" size={15} />쇼츠 생성</>
              )}
            </button>
            <button
              onClick={onDelete}
              className="p-1.5 rounded-lg bg-error/10 text-error hover:bg-error/20 transition-colors"
            >
              <Icon name="delete" size={16} />
            </button>
          </div>
        </div>
      </GlassPanel>
    </div>
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
      <div className="flex items-center gap-2">
        {/* 체크박스: 카드와 완전히 분리된 형제 노드 */}
        <button
          type="button"
          onClick={onToggle}
          onPointerDown={e => e.stopPropagation()}
          onMouseDown={e => e.stopPropagation()}
          onTouchStart={e => e.stopPropagation()}
          className={`w-10 h-10 flex items-center justify-center flex-shrink-0 rounded-xl transition-all ${
            selected ? 'bg-blue-500/20' : 'bg-white/5 hover:bg-blue-500/10'
          }`}
          style={{ touchAction: 'manipulation' }}
        >
          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
            selected ? 'bg-blue-500 border-blue-500' : 'border-white/30'
          }`}>
            {selected && <span className="material-symbols-outlined text-white" style={{ fontSize: 13, fontVariationSettings: "'FILL' 1" }}>check</span>}
          </div>
        </button>
        {/* 카드: 체크박스와 별개 */}
        <div onClick={onSelect} className={`glass-panel rounded-xl p-3 flex items-center gap-3 flex-1 min-w-0 transition-all cursor-pointer ${
          selected ? 'border-blue-500 shadow-[0_0_0_2px_#3b82f6] bg-blue-500/5' : 'hover:border-primary/30'
        }`}>
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
              className="p-2 rounded-lg text-primary hover:bg-primary/10 transition-all flex-shrink-0">
              <Icon name="download" size={18} />
            </a>
          )}
          <button onClick={e => { e.stopPropagation(); onDelete() }}
            title="삭제"
            className="w-9 h-9 flex items-center justify-center rounded-lg text-error hover:bg-error/10 active:bg-error/20 transition-all flex-shrink-0">
            <Icon name="delete" size={15} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="relative">
      {/* 체크박스: GlassPanel 바깥 형제 노드 */}
      <button
        type="button"
        onClick={onToggle}
        onPointerDown={e => e.stopPropagation()}
        onMouseDown={e => e.stopPropagation()}
        onTouchStart={e => e.stopPropagation()}
        className={`absolute top-2 left-2 z-10 w-9 h-9 flex items-center justify-center rounded-xl transition-all ${
          selected ? 'bg-blue-500/30' : 'bg-black/40 hover:bg-blue-500/20'
        }`}
        style={{ touchAction: 'manipulation' }}
      >
        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
          selected ? 'bg-blue-500 border-blue-500' : 'border-white/70'
        }`}>
          {selected && <span className="material-symbols-outlined text-white" style={{ fontSize: 13, fontVariationSettings: "'FILL' 1" }}>check</span>}
        </div>
      </button>
      <GlassPanel
        className={`rounded-xl overflow-hidden transition-all ${
          selected ? 'border-blue-500 shadow-[0_0_0_2px_#3b82f6] bg-blue-500/5' : 'hover:border-primary/30'
        }`}
      >
        {/* 썸네일만 클릭 → 편집/재생 */}
        <div className="relative aspect-video bg-surface-container-highest cursor-pointer" onClick={onSelect}>
          <video src={`${item.url}#t=1`} className="w-full h-full object-cover" muted />
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
        </div>
        {/* 하단 영역: 버튼들만, 카드 클릭 없음 */}
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
          <p className="text-label-md text-on-surface truncate mb-2">{item.title || item.filename}</p>
          <div className="flex gap-2">
            <button
              onClick={onSelect}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-primary/15 text-primary hover:bg-primary/25 transition-colors text-[15px] font-semibold"
            >
              <Icon name={type === 'raw' ? 'edit' : 'play_arrow'} size={15} />
              {type === 'raw' ? '편집하기' : '재생'}
            </button>
            <button
              onClick={onDelete}
              title="삭제"
              className="w-9 h-9 flex items-center justify-center rounded-lg bg-error/10 text-error hover:bg-error/25 active:bg-error/30 transition-colors"
            >
              <Icon name="delete" size={15} />
            </button>
          </div>
        </div>
      </GlassPanel>
    </div>
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
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [singleDeleteFn, setSingleDeleteFn] = useState<(() => Promise<void>) | null>(null)
  const [showProcessModal, setShowProcessModal] = useState(false)
  const [processDuration, setProcessDuration] = useState(60)
  const [pendingProcessItems, setPendingProcessItems] = useState<{ filename: string; category: string }[]>([])
  const [showAddChannelModal, setShowAddChannelModal] = useState(false)
  const [cardStatuses, setCardStatuses] = useState<Map<string, CardProcessStatus>>(new Map())
  const prevShortsCountRef = useRef(0)
  const [collectToast, setCollectToast] = useState<CollectToastState | null>(null)
  const [watchingCollect, setWatchingCollect] = useState(false)
  const downloadsBeforeCollectRef = useRef(0)

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
    downloadsBeforeCollectRef.current = downloads.length
    setCollecting(true)
    setCollectToast(null)
    try {
      await api.collect(clearExisting, limitPerChannel)
      setWatchingCollect(true)
    } catch (e: any) {
      setCollectToast({ type: 'failed', error: e?.response?.data?.detail || e.message })
      setTimeout(() => setCollectToast(null), 5000)
    } finally {
      setCollecting(false)
    }
  }

  // 수집 완료 감지 — step이 'done'으로 바뀌고 downloads가 새로 고침된 뒤 실행
  useEffect(() => {
    if (!watchingCollect) return
    if (pipelineStatus?.step !== 'done') return
    setWatchingCollect(false)
    const newCount = downloads.length - downloadsBeforeCollectRef.current
    if (newCount > 0) {
      setCollectToast({ type: 'done', count: newCount })
      setTimeout(() => setCollectToast(null), 4000)
    } else {
      setCollectToast({ type: 'empty' })
      setTimeout(() => setCollectToast(null), 3000)
    }
  }, [downloads, watchingCollect, pipelineStatus?.step])

  // 수집 실패 감지
  useEffect(() => {
    if (!watchingCollect) return
    if (pipelineStatus?.step !== 'error') return
    setWatchingCollect(false)
    setCollectToast({ type: 'failed', error: pipelineStatus.message })
    setTimeout(() => setCollectToast(null), 5000)
  }, [watchingCollect, pipelineStatus?.step, pipelineStatus?.message])

  const isCollecting = collecting || pipelineStatus?.step === 'collecting'

  /* ── Media actions ── */
  const toggle = (fn: string) => setSelected(prev => {
    const s = new Set(prev); s.has(fn) ? s.delete(fn) : s.add(fn); return s
  })

  const toggleAll = () => {
    const items = activeTab === 'downloads' ? downloads.map(d => d.filename) : activeTab === 'raws' ? raws.map(r => r.filename) : shorts.map(s => s.filename)
    setSelected(prev => prev.size === items.length ? new Set() : new Set(items))
  }

  const handleDeleteSelected = () => {
    if (selected.size === 0) return
    setShowDeleteModal(true)
  }

  const confirmDeleteSelected = async () => {
    setDeleting(true)
    try {
      if (singleDeleteFn) {
        await singleDeleteFn()
        setSingleDeleteFn(null)
      } else {
        const fn = activeTab === 'downloads' ? api.deleteDownload : activeTab === 'raws' ? api.deleteRaw : api.deleteShort
        await Promise.all([...selected].map(f => fn(f)))
        setSelected(new Set())
      }
      loadMedia()
      setProcessMsg('삭제되었습니다.')
      setTimeout(() => setProcessMsg(''), 3000)
    } catch {
      setProcessMsg('삭제에 실패했습니다.')
      setTimeout(() => setProcessMsg(''), 3000)
    } finally {
      setDeleting(false)
      setShowDeleteModal(false)
    }
  }

  const openSingleDeleteModal = (fn: () => Promise<void>) => {
    setSingleDeleteFn(() => fn)
    setShowDeleteModal(true)
  }

  const handleProcessSelected = () => {
    const items = downloads.filter(d => selected.has(d.filename))
    if (items.length === 0) return
    setPendingProcessItems(items.map(d => ({ filename: d.filename, category: d.category })))
    setShowProcessModal(true)
  }

  // shorts 목록이 늘어나면 processing → done 으로 전환
  useEffect(() => {
    if (shorts.length > prevShortsCountRef.current) {
      setCardStatuses(prev => {
        const hasProcessing = [...prev.values()].some(v => v === 'processing')
        if (!hasProcessing) return prev
        const next = new Map(prev)
        for (const [key, val] of next) if (val === 'processing') next.set(key, 'done')
        return next
      })
      setTimeout(() => {
        setCardStatuses(prev => {
          const next = new Map(prev)
          for (const [key, val] of next) if (val === 'done') next.delete(key)
          return next
        })
      }, 3000)
    }
    prevShortsCountRef.current = shorts.length
  }, [shorts])

  const confirmProcessSelected = async () => {
    if (pendingProcessItems.length === 0) return
    setProcessing(true); setProcessMsg(''); setShowProcessModal(false)
    // 처리 시작 표시
    setCardStatuses(prev => {
      const next = new Map(prev)
      pendingProcessItems.forEach(item => next.set(item.filename, 'processing'))
      return next
    })
    try {
      await api.processSelected(pendingProcessItems, 1, processDuration)
      setProcessMsg(`${pendingProcessItems.length}${t.processStarted}`)
      setSelected(new Set())
    } catch (e: any) {
      // 실패 표시 후 5초 뒤 제거
      setCardStatuses(prev => {
        const next = new Map(prev)
        pendingProcessItems.forEach(item => next.set(item.filename, 'failed'))
        return next
      })
      setTimeout(() => {
        setCardStatuses(prev => {
          const next = new Map(prev)
          pendingProcessItems.forEach(item => { if (next.get(item.filename) === 'failed') next.delete(item.filename) })
          return next
        })
      }, 5000)
      setProcessMsg(`${t.failed}: ${e?.response?.data?.detail || e.message}`)
    } finally { setProcessing(false) }
  }

  const handleDownloadSelected = () => {
    const list = activeTab === 'shorts' ? shorts.filter(s => selected.has(s.filename))
      : activeTab === 'raws' ? raws.filter(r => selected.has(r.filename))
      : []
    list.forEach((item, i) => {
      setTimeout(() => {
        const a = document.createElement('a')
        a.href = item.url; a.download = item.filename; a.target = '_blank'
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
      <div>
        <h1 className="text-headline-lg text-on-surface font-bold">{t.navContentManagement}</h1>
        <p className="text-body-md text-on-surface-variant mt-1">
          {t.channelsSubtitle}
        </p>
      </div>

      {/* URL Direct Download */}
      <UrlDirectDownload onComplete={handleRefreshAll} />

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
            {/* Select All toggle */}
            <button onClick={toggleAll}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border transition-colors text-[13px] font-semibold ${
                selected.size > 0
                  ? 'border-primary/50 bg-primary/10 text-primary'
                  : 'border-outline-variant/30 text-on-surface-variant hover:bg-surface-bright/10'
              }`}>
              <Icon name={selected.size > 0 ? 'deselect' : 'select_all'} size={18} />
              {selected.size > 0 ? '전체 해제' : '전체 선택'}
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

      {/* ── Bulk Action Banner ── */}
      {isMediaTab && selected.size > 0 && (
        <div className="flex items-center justify-between px-4 py-3 rounded-2xl bg-primary/10 border border-primary/30">
          <div className="flex items-center gap-3">
            <span className="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-on-primary text-[12px] font-bold shrink-0">
              {selected.size}
            </span>
            <span className="font-semibold text-on-surface text-[15px]">
              {selected.size}개 선택됨
            </span>
          </div>
          <div className="flex items-center gap-2">
            {activeTab === 'downloads' && (
              <button onClick={handleProcessSelected} disabled={processing}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary/15 text-primary font-bold text-[14px] hover:bg-primary/25 transition-colors disabled:opacity-50">
                <Icon name="auto_awesome" size={16} />{t.process}
              </button>
            )}
            {(activeTab === 'shorts' || activeTab === 'raws') && (
              <button onClick={handleDownloadSelected}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary/15 text-primary font-bold text-[14px] hover:bg-primary/25 transition-colors">
                <Icon name="download" size={16} />{t.download}
              </button>
            )}
            <button onClick={handleDeleteSelected}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-error/15 text-error font-bold text-[14px] hover:bg-error/25 transition-colors">
              <Icon name="delete" size={16} />일괄 삭제
            </button>
            <button onClick={() => setSelected(new Set())}
              className="p-2 rounded-xl text-on-surface-variant hover:bg-surface-bright/10 transition-colors">
              <Icon name="close" size={18} />
            </button>
          </div>
        </div>
      )}

      {processMsg && (
        <div className={`p-3 rounded-xl text-label-sm font-medium ${
          processMsg.includes(t.failed) ? 'bg-error-container/20 text-error' : 'bg-tertiary/10 text-tertiary'
        }`}>{processMsg}</div>
      )}

      {/* ═══════════ Tab Content ═══════════ */}

      {/* ── Manage Tab (Channels) ── */}
      {activeTab === 'manage' && (
        <>
          {/* Bento Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left column */}
            <div className="lg:col-span-4 flex flex-col gap-4">
              {/* Section header — outside card, same level as right column header */}
              <div className="flex items-center gap-3 h-10">
                <Icon name="settings" size={20} className="text-tertiary" />
                <h3 className="text-[22px] font-semibold text-on-surface">{t.globalSettings}</h3>
              </div>
              <CollectionSettings
                clearExisting={clearExisting}
                setClearExisting={setClearExisting}
                limitPerChannel={limitPerChannel}
                setLimitPerChannel={setLimitPerChannel}
                onRun={handleRunPipeline}
                isCollecting={isCollecting}
                pipelineStatus={pipelineStatus}
                channels={channels}
              />
            </div>

            {/* Right column */}
            <div className="lg:col-span-8 flex flex-col gap-4">
              {/* Section header — same height as left column header */}
              <div className="flex items-center justify-between h-10">
                <h3 className="text-[22px] font-semibold text-on-surface">
                  {t.monitoredChannels} ({channels.length})
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowAddChannelModal(true)}
                    className="flex items-center gap-1.5 px-3 h-8 rounded-lg border border-primary/40 text-primary hover:bg-primary/10 transition-colors text-[16px] font-semibold"
                  >
                    <Icon name="add" size={16} />
                    채널 추가
                  </button>
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
                processingStatus={cardStatuses.get(d.filename)}
                onPlay={() => setPlayingVideo({
                  url: `/api/media/download/${encodeURIComponent(d.filename)}`,
                  title: d.filename,
                })}
                onProcess={() => {
                  setPendingProcessItems([{ filename: d.filename, category: d.category }])
                  setShowProcessModal(true)
                }}
                onDelete={() => openSingleDeleteModal(() => api.deleteDownload(d.filename))}
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
                onSelect={() => navigate('/editor', { state: { raw: r } })}
                onDelete={() => openSingleDeleteModal(() => api.deleteRaw(r.filename))}
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
                onDelete={() => openSingleDeleteModal(() => api.deleteShort(s.filename))}
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

      {/* AI Shorts Process Modal */}
      {showProcessModal && (
        <div
          className="fixed inset-0 z-[300] bg-black/70 backdrop-blur-sm flex items-center justify-center px-4"
          onClick={() => setShowProcessModal(false)}
          onKeyDown={e => e.key === 'Escape' && setShowProcessModal(false)}
        >
          <div
            className="w-full max-w-lg rounded-3xl border border-white/10 shadow-2xl overflow-hidden"
            style={{ background: 'linear-gradient(145deg, #0d1628 0%, #0b1220 100%)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-7 pt-7 pb-4">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl">✨</span>
                <h2 className="text-[22px] font-bold text-white">AI 쇼츠 생성 설정</h2>
              </div>
              <p className="text-[16px] text-white/50 leading-relaxed">
                생성될 쇼츠 영상의 최대 길이를 설정해주세요.<br/>
                AI가 선택한 길이 이내에서 가장 적합한 구간을 자동으로 추출합니다.
              </p>
            </div>

            {/* Duration picker card */}
            <div className="mx-7 rounded-2xl border border-white/10 bg-white/5 p-7">
              {/* Big time display */}
              <div className="text-center mb-6">
                <div className="text-[64px] font-bold leading-none tabular-nums"
                  style={{ background: 'linear-gradient(135deg, #818cf8, #c084fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                  {String(Math.floor(processDuration / 60)).padStart(2, '0')}:{String(processDuration % 60).padStart(2, '0')}
                </div>
                <div className="text-[18px] text-white/40 mt-2">
                  {Math.floor(processDuration / 60) > 0
                    ? `${Math.floor(processDuration / 60)}분 ${processDuration % 60 > 0 ? `${processDuration % 60}초` : ''}`
                    : `${processDuration}초`}
                </div>
              </div>

              {/* Slider */}
              <div className="relative">
                <input
                  type="range"
                  min={10}
                  max={120}
                  step={5}
                  value={processDuration}
                  onChange={e => setProcessDuration(Number(e.target.value))}
                  className="w-full h-2 rounded-full appearance-none cursor-pointer"
                  style={{ accentColor: '#818cf8' }}
                />
                <div className="flex justify-between text-[18px] text-white/30 mt-2">
                  <span>10초</span>
                  <span>2분</span>
                </div>
              </div>
            </div>

            {/* Presets */}
            <div className="px-7 mt-5">
              <p className="text-[18px] font-semibold text-white/40 uppercase tracking-widest mb-3">빠른 선택</p>
              <div className="grid grid-cols-5 gap-2">
                {[
                  { label: '15초', value: 15 },
                  { label: '30초', value: 30 },
                  { label: '1분', value: 60, recommended: true },
                  { label: '1분 30초', value: 90 },
                  { label: '2분', value: 120 },
                ].map(preset => (
                  <button
                    key={preset.value}
                    onClick={() => setProcessDuration(preset.value)}
                    className={`py-2.5 rounded-xl text-[16px] font-semibold transition-all border ${
                      processDuration === preset.value
                        ? 'border-violet-500/60 text-white'
                        : 'border-white/10 text-white hover:border-white/20'
                    }`}
                    style={processDuration === preset.value ? { background: 'rgba(139,92,246,0.15)' } : { background: 'rgba(255,255,255,0.03)' }}
                  >
                    {preset.label}
                    {preset.recommended && processDuration !== preset.value && (
                      <span className="block text-[10px] text-violet-400/60 mt-0.5">추천</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Info card */}
            <div className="mx-7 mt-5 rounded-2xl border border-violet-500/20 p-4" style={{ background: 'rgba(139,92,246,0.06)' }}>
              <div className="flex gap-3">
                <span className="text-lg mt-0.5">💡</span>
                <div>
                  <p className="text-[15.5px] font-semibold text-white/70 mb-1" style={{ letterSpacing: '-0.6px' }}>AI는 이렇게 동작합니다</p>
                  <p className="text-[15.5px] text-white/40 leading-relaxed" style={{ letterSpacing: '-0.6px' }}>
                    설정한 최대 길이 내에서 가장 몰입도 높은 구간을 자동 분석하여 쇼츠를 생성합니다.<br/>
                    길이를 길게 설정할수록 더 많은 내용이 포함될 수 있습니다.
                  </p>
                </div>
              </div>
            </div>

            {/* Bottom buttons */}
            <div className="flex gap-3 px-7 py-7">
              <button
                onClick={() => setShowProcessModal(false)}
                className="flex-1 h-12 rounded-xl border border-white/10 text-white/60 font-semibold hover:border-white/20 hover:text-white/80 transition-all"
                style={{ background: 'rgba(255,255,255,0.04)' }}
              >
                취소
              </button>
              <button
                onClick={confirmProcessSelected}
                className="flex-1 h-12 rounded-xl font-semibold text-white text-[15px] transition-all hover:opacity-90 active:scale-[0.98]"
                style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6, #ec4899)' }}
              >
                ✨ AI 쇼츠 생성 시작
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 수집 결과 토스트 ── */}
      {collectToast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[500] pointer-events-none"
          style={{ animation: 'collectToastSlideIn 0.3s ease-out' }}>
          <div className={`pointer-events-auto flex items-start gap-3 px-5 py-4 rounded-2xl border shadow-2xl backdrop-blur-sm min-w-[280px] max-w-sm ${
            collectToast.type === 'done' ? 'bg-surface-container border-tertiary/40' :
            collectToast.type === 'empty' ? 'bg-surface-container border-outline-variant/40' :
            'bg-surface-container border-error/40'
          }`}>
            {collectToast.type === 'done' ? (
              <>
                <span className="material-symbols-outlined text-tertiary flex-shrink-0 mt-0.5"
                  style={{ fontSize: 24, fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                <div>
                  <p className="text-[15px] font-bold text-on-surface">최신 영상 수집 완료</p>
                  <p className="text-[13px] text-on-surface-variant mt-0.5">
                    신규 영상 <strong className="text-on-surface">{collectToast.count}개</strong>를 가져왔습니다.
                  </p>
                </div>
              </>
            ) : collectToast.type === 'empty' ? (
              <>
                <span className="material-symbols-outlined text-on-surface-variant flex-shrink-0 mt-0.5"
                  style={{ fontSize: 24 }}>info</span>
                <div>
                  <p className="text-[15px] font-bold text-on-surface">새로운 영상이 없습니다</p>
                  <p className="text-[13px] text-on-surface-variant mt-0.5">이미 최신 영상을 수집했습니다.</p>
                </div>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-error flex-shrink-0 mt-0.5"
                  style={{ fontSize: 24 }}>error</span>
                <div>
                  <p className="text-[15px] font-bold text-on-surface">영상 수집 실패</p>
                  {collectToast.error && (
                    <p className="text-[13px] text-on-surface-variant mt-0.5 break-words">{collectToast.error}</p>
                  )}
                  <button
                    className="mt-1.5 text-[13px] text-primary font-semibold hover:underline"
                    onClick={() => { setCollectToast(null); handleRunPipeline() }}
                  >
                    다시 시도
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      <style>{`
        @keyframes collectToastSlideIn {
          from { opacity: 0; transform: translateX(-50%) translateY(-14px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>

      {/* Bulk Delete Confirm Modal */}
      {/* ── 채널 추가 모달 ── */}
      {showAddChannelModal && (
        <AddChannelModal
          onClose={() => setShowAddChannelModal(false)}
          onAdded={() => { setShowAddChannelModal(false); loadChannels() }}
        />
      )}

      {showDeleteModal && (
        <div className="fixed inset-0 z-[300] bg-black/60 flex items-center justify-center" onClick={() => setShowDeleteModal(false)}>
          <div className="bg-surface-container rounded-2xl border border-outline-variant/30 shadow-2xl p-6 w-[360px] mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <span className="w-10 h-10 rounded-full bg-error/15 flex items-center justify-center">
                <Icon name="delete" size={22} className="text-error" />
              </span>
              <h3 className="text-title-md font-bold text-on-surface">{singleDeleteFn ? '삭제 확인' : '일괄 삭제'}</h3>
            </div>
            <p className="text-body-md text-on-surface-variant mb-6">
              {singleDeleteFn
                ? <>이 항목을 <strong className="text-on-surface">삭제</strong>하시겠습니까?<br/>이 작업은 되돌릴 수 없습니다.</>
                : <>선택한 <strong className="text-on-surface">{selected.size}개</strong>를 삭제하시겠습니까?<br/>이 작업은 되돌릴 수 없습니다.</>
              }
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-outline-variant text-on-surface font-semibold hover:bg-surface-bright/10 transition-colors"
              >
                취소
              </button>
              <button
                onClick={confirmDeleteSelected}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl bg-error text-on-error font-semibold hover:bg-error/90 transition-colors disabled:opacity-50"
              >
                {deleting ? '삭제 중...' : '삭제'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
