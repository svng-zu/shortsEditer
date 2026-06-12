import { useState, useEffect, useCallback, CSSProperties } from 'react'
import { api, AdminUserInfo, AdminStats, AdminPipelineInfo } from '../services/api'

type Tab = 'users' | 'stats' | 'pipelines'

const TABS: { key: Tab; label: string }[] = [
  { key: 'users', label: '사용자 관리' },
  { key: 'stats', label: '전체 통계' },
  { key: 'pipelines', label: '파이프라인 모니터링' },
]

const STEP_LABELS: Record<string, string> = {
  idle: '대기',
  collecting: '수집 중',
  transcribing: '자막 생성 중',
  analyzing: '분석 중',
  editing: '편집 중',
  done: '완료',
  error: '오류',
}

function fmtDate(s: string): string {
  return new Date(s).toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

const STAT_LABELS: { key: keyof AdminStats; label: string }[] = [
  { key: 'total_sessions', label: '전체 세션' },
  { key: 'total_users', label: '가입 사용자' },
  { key: 'downloads', label: '수집됨' },
  { key: 'transcripts', label: '자막 생성' },
  { key: 'analyses', label: '분석 완료' },
  { key: 'raws', label: '편집 완료' },
  { key: 'shorts', label: '렌더 완료' },
]

export default function AdminPage({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<Tab>('users')
  const [users, setUsers] = useState<AdminUserInfo[]>([])
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [pipelines, setPipelines] = useState<AdminPipelineInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const fetchUsers = useCallback(async () => {
    try { setUsers(await api.getAdminUsers()) } catch { setError('사용자 목록을 불러오지 못했습니다.') }
  }, [])
  const fetchStats = useCallback(async () => {
    try { setStats(await api.getAdminStats()) } catch { setError('통계를 불러오지 못했습니다.') }
  }, [])
  const fetchPipelines = useCallback(async () => {
    try { setPipelines(await api.getAdminPipelines()) } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    setLoading(true)
    Promise.all([fetchUsers(), fetchStats()]).finally(() => setLoading(false))
  }, [fetchUsers, fetchStats])

  useEffect(() => {
    if (tab !== 'pipelines') return
    fetchPipelines()
    const iv = setInterval(fetchPipelines, 3000)
    return () => clearInterval(iv)
  }, [tab, fetchPipelines])

  const toggleAdmin = async (u: AdminUserInfo) => {
    const next = !u.is_admin
    const msg = next ? `${u.email} 계정에 관리자 권한을 부여할까요?` : `${u.email} 계정의 관리자 권한을 해제할까요?`
    if (!confirm(msg)) return
    try {
      await api.setUserAdmin(u.id, next)
      await fetchUsers()
    } catch (e: any) {
      alert(e?.response?.data?.detail || '권한 변경에 실패했습니다.')
    }
  }

  return (
    <div style={{ height: '100vh', overflowY: 'auto', background: 'var(--bg)' }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'white', borderBottom: '1px solid var(--border)', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={onBack} className="btn-outlined" style={{ padding: '6px 12px', fontSize: 14 }}>← 돌아가기</button>
          <h2 style={{ margin: 0, fontSize: 18 }}>관리자 대시보드</h2>
        </div>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px', display: 'flex', gap: 4 }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit',
              padding: '10px 16px', fontSize: 14, fontWeight: 600,
              color: tab === t.key ? 'var(--primary)' : 'var(--text2)',
              borderBottom: `2px solid ${tab === t.key ? 'var(--primary)' : 'transparent'}`,
            }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>
        {error && <div style={{ color: 'var(--error)', marginBottom: 16 }}>{error}</div>}
        {loading && <div style={{ color: 'var(--muted)' }}>불러오는 중...</div>}

        {!loading && tab === 'users' && (
          <div style={{ background: 'white', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ background: 'var(--surface2)', textAlign: 'left' }}>
                  <th style={th}>이메일</th>
                  <th style={th}>이름</th>
                  <th style={th}>가입 경로</th>
                  <th style={th}>가입일</th>
                  <th style={th}>사용량</th>
                  <th style={th}>관리자</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={td}>{u.email}</td>
                    <td style={td}>{u.name || '-'}</td>
                    <td style={td}>{u.provider}</td>
                    <td style={td}>{fmtDate(u.created_at)}</td>
                    <td style={td}>{u.quota_limit == null ? `${u.quota_used}개 · 무제한` : `${u.quota_used} / ${u.quota_limit}개`}</td>
                    <td style={td}>
                      <button
                        onClick={() => toggleAdmin(u)}
                        className={u.is_admin ? 'btn-primary' : 'btn-outlined'}
                        style={{ padding: '4px 10px', fontSize: 13 }}
                      >
                        {u.is_admin ? '관리자' : '일반'}
                      </button>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr><td style={td} colSpan={6}>가입한 사용자가 없습니다.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {!loading && tab === 'stats' && stats && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
              {STAT_LABELS.map(({ key, label }) => (
                <div key={key} style={{ background: 'white', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px' }}>
                  <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 6 }}>{label}</div>
                  <div style={{ fontSize: 24, fontWeight: 700 }}>{stats[key] as number}</div>
                </div>
              ))}
            </div>

            <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: 10, padding: 18 }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>카테고리별 분포</div>
              {Object.keys(stats.category_counts).length === 0 ? (
                <div style={{ color: 'var(--muted)', fontSize: 14 }}>데이터가 없습니다.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {Object.entries(stats.category_counts).sort((a, b) => b[1] - a[1]).map(([cat, count]) => (
                    <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 100, fontSize: 13, color: 'var(--text2)' }}>{cat}</div>
                      <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--surface2)', overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', borderRadius: 4, background: 'var(--primary)',
                          width: `${Math.min(100, (count / Math.max(...Object.values(stats.category_counts))) * 100)}%`,
                        }} />
                      </div>
                      <div style={{ width: 40, textAlign: 'right', fontSize: 13, fontWeight: 600 }}>{count}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {!loading && tab === 'pipelines' && (
          <div style={{ background: 'white', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ background: 'var(--surface2)', textAlign: 'left' }}>
                  <th style={th}>세션</th>
                  <th style={th}>사용자</th>
                  <th style={th}>단계</th>
                  <th style={th}>메시지</th>
                  <th style={th}>진행률</th>
                  <th style={th}>상태</th>
                </tr>
              </thead>
              <tbody>
                {pipelines.map(p => (
                  <tr key={p.session_id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ ...td, fontFamily: 'monospace', fontSize: 12 }}>{p.session_id.slice(0, 8)}</td>
                    <td style={td}>{p.user_email || '익명'}</td>
                    <td style={td}>{STEP_LABELS[p.step] || p.step}</td>
                    <td style={td}>{p.message}</td>
                    <td style={td}>{p.progress}%</td>
                    <td style={td}>{p.is_paused ? '일시정지' : '진행 중'}</td>
                  </tr>
                ))}
                {pipelines.length === 0 && (
                  <tr><td style={td} colSpan={6}>현재 진행 중인 작업이 없습니다.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

const th: CSSProperties = { padding: '10px 14px', fontSize: 13, fontWeight: 600, color: 'var(--text2)' }
const td: CSSProperties = { padding: '10px 14px' }
