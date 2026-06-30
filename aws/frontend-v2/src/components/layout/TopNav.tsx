import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { api, Quota } from '../../services/api'
import Icon from '../ui/Icon'
import ProgressBar from '../ui/ProgressBar'

function ProfilePopover({ onClose }: { onClose: () => void }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [quota, setQuota] = useState<Quota | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api.getQuota().then(setQuota).catch(() => {})
  }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  if (!user) return null

  const initial = (user.name || user.email || '?')[0].toUpperCase()
  const quotaPct = quota?.limit ? Math.round((quota.used / quota.limit) * 100) : 0

  return (
    <div ref={ref} className="absolute right-0 top-full mt-2 w-72 glass-panel-elevated rounded-2xl shadow-2xl border border-outline-variant/30 z-50 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-outline-variant/20">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-lg">
            {initial}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-label-md font-bold text-on-surface truncate">{user.name || '사용자'}</p>
            <p className="text-code-sm text-on-surface-variant truncate">{user.email}</p>
          </div>
        </div>
      </div>

      {/* Plan & Quota */}
      {quota && (
        <div className="px-4 py-3 border-b border-outline-variant/20">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
              {quota.plan_display ?? quota.plan ?? 'Free'}
            </span>
            <span className="text-code-sm text-on-surface-variant">
              {quota.used}/{quota.limit ?? '∞'}개 사용
            </span>
          </div>
          <ProgressBar progress={quotaPct} color="primary" />
          {quota.plan_expires_at && (
            <p className="text-[11px] text-on-surface-variant mt-1.5">
              만료: {new Date(quota.plan_expires_at).toLocaleDateString('ko-KR')}
            </p>
          )}
        </div>
      )}

      {/* Menu */}
      <div className="py-1">
        <button onClick={() => { navigate('/profile'); onClose() }}
          className="w-full flex items-center gap-3 px-4 py-2.5 text-label-md text-on-surface hover:bg-surface-bright/10 transition-colors">
          <Icon name="person" size={20} className="text-on-surface-variant" />
          내 프로필
        </button>
        <button onClick={() => { navigate('/pricing'); onClose() }}
          className="w-full flex items-center gap-3 px-4 py-2.5 text-label-md text-on-surface hover:bg-surface-bright/10 transition-colors">
          <Icon name="bolt" size={20} className="text-on-surface-variant" />
          요금제
        </button>
        {user.is_admin && (
          <button onClick={() => { navigate('/admin'); onClose() }}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-label-md text-on-surface hover:bg-surface-bright/10 transition-colors">
            <Icon name="admin_panel_settings" size={20} className="text-on-surface-variant" />
            관리자 콘솔
          </button>
        )}
      </div>

      {/* Logout */}
      <div className="border-t border-outline-variant/20 p-2">
        <button onClick={() => { logout(); onClose() }}
          className="w-full flex items-center gap-3 px-3 py-2.5 text-label-md text-error hover:bg-error/5 rounded-xl transition-colors">
          <Icon name="logout" size={20} />
          로그아웃
        </button>
      </div>
    </div>
  )
}

export default function TopNav() {
  const { user, openAuthModal } = useAuth()
  const navigate = useNavigate()
  const [showProfile, setShowProfile] = useState(false)

  return (
    <header className="sticky top-0 z-40 h-16 bg-surface-dim/90 backdrop-blur-2xl border-b border-outline-variant/20 flex items-center justify-between px-4 md:px-6 gap-4 shrink-0">
      {/* Left: Mobile logo / Desktop search */}
      <div className="flex items-center gap-2 md:hidden">
        <img src="/static/gorila_ai.png" alt="Gorilla AI" className="w-8 h-8 rounded-lg" />
        <span className="text-xl font-black text-primary tracking-tight">Gorilla AI</span>
      </div>

      <div className="hidden md:block flex-1 max-w-md">
        <div className="relative">
          <Icon name="search" size={20} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant" />
          <input
            type="text"
            placeholder="Search resources..."
            className="w-full bg-surface-container-low border border-outline-variant/30 rounded-full pl-10 pr-4 py-2 text-body-md text-on-surface placeholder:text-on-surface-variant/50 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-colors"
          />
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-3">
        <button className="relative p-2 rounded-full hover:bg-surface-container-high/50 transition-colors">
          <Icon name="notifications" size={22} className="text-on-surface-variant" />
          <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-primary" />
        </button>

        <button
          onClick={() => navigate('/channels?tab=downloads')}
          className="hidden md:flex items-center gap-2 bg-primary/10 text-primary rounded-full px-4 py-2 text-label-md font-medium hover:bg-primary/20 transition-colors active:scale-95"
        >
          <Icon name="play_arrow" size={18} />
          <span>쇼츠로 변환하기</span>
        </button>

        <div className="hidden md:block h-6 w-px bg-outline-variant/30" />

        {/* User / Login */}
        {user ? (
          <div className="relative">
            <button onClick={() => setShowProfile(!showProfile)}
              className="flex items-center gap-2 rounded-full hover:bg-surface-bright/10 transition-colors p-0.5 pr-1">
              <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-label-sm font-bold ring-2 ring-primary/50">
                {(user.name || user.email)?.[0]?.toUpperCase() || 'U'}
              </div>
              <span className="hidden md:inline text-label-md text-on-surface">
                {user.name || user.email?.split('@')[0]}
              </span>
              <Icon name={showProfile ? 'expand_less' : 'expand_more'} size={18} className="hidden md:inline text-on-surface-variant" />
            </button>
            {showProfile && <ProfilePopover onClose={() => setShowProfile(false)} />}
          </div>
        ) : (
          <button
            onClick={() => openAuthModal('login')}
            className="flex items-center gap-1.5 text-label-md text-on-surface-variant hover:text-primary transition-colors"
          >
            <div className="h-8 w-8 rounded-full bg-surface-container-high flex items-center justify-center ring-2 ring-primary/50 md:ring-0">
              <Icon name="person" size={20} />
            </div>
            <span className="hidden md:inline">로그인</span>
          </button>
        )}
      </div>
    </header>
  )
}
