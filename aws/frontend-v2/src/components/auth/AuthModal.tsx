import { useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import Icon from '../ui/Icon'

type Mode = 'login' | 'signup' | 'forgot' | 'reset'

export default function AuthModal() {
  const {
    error,
    message,
    clearError,
    login,
    signup,
    loginWithGoogle,
    forgotPassword,
    resetPassword,
    authModalMode,
    closeAuthModal,
  } = useAuth()

  const [mode, setMode] = useState<Mode>(authModalMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const switchMode = (m: Mode) => {
    setMode(m)
    clearError()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (mode === 'login' || mode === 'signup') {
      if (!email.trim() || !password) return
    } else if (mode === 'forgot') {
      if (!email.trim()) return
    } else if (mode === 'reset') {
      if (!password) return
    }
    setSubmitting(true)
    clearError()
    try {
      if (mode === 'login') {
        await login(email.trim(), password)
      } else if (mode === 'signup') {
        await signup(email.trim(), password, name.trim() || undefined)
      } else if (mode === 'forgot') {
        await forgotPassword(email.trim())
      } else {
        await resetPassword(password)
        setPassword('')
        setMode('login')
      }
    } catch {
      // error is displayed via useAuth().error
    } finally {
      setSubmitting(false)
    }
  }

  const isAccountMode = mode === 'login' || mode === 'signup'

  return (
    <div
      onClick={closeAuthModal}
      className="fixed inset-0 z-[300] bg-black/50 backdrop-blur-sm flex items-end md:items-center justify-center overflow-y-auto"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass-panel-elevated rounded-t-2xl md:rounded-2xl p-7 w-full md:w-[380px] md:max-w-[90vw] shadow-2xl relative max-h-[90vh] overflow-y-auto"
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={closeAuthModal}
          aria-label="닫기"
          className="absolute top-3 right-3 text-on-surface-variant hover:text-on-surface transition-colors p-1"
        >
          <Icon name="close" size={20} />
        </button>

        {/* Logo Section */}
        <div className="flex items-center gap-3 mb-1">
          <img
            src="/static/gorila_ai.png"
            alt="Gorilla AI"
            className="h-10 w-auto rounded-lg"
          />
          <div>
            <div className="text-[17px] font-bold text-on-surface">
              Gorilla<span className="text-primary">AI</span>
            </div>
            <div className="text-label-sm text-on-surface-variant">
              Shorts Studio
            </div>
          </div>
        </div>

        {/* Tab Buttons (login/signup) */}
        {isAccountMode && (
          <div className="flex gap-1 my-5 bg-surface-container-high rounded-lg p-1">
            {(['login', 'signup'] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => switchMode(m)}
                className={`
                  flex-1 py-2 text-label-md rounded-lg font-medium transition-all
                  ${
                    m === mode
                      ? 'bg-primary text-on-primary'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }
                `}
              >
                {m === 'login' ? '로그인' : '회원가입'}
              </button>
            ))}
          </div>
        )}

        {/* Non-account mode heading */}
        {!isAccountMode && (
          <div className="mt-5 mb-1 font-bold text-[16px] text-on-surface">
            {mode === 'forgot' ? '비밀번호 재설정' : '새 비밀번호 설정'}
          </div>
        )}

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className={`flex flex-col gap-2.5 ${isAccountMode ? '' : 'mt-3'}`}
        >
          {(mode === 'login' || mode === 'signup' || mode === 'forgot') && (
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="이메일"
              autoComplete="email"
              required
              className="bg-surface-container-lowest border border-outline-variant/50 rounded-xl px-4 py-3 text-on-surface text-body-md placeholder:text-on-surface-variant/50 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-colors"
            />
          )}

          {mode === 'signup' && (
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="이름 (선택)"
              autoComplete="name"
              className="bg-surface-container-lowest border border-outline-variant/50 rounded-xl px-4 py-3 text-on-surface text-body-md placeholder:text-on-surface-variant/50 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-colors"
            />
          )}

          {(mode === 'login' || mode === 'signup' || mode === 'reset') && (
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'reset' ? '새 비밀번호 (8자 이상)' : '비밀번호'}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              minLength={mode === 'signup' || mode === 'reset' ? 8 : undefined}
              required
              className="bg-surface-container-lowest border border-outline-variant/50 rounded-xl px-4 py-3 text-on-surface text-body-md placeholder:text-on-surface-variant/50 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-colors"
            />
          )}

          {/* Forgot password link */}
          {mode === 'login' && (
            <button
              type="button"
              onClick={() => {
                switchMode('forgot')
                setEmail('')
              }}
              className="self-end text-sm text-on-surface-variant hover:text-primary transition-colors bg-transparent border-none cursor-pointer p-0"
            >
              비밀번호를 잊으셨나요?
            </button>
          )}

          {/* Success message */}
          {message && (
            <div className="bg-tertiary/10 text-tertiary rounded-xl p-3 text-sm">
              {message}
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="bg-error-container/20 text-error rounded-xl p-3 text-sm">
              {error}
            </div>
          )}

          {/* Submit button */}
          <button
            type="submit"
            disabled={submitting}
            className="bg-primary text-on-primary w-full py-3 rounded-xl font-bold text-label-md hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-1"
          >
            {submitting
              ? '처리 중...'
              : mode === 'login'
                ? '로그인'
                : mode === 'signup'
                  ? '회원가입'
                  : mode === 'forgot'
                    ? '재설정 링크 보내기'
                    : '비밀번호 변경'}
          </button>

          {/* Back to login (for forgot/reset modes) */}
          {!isAccountMode && (
            <button
              type="button"
              onClick={() => switchMode('login')}
              className="self-center text-sm text-on-surface-variant hover:text-primary transition-colors bg-transparent border-none cursor-pointer p-1"
            >
              ← 로그인으로 돌아가기
            </button>
          )}
        </form>

        {/* Divider + Google OAuth (only for login/signup) */}
        {isAccountMode && (
          <>
            {/* Divider */}
            <div className="flex items-center gap-3 my-5">
              <div className="flex-1 h-px bg-outline-variant/30" />
              <span className="text-label-sm text-on-surface-variant">또는</span>
              <div className="flex-1 h-px bg-outline-variant/30" />
            </div>

            {/* Google button */}
            <button
              type="button"
              onClick={loginWithGoogle}
              className="border border-outline-variant text-on-surface w-full py-3 rounded-xl text-label-md font-medium flex items-center justify-center gap-2 hover:bg-surface-container-high/50 active:scale-[0.98] transition-all"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" className="shrink-0">
                <path
                  d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
                  fill="#4285F4"
                />
                <path
                  d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
                  fill="#34A853"
                />
                <path
                  d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
                  fill="#FBBC05"
                />
                <path
                  d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
                  fill="#EA4335"
                />
              </svg>
              Google로 계속하기
            </button>

            {/* Bottom note */}
            <p className="text-on-surface-variant text-sm mt-4 leading-relaxed text-center">
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
