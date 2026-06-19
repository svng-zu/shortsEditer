import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import Icon from '../ui/Icon'

interface MobileNavItem {
  label: string
  icon: string
  route: string
}

const LEFT_NAV_ITEMS: MobileNavItem[] = [
  { label: '홈', icon: 'dashboard', route: '/dashboard' },
  { label: '편집', icon: 'movie', route: '/editor' },
]

const RIGHT_NAV_ITEMS: MobileNavItem[] = [
  { label: '채널', icon: 'subscriptions', route: '/channels' },
  { label: '프로필', icon: 'person', route: '/profile' },
]

export default function MobileBottomNav() {
  const location = useLocation()
  const navigate = useNavigate()

  const renderItem = (item: MobileNavItem) => {
    const isActive =
      location.pathname === item.route ||
      location.pathname.startsWith(item.route + '/')

    return (
      <NavLink
        key={item.route}
        to={item.route}
        className={`
          flex flex-col items-center justify-center gap-0.5 py-1 px-3 rounded-xl transition-colors
          ${isActive ? 'text-primary' : 'text-on-surface-variant'}
        `}
      >
        <Icon name={item.icon} size={24} filled={isActive} />
        <span className="text-[10px] font-medium leading-tight">{item.label}</span>
      </NavLink>
    )
  }

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-surface-container/90 backdrop-blur-xl border-t border-outline-variant/30 z-50 flex items-center justify-around px-2 safe-area-bottom">
      {/* Left items */}
      {LEFT_NAV_ITEMS.map(renderItem)}

      {/* Center FAB "+" button */}
      <button
        onClick={() => navigate('/channels')}
        className="
          relative -mt-5 w-14 h-14 rounded-full bg-primary text-on-primary
          flex items-center justify-center
          shadow-lg shadow-primary/30
          active:scale-95 transition-transform
        "
      >
        <Icon name="add" size={28} />
      </button>

      {/* Right items */}
      {RIGHT_NAV_ITEMS.map(renderItem)}
    </nav>
  )
}
