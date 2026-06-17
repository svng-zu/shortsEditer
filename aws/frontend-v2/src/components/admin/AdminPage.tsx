import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { api, AdminStats, AdminPipelineInfo, AdminUserInfo } from '../../services/api'
import GlassPanel from '../ui/GlassPanel'
import Icon from '../ui/Icon'
import ProgressBar from '../ui/ProgressBar'
import Button from '../ui/Button'

/* ── Helpers ─────────────────────────────────────────────────── */

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' })
}

function getInitials(name?: string | null, email?: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/)
    return parts.length >= 2
      ? (parts[0][0] + parts[1][0]).toUpperCase()
      : name.slice(0, 2).toUpperCase()
  }
  return (email ?? '?').slice(0, 2).toUpperCase()
}

const AVATAR_COLORS = [
  'bg-primary/30 text-primary',
  'bg-tertiary/30 text-tertiary',
  'bg-secondary-container/30 text-secondary-fixed-dim',
  'bg-error/30 text-error',
  'bg-primary-container/30 text-primary-fixed',
]

function avatarColor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

const PIPELINE_ICONS: Record<string, string> = {
  collecting: 'video_settings',
  transcribing: 'subtitles',
  analyzing: 'psychology',
  editing: 'movie_edit',
  rendering: 'cloud_upload',
}

const PIPELINE_COLORS: Record<string, 'primary' | 'tertiary' | 'secondary'> = {
  collecting: 'primary',
  transcribing: 'tertiary',
  analyzing: 'secondary',
  editing: 'primary',
  rendering: 'tertiary',
}

const USERS_PER_PAGE = 8

/* ── Access Denied ───────────────────────────────────────────── */

function AccessDenied() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <div className="w-20 h-20 rounded-full bg-error/10 flex items-center justify-center">
        <Icon name="shield" size={40} className="text-error" />
      </div>
      <h2 className="text-headline-lg font-bold text-on-surface">Access Denied</h2>
      <p className="text-on-surface-variant text-body-md max-w-md text-center">
        You do not have administrator privileges. Contact an admin to request access.
      </p>
    </div>
  )
}

/* ── Toggle Switch ───────────────────────────────────────────── */

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`
        relative inline-flex items-center w-10 h-5 rounded-full transition-colors duration-200
        focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50
        ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
        ${checked ? 'bg-primary' : 'bg-surface-container-highest'}
      `}
    >
      <span
        className={`
          inline-block w-4 h-4 rounded-full bg-on-surface transition-transform duration-200
          ${checked ? 'translate-x-[22px]' : 'translate-x-[2px]'}
        `}
      />
    </button>
  )
}

/* ── Section: Global Stats ───────────────────────────────────── */

function GlobalStats({ stats, loading }: { stats: AdminStats | null; loading: boolean }) {
  const cards = [
    { label: 'Total Sessions', icon: 'bolt', value: stats?.total_sessions ?? 0 },
    { label: 'Active Users', icon: 'group', value: stats?.total_users ?? 0 },
    { label: 'Downloads', icon: 'download', value: stats?.downloads ?? 0 },
    { label: 'Shorts Created', icon: 'auto_awesome', value: stats?.shorts ?? 0 },
  ]

  return (
    <section>
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-headline-lg font-bold text-on-surface">Global Stats</h2>
        <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-tertiary/10 border border-tertiary/20">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-tertiary opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-tertiary" />
          </span>
          <span className="text-label-sm text-tertiary font-bold tracking-wide">LIVE: 14 Nodes</span>
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map((c) => (
          <GlassPanel key={c.label} className="relative overflow-hidden p-6 rounded-2xl h-32">
            <Icon
              name={c.icon}
              size={80}
              className="absolute -right-4 -top-4 text-on-surface opacity-[0.04] pointer-events-none"
            />
            <div className="relative z-10 flex flex-col gap-1">
              <span className="text-label-sm uppercase tracking-widest text-on-surface-variant">
                {c.label}
              </span>
              {loading ? (
                <div className="h-10 w-20 bg-surface-container-highest rounded animate-pulse mt-1" />
              ) : (
                <span className="text-headline-lg font-bold text-primary">
                  {c.value.toLocaleString()}
                </span>
              )}
              <span className="inline-flex items-center gap-1 text-label-sm text-tertiary">
                <Icon name="trending_up" size={14} />
                +12%
              </span>
            </div>
          </GlassPanel>
        ))}
      </div>
    </section>
  )
}

