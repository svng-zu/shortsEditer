import { useState, useEffect, useCallback } from 'react'
import { api, PipelineStatus, FileCounts, ShortInfo, RawInfo } from './services/api'
import LeftSidebar from './components/LeftSidebar'
import EditorWorkspace from './components/EditorWorkspace'
import PreviewPanel from './components/PreviewPanel'
import BottomNav from './components/BottomNav'

type MobileTab = 'pipeline' | 'editor' | 'preview'

export default function App() {
  const [status, setStatus]         = useState<PipelineStatus>({ step: 'idle', message: '대기 중', progress: 0 })
  const [fileCounts, setFileCounts] = useState<FileCounts>({ downloads: [], videos: [], transcripts: [], analyses: [], shorts: [] })
  const [shorts, setShorts]         = useState<ShortInfo[]>([])
  const [raws, setRaws]             = useState<RawInfo[]>([])
  const [selectedRaw, setSelectedRaw]     = useState<RawInfo | null>(null)
  const [selectedShort, setSelectedShort] = useState<ShortInfo | null>(null)
  const [activeTab, setActiveTab]   = useState<'raws' | 'shorts'>('raws')
  const [isPolling, setIsPolling]   = useState(false)
  const [mobileTab, setMobileTab]   = useState<MobileTab>('editor')

  const isRunning = !['idle', 'done', 'error'].includes(status.step)

  const fetchStatus = useCallback(async () => {
    try { const d = await api.getStatus(); setStatus(d); return d } catch { return null }
  }, [])
  const fetchFiles  = useCallback(async () => { try { setFileCounts(await api.getFiles()) } catch {} }, [])
  const fetchShorts = useCallback(async () => { try { setShorts((await api.getShorts()).shorts) } catch {} }, [])
  const fetchRaws   = useCallback(async () => { try { setRaws((await api.getRaws()).raws) } catch {} }, [])

  useEffect(() => {
    const init = async () => {
      const d = await fetchStatus()
      await Promise.all([fetchFiles(), fetchShorts(), fetchRaws()])
      if (d && !['idle', 'done', 'error'].includes(d.step)) setIsPolling(true)
    }
    init()
  }, [fetchStatus, fetchFiles, fetchShorts, fetchRaws])

  useEffect(() => {
    if (!isPolling) return
    const iv = setInterval(async () => {
      const d = await fetchStatus()
      await fetchFiles()
      if (d && ['idle', 'done', 'error'].includes(d.step)) {
        setIsPolling(false)
        await fetchShorts()
        await fetchRaws()
      }
    }, 2000)
    return () => clearInterval(iv)
  }, [isPolling, fetchStatus, fetchFiles, fetchShorts, fetchRaws])

  const refresh      = async () => { await fetchFiles(); await fetchShorts(); await fetchRaws() }
  const startPolling = () => setIsPolling(true)

  const sharedProps = {
    status, fileCounts,
    activeTab, onTabChange: setActiveTab,
    raws, shorts,
    selectedRaw, selectedShort,
    onSelectRaw: setSelectedRaw,
    onSelectShort: setSelectedShort,
    onRefresh: refresh,
    onStartPolling: startPolling,
    onUpdateTitle: async (filename: string, title: string) => {
      await api.updateTitle(filename, title)
      await fetchShorts()
    },
  }

  return (
    <div className="h-screen flex flex-col bg-slate-950 overflow-hidden">

      {/* ── Desktop: 2-column layout (lg+) — Editor에 Preview 내장 ── */}
      <div className="hidden lg:flex flex-1 overflow-hidden">
        <LeftSidebar {...sharedProps} />
        <EditorWorkspace {...sharedProps} />
      </div>

      {/* ── Mobile: single panel (< lg) ── */}
      <div className="flex lg:hidden flex-col flex-1 overflow-hidden">

        {/* Mobile header */}
        <header className="shrink-0 flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800">
          <h1 className="font-bold text-white text-sm">
            AI <span className="text-violet-400">Shorts</span> Studio
          </h1>

          {/* Status pill */}
          {isRunning ? (
            <div className="flex items-center gap-2 bg-violet-950/60 border border-violet-700/40 rounded-full px-3 py-1">
              <div className="spinner text-violet-400" style={{ width: 10, height: 10, borderWidth: 1.5 }} />
              <span className="text-[11px] text-violet-300 font-medium">{status.progress}%</span>
            </div>
          ) : (
            <div className={`w-2 h-2 rounded-full ${
              status.step === 'error' ? 'bg-red-400 animate-pulse' :
              status.step === 'done'  ? 'bg-green-400' : 'bg-slate-600'
            }`} />
          )}
        </header>

        {/* Running progress bar */}
        {isRunning && (
          <div className="h-0.5 bg-slate-800 shrink-0">
            <div className="h-full progress-shimmer transition-all duration-500" style={{ width: `${status.progress}%` }} />
          </div>
        )}

        {/* Active panel — 하단 네비 높이(56px + safe area)만큼 패딩 */}
        <div className="flex-1 overflow-y-auto"
          style={{ paddingBottom: 'calc(56px + env(safe-area-inset-bottom))' }}>
          {mobileTab === 'pipeline' && <LeftSidebar {...sharedProps} mobile />}
          {mobileTab === 'editor'   && <EditorWorkspace {...sharedProps} />}
          {mobileTab === 'preview'  && <PreviewPanel {...sharedProps} mobile />}
        </div>

        {/* Bottom navigation — fixed 고정 */}
        <div className="fixed bottom-0 inset-x-0 lg:hidden z-50">
          <BottomNav
            activeTab={mobileTab}
            onTabChange={setMobileTab}
            isRunning={isRunning}
            counts={{
              pipeline: fileCounts.downloads.length,
              editor:   raws.length,
              preview:  shorts.length,
            }}
          />
        </div>
      </div>

    </div>
  )
}
