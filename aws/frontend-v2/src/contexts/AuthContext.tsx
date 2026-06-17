import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import {
  api, AuthUser,
  getAuthToken, setAuthToken, clearAuthToken, setUnauthorizedHandler, resetSessionId,
  AUTH_TOKEN_KEY, AUTH_ERROR_KEY,
} from '../services/api'

type AuthModalMode = 'login' | 'signup' | 'forgot' | 'reset'

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  error: string | null
  message: string | null
  clearError: () => void
  login: (email: string, password: string) => Promise<void>
  signup: (email: string, password: string, name?: string) => Promise<void>
  loginWithGoogle: () => void
  forgotPassword: (email: string) => Promise<void>
  resetPassword: (newPassword: string) => Promise<void>
  logout: () => void
  showAuthModal: boolean
  authModalMode: AuthModalMode
  openAuthModal: (mode?: AuthModalMode) => void
  closeAuthModal: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

function clearAuthHash() {
  window.history.replaceState(null, '', window.location.pathname + window.location.search)
}

function consumeResetTokenFromUrl(): string | null {
  const url = new URL(window.location.href)
  const token = url.searchParams.get('reset_token')
  if (!token) return null
  url.searchParams.delete('reset_token')
  window.history.replaceState(null, '', url.pathname + url.search + url.hash)
  return token
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [authModalMode, setAuthModalMode] = useState<AuthModalMode>('login')
  const [resetToken, setResetToken] = useState<string | null>(null)

  const openAuthModal = useCallback((mode: AuthModalMode = 'login') => {
    setAuthModalMode(mode)
    setError(null)
    setMessage(null)
    setShowAuthModal(true)
  }, [])
  const closeAuthModal = useCallback(() => {
    setShowAuthModal(false)
    setError(null)
    setMessage(null)
  }, [])

  const loadMe = useCallback(async () => {
    if (!getAuthToken()) { setUser(null); return }
    try {
      setUser(await api.me())
    } catch {
      clearAuthToken()
      setUser(null)
    }
  }, [])

  // 구글 로그인 콜백 리다이렉트(#auth_token=... / #auth_error=...) 처리.
  // 팝업으로 열렸다면 결과를 localStorage에 남기고 닫는다 — 메인 창은 storage 이벤트로 감지한다.
  // 비밀번호 재설정 메일의 링크(?reset_token=...)로 들어온 경우 재설정 모달을 연다
  useEffect(() => {
    const token = consumeResetTokenFromUrl()
    if (token) {
      setResetToken(token)
      setAuthModalMode('reset')
      setShowAuthModal(true)
    }
  }, [])

  useEffect(() => {
    const hash = window.location.hash
    if (hash.startsWith('#auth_token=')) {
      setAuthToken(decodeURIComponent(hash.slice('#auth_token='.length)))
      clearAuthHash()
      if (window.opener) { window.close(); return }
    } else if (hash.startsWith('#auth_error=')) {
      clearAuthHash()
      const message = '구글 로그인에 실패했습니다. 잠시 후 다시 시도해주세요.'
      if (window.opener) {
        localStorage.setItem(AUTH_ERROR_KEY, message)
        window.close()
        return
      }
      setError(message)
      setShowAuthModal(true)
    }
    loadMe().finally(() => setLoading(false))
  }, [loadMe])

  // 다른 탭/팝업에서 로그인/로그아웃/로그인 실패가 발생하면 동기화
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === AUTH_TOKEN_KEY) loadMe()
      if (e.key === AUTH_ERROR_KEY && e.newValue) {
        setError(e.newValue)
        setShowAuthModal(true)
        localStorage.removeItem(AUTH_ERROR_KEY)
      }
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [loadMe])

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null))
    return () => setUnauthorizedHandler(null)
  }, [])

  // 구글 로그인 팝업이 storage 이벤트로 토큰을 알려와 user가 채워지면 모달을 닫는다
  useEffect(() => {
    if (user) setShowAuthModal(false)
  }, [user])

  const clearError = useCallback(() => setError(null), [])

  const login = useCallback(async (email: string, password: string) => {
    setError(null)
    try {
      const res = await api.login(email, password)
      setAuthToken(res.access_token)
      setUser(res.user)
      setShowAuthModal(false)
    } catch (e: any) {
      setError(e?.response?.data?.detail || '로그인에 실패했습니다.')
      throw e
    }
  }, [])

  const signup = useCallback(async (email: string, password: string, name?: string) => {
    setError(null)
    try {
      const res = await api.signup(email, password, name)
      setAuthToken(res.access_token)
      setUser(res.user)
      setShowAuthModal(false)
    } catch (e: any) {
      setError(e?.response?.data?.detail || '회원가입에 실패했습니다.')
      throw e
    }
  }, [])

  const forgotPassword = useCallback(async (email: string) => {
    setError(null)
    setMessage(null)
    try {
      const res = await api.forgotPassword(email)
      setMessage(res.message)
    } catch (e: any) {
      setError(e?.response?.data?.detail || '요청 처리 중 오류가 발생했습니다.')
      throw e
    }
  }, [])

  const resetPassword = useCallback(async (newPassword: string) => {
    if (!resetToken) {
      setError('재설정 링크가 유효하지 않습니다. 다시 요청해주세요.')
      throw new Error('missing reset token')
    }
    setError(null)
    setMessage(null)
    try {
      const res = await api.resetPassword(resetToken, newPassword)
      setMessage(res.message)
      setResetToken(null)
    } catch (e: any) {
      setError(e?.response?.data?.detail || '비밀번호 재설정에 실패했습니다.')
      throw e
    }
  }, [resetToken])

  const loginWithGoogle = useCallback(() => {
    setError(null)
    api.getGoogleLoginUrl()
      .then(({ url }) => window.open(url, '_blank', 'width=480,height=640'))
      .catch(() => setError('구글 로그인 URL을 가져오지 못했습니다.'))
  }, [])

  const logout = useCallback(() => {
    clearAuthToken()
    setUser(null)
    // 계정에 연결됐던 익명 세션 ID를 새로 발급 — 로그아웃 후 익명 사용이
    // 그 계정의 데이터 디렉터리를 계속 가리키는 문제를 막는다
    resetSessionId()
  }, [])

  return (
    <AuthContext.Provider value={{
      user, loading, error, message, clearError, login, signup, loginWithGoogle,
      forgotPassword, resetPassword, logout,
      showAuthModal, authModalMode, openAuthModal, closeAuthModal,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
