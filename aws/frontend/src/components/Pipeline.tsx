import { useRef, useState, useEffect, useCallback } from 'react'
import { api, apiClient, getSessionId, PipelineStatus, FileCounts } from '../services/api'

function isQuotaError(e: any): boolean {
  return e?.response?.status === 403 && e?.response?.data?.detail?.code === 'quota_exceeded'
}

interface Props {
  status: PipelineStatus
  fileCounts: FileCounts
  isRunning: boolean
  onStartPolling: () => void
  onRefresh: () => void
  isMobile?: boolean
  onQuotaError: () => void
}

const CATEGORIES = [
  { value: 'sports',   label: '스포츠' },
  { value: 'economy',  label: '경제' },
  { value: 'politics', label: '정치' },
]

// 채널 URL에서 "어떤 채널인지" 한눈에 보이도록 핸들/채널명만 추출 (예: .../@SBSBiz/videos → @SBSBiz)
function channelName(url: string): string {
  const m = url.match(/youtube\.com\/(@[^/?#]+|channel\/[^/?#]+|c\/[^/?#]+|user\/[^/?#]+)/i)
  if (!m) return url
  return m[1].replace(/^channel\//, '채널 ').replace(/^c\//, '').replace(/^user\//, '')
}

export default function Pipeline({ status, fileCounts, isRunning, onStartPolling, onRefresh, isMobile = false, onQuotaError }: Props) {
  const [dragOver, setDragOver]             = useState(false)
  const [collectLimit, setCollectLimit]     = useState(3)
  const [oauthState, setOauthState]         = useState<{status:string; url?:string; code?:string} | null>(null)
  const [channels, setChannels]             = useState<{url:string; category:string}[]>([])
  const [showChannels, setShowChannels]     = useState(false)
  const [newChUrl, setNewChUrl]             = useState('')
  const [newChCategory, setNewChCategory]   = useState('sports')
  const [chLoading, setChLoading]           = useState(false)
  const oauthPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const checkOauth = useCallback(async () => {
    try {
      const r = await apiClient.get('/api/oauth-status')
      const d = r.data
      if (d.token_saved) { setOauthState({ status: 'done' }); clearInterval(oauthPollRef.current!); oauthPollRef.current = null }
      else if (d.status === 'waiting') setOauthState({ status: 'waiting', url: d.url, code: d.code })
      else if (d.status === 'error')   { setOauthState({ status: 'error' }); clearInterval(oauthPollRef.current!); oauthPollRef.current = null }
      else setOauthState({ status: d.status })
    } catch {}
  }, [])

  const startOauth = async () => {
    setOauthState({ status: 'starting' })
    await apiClient.post('/api/oauth-init')
    oauthPollRef.current = setInterval(checkOauth, 2000)
  }
  useEffect(() => { checkOauth() }, [checkOauth])
  useEffect(() => () => { if (oauthPollRef.current) clearInterval(oauthPollRef.current) }, [])

  const oauthDone = oauthState?.status === 'done'

  const loadChannels = useCallback(async () => {
    const { channels } = await api.getChannels()
    setChannels(channels)
  }, [])
  useEffect(() => { loadChannels() }, [loadChannels])

  const handleAddChannel = async () => {
    if (!newChUrl.trim()) return
    setChLoading(true)
    try {
      await api.addChannel(newChUrl.trim(), newChCategory)
      setNewChUrl('')
      await loadChannels()
    } catch {} finally { setChLoading(false) }
  }
  const handleRemoveChannel = async (url: string) => {
    await api.removeChannel(url)
    await loadChannels()
  }

  const [uploading, setUploading]     = useState(false)
  const [uploadPct, setUploadPct]     = useState(0)
  const [uploadMsg, setUploadMsg]     = useState<string | null>(null)
  const [clearExisting, setClearExisting] = useState(true)
  const [urlInput, setUrlInput]       = useState('')
  const [urlCategory, setUrlCategory] = useState('sports')
  const [urlStatus, setUrlStatus]     = useState<string | null>(null)
  const [urlLoading, setUrlLoading]   = useState(false)
  const urlPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const startUrlPoll = () => {
    if (urlPollRef.current) return
    urlPollRef.current = setInterval(async () => {
      try {
        const d = await api.getDownloadUrlStatus()
        if (d.status === 'done') {
          setUrlStatus(`✓ ${d.filename || '완료'}`); setUrlLoading(false)
          clearInterval(urlPollRef.current!); urlPollRef.current = null; onRefresh()
        } else if (d.status === 'error') {
          setUrlStatus(`오류: ${d.error}`); setUrlLoading(false)
          clearInterval(urlPollRef.current!); urlPollRef.current = null
        } else {
          setUrlStatus(d.message || '다운로드 중...')
        }
      } catch {}
    }, 1500)
  }
  useEffect(() => () => { if (urlPollRef.current) clearInterval(urlPollRef.current) }, [])

  const handleUrlDownload = async () => {
    const url = urlInput.trim()
    if (!url) return
    setUrlLoading(true); setUrlStatus('다운로드 시작...')
    try { await api.downloadUrl(url, urlCategory); startUrlPoll() }
    catch (e: any) {
      if (isQuotaError(e)) { onQuotaError(); setUrlStatus(null) }
      else setUrlStatus(`오류: ${e instanceof Error ? e.message : '알 수 없음'}`)
      setUrlLoading(false)
    }
  }

  const uploadFile = async (file: File) => {
    setUploading(true); setUploadPct(0); setUploadMsg(null)
    const form = new FormData(); form.append('file', file)
    try {
      const { data } = await apiClient.post('/api/upload-video', form, {
        onUploadProgress: (e: { loaded: number; total?: number }) => {
          if (e.total) setUploadPct(Math.round(e.loaded / e.total * 100))
        }
      })
      setUploadMsg(`✓ ${data.filename}`); onRefresh()
    } catch (e: any) {
      if (isQuotaError(e)) { onQuotaError() }
      else setUploadMsg('업로드 실패')
    }
    finally { setUploading(false) }
  }

  const run = (fn: () => Promise<void>) => async () => {
    try {
      await fn()
      onStartPolling()
    } catch (e: any) {
      if (isQuotaError(e)) { onQuotaError() }
      else throw e
    }
  }
  const steps = [
    { num: 1, activeSteps: ['collecting'],
      title: '영상 수집', icon: '⬇️', files: fileCounts.downloads,
      action: run(() => api.collect(clearExisting, collectLimit)), btnLabel: '채널 수집' },
    { num: 2, activeSteps: ['transcribing', 'analyzing', 'editing'],
      title: '영상 편집', icon: '✂️', files: fileCounts.videos,
      action: run(() => api.process(1)), btnLabel: '편집 시작' },
  ]

  const counters = [
    { n: fileCounts.downloads.length,   label: '영상',  color: '#1a73e8' },
    { n: fileCounts.videos.length,      label: '편집',  color: '#ea4335' },
  ]

  // 수집된 영상 관리 — 체크박스 선택 + 개별/일괄 삭제
  const [selectedDownloads, setSelectedDownloads] = useState<Set<string>>(new Set())
  const [deletingDownloads, setDeletingDownloads] = useState<Set<string>>(new Set())
  const editedDownloads = new Set(fileCounts.videos)

  // 목록이 바뀌면(새로고침/삭제) 더 이상 존재하지 않는 항목의 선택을 정리
  useEffect(() => {
    setSelectedDownloads(prev => {
      const next = new Set([...prev].filter(name => fileCounts.downloads.includes(name)))
      return next.size === prev.size ? prev : next
    })
  }, [fileCounts.downloads])

  const toggleDownloadSelect = (name: string) => {
    setSelectedDownloads(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name); else next.add(name)
      return next
    })
  }
  const toggleSelectAllDownloads = () => {
    setSelectedDownloads(prev =>
      prev.size === fileCounts.downloads.length ? new Set() : new Set(fileCounts.downloads)
    )
  }
  const removeDownload = async (name: string) => {
    setDeletingDownloads(prev => new Set(prev).add(name))
    try {
      await api.deleteDownload(`${name}.mp4`)
      setSelectedDownloads(prev => { const next = new Set(prev); next.delete(name); return next })
      onRefresh()
    } finally {
      setDeletingDownloads(prev => { const next = new Set(prev); next.delete(name); return next })
    }
  }
  const removeSelectedDownloads = async () => {
    const names = [...selectedDownloads]
    if (names.length === 0) return
    setDeletingDownloads(new Set(names))
    try {
      await Promise.all(names.map(name => api.deleteDownload(`${name}.mp4`)))
      setSelectedDownloads(new Set())
      onRefresh()
    } finally {
      setDeletingDownloads(new Set())
    }
  }

  // 수집된 영상 관리 카드 — 체크박스 | 썸네일 | 제목 | 상태 | 작업
  const videoCollectionCard = fileCounts.downloads.length > 0 && (
    <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--surface)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '12px 16px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>📼 수집된 영상</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>총 {fileCounts.downloads.length}개 영상이 수집되었습니다.</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={steps[0].action} className="btn-outlined" style={{ fontSize: 11, padding: '6px 12px', borderRadius: 8 }}>
            ↻ 다시 수집
          </button>
          <button onClick={removeSelectedDownloads} disabled={selectedDownloads.size === 0} className="btn-outlined"
            style={{
              fontSize: 11, padding: '6px 12px', borderRadius: 8,
              color: selectedDownloads.size > 0 ? 'var(--error)' : 'var(--muted)',
              borderColor: selectedDownloads.size > 0 ? 'var(--error)' : 'var(--border)',
              cursor: selectedDownloads.size > 0 ? 'pointer' : 'default',
            }}>
            🗑 선택 삭제{selectedDownloads.size > 0 ? ` (${selectedDownloads.size})` : ''}
          </button>
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--surface2)' }}>
              <th style={{ width: 36, padding: '8px 10px', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>
                <input type="checkbox"
                  checked={selectedDownloads.size > 0 && selectedDownloads.size === fileCounts.downloads.length}
                  onChange={toggleSelectAllDownloads}
                  style={{ cursor: 'pointer', accentColor: 'var(--primary)' }} />
              </th>
              <th style={{ width: 132, padding: '8px 10px', textAlign: 'left', color: 'var(--text2)', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>썸네일</th>
              <th style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--text2)', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>제목</th>
              <th style={{ width: 64, padding: '8px 10px', textAlign: 'center', color: 'var(--text2)', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>상태</th>
              <th style={{ width: 64, padding: '8px 10px', textAlign: 'center', color: 'var(--text2)', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>작업</th>
            </tr>
          </thead>
          <tbody>
            {fileCounts.downloads.map(name => {
              const done = editedDownloads.has(name)
              const deleting = deletingDownloads.has(name)
              return (
                <tr key={name} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                    <input type="checkbox" checked={selectedDownloads.has(name)} onChange={() => toggleDownloadSelect(name)}
                      style={{ cursor: 'pointer', accentColor: 'var(--primary)' }} />
                  </td>
                  <td style={{ padding: '6px 10px' }}>
                    <div style={{ width: 112, height: 198, borderRadius: 8, overflow: 'hidden', background: '#000' }}>
                      {/* fileCounts.downloads는 확장자 없는 stem이라 썸네일 URL에는 .mp4를 붙여줘야 함 — 서버에서 ffmpeg로 추출한 정지 이미지를 사용 */}
                      <img src={`/api/media/downloads/${getSessionId()}/${encodeURIComponent(`${name}.mp4`)}/thumbnail`} loading="lazy" alt={name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    </div>
                  </td>
                  <td style={{ padding: '6px 10px', maxWidth: 0 }}>
                    <div title={name} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)' }}>{name}</div>
                  </td>
                  <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 20,
                      background: done ? '#e6f4ea' : '#f1f3f4',
                      color: done ? '#34a853' : 'var(--muted)',
                    }}>
                      {done ? '완료' : '대기'}
                    </span>
                  </td>
                  <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                    <button onClick={() => removeDownload(name)} disabled={deleting}
                      style={{
                        fontSize: 11, padding: '4px 10px', borderRadius: 6,
                        background: 'var(--surface2)', color: 'var(--error)', border: '1px solid var(--border)',
                        cursor: deleting ? 'default' : 'pointer', opacity: deleting ? 0.5 : 1,
                      }}>
                      {deleting ? '...' : '삭제'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )

  if (isMobile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>

        {/* 상단 요약 카드 */}
        <div style={{ background: 'white', padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          {/* OAuth 상태 */}
          {!oauthDone ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, padding: '10px 12px', background: '#fff8e1', borderRadius: 10, border: '1px solid #ffe082' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 12, color: '#e65100' }}>⚠ YouTube 인증 필요</div>
                <div style={{ fontSize: 11, color: '#7f6000', marginTop: 1 }}>미인증 시 다운로드 차단</div>
              </div>
              <button onClick={startOauth} style={{ background: '#f57c00', color: 'white', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                🔑 인증
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, padding: '8px 12px', background: '#e6f4ea', borderRadius: 10, border: '1px solid #81c995' }}>
              <span style={{ fontSize: 14 }}>✅</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#2d7a47' }}>YouTube 인증 완료</span>
            </div>
          )}
          {oauthState?.status === 'waiting' && oauthState.url && (
            <div style={{ marginBottom: 12, padding: '10px 12px', background: '#e8f0fe', borderRadius: 10, border: '1px solid #aecbfa' }}>
              <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 4, color: '#1a73e8' }}>🔐 인증 진행 중</div>
              <div style={{ fontSize: 11, color: '#5f6368', marginBottom: 8 }}>
                코드 <b style={{ color: '#1a73e8', fontSize: 14 }}>{oauthState.code}</b> 를 아래 페이지에 입력하세요
              </div>
              <a href={oauthState.url} target="_blank" rel="noreferrer"
                style={{ display: 'block', textAlign: 'center', background: '#1a73e8', color: 'white', borderRadius: 8, padding: '8px 0', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>
                인증 페이지 열기 →
              </a>
            </div>
          )}

          {/* 통계 배지 */}
          <div style={{ display: 'flex', gap: 8 }}>
            {counters.map(c => (
              <div key={c.label} style={{ flex: 1, textAlign: 'center', padding: '8px 4px', background: c.n > 0 ? `${c.color}12` : '#f8f9fa', borderRadius: 10, border: `1px solid ${c.n > 0 ? `${c.color}40` : 'var(--border)'}` }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: c.n > 0 ? c.color : '#bdc1c6', lineHeight: 1.1 }}>{c.n}</div>
                <div style={{ fontSize: 10, fontWeight: 600, color: c.n > 0 ? c.color : 'var(--muted)', marginTop: 2 }}>{c.label}</div>
              </div>
            ))}
          </div>

        </div>

        {/* ── 검색창(구글 스타일) — URL로 영상 가져오기 ── */}
        <div style={{ background: 'white', padding: '20px 16px 18px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', letterSpacing: 0.4 }}>🔍 YouTube 영상으로 쇼츠 만들기</div>

          <div style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 6,
            padding: '4px 4px 4px 16px', borderRadius: 999,
            border: '1px solid var(--border)', boxShadow: '0 2px 12px rgba(32,33,36,0.08)',
            background: 'white',
          }}>
            <span style={{ fontSize: 15 }}>🔗</span>
            <input
              value={urlInput} onChange={e => setUrlInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !urlLoading) handleUrlDownload() }}
              placeholder="YouTube 영상 URL을 붙여넣으세요"
              style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontSize: 13, padding: '11px 0', color: 'var(--text)' }}
            />
            <button onClick={handleUrlDownload} disabled={urlLoading || !urlInput.trim()} className={urlInput.trim() ? 'btn-primary' : 'btn-outlined'}
              style={{ borderRadius: 999, padding: '10px 16px', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>
              {urlLoading ? <div className="spinner spinner-sm" style={{ borderTopColor: urlInput.trim() ? 'white' : 'var(--primary)' }} /> : '⬇ 다운로드'}
            </button>
          </div>

          <select value={urlCategory} onChange={e => setUrlCategory(e.target.value)}
            style={{ width: '100%', border: '1px solid var(--border)', background: 'var(--surface2)', borderRadius: 999, padding: '9px 16px', fontSize: 12, fontWeight: 600, color: 'var(--text2)', cursor: 'pointer', outline: 'none', textAlign: 'center', textAlignLast: 'center' }}>
            {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>

          {urlStatus && (
            <div style={{ fontSize: 12, fontWeight: 600, color: urlStatus.startsWith('✓') ? 'var(--success)' : urlStatus.startsWith('오류') ? 'var(--error)' : 'var(--primary)' }}>
              {urlStatus}
            </div>
          )}

          {/* 파일 업로드 드래그존 */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) uploadFile(f) }}
            onClick={() => fileInputRef.current?.click()}
            style={{
              width: '100%', border: `1.5px dashed ${dragOver ? 'var(--primary)' : 'var(--border)'}`,
              borderRadius: 999, padding: '9px 14px', textAlign: 'center', cursor: 'pointer',
              fontSize: 12, fontWeight: 600, color: dragOver ? 'var(--primary)' : 'var(--text2)',
              background: dragOver ? 'var(--primary-bg)' : 'var(--surface2)', transition: 'all .15s',
            }}>
            <input ref={fileInputRef} type="file" accept=".mp4,.mkv,.mov,.avi" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f) }} />
            {uploading ? `📁 ${uploadPct}% 업로드 중...` : '📁 또는 영상 파일 직접 업로드 (드래그 가능)'}
          </div>
          {uploadMsg && <div style={{ fontSize: 12, fontWeight: 600, color: uploadMsg.startsWith('✓') ? 'var(--success)' : 'var(--error)' }}>{uploadMsg}</div>}
        </div>

        {/* 파이프라인 스텝 리스트 */}
        <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {videoCollectionCard}
          {steps.map(step => {
            const isActive = step.activeSteps.includes(status.step)
            const isDone   = step.files.length > 0

            const borderColor = isActive ? '#1a73e8' : isDone ? '#34a853' : '#dadce0'
            const bgColor     = isActive ? '#f0f4ff' : isDone ? '#f6fef6' : 'white'
            const iconBg      = isActive ? '#1a73e8' : isDone ? '#e6f4ea' : '#f1f3f4'
            const iconColor   = isActive ? 'white' : isDone ? '#34a853' : '#9aa0a6'

            return (
              <div key={step.num} style={{ borderRadius: 14, overflow: 'hidden', border: `1.5px solid ${borderColor}`, background: bgColor, boxShadow: isActive ? '0 2px 12px rgba(26,115,232,0.12)' : '0 1px 4px rgba(0,0,0,0.05)' }}>

                {/* 스텝 헤더 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 14px 10px' }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: iconBg, color: iconColor, fontSize: isDone ? 16 : isActive ? 10 : 18, fontWeight: 700 }}>
                    {isDone ? '✓' : isActive ? <div className="spinner" /> : step.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: isActive ? '#1a73e8' : isDone ? '#2d7a47' : 'var(--text)' }}>{step.title}</div>
                    <div style={{ fontSize: 12, marginTop: 1, color: isActive ? '#1a73e8' : isDone ? '#34a853' : 'var(--muted)' }}>
                      {isActive ? (status.message || '처리 중...') : isDone ? `${step.files.length}개 완료` : '대기 중'}
                    </div>
                  </div>
                  {isDone && !isActive && (
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#34a853', background: '#e6f4ea', padding: '4px 10px', borderRadius: 20 }}>{step.files.length}</span>
                  )}
                  {isActive && status.progress > 0 && (
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#1a73e8' }}>{status.progress}%</span>
                  )}
                </div>

                {/* Step 1: URL 입력 + 채널 관리 */}
                {step.num === 1 && (
                  <div style={{ padding: '0 14px 12px', display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid var(--border)' }}>
                    <div style={{ paddingTop: 10, fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
                      💡 URL로 바로 가져오려면 상단 검색창을 이용하세요. 여기서는 자동 수집할 채널과 옵션을 관리할 수 있어요.
                    </div>

                    {/* 채널 관리 */}
                    <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                      <button onClick={() => setShowChannels(v => !v)}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: 'var(--surface2)', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                        <span>📋 채널 관리 {channels.length > 0 ? `(${channels.length}개)` : ''}</span>
                        <span style={{ fontSize: 11, color: 'var(--muted)' }}>{showChannels ? '▲' : '▼'}</span>
                      </button>
                      {showChannels && (
                        <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8, background: 'white' }}>
                          {channels.length === 0 && (
                            <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: '4px 0' }}>기본 채널 사용 중 (SBSBiz, MBC, SPOTV 등)</div>
                          )}
                          {channels.map(ch => (
                            <div key={ch.url} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600, color: 'var(--text)' }} title={ch.url}>{channelName(ch.url)}</span>
                              <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, background: ch.category === 'sports' ? '#e8f5e9' : ch.category === 'economy' ? '#fff8e1' : '#fce4ec', color: ch.category === 'sports' ? '#2e7d32' : ch.category === 'economy' ? '#f57f17' : '#c62828', whiteSpace: 'nowrap' }}>
                                {ch.category === 'sports' ? '스포츠' : ch.category === 'economy' ? '경제' : '정치'}
                              </span>
                              <button onClick={() => handleRemoveChannel(ch.url)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--error)', fontSize: 16, lineHeight: 1, padding: '0 2px' }}>×</button>
                            </div>
                          ))}
                          <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                            <input value={newChUrl} onChange={e => setNewChUrl(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter' && !chLoading) handleAddChannel() }}
                              placeholder="https://www.youtube.com/@채널명"
                              className="input-field" style={{ flex: 1, fontSize: 12 }} />
                            <select value={newChCategory} onChange={e => setNewChCategory(e.target.value)}
                              style={{ padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, color: 'var(--text)', background: 'white', outline: 'none' }}>
                              {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                            </select>
                            <button onClick={handleAddChannel} disabled={chLoading || !newChUrl.trim()} className="btn-primary"
                              style={{ padding: '6px 12px', fontSize: 12, whiteSpace: 'nowrap' }}>
                              {chLoading ? '...' : '+'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text2)', cursor: 'pointer' }}>
                        <input type="checkbox" checked={clearExisting} onChange={e => setClearExisting(e.target.checked)} style={{ cursor: 'pointer', accentColor: 'var(--primary)' }} />
                        수집 시 기존 파일 삭제
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                        채널당
                        <input type="number" min={1} max={20} value={collectLimit}
                          onChange={e => setCollectLimit(Math.max(1, Math.min(20, Number(e.target.value))))}
                          style={{ width: 44, padding: '4px 6px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, textAlign: 'center', color: 'var(--text)', background: 'white', outline: 'none' }} />
                        개
                      </label>
                    </div>
                  </div>
                )}

                {/* 진행 상태바 */}
                {isActive && (
                  <div style={{ height: 4, background: '#e8eaed' }}>
                    <div className="progress-bar" style={{ height: '100%', width: `${status.progress || 100}%`, transition: 'width .4s' }} />
                  </div>
                )}

                {/* 실행 버튼 */}
                <div style={{ padding: '10px 28px 14px' }}>
                  <button onClick={step.action} className="btn-primary"
                    style={{ width: '100%', padding: '12px 0', fontSize: 14, borderRadius: 10, fontWeight: 700 }}>
                    {isActive
                      ? <><div className="spinner spinner-sm" style={{ borderTopColor: 'white', marginRight: 8 }} />처리 중...</>
                      : step.btnLabel}
                  </button>
                </div>
              </div>
            )
          })}

          {/* 오류/완료 메시지 */}
          {status.step === 'error' && (
            <div style={{ padding: '14px 16px', background: '#fce8e6', border: '1.5px solid #f28b82', borderRadius: 12, fontSize: 13, color: 'var(--error)', fontWeight: 600 }}>
              ⚠ {status.message}
            </div>
          )}
          {status.step === 'done' && (
            <div style={{ padding: '14px 16px', background: '#e6f4ea', border: '1.5px solid #81c995', borderRadius: 12, fontSize: 13, color: 'var(--success)', fontWeight: 600 }}>
              ✓ {status.message}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── 데스크톱 레이아웃 — 가로 전체 폭, URL 검색창 중심 ──
  return (
    <aside className="card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>Pipeline</span>
        <button onClick={onRefresh} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '2px 4px', borderRadius: 4 }}
          title="새로고침">↻</button>
      </div>

      {!oauthDone ? (
        <div style={{ padding: '10px 14px', background: '#fff8e1', borderBottom: '1px solid #ffe082', flexShrink: 0 }}>
          {oauthState?.status === 'waiting' && oauthState.url ? (
            <div>
              <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 4, color: '#e65100' }}>🔐 YouTube 인증 진행 중</div>
              <div style={{ fontSize: 11, color: '#5f6368', marginBottom: 6, lineHeight: 1.5 }}>
                아래 URL에서 코드 <b style={{ color: '#1a73e8' }}>{oauthState.code}</b> 를 입력하세요
              </div>
              <a href={oauthState.url} target="_blank" rel="noreferrer"
                className="btn-primary" style={{ display: 'inline-block', fontSize: 11, padding: '5px 10px' }}>
                인증 페이지 열기 →
              </a>
            </div>
          ) : oauthState?.status === 'done' ? null : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 12, color: '#e65100' }}>⚠ YouTube 인증 필요</div>
                <div style={{ fontSize: 10, color: '#5f6368', marginTop: 1 }}>인증 없이는 다운로드가 차단될 수 있어요</div>
              </div>
              <button onClick={startOauth} className="btn-primary" style={{ fontSize: 11, padding: '5px 10px', background: '#f57c00', whiteSpace: 'nowrap' }}>
                🔑 인증 시작
              </button>
            </div>
          )}
        </div>
      ) : (
        <div style={{ padding: '6px 14px', background: '#e6f4ea', borderBottom: '1px solid #81c995', flexShrink: 0, fontSize: 11, color: '#34a853', fontWeight: 600 }}>
          ✓ YouTube 인증 완료
        </div>
      )}

      {/* ── 검색창(구글 스타일) — URL로 영상 가져오기 ── */}
      <div style={{ padding: '40px 24px 28px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text2)', letterSpacing: 0.4 }}>🔍 YouTube 영상으로 쇼츠 만들기</div>

        <div style={{
          width: '100%', maxWidth: 720, display: 'flex', alignItems: 'center', gap: 8,
          padding: '5px 6px 5px 22px', borderRadius: 999,
          border: '1px solid var(--border)', boxShadow: '0 2px 16px rgba(32,33,36,0.08)',
          background: 'white',
        }}>
          <span style={{ fontSize: 17 }}>🔗</span>
          <input
            value={urlInput} onChange={e => setUrlInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !urlLoading) handleUrlDownload() }}
            placeholder="YouTube 영상 URL을 붙여넣으세요"
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 15, padding: '13px 0', color: 'var(--text)' }}
          />
          <select value={urlCategory} onChange={e => setUrlCategory(e.target.value)}
            style={{ border: 'none', background: 'var(--surface2)', borderRadius: 999, padding: '10px 14px', fontSize: 12, fontWeight: 600, color: 'var(--text2)', cursor: 'pointer', outline: 'none' }}>
            {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <button onClick={handleUrlDownload} disabled={urlLoading || !urlInput.trim()} className={urlInput.trim() ? 'btn-primary' : 'btn-outlined'}
            style={{ borderRadius: 999, padding: '12px 24px', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>
            {urlLoading ? <div className="spinner spinner-sm" style={{ borderTopColor: urlInput.trim() ? 'white' : 'var(--primary)' }} /> : '⬇ 다운로드'}
          </button>
        </div>

        {urlStatus && (
          <div style={{ fontSize: 12, fontWeight: 600, color: urlStatus.startsWith('✓') ? 'var(--success)' : urlStatus.startsWith('오류') ? 'var(--error)' : 'var(--primary)' }}>
            {urlStatus}
          </div>
        )}

        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) uploadFile(f) }}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: `1.5px dashed ${dragOver ? 'var(--primary)' : 'var(--border)'}`,
            borderRadius: 999, padding: '8px 18px', cursor: 'pointer',
            fontSize: 12, fontWeight: 600, color: dragOver ? 'var(--primary)' : 'var(--text2)',
            background: dragOver ? 'var(--primary-bg)' : 'var(--surface2)', transition: 'all .15s',
          }}>
          <input ref={fileInputRef} type="file" accept=".mp4,.mkv,.mov,.avi" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f) }} />
          {uploading ? `📁 ${uploadPct}% 업로드 중...` : '📁 또는 영상 파일을 직접 업로드 (드래그 가능)'}
        </div>
        {uploadMsg && <div style={{ fontSize: 12, fontWeight: 600, color: uploadMsg.startsWith('✓') ? 'var(--success)' : 'var(--error)' }}>{uploadMsg}</div>}

        {/* ── 채널에서 가져오기 (콜랩서블) ── */}
        <div style={{ width: '100%', maxWidth: 720 }}>
          <button onClick={() => setShowChannels(v => !v)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              border: `1.5px solid ${showChannels ? 'var(--primary)' : 'var(--border)'}`,
              borderRadius: showChannels ? '18px 18px 0 0' : 999,
              padding: '8px 18px', cursor: 'pointer',
              fontSize: 12, fontWeight: 600, color: showChannels ? 'var(--primary)' : 'var(--text2)',
              background: showChannels ? '#f8f9ff' : 'var(--surface2)', transition: 'all .15s',
            }}>
            <span>📋 자주 쓰는 채널에서 가져오기 {channels.length > 0 ? `(${channels.length}개 등록됨)` : '(기본 채널 사용)'}</span>
            <span style={{ fontSize: 10 }}>{showChannels ? '▲' : '▼'}</span>
          </button>
          {/* 펼치지 않아도 어떤 채널이 등록돼 있는지 한눈에 보이도록 미리보기 칩을 표시 */}
          {!showChannels && channels.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', padding: '8px 4px 0' }}>
              {channels.slice(0, 6).map(ch => (
                <span key={ch.url} title={ch.url} style={{
                  fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 999,
                  background: ch.category === 'sports' ? '#e8f5e9' : ch.category === 'economy' ? '#fff8e1' : '#fce4ec',
                  color: ch.category === 'sports' ? '#2e7d32' : ch.category === 'economy' ? '#f57f17' : '#c62828',
                  whiteSpace: 'nowrap',
                }}>
                  {channelName(ch.url)}
                </span>
              ))}
              {channels.length > 6 && (
                <span style={{ fontSize: 11, color: 'var(--muted)', padding: '3px 6px' }}>+{channels.length - 6}개 더</span>
              )}
            </div>
          )}
          {showChannels && (
            <div style={{
              border: '1.5px solid var(--primary)', borderTop: 'none', borderRadius: '0 0 18px 18px',
              padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10,
              background: 'white', boxShadow: '0 8px 24px rgba(32,33,36,0.06)',
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {channels.length === 0 && (
                  <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', padding: '4px 0' }}>
                    채널 없음 → 기본 채널(SBSBiz, MBC, SPOTV 등) 사용
                  </div>
                )}
                {channels.map(ch => (
                  <div key={ch.url} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600, color: 'var(--text)' }} title={ch.url}>{channelName(ch.url)}</span>
                    <span style={{ padding: '1px 8px', borderRadius: 10, fontSize: 11, background: ch.category === 'sports' ? '#e8f5e9' : ch.category === 'economy' ? '#fff8e1' : '#fce4ec', color: ch.category === 'sports' ? '#2e7d32' : ch.category === 'economy' ? '#f57f17' : '#c62828', whiteSpace: 'nowrap' }}>
                      {ch.category === 'sports' ? '스포츠' : ch.category === 'economy' ? '경제' : '정치'}
                    </span>
                    <button onClick={() => handleRemoveChannel(ch.url)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--error)', fontSize: 15, lineHeight: 1, padding: '0 2px' }}>×</button>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 6 }}>
                  <input value={newChUrl} onChange={e => setNewChUrl(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !chLoading) handleAddChannel() }}
                    placeholder="https://www.youtube.com/@채널명"
                    className="input-field" style={{ flex: 1, fontSize: 12 }} />
                  <select value={newChCategory} onChange={e => setNewChCategory(e.target.value)}
                    style={{ padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, color: 'var(--text)', background: 'white', cursor: 'pointer', outline: 'none' }}>
                    {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                  <button onClick={handleAddChannel} disabled={chLoading || !newChUrl.trim()} className="btn-primary"
                    style={{ padding: '6px 12px', fontSize: 12, whiteSpace: 'nowrap' }}>
                    {chLoading ? '...' : '+ 추가'}
                  </button>
                </div>
              </div>

              <div style={{ height: 1, background: 'var(--border)' }} />

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text2)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={clearExisting} onChange={e => setClearExisting(e.target.checked)} style={{ cursor: 'pointer', accentColor: 'var(--primary)' }} />
                  채널 수집 시 기존 파일 삭제
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                  채널당
                  <input type="number" min={1} max={20} value={collectLimit}
                    onChange={e => setCollectLimit(Math.max(1, Math.min(20, Number(e.target.value))))}
                    style={{ width: 48, padding: '4px 6px', border: '1px solid var(--border)', borderRadius: 5, fontSize: 12, textAlign: 'center', color: 'var(--text)', background: 'white', outline: 'none' }} />
                  개
                </label>
              </div>

              <button onClick={steps[0].action} className="btn-primary" style={{ padding: '10px 0', fontSize: 13, fontWeight: 700, borderRadius: 999 }}>
                {steps[0].activeSteps.includes(status.step)
                  ? <><div className="spinner spinner-sm" style={{ borderTopColor: 'white', marginRight: 6 }} />처리 중...</>
                  : `⬇ ${steps[0].btnLabel}`}
              </button>
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
      <div style={{ width: '100%', maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 1, background: 'var(--border)' }}>
        {counters.map(({ n, label }) => (
          <div key={label} style={{ width: '100%', background: 'var(--surface2)' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 8, padding: '8px 4px' }}>
              <span style={{ fontSize: 20, fontWeight: 700, color: n > 0 ? 'var(--primary)' : 'var(--muted)', lineHeight: 1.2 }}>{n}</span>
              <span style={{ fontSize: 10, color: 'var(--text2)' }}>{label}</span>
            </div>
          </div>
        ))}
      </div>
      </div>

      {/* 수집된 영상 관리 — 체크박스 | 썸네일 | 제목 | 상태 | 작업 */}
      {videoCollectionCard && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 16px 0' }}>
          <div style={{ width: '100%', maxWidth: 720 }}>{videoCollectionCard}</div>
        </div>
      )}

      {isRunning && (
        <div style={{ height: 3, background: '#e8eaed', flexShrink: 0 }}>
          <div className="progress-bar" style={{ height: '100%', width: `${status.progress}%`, transition: 'width .4s' }} />
        </div>
      )}

      {/* ── 단계 카드 — 가로 배치 (영상 수집은 위 히어로의 "채널에서 가져오기"로 통합되어 카드는 표시하지 않음) ── */}
      <div style={{ padding: 16, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'stretch', justifyContent: 'center' }}>
        {steps.filter(step => step.num !== 1).map(step => {
          const isActive = step.activeSteps.includes(status.step)
          const isDone   = step.files.length > 0

          return (
            <div key={step.num} style={{
              flex: '0 1 720px', width: '100%', display: 'flex', flexDirection: 'column',
              border: `1px solid ${isActive ? 'var(--primary)' : 'var(--border)'}`,
              borderRadius: 10, overflow: 'hidden',
              background: isActive ? '#f8f9ff' : 'var(--surface)',
              transition: 'border-color .2s',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px' }}>
                <div style={{
                  width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: isActive ? 10 : 12,
                  background: isDone ? '#e6f4ea' : isActive ? 'var(--primary)' : 'var(--surface2)',
                  color: isDone ? '#34a853' : isActive ? 'white' : 'var(--muted)',
                  fontWeight: 700, border: isDone ? '1px solid #34a853' : isActive ? 'none' : '1px solid var(--border)',
                }}>
                  {isDone ? '✓' : isActive ? <div className="spinner spinner-sm" /> : step.num}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: isActive ? 'var(--primary)' : 'var(--text)' }}>{step.title}</div>
                  {isDone && !isActive && <div style={{ fontSize: 11, color: 'var(--success)' }}>{step.files.length}개 완료</div>}
                  {isActive && <div style={{ fontSize: 11, color: 'var(--primary)' }}>{status.message}</div>}
                </div>
              </div>

              <div style={{ padding: '12px 48px', marginTop: 'auto' }}>
                <button onClick={step.action} className="btn-primary"
                  style={{ width: '100%', padding: '8px 0' }}>
                  {isActive ? <><div className="spinner spinner-sm" style={{ borderTopColor: 'white', marginRight: 6 }} />처리 중...</> : step.btnLabel}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {status.step === 'error' && (
        <div style={{ margin: '0 16px 16px', padding: '10px 12px', background: '#fce8e6', border: '1px solid #f28b82', borderRadius: 8, fontSize: 12, color: 'var(--error)' }}>
          ⚠ {status.message}
        </div>
      )}
      {status.step === 'done' && (
        <div style={{ margin: '0 16px 16px', padding: '10px 12px', background: '#e6f4ea', border: '1px solid #81c995', borderRadius: 8, fontSize: 12, color: 'var(--success)' }}>
          ✓ {status.message}
        </div>
      )}
    </aside>
  )
}
