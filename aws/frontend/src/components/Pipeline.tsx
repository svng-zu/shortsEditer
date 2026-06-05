import { useRef, useState, useEffect, useCallback } from 'react'
import { api, apiClient, PipelineStatus, FileCounts } from '../services/api'

interface Props {
  status: PipelineStatus
  fileCounts: FileCounts
  isRunning: boolean
  onStartPolling: () => void
  onRefresh: () => void
}

const CATEGORIES = [
  { value: 'sports',   label: '스포츠' },
  { value: 'economy',  label: '경제' },
  { value: 'politics', label: '정치' },
]

export default function Pipeline({ status, fileCounts, isRunning, onStartPolling, onRefresh }: Props) {
  const [dragOver, setDragOver]     = useState(false)
  const [oauthState, setOauthState] = useState<{status:string; url?:string; code?:string} | null>(null)
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
    if (!url) return  // URL 없으면 채널 수집 버튼 사용
    setUrlLoading(true); setUrlStatus('다운로드 시작...')
    try { await api.downloadUrl(url, urlCategory); startUrlPoll() }
    catch (e: unknown) { setUrlStatus(`오류: ${e instanceof Error ? e.message : '알 수 없음'}`); setUrlLoading(false) }
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
    } catch { setUploadMsg('업로드 실패') }
    finally { setUploading(false) }
  }

  const run = (fn: () => Promise<void>) => async () => { await fn(); onStartPolling() }
  const transcriptSet = new Set(fileCounts.transcripts)
  const analysisSet   = new Set(fileCounts.analyses)
  const videoSet      = new Set(fileCounts.videos)

  const steps = [
    {
      num: 1, key: 'collecting', title: '영상 수집',
      icon: '⬇', files: fileCounts.downloads, nextSet: transcriptSet,
      action: run(() => api.collect(clearExisting)), btnLabel: '채널 수집',
    },
    { num: 2, key: 'transcribing', title: '자막 생성',  icon: '💬', files: fileCounts.transcripts, nextSet: analysisSet,  action: run(() => api.transcribe()), btnLabel: '자막 생성' },
    { num: 3, key: 'analyzing',   title: 'AI 분석',    icon: '🧠', files: fileCounts.analyses,     nextSet: videoSet,     action: run(() => api.analyze()),   btnLabel: '분석 시작' },
    { num: 4, key: 'editing',     title: '영상 편집',   icon: '✂', files: fileCounts.videos,        nextSet: new Set<string>(), action: run(() => api.edit(1)), btnLabel: '편집 시작' },
  ]

  return (
    <aside className="card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* 헤더 */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>Pipeline</span>
        <button onClick={onRefresh} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '2px 4px', borderRadius: 4 }}
          title="새로고침">↻</button>
      </div>

      {/* YouTube OAuth2 인증 배너 */}
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

      {/* 파일 카운터 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: 'var(--border)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        {[
          { n: fileCounts.downloads.length,   l: '영상' },
          { n: fileCounts.transcripts.length, l: '자막' },
          { n: fileCounts.analyses.length,    l: '분석' },
          { n: fileCounts.videos.length,      l: '편집' },
        ].map(({ n, l }) => (
          <div key={l} style={{ background: 'var(--surface2)', padding: '8px 4px', textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: n > 0 ? 'var(--primary)' : 'var(--muted)', lineHeight: 1.2 }}>{n}</div>
            <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 1 }}>{l}</div>
          </div>
        ))}
      </div>

      {/* 진행바 */}
      {isRunning && (
        <div style={{ height: 3, background: '#e8eaed', flexShrink: 0 }}>
          <div className="progress-bar" style={{ height: '100%', width: `${status.progress}%`, transition: 'width .4s' }} />
        </div>
      )}

      {/* 스텝 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {steps.map(step => {
          const isActive = status.step === step.key
          const isDone   = step.files.length > 0

          return (
            <div key={step.key} style={{
              border: `1px solid ${isActive ? 'var(--primary)' : 'var(--border)'}`,
              borderRadius: 8, overflow: 'hidden',
              background: isActive ? '#f8f9ff' : 'var(--surface)',
              transition: 'border-color .2s',
            }}>
              {/* 스텝 헤더 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px' }}>
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

              {/* 파일 목록 */}
              {step.files.length > 0 && (
                <div style={{ maxHeight: 64, overflowY: 'auto', borderTop: '1px solid var(--border)', background: 'var(--surface2)' }}>
                  {step.files.map(name => {
                    const done = step.nextSet.has(name)
                    return (
                      <div key={name} style={{ padding: '2px 12px', fontSize: 10, color: done ? 'var(--success)' : 'var(--text2)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {done ? '✓ ' : '  '}{name}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Step 1 extras */}
              {step.num === 1 && (
                <div style={{ padding: '0 12px 12px', borderTop: step.files.length > 0 ? '1px solid var(--border)' : 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {/* URL 입력 */}
                  <div style={{ paddingTop: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>YouTube URL 직접 입력</div>
                    <input
                      value={urlInput} onChange={e => setUrlInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !urlLoading) handleUrlDownload() }}
                      placeholder="https://youtube.com/watch?v=..."
                      className="input-field" style={{ marginBottom: 6, fontSize: 12 }}
                    />
                    <div style={{ display: 'flex', gap: 6 }}>
                      <select value={urlCategory} onChange={e => setUrlCategory(e.target.value)}
                        style={{ flex: 1, padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, color: 'var(--text)', background: 'white', cursor: 'pointer', outline: 'none' }}>
                        {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                      </select>
                      <button
                        onClick={handleUrlDownload}
                        disabled={urlLoading || !urlInput.trim()}
                        className={urlInput.trim() ? 'btn-primary' : 'btn-outlined'}
                        style={{ padding: '6px 14px', fontSize: 12, borderRadius: 6, whiteSpace: 'nowrap' }}
                        title={!urlInput.trim() ? 'URL을 먼저 입력하세요' : '이 URL 영상만 다운로드'}
                      >
                        {urlLoading
                          ? <div className="spinner spinner-sm" style={{ borderTopColor: urlInput.trim() ? 'white' : 'var(--primary)' }} />
                          : '⬇ 다운로드'
                        }
                      </button>
                    </div>
                    {!urlInput.trim() && !urlStatus && (
                      <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>URL 입력 후 다운로드 / 채널 전체 수집은 아래 버튼 사용</div>
                    )}
                    {urlStatus && (
                      <div style={{ marginTop: 5, fontSize: 11, color: urlStatus.startsWith('✓') ? 'var(--success)' : urlStatus.startsWith('오류') ? 'var(--error)' : 'var(--primary)' }}>
                        {urlStatus}
                      </div>
                    )}
                  </div>

                  {/* 파일 업로드 */}
                  <div
                    onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) uploadFile(f) }}
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      border: `2px dashed ${dragOver ? 'var(--primary)' : 'var(--border)'}`,
                      borderRadius: 6, padding: '8px 12px', textAlign: 'center', cursor: 'pointer',
                      fontSize: 12, color: dragOver ? 'var(--primary)' : 'var(--text2)',
                      background: dragOver ? 'var(--primary-bg)' : 'var(--surface2)',
                      transition: 'all .15s',
                    }}>
                    <input ref={fileInputRef} type="file" accept=".mp4,.mkv,.mov,.avi" style={{ display: 'none' }}
                      onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f) }} />
                    {uploading ? `${uploadPct}% 업로드 중...` : '파일 드래그 또는 클릭 (MP4)'}
                  </div>
                  {uploadMsg && <div style={{ fontSize: 11, color: uploadMsg.startsWith('✓') ? 'var(--success)' : 'var(--error)', textAlign: 'center' }}>{uploadMsg}</div>}

                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text2)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={clearExisting} onChange={e => setClearExisting(e.target.checked)}
                      style={{ cursor: 'pointer', accentColor: 'var(--primary)' }} />
                    채널 수집 시 기존 파일 삭제
                  </label>
                </div>
              )}

              {/* 버튼 */}
              <div style={{ padding: '0 12px 12px' }}>
                <button onClick={step.action} disabled={isRunning} className="btn-primary"
                  style={{ width: '100%', padding: '8px 0' }}>
                  {isActive ? <><div className="spinner spinner-sm" style={{ borderTopColor: 'white', marginRight: 6 }} />처리 중...</> : step.btnLabel}
                </button>
              </div>
            </div>
          )
        })}

        {status.step === 'error' && (
          <div style={{ padding: '10px 12px', background: '#fce8e6', border: '1px solid #f28b82', borderRadius: 8, fontSize: 12, color: 'var(--error)' }}>
            ⚠ {status.message}
          </div>
        )}
        {status.step === 'done' && (
          <div style={{ padding: '10px 12px', background: '#e6f4ea', border: '1px solid #81c995', borderRadius: 8, fontSize: 12, color: 'var(--success)' }}>
            ✓ {status.message}
          </div>
        )}
      </div>
    </aside>
  )
}
