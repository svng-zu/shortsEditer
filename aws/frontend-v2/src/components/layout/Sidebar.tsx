import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import Icon from '../ui/Icon'

interface NavItem {
  label: string
  icon: string
  route: string
  placeholder?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', icon: 'dashboard', route: '/dashboard' },
  { label: 'YouTube Channels', icon: 'subscriptions', route: '/channels' },
  { label: 'Media Library', icon: 'video_library', route: '/media', placeholder: true },
  { label: 'Shorts Gallery', icon: 'movie', route: '/editor' },
  { label: 'Pipeline Status', icon: 'analytics', route: '/pipeline', placeholder: true },
  { label: 'Admin Console', icon: 'settings_applications', route: '/admin' },
]

export default function Sidebar() {
  const { user, openAuthModal } = useAuth()
  const location = useLocation()

  return (
    <aside className="hidden md:flex bg-surface-container/85 backdrop-blur-xl border-r border-outline-variant/30 h-screen sticky left-0 top-0 flex-col py-6 w-sidebar shrink-0">
      {/* Logo */}
      <div className="px-6 mb-8">
        <div className="flex items-center gap-3">
          <img
            src="/static/gorila_ai.png"
            alt="Gorilla AI"
            className="h-9 w-9 rounded-lg"
          />
          <div>
            <h1 className="text-primary font-bold text-headline-lg leading-none tracking-tight">
              Gorilla AI
            </h1>
            <span className="text-label-sm text-on-surface-variant uppercase tracking-widest">
              V3.2 Engine
            </span>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 flex flex-col gap-1 px-3 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const isActive =
            location.pathname === item.route ||
            location.pathname.startsWith(item.route + '/')

          return (
            <NavLink
              key={item.route}
              to={item.route}
              className={`
                flex items-center gap-3 px-4 py-3 rounded-xl text-label-md transition-all duration-200
                ${
                  isActive
                    ? 'bg-primary/10 text-primary border-l-4 border-primary pl-3'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-bright/10 border-l-4 border-transparent'
                }
              `}
            >
              <Icon name={item.icon} size={24} filled={isActive} />
              <span>{item.label}</span>
              {item.placeholder && (
                <span className="ml-auto text-label-sm text-on-surface-variant/50 bg-surface-container-high/50 px-1.5 py-0.5 rounded text-[10px]">
                  Soon
                </span>
              )}
            </NavLink>
          )
        })}
      </nav>

      {/* Bottom Section */}
      <div className="border-t border-outline-variant/20 pt-6 px-4 flex flex-col gap-4">
        {/* Run All Button */}
        <button className="bg-primary text-on-primary w-full py-3 rounded-xl font-bold text-label-md hover:brightness-110 active:scale-[0.98] transition-all">
          Run All
        </button>

        {/* Quota Display */}
        <div className="flex items-center gap-2 px-1">
          <Icon name="data_usage" size={18} className="text-on-surface-variant" />
          <span className="text-label-sm text-on-surface-variant">
            Quota: 0/10
          </span>
        </div>

        {/* Login / Profile */}
        {user ? (
          <div className="flex items-center gap-3 px-1">
            <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-label-sm font-bold shrink-0">
              {(user.name || user.email)?.[0]?.toUpperCase() || 'U'}
            </div>
            <div className="min-w-0">
              <p className="text-label-md text-on-surface truncate">
                {user.name || user.email}
              </p>
              {user.name && (
                <p className="text-label-sm text-on-surface-variant truncate">
                  {user.email}
                </p>
              )}
            </div>
          </div>
        ) : (
          <button
            onClick={() => openAuthModal('login')}
            className="flex items-center gap-2 px-1 text-label-md text-on-surface-variant hover:text-primary transition-colors"
          >
            <Icon name="login" size={20} />
            <span>로그인</span>
          </button>
        )}
      </div>
    </aside>
  )
}
