import { useState, useEffect, useCallback } from 'react'
import Header from './components/Header'
import Pipeline from './components/Pipeline'
import ShortsPanel from './components/ShortsPanel'
import DetailPanel from './components/DetailPanel'
import { api, PipelineStatus, FileCounts, ShortInfo, RawInfo } from './services/api'

export default function App() {
  const [status, setStatus]     = useState<PipelineStatus>({ step: 'idle', message: '대기 중', progress: 0 })
  const [fileCounts, setFileCounts] = useState<FileCounts>({ downloads: [], videos: [], transcripts: [], analyses: [], shorts: [] })
  const [shorts, setShorts]     = useState<ShortInfo[]>([])
  const [raws, setRaws]         = useState<RawInfo[]>([])
  const [selectedShort, setSelectedShort] = useState<ShortInfo | null>(null)
  const [selectedRaw, setSelectedRaw]     = useState<RawInfo | null>(null)
  const [activeTab, setActiveTab] = useState<'raws' | 'shorts'>('raws')
  const [isPolling, setIsPolling] = useState(false)
  const [isPaused, setIsPaused]   = useState(false)

  const isRunning = !['idle', 'done', 'error'].includes(status.step)

  const fetchStatus = useCallback(async () => {
    try { const d = await api.getStatus(); setStatus(d); return d } catch { return null }
  }, [])
  const fetchFiles  = useCallback(async () => { try { setFileCounts(await api.getFiles()) } catch {} }, [])
  const fetchShorts = useCallback(async () => { try { setShorts((await api.getShorts()).shorts) } catch {} }, [])
  const fetchRaws   = useCallback(async () => { try { setRaws((await api.getRaws()).raws) } catch {} }, [])
  const startPolling = useCallback(() => setIsPolling(true), [])

  useEffect(() => {
    fetchStatus(); fetchFiles(); fetchShorts(); fetchRaws()
  }, [fetchStatus, fetchFiles, fetchShorts, fetchRaws])

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

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)', overflow: 'hidden' }}>

      <Header
        status={status} isRunning={isRunning} isPaused={isPaused}
        onPause={async () => { await api.pause(); setIsPaused(true) }}
        onResume={async () => { await api.resume(); setIsPaused(false) }}
      />

      {/* 진행바 */}
      {isRunning && (
        <div style={{ height: 3, background: '#e8eaed', flexShrink: 0 }}>
          <div className="progress-bar" style={{ height: '100%', width: `${status.progress}%`, transition: 'width .4s' }} />
        </div>
      )}

      {/* 3분할 */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '300px 1fr 280px', gap: 12, padding: 12, overflow: 'hidden', minHeight: 0 }}>
        <Pipeline
          status={status} fileCounts={fileCounts} isRunning={isRunning}
          onStartPolling={startPolling} onRefresh={handleRefresh}
        />
        <ShortsPanel
          activeTab={activeTab} onTabChange={setActiveTab}
          shorts={shorts} raws={raws}
          selectedShort={selectedShort} selectedRaw={selectedRaw}
          onSelectShort={setSelectedShort} onSelectRaw={setSelectedRaw}
          onRefresh={handleRefresh} onStartPolling={startPolling}
          isRunning={isRunning}
        />
        <DetailPanel
          activeTab={activeTab}
          selectedShort={selectedShort} selectedRaw={selectedRaw}
          onUpdateTitle={async (f, t) => { await api.updateTitle(f, t); await fetchShorts() }}
          onStartPolling={startPolling}
        />
      </div>

    </div>
  )
}
