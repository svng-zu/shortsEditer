type MobileTab = 'pipeline' | 'editor' | 'preview'

interface Props {
  activeTab: MobileTab
  onTabChange: (tab: MobileTab) => void
  isRunning: boolean
  counts: { pipeline: number; editor: number; preview: number }
}

const TABS: { key: MobileTab; icon: string; label: string }[] = [
  { key: 'pipeline', icon: '⚡', label: 'Pipeline' },
  { key: 'editor',   icon: '✏️', label: 'Editor'   },
  { key: 'preview',  icon: '▶',  label: 'Preview'  },
]

export default function BottomNav({ activeTab, onTabChange, isRunning, counts }: Props) {
  return (
    <div className="shrink-0 bg-slate-900 border-t border-slate-800">

      {/* 탭 버튼 */}
      <nav className="flex items-stretch">
        {TABS.map(tab => {
          const isActive  = activeTab === tab.key
          const count     = counts[tab.key]
          const showPulse = tab.key === 'pipeline' && isRunning

          return (
            <button
              key={tab.key}
              onClick={() => onTabChange(tab.key)}
              className={`flex-1 flex flex-col items-center justify-center py-3 gap-1 relative transition-colors ${
                isActive ? 'text-violet-400' : 'text-slate-500 active:text-slate-300'
              }`}
            >
              {isActive && (
                <span className="absolute top-0 inset-x-6 h-0.5 bg-violet-500 rounded-b-full" />
              )}

              <span className="text-xl leading-none relative">
                {tab.icon}
                {showPulse && (
                  <span className="absolute -top-0.5 -right-1 w-2 h-2 bg-violet-500 rounded-full animate-pulse" />
                )}
                {!showPulse && count > 0 && (
                  <span className={`absolute -top-1 -right-2 min-w-[14px] h-[14px] px-0.5 rounded-full text-[9px] font-bold flex items-center justify-center ${
                    isActive ? 'bg-violet-500 text-white' : 'bg-slate-600 text-slate-300'
                  }`}>
                    {count > 99 ? '99+' : count}
                  </span>
                )}
              </span>

              <span className={`text-[11px] font-semibold ${isActive ? 'text-violet-400' : 'text-slate-500'}`}>
                {tab.label}
              </span>
            </button>
          )
        })}
      </nav>

      {/* iPhone 홈 인디케이터 safe area 채우기 */}
      <div className="safe-area-bg bg-slate-900" />

    </div>
  )
}
