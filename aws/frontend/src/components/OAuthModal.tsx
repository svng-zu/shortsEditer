import { useState, useEffect } from 'react'
import axios from 'axios'

interface Props {
  onClose: () => void
}

type OAuthStatus = 'idle' | 'starting' | 'waiting' | 'done' | 'error'

export default function OAuthModal({ onClose }: Props) {
  const [status, setStatus] = useState<OAuthStatus>('idle')
  const [url, setUrl] = useState<string | null>(null)
  const [code, setCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tokenSaved, setTokenSaved] = useState(false)

  const startOAuth = async () => {
    setStatus('starting')
    setUrl(null)
    setCode(null)
    setError(null)
    await axios.post('/api/oauth-init')
  }

  useEffect(() => {
    if (status === 'idle' || status === 'done' || status === 'error') return
    const interval = setInterval(async () => {
      try {
        const { data } = await axios.get('/api/oauth-status')
        setStatus(data.status)
        if (data.url) setUrl(data.url)
        if (data.code) setCode(data.code)
        if (data.error) setError(data.error)
        if (data.token_saved) setTokenSaved(true)
        if (data.status === 'done' || data.status === 'error') clearInterval(interval)
      } catch {}
    }, 2000)
    return () => clearInterval(interval)
  }, [status])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface border border-border rounded-2xl p-6 w-full max-w-md shadow-2xl fade-in">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="font-black text-base">YouTube OAuth2 인증</h2>
            <p className="text-muted text-xs mt-0.5">EC2에서 YouTube 다운로드를 허용합니다</p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-white text-xl">×</button>
        </div>

        {/* Already authenticated */}
        {tokenSaved && status !== 'starting' && (
          <div className="bg-success/10 border border-success/30 rounded-xl p-4 mb-4 text-center fade-in">
            <div className="text-2xl mb-1">✓</div>
            <div className="text-success font-bold text-sm">인증 완료!</div>
            <div className="text-muted text-xs mt-1">이제 YouTube 영상을 수집할 수 있습니다.</div>
          </div>
        )}

        {/* Steps */}
        {status === 'idle' && !tokenSaved && (
          <div className="space-y-3 mb-5 text-sm text-muted">
            <div className="flex gap-3">
              <span className="w-5 h-5 rounded-full bg-accent text-bg text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5">1</span>
              <span>아래 버튼을 눌러 인증을 시작합니다</span>
            </div>
            <div className="flex gap-3">
              <span className="w-5 h-5 rounded-full bg-border text-muted text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5">2</span>
              <span>Google 인증 URL이 나타나면 브라우저에서 열어 로그인합니다</span>
            </div>
            <div className="flex gap-3">
              <span className="w-5 h-5 rounded-full bg-border text-muted text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5">3</span>
              <span>인증 완료 시 EC2에서도 다운로드 가능해집니다</span>
            </div>
          </div>
        )}

        {/* Waiting for user to authenticate */}
        {(status === 'starting' || status === 'waiting') && !tokenSaved && (
          <div className="space-y-4 mb-4">
            {status === 'starting' && (
              <div className="flex items-center justify-center gap-2 py-4 text-muted text-sm">
                <div className="spinner" /> 인증 URL 생성 중...
              </div>
            )}
            {url && (
              <div className="fade-in">
                <div className="text-xs text-muted mb-2 font-bold uppercase tracking-wider">
                  아래 URL을 브라우저에서 열어주세요
                </div>
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="block w-full px-3 py-3 bg-surface2 border border-accent/40 rounded-xl text-accent text-xs font-mono break-all hover:bg-surface2/80 transition-colors"
                >
                  {url}
                </a>
                {code && (
                  <div className="mt-3 text-center">
                    <div className="text-xs text-muted mb-1">인증 코드</div>
                    <div className="text-2xl font-black tracking-[0.3em] text-white">{code}</div>
                  </div>
                )}
                <div className="flex items-center justify-center gap-2 mt-4 text-xs text-muted">
                  <div className="spinner" /> 인증 대기 중...
                </div>
              </div>
            )}
          </div>
        )}

        {/* Error */}
        {status === 'error' && (
          <div className="bg-accent2/10 border border-accent2/30 rounded-xl p-3 mb-4 text-accent2 text-xs fade-in">
            ⚠ {error || '인증에 실패했습니다. 다시 시도해주세요.'}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          {(status === 'idle' || status === 'error') && (
            <button
              onClick={startOAuth}
              className="flex-1 py-2.5 bg-accent text-bg font-bold text-sm rounded-xl hover:brightness-110 active:scale-[0.98] transition-all"
            >
              {status === 'error' ? '다시 시도' : '인증 시작'}
            </button>
          )}
          {(tokenSaved || status === 'done') && (
            <button
              onClick={onClose}
              className="flex-1 py-2.5 bg-success text-bg font-bold text-sm rounded-xl"
            >
              완료
            </button>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2.5 bg-surface2 border border-border text-muted text-sm rounded-xl hover:text-white transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}
