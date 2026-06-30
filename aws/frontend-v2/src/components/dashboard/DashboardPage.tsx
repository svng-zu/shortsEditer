import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { api, PipelineStatus, ShortInfo, DownloadInfo } from '../../services/api'
import GlassPanel from '../ui/GlassPanel'
import Icon from '../ui/Icon'
import Badge from '../ui/Badge'
import Button from '../ui/Button'

/* ── Helpers ─────────────────────────────────────────────── */

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return '--:--'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, '0')}:${s.toString().padStart(2, '0')}`
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

function formatDate(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

/* ── Circular Progress ──────────────────────────────────── */

function CircularProgress({ progress, size = 52, stroke = 5 }: { progress: number; size?: number; stroke?: number }) {
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (progress / 100) * circumference

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none"
        stroke="currentColor" className="text-surface-container-highest" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none"
        stroke="url(#progress-gradient)" strokeWidth={stroke}
        strokeDasharray={circumference} strokeDashoffset={offset}
        strokeLinecap="round" className="transition-all duration-500" />
      <defs>
        <linearGradient id="progress-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#adc6ff" />
          <stop offset="100%" stopColor="#8ab4f8" />
        </linearGradient>
      </defs>
    </svg>
  )
}

/* ── Step Labels ────────────────────────────────────────── */

const STEP_LABEL: Record<string, string> = {
  idle: '대기 중',
  collecting: '영상 수집 중...',
  transcribing: '자막 생성 중...',
  analyzing: '분석 중...',
  editing: '편집 중...',
  done: '완료',
  error: '오류 발생',
}

/* ── 작업 중인 프로젝트 (최상단 고정) ───────────────────── */

function ActiveProjectCard({
  download,
  status,
}: {
  download: DownloadInfo
  status: PipelineStatus
}) {
  const progress = status.progress
  const stepText = status.message || STEP_LABEL[status.step] || status.step

  return (
    <GlassPanel className="rounded-2xl overflow-hidden group border-primary/20 hover:border-primary/40 transition-colors">
      <div className="relative aspect-video bg-surface-container-highest">
        {/* 썸네일 */}
        {download.thumbnail_url ? (
          <img src={download.thumbnail_url} alt="" className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Icon name="video_file" size={40} className="text-on-surface-variant/30" />
          </div>
        )}

        {/* 반투명 오버레이 */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/10" />

        {/* 진행률 원형 Progress + 텍스트 */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
          <div className="relative">
            <CircularProgress progress={progress} size={64} stroke={5} />
            <span className="absolute inset-0 flex items-center justify-center text-white text-label-md font-bold">
              {Math.round(progress)}%
            </span>
          </div>
          <span className="text-white/90 text-label-sm font-medium">{stepText}</span>
        </div>

        {/* Gradient Progress Bar 하단 */}
        <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-black/30">
          <div
            className="h-full rounded-r-full transition-all duration-500"
            style={{
              width: `${progress}%`,
              background: 'linear-gradient(90deg, #adc6ff, #8ab4f8, #adc6ff)',
            }}
          />
        </div>

        {/* 영상 길이 우측 하단 */}
        {download.duration != null && (
          <span className="absolute bottom-3 right-2 bg-black/70 text-white text-[11px] font-bold px-2 py-0.5 rounded">
            {formatDuration(download.duration)}
          </span>
        )}

        {/* 카테고리 뱃지 좌측 상단 */}
        <span className="absolute top-2 left-2">
          <Badge variant={categoryBadgeVariant(download.category)}>
            {download.category}
          </Badge>
        </span>
      </div>

      {/* 하단 정보 */}
      <div className="p-4">
        <p className="text-label-lg text-on-surface font-semibold line-clamp-2 mb-2" title={download.filename}>
          {truncateFilename(download.filename, 60)}
        </p>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full bg-primary/15 text-primary border border-primary/20 animate-pulse">
            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
            처리중
          </span>
          <span className="text-label-sm text-on-surface-variant">
            {Math.round(progress)}%
          </span>
        </div>
      </div>
    </GlassPanel>
  )
}

/* ── 완료된 프로젝트 카드 ───────────────────────────────── */

function CompletedShortCard({ short }: { short: ShortInfo }) {
  const navigate = useNavigate()

  return (
    <GlassPanel
      className="rounded-2xl overflow-hidden group hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 cursor-pointer"
      onClick={() => navigate(`/editor/${encodeURIComponent(short.filename)}`)}
    >
      <div className="relative aspect-video bg-surface-container-highest overflow-hidden">
        {short.url ? (
          <video
            src={`${short.url}#t=1`}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            muted
            preload="metadata"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Icon name="movie" size={40} className="text-on-surface-variant/30" />
          </div>
        )}

        {/* 호버 오버레이 */}
        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
            <Icon name="play_arrow" size={28} filled className="text-white" />
          </div>
        </div>

        {/* 카테고리 */}
        {short.category && (
          <span className="absolute top-2 left-2">
            <Badge variant={categoryBadgeVariant(short.category)}>
              {short.category}
            </Badge>
          </span>
        )}
      </div>

      {/* 하단 정보 */}
      <div className="p-4">
        <p className="text-label-md text-on-surface font-semibold line-clamp-2 mb-2" title={short.title || short.filename}>
          {short.title || truncateFilename(short.filename, 50)}
        </p>
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full bg-tertiary/15 text-tertiary border border-tertiary/20">
            <Icon name="check_circle" size={12} filled />
            완료
          </span>
          {short.channel_name && (
            <div className="flex items-center gap-1.5 min-w-0">
              {short.channel_thumbnail_url && (
                <img src={short.channel_thumbnail_url} alt="" className="w-4 h-4 rounded-full" />
              )}
              <span className="text-[11px] text-on-surface-variant truncate">{short.channel_name}</span>
            </div>
          )}
        </div>
      </div>
    </GlassPanel>
  )
}

