import { useState, useEffect } from 'react'
import { api } from '../services/api'

interface Props {
  filename: string
  defaultTitle: string
  onClose: () => void
}

export default function YouTubeUploadModal({ filename, defaultTitle, onClose }: Props) {
  const [title, setTitle] = useState(defaultTitle)
  const [description, setDescription] = useState('')
  const [privacy, setPrivacy] = useState<'public' | 'unlisted' | 'private'>('private')
  const [phase, setPhase] = useState<'form' | 'uploading' | 'done' | 'error'>('form')
  const [resultUrl, setResultUrl] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [authStatus, setAuthStatus] = useState<{ authenticated: boolean; configured: boolean } | null>(null)

  useEffect(() => {
    api.getYouTubeAuthStatus().then(setAuthStatus)
  }, [])

  const handleAuth = async () => {
    const { url } = await api.getYouTubeAuthUrl()
    window.open(url, '_blank', 'width=600,height=700')
  }

  const handleUpload = async () => {
    if (!title.trim()) return
    setPhase('uploading')
    try {
      await api.uploadToYouTube(filename, title.trim(), description.trim(), privacy)
      // 폴링으로 완료 대기
      const poll = setInterval(async () => {
        const status = await api.getYouTubeUploadStatus()
        if (!status.running) {
          clearInterval(poll)
          if (status.result) {
            setResultUrl(status.result.url)
            setPhase('done')
          } else {
            setErrorMsg(status.error || '알 수 없는 오류')
            setPhase('error')
          }
        }
      }, 3000)
    } catch (e: any) {
      setErrorMsg(e?.response?.data?.detail || String(e))
      setPhase('error')
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-surface rounded-xl p-6 w-[420px] max-w-full shadow-2xl border border-border">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <span className="text-red-500 text-xl">▶</span>
            <h2 className="text-sm font-bold text-white">YouTube 업로드</h2>
          </div>
          <button onClick={onClose} className="text-muted hover:text-white text-lg leading-none">✕</button>
        </div>

        {/* 인증 안된 경우 */}
        {authStatus && !authStatus.authenticated && (
          <div className="mb-4 p-3 bg-yellow-900/40 border border-yellow-600/40 rounded-lg">
            {!authStatus.configured ? (
              <p className="text-xs text-yellow-300">
                YOUTUBE_CLIENT_ID가 설정되지 않았습니다.
                <br />.env 파일에 YouTube OAuth 자격증명을 추가해주세요.
              </p>
            ) : (
              <div>
                <p className="text-xs text-yellow-300 mb-2">YouTube 계정 연동이 필요합니다.</p>
                <button
                  onClick={handleAuth}
                  className="w-full py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded"
                >
                  Google 계정으로 연동하기
                </button>
                <p className="text-[10px] text-muted mt-1.5">
                  새 창에서 인증 후 이 모달을 닫았다가 다시 여세요.
                </p>
              </div>
            )}
          </div>
        )}

        {/* 업로드 폼 */}
        {phase === 'form' && (
          <>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] text-muted mb-1 block">제목 *</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={100}
                  className="w-full p-2.5 bg-surface2 border border-border rounded text-sm text-white"
                  placeholder="YouTube 영상 제목"
                />
                <div className="text-right text-[10px] text-muted mt-0.5">{title.length}/100</div>
              </div>

              <div>
                <label className="text-[10px] text-muted mb-1 block">설명</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  maxLength={500}
                  className="w-full p-2.5 bg-surface2 border border-border rounded text-sm text-white resize-none"
                  placeholder="영상 설명 (선택)"
                />
              </div>

              <div>
                <label className="text-[10px] text-muted mb-1 block">공개 설정</label>
                <select
                  value={privacy}
                  onChange={(e) => setPrivacy(e.target.value as any)}
                  className="w-full p-2.5 bg-surface2 border border-border rounded text-sm text-white"
                >
                  <option value="private">비공개</option>
                  <option value="unlisted">미등록 (링크 있으면 볼 수 있음)</option>
                  <option value="public">공개</option>
                </select>
              </div>
            </div>

            <div className="mt-5 flex gap-2">
              <button
                onClick={onClose}
                className="flex-1 py-2 bg-surface2 text-muted text-sm rounded hover:bg-border"
              >
                취소
              </button>
              <button
                onClick={handleUpload}
                disabled={!title.trim() || !authStatus?.authenticated}
                className="flex-1 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold rounded"
              >
                업로드
              </button>
            </div>
          </>
        )}

        {/* 업로드 중 */}
        {phase === 'uploading' && (
          <div className="text-center py-8">
            <div className="text-4xl mb-3 animate-spin inline-block">⟳</div>
            <p className="text-sm text-white font-bold mb-1">업로드 중...</p>
            <p className="text-xs text-muted">파일 크기에 따라 수 분이 걸릴 수 있습니다.</p>
          </div>
        )}

        {/* 완료 */}
        {phase === 'done' && (
          <div className="text-center py-6">
            <div className="text-4xl mb-3">✅</div>
            <p className="text-sm text-white font-bold mb-3">업로드 완료!</p>
            <a
              href={resultUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded mb-4"
            >
              YouTube에서 보기 →
            </a>
            <div className="text-[10px] text-muted break-all bg-surface2 rounded p-2">{resultUrl}</div>
            <button onClick={onClose} className="mt-4 text-xs text-muted hover:text-white">닫기</button>
          </div>
        )}

        {/* 오류 */}
        {phase === 'error' && (
          <div className="text-center py-6">
            <div className="text-4xl mb-3">❌</div>
            <p className="text-sm text-white font-bold mb-2">업로드 실패</p>
            <p className="text-xs text-red-400 bg-surface2 rounded p-2 mb-4">{errorMsg}</p>
            <div className="flex gap-2">
              <button onClick={() => setPhase('form')} className="flex-1 py-2 bg-surface2 text-white text-xs rounded">
                다시 시도
              </button>
              <button onClick={onClose} className="flex-1 py-2 bg-border text-muted text-xs rounded">
                닫기
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
