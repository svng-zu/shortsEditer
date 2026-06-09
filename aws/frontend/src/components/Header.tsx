import { useState } from 'react'
import { PipelineStatus, Quota } from '../services/api'
import { useAuth } from '../contexts/AuthContext'

interface Props {
  status: PipelineStatus
  isRunning: boolean
  isPaused: boolean
  onPause: () => void
  onResume: () => void
  onStop: () => void
  quota?: Quota | null
  quotaNotice?: boolean
  compact?: boolean
}

export default function Header({ status, isRunning, isPaused, onPause, onResume, onStop, quota = null, quotaNotice = false, compact = false }: Props) {
  const { user, logout, openAuthModal } = useAuth()
  const [showProfile, setShowProfile] = useState(false)
  const [showQuotaPopover, setShowQuotaPopover] = useState(false)

  const quotaReached = !!quota && quota.limit != null && quota.used >= quota.limit
  const showQuotaUpgradeNotice = quotaNotice || quotaReached
  const quotaLabel = quota ? (quota.is_admin ? '관리자' : quota.is_member ? '무료 회원' : '익명 체험') : ''

  const stepColor = isRunning && !isPaused ? '#1a73e8'
    : isPaused ? '#f9ab00'
    : status.step === 'done'  ? '#34a853'
    : status.step === 'error' ? '#ea4335'
    : '#9aa0a6'

  return (
    <header style={{
      height: compact ? 52 : 80,
      flexShrink: 0,
      background: 'white',
      borderBottom: '1px solid #dadce0',
      display: 'flex',
      alignItems: 'center',
      padding: compact ? '0 12px' : '0 20px',
      gap: compact ? 8 : 12,
      boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    }}>
      {/* 로고 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <img
          src="/static/gorila_ai.png"
          alt="고릴라AI"
          style={{ height: compact ? 40 : 64, width: 'auto', borderRadius: compact ? 8 : 10, display: 'block' }}
        />
        {!compact && (
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: '#202124', lineHeight: 1.2 }}>
              고릴라<span style={{ color: '#1a73e8' }}>AI</span>
            </div>
            <div style={{ fontSize: 12, color: '#9aa0a6', lineHeight: 1 }}>Shorts Studio</div>
          </div>
        )}
      </div>

      {/* 한도 배지 (클릭 시 사용량/안내 팝오버) */}
      {quota && (
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button
            onClick={() => setShowQuotaPopover(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: quotaReached ? '#fce8e6' : 'var(--surface2)',
              border: `1px solid ${quotaReached ? '#f28b82' : 'var(--border)'}`,
              borderRadius: 999, cursor: 'pointer',
              padding: compact ? '4px 9px' : '5px 12px',
              fontSize: 13, fontWeight: 700,
              color: quotaReached ? 'var(--error)' : 'var(--text2)',
            }}
            title="사용량 한도"
          >
            {!compact && <span style={{ fontWeight: 600 }}>{quotaLabel}</span>}
            {quota.is_admin || quota.limit == null
              ? <span>{quota.used}개{!compact && ' · 무제한'}</span>
              : <span>{quota.used}/{quota.limit}{!compact && '개'}</span>}
          </button>

          {showQuotaPopover && (
            <div style={{
              position: 'fixed', top: compact ? 60 : 88, right: 12, zIndex: 200,
              background: 'white', border: '1px solid #dadce0', borderRadius: 10,
              boxShadow: '0 4px 20px rgba(0,0,0,0.12)', padding: 16, width: 280,
              display: 'flex', flexDirection: 'column', gap: 12,
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--text2)', marginBottom: 6 }}>
                  <span>{quotaLabel} 한도</span>
                </div>
                {quota.is_admin || quota.limit == null ? (
                  <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                    {quota.used}개 · 무제한
                  </span>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--surface2)', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: 3, transition: 'width .3s',
                        width: `${Math.min(100, Math.round(quota.used / quota.limit * 100))}%`,
                        background: quotaReached ? 'var(--error)' : 'var(--primary)',
                      }} />
                    </div>
                    <span style={{ fontWeight: 700, fontSize: 15, color: quotaReached ? 'var(--error)' : 'var(--text)', whiteSpace: 'nowrap' }}>
                      {quota.used} / {quota.limit}개
                    </span>
                  </div>
                )}
              </div>

              {showQuotaUpgradeNotice && (
                user ? (
                  <div style={{
                    padding: '10px 12px', borderRadius: 8, fontSize: 14, lineHeight: 1.6,
                    background: '#fef7e0', border: '1px solid #fde293', color: '#7f6000',
                    display: 'flex', flexDirection: 'column', gap: 8,
                  }}>
                    <div><b>무료 한도에 도달했어요.</b> 추가 이용은 준비 중이에요 — 곧 업그레이드 옵션을 제공할 예정입니다.</div>
                    <button disabled className="btn-outlined" style={{ alignSelf: 'flex-start', fontSize: 13, padding: '5px 12px', opacity: 0.6, cursor: 'default' }}>
                      업그레이드 (준비 중)
                    </button>
                  </div>
                ) : (
                  <div style={{
                    padding: '10px 12px', borderRadius: 8, fontSize: 14, lineHeight: 1.6,
                    background: '#fef7e0', border: '1px solid #fde293', color: '#7f6000',
                    display: 'flex', flexDirection: 'column', gap: 8,
                  }}>
                    <div><b>무료 체험 한도에 도달했어요.</b> 회원가입하면 더 많은 영상을 처리할 수 있어요!</div>
                    <button onClick={() => { openAuthModal('signup'); setShowQuotaPopover(false) }} className="btn-primary" style={{ alignSelf: 'flex-start', fontSize: 13, padding: '6px 14px', background: '#f57c00' }}>
                      회원가입하고 한도 늘리기
                    </button>
                  </div>
                )
              )}
            </div>
          )}
        </div>
      )}

      {!compact && <div style={{ width: 1, height: 24, background: '#dadce0', flexShrink: 0 }} />}

      {/* 상태 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
        <div style={{
          width: 7, height: 7, borderRadius: '50%', background: stepColor, flexShrink: 0,
          animation: isRunning && !isPaused ? 'pulse 1.2s infinite' : 'none',
        }} />
        <span style={{ fontSize: 14, color: '#5f6368', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {isPaused ? '일시정지됨' : status.message || '대기 중'}
        </span>
        {isRunning && (
          <span style={{ fontSize: 14, fontWeight: 600, color: '#1a73e8', flexShrink: 0 }}>
            {status.progress}%
          </span>
        )}
      </div>

      {/* 중지/재개/종료 */}
      {isRunning && (
        <>
          {!isPaused
            ? <button onClick={onPause} className="btn-outlined" style={{ padding: '4px 10px', fontSize: 13, flexShrink: 0 }}>
                {compact ? '⏸' : '⏸ 중지'}
              </button>
            : <button onClick={onResume} className="btn-primary" style={{ padding: '4px 10px', fontSize: 13, flexShrink: 0 }}>
                {compact ? '▶' : '▶ 재개'}
              </button>
          }
          <button
            onClick={() => { if (confirm('진행 중인 작업을 종료할까요? 지금까지의 결과는 유지되지만 작업은 중단됩니다.')) onStop() }}
            className="btn-outlined"
            style={{ padding: '4px 10px', fontSize: 13, flexShrink: 0, color: 'var(--error, #d93025)', borderColor: 'var(--error, #d93025)' }}
          >
            {compact ? '⏹' : '⏹ 종료'}
          </button>
        </>
      )}

      {/* 계정 */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        {user ? (
          <button
            onClick={() => setShowProfile(v => !v)}
            style={{
              background: 'none', border: '1px solid #dadce0', borderRadius: 6,
              padding: compact ? '4px 8px' : '4px 10px',
              fontSize: 13, color: '#5f6368', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 4,
            }}
            title="계정"
          >
            👤
            {!compact && (
              <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }}>
                {user.name || user.email}
              </span>
            )}
          </button>
        ) : (
          <button
            onClick={() => openAuthModal('login')}
            className="btn-outlined"
            style={{ padding: compact ? '5px 10px' : '6px 14px', fontSize: 13 }}
          >
            로그인
          </button>
        )}

        {showProfile && user && (
          <div style={{
            position: 'fixed', top: compact ? 60 : 88, right: 12, zIndex: 200,
            background: 'white', border: '1px solid #dadce0', borderRadius: 10,
            boxShadow: '0 4px 20px rgba(0,0,0,0.12)', padding: 16, width: 260,
          }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>{user.name || '이름 없음'}</div>
            <div style={{ fontSize: 13, color: '#5f6368', marginBottom: 14, wordBreak: 'break-all' }}>{user.email}</div>
            <button
              onClick={() => { logout(); setShowProfile(false) }}
              className="btn-outlined" style={{ width: '100%', padding: '7px 0', fontSize: 14 }}>
              로그아웃
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