/* ── 쇼츠 갤러리 미리보기 ───────────────────────────────── */

function ShortsGalleryPreview({ shorts }: { shorts: ShortInfo[] }) {
  return (
    <GlassPanel className="rounded-2xl p-6 h-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[24px] font-semibold text-on-surface">쇼츠 갤러리</h3>
        <Link to="/editor" className="text-[18px] text-primary hover:text-primary/80 transition-colors">
          전체 보기 →
        </Link>
      </div>

      {shorts.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-on-surface-variant/50">
          <div className="text-center">
            <Icon name="movie" size={48} className="mb-2 opacity-30" />
            <p className="text-label-sm">아직 쇼츠가 없습니다. 영상을 수집하고 변환해보세요.</p>
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
                  <video src={short.url} className="w-full h-full object-cover" muted preload="metadata" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Icon name="movie" size={36} className="text-on-surface-variant/30" />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-3">
                  <p className="text-[11px] font-medium text-white leading-tight line-clamp-2">
                    {short.title || truncateFilename(short.filename, 30)}
                  </p>
                </div>
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

/* ── 수집된 영상 (대기) ─────────────────────────────────── */

function DownloadCard({
  download,
  onProcess,
}: {
  download: DownloadInfo
  onProcess: () => void
}) {
  return (
    <GlassPanel className="rounded-2xl overflow-hidden group hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300">
      <div className="relative aspect-video bg-surface-container-highest overflow-hidden">
        {download.thumbnail_url ? (
          <img src={download.thumbnail_url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Icon name="video_file" size={40} className="text-on-surface-variant/30" />
          </div>
        )}

        {/* 호버 오버레이 */}
        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <button onClick={(e) => { e.stopPropagation(); onProcess() }}
            className="bg-primary text-on-primary px-5 py-2.5 rounded-xl font-bold text-label-md shadow-lg hover:brightness-110 active:scale-95 transition-all flex items-center gap-2">
            <Icon name="auto_awesome" size={18} />
            쇼츠로 변환하기
          </button>
        </div>

        {/* 영상 길이 */}
        {download.duration != null && (
          <span className="absolute bottom-2 right-2 bg-black/70 text-white text-[11px] font-bold px-2 py-0.5 rounded">
            {formatDuration(download.duration)}
          </span>
        )}

        {/* 카테고리 */}
        <span className="absolute top-2 left-2">
          <Badge variant={categoryBadgeVariant(download.category)}>
            {download.category}
          </Badge>
        </span>
      </div>

      <div className="p-4">
        <p className="text-label-md text-on-surface font-semibold line-clamp-2 mb-2" title={download.filename}>
          {truncateFilename(download.filename, 50)}
        </p>
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full bg-surface-container-highest text-on-surface-variant">
            <Icon name="schedule" size={12} />
            대기 중
          </span>
          {download.channel_name && (
            <div className="flex items-center gap-1.5 min-w-0">
              {download.channel_thumbnail_url && (
                <img src={download.channel_thumbnail_url} alt="" className="w-4 h-4 rounded-full" />
              )}
              <span className="text-[11px] text-on-surface-variant truncate">{download.channel_name}</span>
            </div>
          )}
        </div>
      </div>
    </GlassPanel>
  )
}

/* ── Floating Action Button ──────────────────────────────── */

function FAB() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const fabRef = useRef<HTMLDivElement>(null)

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
      {open && (
        <div className="flex flex-col gap-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <button
            onClick={() => { setOpen(false); navigate('/channels') }}
            className="flex items-center gap-3 pl-4 pr-5 py-3 rounded-2xl glass-panel-elevated text-on-surface text-label-md hover:bg-primary/10 transition-all whitespace-nowrap"
          >
            <Icon name="link" size={20} className="text-primary" />
            URL 다운로드
          </button>
          <button
            onClick={() => { setOpen(false); navigate('/channels') }}
            className="flex items-center gap-3 pl-4 pr-5 py-3 rounded-2xl glass-panel-elevated text-on-surface text-label-md hover:bg-primary/10 transition-all whitespace-nowrap"
          >
            <Icon name="subscriptions" size={20} className="text-tertiary" />
            채널 추가
          </button>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        className={`w-16 h-16 rounded-full bg-primary text-on-primary flex items-center justify-center shadow-lg shadow-primary/20 hover:brightness-110 active:scale-95 transition-all duration-200 ${open ? 'rotate-45' : ''}`}
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
  const [shorts, setShorts] = useState<ShortInfo[]>([])
  const [downloads, setDownloads] = useState<DownloadInfo[]>([])
  const [loading, setLoading] = useState(true)

  const [showProcessModal, setShowProcessModal] = useState(false)
  const [pendingItem, setPendingItem] = useState<{ filename: string; category: string } | null>(null)
  const [processDuration, setProcessDuration] = useState(60)
  const [processing, setProcessing] = useState(false)
  const [processError, setProcessError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [statusRes, shortsRes, downloadsRes] = await Promise.allSettled([
          api.getStatus(), api.getShorts(), api.getDownloads(),
        ])
        if (cancelled) return
        if (statusRes.status === 'fulfilled') setStatus(statusRes.value)
        if (shortsRes.status === 'fulfilled') setShorts(shortsRes.value.shorts)
        if (downloadsRes.status === 'fulfilled') setDownloads(downloadsRes.value.downloads)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const isActive = status.step !== 'idle' && status.step !== 'done' && status.step !== 'error'
    if (!isActive) return
    const interval = setInterval(async () => {
      try {
        const s = await api.getStatus()
        setStatus(s)
        if (s.step === 'done' || s.step === 'idle') {
          const [shortsRes, downloadsRes] = await Promise.allSettled([api.getShorts(), api.getDownloads()])
          if (shortsRes.status === 'fulfilled') setShorts(shortsRes.value.shorts)
          if (downloadsRes.status === 'fulfilled') setDownloads(downloadsRes.value.downloads)
        }
      } catch {}
    }, 2000)
    return () => clearInterval(interval)
  }, [status.step])

  const openProcessModal = useCallback((filename: string, category: string) => {
    setPendingItem({ filename, category })
    setProcessError(null)
    setShowProcessModal(true)
  }, [])

  const confirmProcess = useCallback(async () => {
    if (!pendingItem) return
    setProcessing(true)
    setProcessError(null)
    setShowProcessModal(false)
    try {
      await api.processSelected([pendingItem], 1, processDuration)
      const s = await api.getStatus()
      setStatus(s)
    } catch (e: any) {
      setProcessError(e?.response?.data?.detail || '처리를 시작할 수 없습니다.')
    } finally {
      setProcessing(false)
    }
  }, [pendingItem, processDuration])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Icon name="sync" size={32} className="text-primary animate-spin" />
      </div>
    )
  }

  const isActive = status.step !== 'idle' && status.step !== 'done' && status.step !== 'error'
  const activeDownload = isActive ? downloads[0] : null

  return (
    <div className="space-y-8 max-w-[1400px]">

      {/* ── 1. 작업 중인 프로젝트 (최상단 고정) ── */}
      {isActive && activeDownload && (
        <section>
          <div className="flex items-center gap-3 mb-4">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-primary" />
            </span>
            <h2 className="text-title-lg text-on-surface font-bold">작업 중인 프로젝트</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <ActiveProjectCard download={activeDownload} status={status} />
          </div>
        </section>
      )}

      {/* ── 2. 쇼츠 갤러리 ── */}
      <ShortsGalleryPreview shorts={shorts} />

      {/* ── 3. 완료된 쇼츠 ── */}
      {shorts.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[24px] font-semibold text-on-surface">완료된 쇼츠</h2>
            <Link to="/editor" className="text-[18px] text-primary hover:text-primary/80 transition-colors">
              전체 보기 →
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {shorts.slice(0, 8).map((s) => (
              <CompletedShortCard key={s.filename} short={s} />
            ))}
          </div>
        </section>
      )}

      {/* ── 4. 수집된 영상 (대기) ── */}
      {downloads.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[24px] font-semibold text-on-surface">수집된 영상</h2>
            <Link to="/channels?tab=downloads" className="text-[18px] text-primary hover:text-primary/80 transition-colors">
              전체 보기 →
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {downloads.map((dl) => (
              <DownloadCard key={dl.filename} download={dl} onProcess={() => openProcessModal(dl.filename, dl.category)} />
            ))}
          </div>
        </section>
      )}

      {/* 빈 상태 */}
      {shorts.length === 0 && downloads.length === 0 && !isActive && (
        <GlassPanel className="rounded-2xl p-16 text-center">
          <Icon name="rocket_launch" size={56} className="text-on-surface-variant/20 mx-auto mb-4" />
          <p className="text-title-md text-on-surface mb-2">시작해볼까요?</p>
          <p className="text-body-md text-on-surface-variant mb-6">채널을 추가하거나 URL을 입력해서 영상을 수집해보세요.</p>
          <Button variant="primary" onClick={() => navigate('/channels')}>
            <Icon name="add" size={18} />
            영상 수집하기
          </Button>
        </GlassPanel>
      )}

      {/* 처리 상태 메시지 */}
      {processing && (
        <div className="fixed bottom-24 md:bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-primary/90 text-on-primary px-6 py-3 rounded-2xl shadow-lg">
          <span className="w-4 h-4 border-2 border-on-primary/40 border-t-on-primary rounded-full animate-spin" />
          쇼츠 생성 중...
        </div>
      )}
      {processError && (
        <div className="fixed bottom-24 md:bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-error/90 text-on-error px-6 py-3 rounded-2xl shadow-lg cursor-pointer"
          onClick={() => setProcessError(null)}>
          <Icon name="error" size={18} />
          {processError}
        </div>
      )}

      {/* AI 쇼츠 생성 설정 모달 */}
      {showProcessModal && (
        <div
          className="fixed inset-0 z-[300] bg-black/70 backdrop-blur-sm flex items-center justify-center px-4"
          onClick={() => setShowProcessModal(false)}
        >
          <div
            className="w-full max-w-lg rounded-3xl border border-white/10 shadow-2xl overflow-hidden"
            style={{ background: 'linear-gradient(145deg, #0d1628 0%, #0b1220 100%)' }}
            onClick={e => e.stopPropagation()}
          >
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

            <div className="mx-7 rounded-2xl border border-white/10 bg-white/5 p-7">
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
              <input
                type="range" min={10} max={120} step={5}
                value={processDuration}
                onChange={e => setProcessDuration(Number(e.target.value))}
                className="w-full h-2 rounded-full appearance-none cursor-pointer"
                style={{ accentColor: '#818cf8' }}
              />
              <div className="flex justify-between text-[18px] text-white/30 mt-2">
                <span>10초</span><span>2분</span>
              </div>
            </div>

            <div className="px-7 mt-5">
              <p className="text-[18px] font-semibold text-white/40 uppercase tracking-widest mb-3">빠른 선택</p>
              <div className="grid grid-cols-5 gap-2">
                {[
                  { label: '15초', value: 15 },
                  { label: '30초', value: 30 },
                  { label: '1분', value: 60 },
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
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3 px-7 py-7">
              <button
                onClick={() => setShowProcessModal(false)}
                className="flex-1 h-12 rounded-xl border border-white/10 text-white/60 font-semibold hover:border-white/20 hover:text-white/80 transition-all"
                style={{ background: 'rgba(255,255,255,0.04)' }}
              >
                취소
              </button>
              <button
                onClick={confirmProcess}
                className="flex-1 h-12 rounded-xl font-semibold text-white text-[15px] transition-all hover:opacity-90 active:scale-[0.98]"
                style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6, #ec4899)' }}
              >
                ✨ AI 쇼츠 생성 시작
              </button>
            </div>
          </div>
        </div>
      )}

      <FAB />
    </div>
  )
}
