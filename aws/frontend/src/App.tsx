import { useState, useEffect, useCallback } from 'react'
import Header from './components/Header'
import Pipeline from './components/Pipeline'
import ShortsPanel from './components/ShortsPanel'
import DetailPanel from './components/DetailPanel'
import { api, PipelineStatus, FileCounts, ShortInfo, RawInfo } from './services/api'

export default function App() {
  const [status, setStatus] = useState<PipelineStatus>({
    step: 'idle',
    message: '대기 중',
    progress: 0,
  })
  const [fileCounts, setFileCounts] = useState<FileCounts>({
    downloads: [],
    videos: [],
    transcripts: [],
    analyses: [],
    shorts: [],
  })
  const [shorts, setShorts] = useState<ShortInfo[]>([])
  const [raws, setRaws] = useState<RawInfo[]>([])
  const [selectedShort, setSelectedShort] = useState<ShortInfo | null>(null)
  const [selectedRaw, setSelectedRaw] = useState<RawInfo | null>(null)
  const [activeTab, setActiveTab] = useState<'raws' | 'shorts'>('raws')
  const [isPolling, setIsPolling] = useState(false)

  const fetchStatus = useCallback(async () => {
    try {
      const data = await api.getStatus()
      setStatus(data)
      return data
    } catch (e) {
      console.error('Failed to fetch status:', e)
      return null
    }
  }, [])

  const fetchFiles = useCallback(async () => {
    try {
      const data = await api.getFiles()
      setFileCounts(data)
    } catch (e) {
      console.error('Failed to fetch files:', e)
    }
  }, [])

  const fetchShorts = useCallback(async () => {
    try {
      const data = await api.getShorts()
      setShorts(data.shorts)
    } catch (e) {
      console.error('Failed to fetch shorts:', e)
    }
  }, [])

  const fetchRaws = useCallback(async () => {
    try {
      const data = await api.getRaws()
      setRaws(data.raws)
    } catch (e) {
      console.error('Failed to fetch raws:', e)
    }
  }, [])

  const startPolling = useCallback(() => {
    setIsPolling(true)
  }, [])

  useEffect(() => {
    // Initial fetch
    fetchStatus()
    fetchFiles()
    fetchShorts()
    fetchRaws()
  }, [fetchStatus, fetchFiles, fetchShorts, fetchRaws])

  useEffect(() => {
    if (!isPolling) return

    const interval = setInterval(async () => {
      const data = await fetchStatus()
      await fetchFiles()

      if (data && ['idle', 'done', 'error'].includes(data.step)) {
        setIsPolling(false)
        await fetchShorts()
        await fetchRaws()
      }
    }, 2000)

    return () => clearInterval(interval)
  }, [isPolling, fetchStatus, fetchFiles, fetchShorts, fetchRaws])

  const handleRefresh = async () => {
    await fetchFiles()
    await fetchShorts()
    await fetchRaws()
  }

  return (
    <div className="flex flex-col h-screen">
      <Header status={status} />

      <div className="flex-1 grid grid-cols-[300px_1fr_280px] overflow-hidden">
        {/* Left Panel - Pipeline */}
        <Pipeline
          status={status}
          fileCounts={fileCounts}
          onStartPolling={startPolling}
          onRefresh={handleRefresh}
        />

        {/* Center Panel - Shorts/Raws */}
        <ShortsPanel
          activeTab={activeTab}
          onTabChange={setActiveTab}
          shorts={shorts}
          raws={raws}
          selectedShort={selectedShort}
          selectedRaw={selectedRaw}
          onSelectShort={setSelectedShort}
          onSelectRaw={setSelectedRaw}
          onRefresh={handleRefresh}
          onStartPolling={startPolling}
        />

        {/* Right Panel - Details */}
        <DetailPanel
          selectedShort={selectedShort}
          selectedRaw={selectedRaw}
          activeTab={activeTab}
          onUpdateTitle={async (filename, title) => {
            await api.updateTitle(filename, title)
            await fetchShorts()
          }}
        />
      </div>
    </div>
  )
}
