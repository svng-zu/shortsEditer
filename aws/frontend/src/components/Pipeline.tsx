import { useRef, useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { api, apiClient, PipelineStatus, VideoInfo, DownloadInfo } from '../services/api'

const CATEGORIES_DL = [
  { value: 'sports', label: '스포츠' },
  { value: 'economy', label: '경제' },
  { value: 'politics', label: '정치' },
]

function isQuotaError(e: any): boolean {
  return e?.response?.status === 403 && e?.response?.data?.detail?.code === 'quota_exceeded'
}

interface Props {
  status: PipelineStatus
  isRunning: boolean
  onStartPolling: () => void
  onRefresh: () => void
  isMobile?: boolean
  onQuotaError: () => void
  downloads: DownloadInfo[]
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

export default function Pipeline({ status, isRunning, onStartPolling, onRefresh, onQuotaError, downloads, isMobile = false }: Props) {
  const [dragOver, setDragOver]             = useState(false)
  const [collectLimit, setCollectLimit]     = useState(3)
  const [oauthState, setOauthState]         = useState<{status:string; url?:string; code?:string} | null>(null)
  const [channels, setChannels]             = useState<{url:string; category:string; thumbnail_url?:string}[]>([])
  const [selectedChannels, setSelectedChannels] = useState<Set<string>>(new Set())
  const [showChannels, setShowChannels]     = useState(false)
  const [newChUrl, setNewChUrl]             = useState('')
  const [newChCategory, setNewChCategory]   = useState('sports')
  const [chLoading, setChLoading]           = useState(false)
  const oauthPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const checkOauth = useCallback(async () => {
    try {
      const r = await apiClient.get('/api/oauth-status')
      const d = r.data
      if (d.token_saved && !d.token_expired) { setOauthState({ status: 'done' }); clearInterval(oauthPollRef.current!); oauthPollRef.current = null }
      else if (d.token_saved && d.token_expired) { setOauthState({ status: 'expired' }); clearInterval(oauthPollRef.current!); oauthPollRef.current = null }
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

  const loadChannels = useCallback(async () => {
    const { channels } = await api.getChannels()
    setChannels(channels)
    // 새로 등록된 채널은 기본적으로 선택 상태로, 삭제된 채널은 선택 목록에서도 제거
    setSelectedChannels(prev => {
      const urls = new Set(channels.map(c => c.url))
      const next = new Set([...prev].filter(u => urls.has(u)))
      channels.forEach(c => { if (!prev.has(c.url)) next.add(c.url) })
      return next
    })
  }, [])
  useEffect(() => { loadChannels() }, [loadChannels])

  const toggleChannelSelected = (url: string) => {
    setSelectedChannels(prev => { const next = new Set(prev); next.has(url) ? next.delete(url) : next.add(url); return next })
  }
  const toggleAllChannelsSelected = () => {
    setSelectedChannels(prev => prev.size === channels.length ? new Set() : new Set(channels.map(c => c.url)))
  }

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

  const [dlSelected, setDlSelected]   = useState<Set<string>>(new Set())
  const [dlCategories, setDlCategories] = useState<Record<string, string>>({})
  const [dlProcessing, setDlProcessing] = useState(false)
  const [playingDownload, setPlayingDownload] = useState<DownloadInfo | null>(null)

  useEffect(() => {
    const init: Record<string, string> = {}
    downloads.forEach(d => { init[d.filename] = d.category })
    setDlCategories(prev => {
      const merged = { ...init }
      Object.keys(prev).forEach(k => { if (k in merged) merged[k] = prev[k] })
      return merged
    })
  }, [downloads])

  const dlToggle = (filename: string) => {
    setDlSelected(prev => { const next = new Set(prev); next.has(filename) ? next.delete(filename) : next.add(filename); return next })
  }
  const dlToggleAll = () => {
    if (dlSelected.size === downloads.length) setDlSelected(new Set())
    else setDlSelected(new Set(downloads.map(d => d.filename)))
  }
  const handleDlProcess = async () => {
    const items = [...dlSelected].map(fn => ({ filename: fn, category: dlCategories[fn] || 'economy' }))
    if (!items.length) return
    setDlProcessing(true)
    try { await api.processSelected(items); onStartPolling() }
    catch {} finally { setDlProcessing(false) }
  }
  const deleteDownload = async (fn: string, e: React.MouseEvent) => {
    e.stopPropagation(); if (!confirm('수집된 영상을 삭제할까요?')) return
    await api.deleteDownload(fn)
    setDlSelected(prev => { const next = new Set(prev); next.delete(fn); return next })
    onRefresh()
  }

  const [uploading, setUploading]     = useState(false)
  const [uploadPct, setUploadPct]     = useState(0)
  const [uploadMsg, setUploadMsg]     = useState<string | null>(null)
  const [clearExisting, setClearExisting] = useState(true)
  const [urlInput, setUrlInput]       = useState('')
  const [urlCategory, setUrlCategory] = useState('sports')
  const [urlStatus, setUrlStatus]     = useState<string | null>(null)
  const [urlLoading, setUrlLoading]   = useState(false)
  const [videoInfo, setVideoInfo]     = useState<VideoInfo | null>(null)
  const [infoLoading, setInfoLoading] = useState(false)
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

  const handleUrlCheck = async () => {
    const url = urlInput.trim()
    if (!url) return
    setInfoLoading(true); setUrlStatus(null); setVideoInfo(null)
    try {
      const info = await api.getVideoInfo(url)
      setVideoInfo(info)
    } catch (e: any) {
      setUrlStatus(`영상 정보 조회 실패: ${e instanceof Error ? e.message : '알 수 없음'}`)
    } finally { setInfoLoading(false) }
  }

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

  const fmtDuration = (sec: number) => {
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60
    return h > 0 ? `${h}시간 ${m}분` : `${m}분 ${s}초`
  }
  const fmtSize = (bytes: number | null) =>
    bytes ? `약 ${Math.round(bytes / 1024 / 1024)}MB` : '크기 미상'

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

  const runAction = (fn: () => Promise<void>) => async () => {
    try { await fn(); onStartPolling() }
    catch (e: any) { if (isQuotaError(e)) { onQuotaError() } else throw e }
  }
  const isCollecting = status.step === 'collecting'
  // 일부 채널만 선택된 경우에만 channel_urls를 전달 (전체 선택/채널 없음이면 기본 동작 그대로)
  const handleCollect = runAction(() => api.collect(
    clearExisting, collectLimit,
    channels.length > 0 && selectedChannels.size < channels.length ? [...selectedChannels] : undefined
  ))

  // ── 공통 레이아웃 (모바일/데스크톱 동일) ──
  return (
    <aside className="card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>영상수집</span>
        <button onClick={onRefresh} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '2px 4px', borderRadius: 4 }}
          title="새로고침">↻</button>
      </div>

      {oauthState?.status === 'expired' && (
        <div style={{ padding: '10px 14px', background: '#fce8e6', borderBottom: '1px solid #f28b82', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, color: '#c5221f' }}>⚠ YouTube 인증 만료됨</div>
              <div style={{ fontSize: 12, color: '#5f6368', marginTop: 1 }}>토큰이 만료되어 영상 수집이 실패합니다. 재인증이 필요합니다.</div>
            </div>
            <button onClick={startOauth} className="btn-primary" style={{ fontSize: 13, padding: '5px 10px', background: '#c5221f', whiteSpace: 'nowrap' }}>
              🔑 재인증
            </button>
          </div>
        </div>
      )}

      {/* ── 검색창(구글 스타일) — URL로 영상 가져오기 ── */}
      <div style={{ padding: '40px 24px 28px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <img src="/static/gorila_ai.png" alt="" style={{ height: 44, width: 44, borderRadius: 9 }} />
          <span style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>고릴라AI 쇼츠 스튜디오</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 19, fontWeight: 700, color: 'var(--text2)', letterSpacing: 0.4 }}>
          YouTube 영상으로 쇼츠 만들기
        </div>

        <div style={{
          width: '100%', maxWidth: 720, display: 'flex', flexWrap: isMobile ? 'wrap' : 'nowrap', alignItems: 'center', gap: 8,
          padding: isMobile ? '12px 14px' : '5px 6px 5px 22px', borderRadius: isMobile ? 20 : 999,
          border: '1px solid var(--border)', boxShadow: '0 2px 16px rgba(32,33,36,0.08)',
          background: 'white',
        }}>
          <div style={{ flex: isMobile ? '1 1 100%' : 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 17 }}>🔗</span>
            <input
              value={urlInput} onChange={e => setUrlInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !urlLoading) handleUrlDownload() }}
              placeholder="YouTube 영상 URL을 붙여넣으세요"
              style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontSize: 17, padding: '13px 0', color: 'var(--text)' }}
            />
          </div>
          {!videoInfo && (
            <select value={urlCategory} onChange={e => setUrlCategory(e.target.value)}
              style={{ flex: isMobile ? 1 : undefined, border: 'none', background: 'var(--surface2)', borderRadius: 999, padding: '10px 14px', fontSize: 14, fontWeight: 600, color: 'var(--text2)', cursor: 'pointer', outline: 'none' }}>
              {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          )}
          <button
            onClick={videoInfo ? () => { setVideoInfo(null) } : handleUrlCheck}
            disabled={infoLoading || urlLoading || !urlInput.trim()}
            className={urlInput.trim() ? 'btn-primary' : 'btn-outlined'}
            style={{ flex: isMobile ? 1 : undefined, borderRadius: 999, padding: '12px 24px', fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap' }}>
            {infoLoading
              ? <div className="spinner spinner-sm" style={{ borderTopColor: 'white' }} />
              : videoInfo ? '↩ 다시 입력' : '확인'}
          </button>
        </div>

        {urlStatus && (
          <div style={{ fontSize: 14, fontWeight: 600, color: urlStatus.startsWith('✓') ? 'var(--success)' : urlStatus.startsWith('오류') ? 'var(--error)' : 'var(--primary)' }}>
            {urlStatus}
          </div>
        )}

        {/* 영상 정보 카드 */}
        {videoInfo && (
          <div style={{
            width: '100%', maxWidth: 720,
            border: '1px solid var(--border)', borderRadius: 16,
            background: 'white', overflow: 'hidden',
            boxShadow: '0 2px 12px rgba(32,33,36,0.08)',
          }}>
            <div style={{ display: 'flex', gap: 14, padding: 14 }}>
              <img src={videoInfo.thumbnail_url} alt="썸네일"
                style={{ width: 120, height: 68, objectFit: 'cover', borderRadius: 8, flexShrink: 0, background: '#e8eaed' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', lineHeight: 1.4, marginBottom: 6, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {videoInfo.title}
                </div>
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                  {fmtDuration(videoInfo.duration)} · {fmtSize(videoInfo.filesize_approx)}
                </div>
              </div>
            </div>
            {videoInfo.duration > 3600 && (
              <div style={{ padding: '8px 14px', background: '#fff8e1', borderTop: '1px solid #ffe082', fontSize: 13, color: '#e65100', fontWeight: 600 }}>
                ⚠ 1시간 이상 영상입니다. 자막·분석 처리 시간이 매우 길어질 수 있어요.
              </div>
            )}
            <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center' }}>
              <select value={urlCategory} onChange={e => setUrlCategory(e.target.value)}
                style={{ border: '1px solid var(--border)', background: 'var(--surface2)', borderRadius: 8, padding: '8px 12px', fontSize: 14, fontWeight: 600, color: 'var(--text2)', cursor: 'pointer', outline: 'none' }}>
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              <button
                onClick={() => { handleUrlDownload(); setVideoInfo(null) }}
                disabled={urlLoading}
                className="btn-primary"
                style={{ flex: 1, borderRadius: 8, padding: '10px 0', fontSize: 15, fontWeight: 700 }}>
                {urlLoading
                  ? <div className="spinner spinner-sm" style={{ borderTopColor: 'white', margin: '0 auto' }} />
                  : videoInfo.duration > 3600 ? '⬇ 그래도 다운로드' : '⬇ 다운로드'}
              </button>
            </div>
          </div>
        )}

        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) uploadFile(f) }}
          onClick={() => fileInputRef.current?.click()}
          style={{
            width: '100%', maxWidth: 720,
            border: `1.5px dashed ${dragOver ? 'var(--primary)' : 'var(--border)'}`,
            borderRadius: 999, padding: '8px 18px', cursor: 'pointer',
            fontSize: 14, fontWeight: 600, color: dragOver ? 'var(--primary)' : 'var(--text2)',
            background: dragOver ? 'var(--primary-bg)' : 'var(--surface2)', transition: 'all .15s',
            boxSizing: 'border-box', textAlign: 'center',
          }}>
          <input ref={fileInputRef} type="file" accept=".mp4,.mkv,.mov,.avi" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f) }} />
          {uploading ? `📁 ${uploadPct}% 업로드 중...` : '📁 또는 영상 파일을 직접 업로드 (드래그 가능)'}
        </div>
        {uploadMsg && <div style={{ fontSize: 14, fontWeight: 600, color: uploadMsg.startsWith('✓') ? 'var(--success)' : 'var(--error)' }}>{uploadMsg}</div>}

        {/* ── 채널에서 가져오기 (콜랩서블) ── */}
        <div style={{ width: '100%', maxWidth: 720 }}>
          <button onClick={() => setShowChannels(v => !v)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              border: `1.5px solid ${showChannels ? 'var(--primary)' : 'var(--border)'}`,
              borderRadius: showChannels ? '18px 18px 0 0' : 999,
              padding: '8px 18px', cursor: 'pointer',
              fontSize: 14, fontWeight: 600, color: showChannels ? 'var(--primary)' : 'var(--text2)',
              background: showChannels ? '#f8f9ff' : 'var(--surface2)', transition: 'all .15s',
            }}>
            <span>📋 자주 쓰는 채널에서 가져오기 {channels.length > 0 ? `(${channels.length}개 등록됨)` : '(기본 채널 사용)'}</span>
            <span style={{ fontSize: 12 }}>{showChannels ? '▲' : '▼'}</span>
          </button>
          {/* 펼치지 않아도 어떤 채널이 등록돼 있는지 한눈에 보이도록 미리보기 칩을 표시 */}
          {!showChannels && channels.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', padding: '8px 4px 0' }}>
              {channels.slice(0, 6).map(ch => (
                <span key={ch.url} title={ch.url} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  fontSize: 13, fontWeight: 600, padding: '3px 10px 3px 5px', borderRadius: 999,
                  background: ch.category === 'sports' ? '#e8f5e9' : ch.category === 'economy' ? '#fff8e1' : '#fce4ec',
                  color: ch.category === 'sports' ? '#2e7d32' : ch.category === 'economy' ? '#f57f17' : '#c62828',
                  whiteSpace: 'nowrap',
                }}>
                  {ch.thumbnail_url && (
                    <img src={ch.thumbnail_url} alt="" style={{ width: 20, height: 20, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                  )}
                  {channelName(ch.url)}
                </span>
              ))}
              {channels.length > 6 && (
                <span style={{ fontSize: 13, color: 'var(--muted)', padding: '3px 6px' }}>+{channels.length - 6}개 더</span>
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
                  <div style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', padding: '4px 0' }}>
                    채널 없음 → 기본 채널(SBSBiz, MBC, SPOTV 등) 사용
                  </div>
                )}
                {channels.length > 0 && (
                  <button onClick={toggleAllChannelsSelected} style={{
                    alignSelf: 'flex-start', background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 12, fontWeight: 600, color: 'var(--primary)', padding: '0 2px',
                  }}>
                    {selectedChannels.size === channels.length ? '전체 해제' : '전체 선택'} ({selectedChannels.size}/{channels.length})
                  </button>
                )}
                {channels.map(ch => (
                  <div key={ch.url} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
                    <input type="checkbox" checked={selectedChannels.has(ch.url)} onChange={() => toggleChannelSelected(ch.url)}
                      style={{ cursor: 'pointer', accentColor: 'var(--primary)', flexShrink: 0 }} />
                    {ch.thumbnail_url && (
                      <img src={ch.thumbnail_url} alt="" style={{ width: 26, height: 26, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                    )}
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600, color: 'var(--text)' }} title={ch.url}>{channelName(ch.url)}</span>
                    <span style={{ padding: '1px 8px', borderRadius: 10, fontSize: 13, background: ch.category === 'sports' ? '#e8f5e9' : ch.category === 'economy' ? '#fff8e1' : '#fce4ec', color: ch.category === 'sports' ? '#2e7d32' : ch.category === 'economy' ? '#f57f17' : '#c62828', whiteSpace: 'nowrap' }}>
                      {ch.category === 'sports' ? '스포츠' : ch.category === 'economy' ? '경제' : '정치'}
                    </span>
                    <button onClick={() => handleRemoveChannel(ch.url)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--error)', fontSize: 17, lineHeight: 1, padding: '0 2px' }}>×</button>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 6 }}>
                  <input value={newChUrl} onChange={e => setNewChUrl(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !chLoading) handleAddChannel() }}
                    placeholder="https://www.youtube.com/@채널명"
                    className="input-field" style={{ flex: 1, fontSize: 14 }} />
                  <select value={newChCategory} onChange={e => setNewChCategory(e.target.value)}
                    style={{ padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 14, color: 'var(--text)', background: 'white', cursor: 'pointer', outline: 'none' }}>
                    {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                  <button onClick={handleAddChannel} disabled={chLoading || !newChUrl.trim()} className="btn-primary"
                    style={{ padding: '6px 12px', fontSize: 14, whiteSpace: 'nowrap' }}>
                    {chLoading ? '...' : '+ 추가'}
                  </button>
                </div>
              </div>

              <div style={{ height: 1, background: 'var(--border)' }} />

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: 'var(--text2)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={clearExisting} onChange={e => setClearExisting(e.target.checked)} style={{ cursor: 'pointer', accentColor: 'var(--primary)' }} />
                  채널 수집 시 기존 파일 삭제
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 14, color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                  채널당
                  <input type="text" inputMode="numeric" value={collectLimit === 0 ? '' : collectLimit}
                    onChange={e => {
                      const raw = e.target.value.replace(/[^0-9]/g, '')
                      if (raw === '') { setCollectLimit(0); return }
                      const n = Math.min(20, parseInt(raw, 10))
                      setCollectLimit(n)
                    }}
                    onBlur={() => { if (collectLimit === 0) alert('1개 이상의 값을 설정해주세요') }}
                    style={{ width: 48, padding: '4px 6px', border: `1px solid ${collectLimit === 0 ? '#e53935' : 'var(--border)'}`, borderRadius: 5, fontSize: 14, textAlign: 'center', color: 'var(--text)', background: 'white', outline: 'none' }} />
                  개
                </label>
              </div>

              <button onClick={() => { if (collectLimit === 0) { alert('1개 이상의 값을 설정해주세요'); return } if (channels.length > 0 && selectedChannels.size === 0) { alert('수집할 채널을 1개 이상 선택해주세요'); return } handleCollect() }} disabled={isRunning} className="btn-primary" style={{ padding: '10px 0', fontSize: 15, fontWeight: 700, borderRadius: 999 }}>
                {isCollecting
                  ? <><div className="spinner spinner-sm" style={{ borderTopColor: 'white', marginRight: 6 }} />수집 중...</>
                  : channels.length > 0 && selectedChannels.size < channels.length ? `⬇ 선택한 채널 수집 (${selectedChannels.size}개)` : '⬇ 채널 수집'}
              </button>
            </div>
          )}
        </div>

      </div>

      {isRunning && (
        <div style={{ height: 3, background: '#e8eaed', flexShrink: 0 }}>
          <div className="progress-bar" style={{ height: '100%', width: `${status.progress}%`, transition: 'width .4s' }} />
        </div>
      )}

      {status.step === 'error' && (
        <div style={{ margin: '0 16px 16px', padding: '10px 12px', background: '#fce8e6', border: '1px solid #f28b82', borderRadius: 8, fontSize: 14, color: 'var(--error)' }}>
          ⚠ {status.message}
        </div>
      )}
      {status.step === 'done' && (
        <div style={{ margin: '0 16px 16px', padding: '10px 12px', background: '#e6f4ea', border: '1px solid #81c995', borderRadius: 8, fontSize: 14, color: 'var(--success)' }}>
          ✓ {status.message}
        </div>
      )}

      {/* ── 수집됨 목록 ── */}
      <div style={{ borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: '#fafafa', borderBottom: '1px solid var(--border)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, cursor: 'pointer', fontWeight: 700, color: 'var(--text2)' }}>
            <input type="checkbox"
              checked={dlSelected.size === downloads.length && downloads.length > 0}
              onChange={dlToggleAll}
              style={{ accentColor: 'var(--primary)', width: 16, height: 16, cursor: 'pointer' }} />
            📥 수집됨{downloads.length > 0 ? ` (${downloads.length})` : ''}
          </label>
          {dlSelected.size > 0 && (
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>{dlSelected.size}개 선택</span>
          )}
          <button
            onClick={handleDlProcess}
            disabled={dlSelected.size === 0 || dlProcessing}
            className="btn-primary"
            style={{ marginLeft: 'auto', padding: '6px 14px', fontSize: 13, fontWeight: 700, borderRadius: 8, opacity: dlSelected.size === 0 ? 0.5 : 1 }}>
            {dlProcessing ? '처리 중...' : '✂️ 편집 시작'}
          </button>
        </div>
        {/* 목록 */}
        <div style={{ overflowY: 'auto', maxHeight: isMobile ? 360 : 736 }}>
          {downloads.length === 0
            ? <div style={{ padding: '20px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                아직 수집된 영상이 없어요
              </div>
            : downloads.map(d => {
                return (
                  <div key={d.filename} onClick={() => setPlayingDownload(d)}
                    style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={dlSelected.has(d.filename)} onChange={() => dlToggle(d.filename)}
                      onClick={e => e.stopPropagation()}
                      style={{ accentColor: 'var(--primary)', width: 18, height: 18, flexShrink: 0, cursor: 'pointer', marginTop: 3 }} />
                    <div style={{ width: isMobile ? 'clamp(130px, 37vw, 208px)' : 'clamp(299px, 34vw, 450px)', aspectRatio: '16/9', borderRadius: 6, overflow: 'hidden', flexShrink: 0, background: '#e8eaed' }}>
                      <img src={d.thumbnail_url ?? `/api/media/downloads/default/${d.filename}/thumbnail`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                    <div style={{ flex: '0 1 35%', minWidth: 0 }}>
                      <div style={{ fontSize: isMobile ? 13 : 16, fontWeight: 600, color: 'var(--text)', lineHeight: 1.4, marginBottom: 6, wordBreak: 'break-word' }}>
                        {d.stem}
                      </div>
                      {d.duration != null && (
                        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>
                          {fmtDuration(Math.round(d.duration))}
                        </div>
                      )}
                      <select value={dlCategories[d.filename] || d.category}
                        onChange={e => setDlCategories(prev => ({ ...prev, [d.filename]: e.target.value }))}
                        onClick={e => e.stopPropagation()}
                        style={{ fontSize: 12, padding: '3px 7px', border: '1px solid var(--border)', borderRadius: 6, background: 'white', color: 'var(--text2)', cursor: 'pointer', outline: 'none' }}>
                        {CATEGORIES_DL.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                      </select>
                    </div>
                    <button onClick={e => deleteDownload(d.filename, e)}
                      style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, background: 'var(--surface2)', color: 'var(--muted)', border: '1px solid var(--border)', cursor: 'pointer', flexShrink: 0, marginLeft: 'auto' }}>
                      삭제
                    </button>
                  </div>
                )
              })
          }
        </div>
      </div>

      {playingDownload && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: '#111', display: 'flex', flexDirection: 'column' }}>
          <div style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px' }}>
            <button onClick={() => setPlayingDownload(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: 'white', lineHeight: 1, padding: '0 4px 0 0' }}>
              ←
            </button>
            <span style={{ fontWeight: 700, fontSize: 16, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'white' }}>
              {playingDownload.stem}
            </span>
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, minHeight: 0 }}>
            <video key={playingDownload.filename} src={playingDownload.thumbnail_url?.replace(/\/thumbnail$/, '')} controls autoPlay
              style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 12, boxShadow: '0 4px 32px rgba(0,0,0,0.5)' }} />
          </div>
        </div>,
        document.body
      )}
    </aside>
  )
}