/* ── Section: Active Pipelines ───────────────────────────────── */

function ActivePipelines({ pipelines, loading }: { pipelines: AdminPipelineInfo[]; loading: boolean }) {
  const activePipelines = pipelines.filter((p) => p.step !== 'idle' && p.step !== 'done')

  return (
    <GlassPanel className="rounded-2xl p-6 flex flex-col gap-4 min-h-[340px]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-primary" />
          </span>
          <h3 className="text-title-md text-on-surface">Active Pipelines</h3>
        </div>
        <span className="text-label-sm text-on-surface-variant">
          {activePipelines.length} Tasks Running
        </span>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : activePipelines.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-on-surface-variant">
          <Icon name="check_circle" size={40} className="opacity-30" />
          <span className="text-label-sm">No active pipelines</span>
        </div>
      ) : (
        <div className="flex flex-col gap-3 overflow-y-auto flex-1">
          {activePipelines.map((p) => {
            const icon = PIPELINE_ICONS[p.step] ?? 'pending'
            const color = PIPELINE_COLORS[p.step] ?? 'primary'

            return (
              <div
                key={p.session_id}
                className="p-4 rounded-xl bg-surface-container-high/50 border border-outline-variant/20"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Icon name={icon} size={18} className="text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-label-md text-on-surface truncate">
                        {p.user_email ?? p.session_id.slice(0, 8)}
                      </p>
                      <p className="text-[11px] text-on-surface-variant truncate">
                        {p.step} &middot; {p.session_id.slice(0, 12)}...
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      className="w-7 h-7 rounded-lg flex items-center justify-center
                                 text-on-surface-variant hover:bg-surface-container-highest transition-colors"
                      title={p.is_paused ? 'Resume' : 'Pause'}
                    >
                      <Icon name={p.is_paused ? 'play_arrow' : 'pause'} size={16} />
                    </button>
                    <button
                      className="w-7 h-7 rounded-lg flex items-center justify-center
                                 text-on-surface-variant hover:bg-error/10 hover:text-error transition-colors"
                      title="Stop"
                    >
                      <Icon name="stop" size={16} />
                    </button>
                  </div>
                </div>

                <ProgressBar progress={p.progress} color={color} />

                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-[11px] text-on-surface-variant truncate max-w-[70%]">
                    {p.message}
                  </span>
                  <span className="text-[11px] font-bold text-on-surface-variant">
                    {Math.round(p.progress)}%
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </GlassPanel>
  )
}

/* ── Section: System Health ───────────────────────────────────── */

function SystemHealth() {
  return (
    <GlassPanel className="rounded-2xl p-6 flex flex-col gap-4 min-h-[340px]">
      <h3 className="text-title-md text-on-surface">System Health</h3>

      <div className="flex flex-col gap-3">
        {/* API Status */}
        <div className="flex items-center justify-between">
          <span className="text-label-md text-on-surface-variant">API Status</span>
          <span className="inline-flex items-center gap-1.5 text-label-sm font-bold text-tertiary">
            <span className="w-1.5 h-1.5 rounded-full bg-tertiary" />
            ONLINE
          </span>
        </div>

        {/* Engine Version */}
        <div className="flex items-center justify-between">
          <span className="text-label-md text-on-surface-variant">Engine Version</span>
          <span className="text-label-sm text-on-surface font-mono">v2.4.1</span>
        </div>

        {/* S3 Bucket */}
        <div className="flex items-center justify-between">
          <span className="text-label-md text-on-surface-variant">S3 Bucket</span>
          <span className="inline-flex items-center gap-1.5 text-label-sm text-tertiary">
            <span className="w-1.5 h-1.5 rounded-full bg-tertiary" />
            Connected
          </span>
        </div>

        {/* Database */}
        <div className="flex items-center justify-between">
          <span className="text-label-md text-on-surface-variant">Database</span>
          <span className="text-label-sm text-on-surface font-mono">~4ms</span>
        </div>
      </div>

      {/* Resource Usage */}
      <div className="border-t border-outline-variant/30 pt-4 mt-auto flex flex-col gap-3">
        <span className="text-label-sm uppercase tracking-widest text-on-surface-variant">
          Resource Usage
        </span>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-label-sm text-on-surface-variant">CPU Load</span>
            <span className="text-label-sm text-on-surface font-mono">23%</span>
          </div>
          <ProgressBar progress={23} color="primary" />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-label-sm text-on-surface-variant">RAM</span>
            <span className="text-label-sm text-on-surface font-mono">61%</span>
          </div>
          <ProgressBar progress={61} color="tertiary" />
        </div>
      </div>
    </GlassPanel>
  )
}

/* ── Section: User Management ────────────────────────────────── */

function UserManagement({
  users,
  loading,
  onToggleAdmin,
}: {
  users: AdminUserInfo[]
  loading: boolean
  onToggleAdmin: (userId: string, isAdmin: boolean) => void
}) {
  const [page, setPage] = useState(0)
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set())
  const totalPages = Math.max(1, Math.ceil(users.length / USERS_PER_PAGE))
  const pagedUsers = users.slice(page * USERS_PER_PAGE, (page + 1) * USERS_PER_PAGE)

  // Reset page if users list shrinks
  useEffect(() => {
    if (page >= totalPages) setPage(Math.max(0, totalPages - 1))
  }, [totalPages, page])

  const handleToggleAdmin = async (userId: string, newValue: boolean) => {
    setTogglingIds((prev) => new Set(prev).add(userId))
    try {
      onToggleAdmin(userId, newValue)
    } finally {
      // Small delay so the toggle feels responsive
      setTimeout(() => {
        setTogglingIds((prev) => {
          const next = new Set(prev)
          next.delete(userId)
          return next
        })
      }, 500)
    }
  }

  return (
    <GlassPanel className="rounded-2xl p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-title-md text-on-surface">User Management</h3>
        <div className="flex items-center gap-2">
          <Button variant="ghost" className="!px-3 !py-1.5 text-label-sm">
            <Icon name="filter_list" size={16} />
            Filter
          </Button>
          <Button variant="primary" className="!px-3 !py-1.5 text-label-sm">
            <Icon name="person_add" size={16} />
            Add User
          </Button>
        </div>
      </div>

      {/* Desktop Table — hidden on mobile */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-outline-variant/30">
              <th className="text-label-sm uppercase tracking-widest text-on-surface-variant py-3 pr-4 font-semibold">
                User
              </th>
              <th className="text-label-sm uppercase tracking-widest text-on-surface-variant py-3 pr-4 font-semibold">
                Status
              </th>
              <th className="text-label-sm uppercase tracking-widest text-on-surface-variant py-3 pr-4 font-semibold">
                Quota Used
              </th>
              <th className="text-label-sm uppercase tracking-widest text-on-surface-variant py-3 pr-4 font-semibold hidden lg:table-cell">
                Joined
              </th>
              <th className="text-label-sm uppercase tracking-widest text-on-surface-variant py-3 pr-4 font-semibold">
                Admin
              </th>
              <th className="text-label-sm uppercase tracking-widest text-on-surface-variant py-3 font-semibold w-10">
                {/* Actions */}
              </th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="border-b border-outline-variant/10">
                  <td className="py-3 pr-4" colSpan={6}>
                    <div className="h-10 bg-surface-container-highest/50 rounded animate-pulse" />
                  </td>
                </tr>
              ))
            ) : pagedUsers.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-on-surface-variant text-label-md">
                  No users found
                </td>
              </tr>
            ) : (
              pagedUsers.map((u) => {
                const quotaLimit = u.quota_limit ?? 50
                const quotaPct = quotaLimit > 0 ? Math.min(100, (u.quota_used / quotaLimit) * 100) : 0

                return (
                  <tr
                    key={u.id}
                    className="border-b border-outline-variant/10 hover:bg-surface-container-high/30 transition-colors group"
                  >
                    {/* User */}
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center text-label-sm font-bold flex-shrink-0 ${avatarColor(u.id)}`}
                        >
                          {getInitials(u.name, u.email)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-label-md text-on-surface truncate">
                            {u.name || u.email.split('@')[0]}
                          </p>
                          <p className="text-[11px] text-on-surface-variant truncate">{u.email}</p>
                        </div>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="py-3 pr-4">
                      <span className="inline-flex items-center text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded border bg-tertiary/10 text-tertiary border-tertiary/20">
                        Active
                      </span>
                    </td>

                    {/* Quota */}
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-3 min-w-[120px]">
                        <div className="flex-1">
                          <ProgressBar
                            progress={quotaPct}
                            color={quotaPct > 80 ? 'secondary' : 'primary'}
                          />
                        </div>
                        <span className="text-[11px] text-on-surface-variant whitespace-nowrap">
                          {u.quota_used}/{quotaLimit}
                        </span>
                      </div>
                    </td>

                    {/* Joined */}
                    <td className="py-3 pr-4 hidden lg:table-cell">
                      <span className="text-label-sm text-on-surface-variant">
                        {formatDate(u.created_at)}
                      </span>
                    </td>

                    {/* Admin Toggle */}
                    <td className="py-3 pr-4">
                      <Toggle
                        checked={u.is_admin}
                        onChange={(v) => handleToggleAdmin(u.id, v)}
                        disabled={togglingIds.has(u.id)}
                      />
                    </td>

                    {/* Actions */}
                    <td className="py-3">
                      <button
                        className="w-7 h-7 rounded-lg flex items-center justify-center
                                   text-on-surface-variant opacity-0 group-hover:opacity-100
                                   hover:bg-surface-container-highest transition-all"
                        title="More actions"
                      >
                        <Icon name="more_vert" size={18} />
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Card List — visible only on mobile */}
      <div className="md:hidden flex flex-col gap-3">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 bg-surface-container-highest/50 rounded-xl animate-pulse" />
          ))
        ) : pagedUsers.length === 0 ? (
          <div className="py-12 text-center text-on-surface-variant text-label-md">
            No users found
          </div>
        ) : (
          pagedUsers.map((u) => (
            <div
              key={u.id}
              className="flex items-center gap-3 p-3 rounded-xl bg-surface-container-high/30 border border-outline-variant/15"
            >
              {/* Avatar */}
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center text-label-sm font-bold flex-shrink-0 ${avatarColor(u.id)}`}
              >
                {getInitials(u.name, u.email)}
              </div>

              {/* Name + email */}
              <div className="flex-1 min-w-0">
                <p className="text-label-md text-on-surface truncate">
                  {u.name || u.email.split('@')[0]}
                </p>
                <p className="text-[11px] text-on-surface-variant truncate">{u.email}</p>
              </div>

              {/* Status dot */}
              <span className="w-2.5 h-2.5 rounded-full bg-tertiary flex-shrink-0" title="Active" />

              {/* Admin toggle */}
              <Toggle
                checked={u.is_admin}
                onChange={(v) => handleToggleAdmin(u.id, v)}
                disabled={togglingIds.has(u.id)}
              />
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {!loading && users.length > 0 && (
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-outline-variant/20">
          <span className="text-label-sm text-on-surface-variant">
            Showing {page * USERS_PER_PAGE + 1}&ndash;
            {Math.min((page + 1) * USERS_PER_PAGE, users.length)} of {users.length} users
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-on-surface-variant
                         hover:bg-surface-container-highest transition-colors disabled:opacity-30 disabled:pointer-events-none"
            >
              <Icon name="chevron_left" size={20} />
            </button>
            <span className="text-label-sm text-on-surface-variant px-2">
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-on-surface-variant
                         hover:bg-surface-container-highest transition-colors disabled:opacity-30 disabled:pointer-events-none"
            >
              <Icon name="chevron_right" size={20} />
            </button>
          </div>
        </div>
      )}
    </GlassPanel>
  )
}

/* ── Main: AdminPage ─────────────────────────────────────────── */

export default function AdminPage() {
  const { user, loading: authLoading } = useAuth()

  const [stats, setStats] = useState<AdminStats | null>(null)
  const [pipelines, setPipelines] = useState<AdminPipelineInfo[]>([])
  const [users, setUsers] = useState<AdminUserInfo[]>([])

  const [statsLoading, setStatsLoading] = useState(true)
  const [pipelinesLoading, setPipelinesLoading] = useState(true)
  const [usersLoading, setUsersLoading] = useState(true)

  const pipelineTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  /* ── Fetch stats ── */
  const fetchStats = useCallback(async () => {
    try {
      const data = await api.getAdminStats()
      setStats(data)
    } catch (err) {
      console.error('Failed to fetch admin stats', err)
    } finally {
      setStatsLoading(false)
    }
  }, [])

  /* ── Fetch pipelines ── */
  const fetchPipelines = useCallback(async () => {
    try {
      const data = await api.getAdminPipelines()
      setPipelines(data)
    } catch (err) {
      console.error('Failed to fetch pipelines', err)
    } finally {
      setPipelinesLoading(false)
    }
  }, [])

  /* ── Fetch users ── */
  const fetchUsers = useCallback(async () => {
    try {
      const data = await api.getAdminUsers()
      setUsers(data)
    } catch (err) {
      console.error('Failed to fetch users', err)
    } finally {
      setUsersLoading(false)
    }
  }, [])

  /* ── Toggle admin role ── */
  const handleToggleAdmin = useCallback(
    async (userId: string, isAdmin: boolean) => {
      try {
        await api.setUserAdmin(userId, isAdmin)
        // Optimistic update
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, is_admin: isAdmin } : u)),
        )
      } catch (err) {
        console.error('Failed to update admin role', err)
        // Revert on error
        fetchUsers()
      }
    },
    [fetchUsers],
  )

  /* ── Initial load + pipeline polling ── */
  useEffect(() => {
    if (authLoading || !user?.is_admin) return

    fetchStats()
    fetchPipelines()
    fetchUsers()

    // Poll pipelines every 3s
    pipelineTimerRef.current = setInterval(fetchPipelines, 3000)

    return () => {
      if (pipelineTimerRef.current) clearInterval(pipelineTimerRef.current)
    }
  }, [authLoading, user?.is_admin, fetchStats, fetchPipelines, fetchUsers])

  /* ── Guard: auth still loading ── */
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  /* ── Guard: not admin ── */
  if (!user?.is_admin) {
    return <AccessDenied />
  }

  /* ── Render ── */
  return (
    <div className="flex flex-col gap-8 max-w-[1400px]">
      {/* Mobile admin header */}
      <div className="md:hidden">
        <h1 className="text-xl font-bold text-on-surface">Admin Console</h1>
        <p className="text-label-sm text-on-surface-variant">V3.2 Engine &bull; Quota: {stats?.shorts ?? 0}/{stats?.total_sessions ?? 5}</p>
      </div>

      {/* Section 1: Global Stats */}
      <GlobalStats stats={stats} loading={statsLoading} />

      {/* Section 2: Active Pipelines + System Health */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <ActivePipelines pipelines={pipelines} loading={pipelinesLoading} />
        </div>
        <div className="lg:col-span-1">
          <SystemHealth />
        </div>
      </div>

      {/* Section 3: User Management */}
      <UserManagement users={users} loading={usersLoading} onToggleAdmin={handleToggleAdmin} />
    </div>
  )
}
