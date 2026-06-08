import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'

type Mode = 'login' | 'signup' | 'forgot' | 'reset'

export default function AuthModal() {
  const {
    error, message, clearError, login, signup, loginWithGoogle,
    forgotPassword, resetPassword, authModalMode, closeAuthModal,
  } = useAuth()
  const [mode, setMode] = useState<Mode>(authModalMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const switchMode = (m: Mode) => { setMode(m); clearError() }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      if (mode === 'login') {
        if (!email.trim() || !password) return
        await login(email.trim(), password)
      } else if (mode === 'signup') {
        if (!email.trim() || !password) return
        await signup(email.trim(), password, name.trim() || undefined)
      } else if (mode === 'forgot') {
        if (!email.trim()) return
        await forgotPassword(email.trim())
      } else {
        if (!password) return
        await resetPassword(password)
        setPassword('')
        setMode('login')
      }
    } catch {
      // 에러 메시지는 useAuth().error로 표시됨
    } finally {
      setSubmitting(false)
    }
  }

  const isAccountMode = mode === 'login' || mode === 'signup'

  return (
    <div
      onClick={closeAuthModal}
      style={{
        position: 'fixed', inset: 0, zIndex: 300,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(32,33,36,0.45)',
      }}>
      <div onClick={e => e.stopPropagation()} style={{
        position: 'relative',
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)', padding: 28, width: 360, maxWidth: '90vw',
      }}>
        <button
          type="button"
          onClick={closeAuthModal}
          aria-label="닫기"
          style={{
            position: 'absolute', top: 12, right: 12,
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 18, lineHeight: 1, color: 'var(--muted)', padding: 4,
          }}
        >
          ✕
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <img src="/static/gorila_ai.png" alt="고릴라AI" style={{ height: 40, width: 'auto', borderRadius: 8 }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>
              고릴라<span style={{ color: 'var(--primary)' }}>AI</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>Shorts Studio</div>
          </div>
        </div>

        {isAccountMode && (
          <div style={{ display: 'flex', gap: 4, margin: '20px 0 16px', background: 'var(--surface2)', borderRadius: 8, padding: 4 }}>
            {(['login', 'signup'] as Mode[]).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => switchMode(m)}
                className={m === mode ? 'btn-primary' : 'btn-outlined'}
                style={{ flex: 1, padding: '8px 0', fontSize: 12, border: m === mode ? 'none' : '1px solid transparent' }}
              >
                {m === 'login' ? '로그인' : '회원가입'}
              </button>
            ))}
          </div>
        )}

        {!isAccountMode && (
          <div style={{ margin: '20px 0 4px', fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>
            {mode === 'forgot' ? '비밀번호 재설정' : '새 비밀번호 설정'}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: isAccountMode ? 0 : 12 }}>
          {(mode === 'login' || mode === 'signup' || mode === 'forgot') && (
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="input-field"
              placeholder="이메일"
              autoComplete="email"
              required
            />
          )}
          {mode === 'signup' && (
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="input-field"
              placeholder="이름 (선택)"
              autoComplete="name"
            />
          )}
          {(mode === 'login' || mode === 'signup' || mode === 'reset') && (
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="input-field"
              placeholder={mode === 'reset' ? '새 비밀번호 (8자 이상)' : '비밀번호'}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              minLength={mode === 'signup' || mode === 'reset' ? 8 : undefined}
              required
            />
          )}

          {mode === 'login' && (
            <button
              type="button"
              onClick={() => { switchMode('forgot'); setEmail('') }}
              style={{ alignSelf: 'flex-end', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--muted)', padding: 0 }}
            >
              비밀번호를 잊으셨나요?
            </button>
          )}

          {message && (
            <div style={{ fontSize: 12, color: '#1e8e3e', background: '#e6f4ea', borderRadius: 6, padding: '8px 10px' }}>
              {message}
            </div>
          )}
          {error && (
            <div style={{ fontSize: 12, color: 'var(--error)', background: '#fce8e6', borderRadius: 6, padding: '8px 10px' }}>
              {error}
            </div>
          )}

          <button type="submit" className="btn-primary" disabled={submitting} style={{ marginTop: 4, padding: '10px 0', fontSize: 13 }}>
            {submitting ? '처리 중...' : (
              mode === 'login' ? '로그인'
              : mode === 'signup' ? '회원가입'
              : mode === 'forgot' ? '재설정 링크 보내기'
              : '비밀번호 변경'
            )}
          </button>

          {!isAccountMode && (
            <button
              type="button"
              onClick={() => switchMode('login')}
              style={{ alignSelf: 'center', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--muted)', padding: 4 }}
            >
              ← 로그인으로 돌아가기
            </button>
          )}
        </form>

        {isAccountMode && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '18px 0' }}>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>또는</span>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            </div>

            <button
              type="button"
              onClick={loginWithGoogle}
              className="btn-outlined"
              style={{ width: '100%', padding: '10px 0', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              <span>🔵</span> Google로 계속하기
            </button>

            <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 16, lineHeight: 1.5, textAlign: 'center' }}>
              {mode === 'login'
                ? '계정이 없으신가요? 회원가입 시 이 브라우저의 기존 데이터가 자동으로 연결됩니다.'
                : '가입하면 이 브라우저에서 모았던 영상·쇼츠 데이터가 새 계정에 그대로 연결됩니다.'}
            </p>
          </>
        )}
      </div>
    </div>
  )
}
