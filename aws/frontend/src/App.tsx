import { useState, useEffect, useCallback, useRef } from 'react'
import Header from './components/Header'
import Pipeline from './components/Pipeline'
import ShortsPanel from './components/ShortsPanel'
import AuthModal from './components/AuthModal'
import LandingPage from './components/LandingPage'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { api, PipelineStatus, FileCounts, ShortInfo, RawInfo, Quota } from './services/api'

type MobileView = 'pipeline' | 'shorts'

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    setIsMobile(mq.matches)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return isMobile
}

const MOBILE_TABS: { key: MobileView; icon: string; label: string }[] = [
  { key: 'pipeline', icon: '⚙️', label: '파이프라인' },
  { key: 'shorts',   icon: '🎬', label: '편집실' },
]

function ShortsStudio() {
  const [status, setStatus]     = useState<PipelineStatus>({ step: 'idle', message: '대기 중', progress: 0 })
  const [fileCounts, setFileCounts] = useState<FileCounts>({ downloads: [], videos: [], transcripts: [], analyses: [], shorts: [] })
  const [shorts, setShorts]     = useState<ShortInfo[]>([])
  const [raws, setRaws]         = useState<RawInfo[]>([])
  const [selectedShort, setSelectedShort] = useState<ShortInfo | null>(null)
  const [selectedRaw, setSelectedRaw]     = useState<RawInfo | null>(null)
  const [activeTab, setActiveTab] = useState<'raws' | 'shorts'>('raws')
  const [isPolling, setIsPolling] = useState(false)
  const [isPaused, setIsPaused]   = useState(false)
  const [mobileView, setMobileView] = useState<MobileView>('pipeline')
  const [quota, setQuota]         = useState<Quota | null>(null)
  const [quotaNotice, setQuotaNotice] = useState(false)

  const isMobile = useIsMobile()
  const isRunning = !['idle', 'done', 'error'].includes(status.step)

  const fetchStatus = useCallback(async () => {
    try { const d = await api.getStatus(); setStatus(d); return d } catch { return null }
  }, [])
  const fetchFiles  = useCallback(async () => { try { setFileCounts(await api.getFiles()) } catch {} }, [])
  const fetchShorts = useCallback(async () => { try { setShorts((await api.getShorts()).shorts) } catch {} }, [])
  const fetchRaws   = useCallback(async () => { try { setRaws((await api.getRaws()).raws) } catch {} }, [])
  const fetchQuota  = useCallback(async () => { try { setQuota(await api.getQuota()) } catch {} }, [])
  const startPolling = useCallback(() => setIsPolling(true), [])
  const onQuotaError = useCallback(() => { setQuotaNotice(true); fetchQuota() }, [fetchQuota])

  useEffect(() => {
    fetchStatus(); fetchFiles(); fetchShorts(); fetchRaws(); fetchQuota()
  }, [fetchStatus, fetchFiles, fetchShorts, fetchRaws, fetchQuota])

  useEffect(() => {
    if (!isPolling) return
    const iv = setInterval(async () => {
      const d = await fetchStatus()
      await fetchFiles()
      if (d && ['idle', 'done', 'error'].includes(d.step)) {
        setIsPolling(false); setIsPaused(false)
        await fetchShorts(); await fetchRaws()
      }
    }, 2000)
    return () => clearInterval(iv)
  }, [isPolling, fetchStatus, fetchFiles, fetchShorts, fetchRaws])

  const handleRefresh = async () => { await fetchFiles(); await fetchShorts(); await fetchRaws() }

  const shortsPanelProps = {
    activeTab, onTabChange: setActiveTab,
    shorts, raws,
    selectedShort, selectedRaw,
    onSelectShort: (s: ShortInfo | null) => setSelectedShort(s),
    onSelectRaw:   (r: RawInfo | null)   => setSelectedRaw(r),
    onRefresh: handleRefresh, onStartPolling: startPolling,
    isMobile,
  }

  const progressBar = isRunning && (
    <div style={{ height: 3, background: '#e8eaed', flexShrink: 0 }}>
      <div className="progress-bar" style={{ height: '100%', width: `${status.progress}%`, transition: 'width .4s' }} />
    </div>
  )

  if (isMobile) {
    return (
      <div style={{ minHeight: '100dvh', background: 'var(--bg)' }}>
        {/* 헤더 — sticky */}
        <div style={{ position: 'sticky', top: 0, zIndex: 100, background: 'white', boxShadow: '0 1px 6px rgba(0,0,0,0.08)' }}>
          <Header
            status={status} isRunning={isRunning} isPaused={isPaused}
            onPause={async () => { await api.pause(); setIsPaused(true) }}
            onResume={async () => { await api.resume(); setIsPaused(false) }}
            quota={quota} quotaNotice={quotaNotice}
            compact
          />
          {progressBar}
        </div>

        {/* 콘텐츠 — 자연 스크롤, 하단 탭만큼 패딩 */}
        <div style={{ paddingBottom: 70 }}>
          {mobileView === 'pipeline' && (
            <Pipeline
              status={status} fileCounts={fileCounts} isRunning={isRunning}
              onStartPolling={startPolling} onRefresh={handleRefresh} isMobile
              onQuotaError={onQuotaError}
            />
          )}
          {mobileView === 'shorts' && <ShortsPanel {...shortsPanelProps} />}
        </div>

        {/* 하단 탭 — fixed */}
        <nav style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
          height: 58, display: 'flex',
          background: 'white', borderTop: '1px solid var(--border)',
          boxShadow: '0 -2px 10px rgba(0,0,0,0.07)',
        }}>
          {MOBILE_TABS.map(tab => (
            <button key={tab.key} onClick={() => setMobileView(tab.key)} style={{
              flex: 1, border: 'none', background: 'none', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
              color: mobileView === tab.key ? 'var(--primary)' : 'var(--muted)',
              borderTop: `2px solid ${mobileView === tab.key ? 'var(--primary)' : 'transparent'}`,
              transition: 'color .15s', fontFamily: 'inherit',
            }}>
              <span style={{ fontSize: 20, lineHeight: 1 }}>{tab.icon}</span>
              <span style={{ fontSize: 10, fontWeight: 600 }}>{tab.label}</span>
            </button>
          ))}
        </nav>
      </div>
    )
  }

  return (
    <div style={{ height: '100vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 100, background: 'white', boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
        <Header
          status={status} isRunning={isRunning} isPaused={isPaused}
          onPause={async () => { await api.pause(); setIsPaused(true) }}
          onResume={async () => { await api.resume(); setIsPaused(false) }}
          quota={quota} quotaNotice={quotaNotice}
        />
        {progressBar}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '16px 32px', maxWidth: 1440, margin: '0 auto', width: '100%' }}>
        <Pipeline
          status={status} fileCounts={fileCounts} isRunning={isRunning}
          onStartPolling={startPolling} onRefresh={handleRefresh} isMobile={false}
          onQuotaError={onQuotaError}
        />
        <div style={{ display: 'grid', height: '78vh', minHeight: 520 }}>
          <ShortsPanel {...shortsPanelProps} />
        </div>
      </div>
    </div>
  )
}

const SEEN_APP_KEY = 'gorila_seen_app'
type AppView = 'landing' | 'app'

function AppShell() {
  const { user, showAuthModal } = useAuth()
  const [view, setView] = useState<AppView>(() => (
    localStorage.getItem(SEEN_APP_KEY) ? 'app' : 'landing'
  ))
  const prevUserRef = useRef(user)

  // 로그아웃하면(로그인 상태 → 로그아웃) 초기 화면(랜딩)으로 돌아간다
  useEffect(() => {
    if (prevUserRef.current && !user) setView('landing')
    prevUserRef.current = user
  }, [user])

  const enterApp = useCallback(() => {
    localStorage.setItem(SEEN_APP_KEY, '1')
    setView('app')
  }, [])

  return (
    <>
      {view === 'landing' ? <LandingPage onStart={enterApp} /> : <ShortsStudio />}
      {showAuthModal && <AuthModal />}
    </>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  )
}
