import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { api, Quota } from '../../services/api'
import GlassPanel from '../ui/GlassPanel'
import Icon from '../ui/Icon'
import Button from '../ui/Button'
import ProgressBar from '../ui/ProgressBar'

export default function ProfilePage() {
  const { user, logout, openAuthModal } = useAuth()
  const navigate = useNavigate()
  const [quota, setQuota] = useState<Quota | null>(null)

  useState(() => {
    api.getQuota().then(setQuota).catch(() => {})
  })

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
        <div className="w-20 h-20 rounded-full bg-surface-container-high flex items-center justify-center mb-6">
          <Icon name="person" size={40} className="text-on-surface-variant/40" />
        </div>
        <h2 className="text-title-md font-bold text-on-surface mb-2">로그인이 필요합니다</h2>
        <p className="text-body-md text-on-surface-variant mb-6">
          계정에 로그인하면 데이터를 안전하게 관리할 수 있습니다.
        </p>
        <button onClick={() => openAuthModal('login')}
          className="bg-primary text-on-primary px-8 py-3 rounded-xl font-bold text-label-md">
          로그인
        </button>
      </div>
    )
  }

  const initial = (user.name || user.email || '?')[0].toUpperCase()
  const quotaPct = quota && quota.limit ? Math.round((quota.used / quota.limit) * 100) : 0

  return (
    <div className="space-y-5 pb-20">
      {/* Profile Header */}
      <GlassPanel className="rounded-2xl p-6">
        <div className="flex items-center gap-4 mb-5">
          <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center text-primary text-2xl font-bold">
            {initial}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-title-md font-bold text-on-surface truncate">
              {user.name || '사용자'}
            </h2>
            <p className="text-label-md text-on-surface-variant truncate">{user.email}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-tertiary/10 text-tertiary border border-tertiary/20">
                {user.is_admin ? 'Admin' : 'Member'}
              </span>
              <span className="text-code-sm text-on-surface-variant">
                {user.provider === 'google' ? 'Google 계정' : '이메일 계정'}
              </span>
            </div>
          </div>
        </div>

        {/* Quota */}
        {quota && (
          <div className="bg-surface-container-low rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-label-sm text-on-surface-variant uppercase tracking-widest">이용량</span>
              <span className="text-label-md text-on-surface font-bold">
                {quota.used} / {quota.limit ?? '∞'}
              </span>
            </div>
            <ProgressBar progress={quotaPct} color="primary" />
            <div className="flex items-center justify-between mt-3">
              <div>
                <p className="text-code-sm text-on-surface-variant">
                  {quota.limit ? `이번 달 ${quota.limit - quota.used}개 남음` : '무제한'}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                    {quota.plan_display ?? quota.plan ?? 'Free'}
                  </span>
                  {quota.plan_expires_at && (
                    <span className="text-code-sm text-on-surface-variant">
                      ~{new Date(quota.plan_expires_at).toLocaleDateString('ko-KR')}
                    </span>
                  )}
                </div>
              </div>
              <Button
                variant="ghost"
                className="text-label-sm"
                onClick={() => navigate('/pricing')}
              >
                <Icon name="bolt" size={16} />
                업그레이드
              </Button>
            </div>
          </div>
        )}
      </GlassPanel>

      {/* Menu Items */}
      <GlassPanel className="rounded-2xl overflow-hidden divide-y divide-outline-variant/10">
        <MenuItem icon="subscriptions" label="채널 관리" route="/channels" />
        <MenuItem icon="video_library" label="미디어 라이브러리" route="/media" />
        <MenuItem icon="movie" label="쇼츠 편집" route="/editor" />
        <MenuItem icon="analytics" label="파이프라인" route="/pipeline" />
        {user.is_admin && (
          <MenuItem icon="admin_panel_settings" label="관리자 콘솔" route="/admin" />
        )}
      </GlassPanel>

      {/* App Info */}
      <GlassPanel className="rounded-2xl p-5">
        <div className="flex items-center gap-3 mb-4">
          <Icon name="info" size={20} className="text-on-surface-variant" />
          <span className="text-label-md text-on-surface font-semibold">앱 정보</span>
        </div>
        <div className="space-y-3 text-label-md">
          <div className="flex justify-between">
            <span className="text-on-surface-variant">버전</span>
            <span className="text-on-surface font-mono text-code-sm">V3.2 Engine</span>
          </div>
          <div className="flex justify-between">
            <span className="text-on-surface-variant">엔진</span>
            <span className="text-on-surface font-mono text-code-sm">Gemini 2.5 Flash</span>
          </div>
        </div>
      </GlassPanel>

      {/* Logout */}
      <button onClick={logout}
        className="w-full glass-panel rounded-2xl p-4 flex items-center justify-center gap-2 text-error font-bold text-label-md hover:bg-error/5 transition-colors">
        <Icon name="logout" size={20} />
        로그아웃
      </button>
    </div>
  )
}

function MenuItem({ icon, label, route }: { icon: string; label: string; route: string }) {
  return (
    <a href={route}
      className="flex items-center gap-4 px-5 py-4 hover:bg-surface-bright/5 transition-colors">
      <Icon name={icon} size={22} className="text-on-surface-variant" />
      <span className="text-label-md text-on-surface flex-1">{label}</span>
      <Icon name="chevron_right" size={20} className="text-outline" />
    </a>
  )
}
