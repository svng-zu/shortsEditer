import GlassPanel from './GlassPanel'
import Icon from './Icon'

interface StatCardProps {
  label: string
  value: string
  trend?: string
  icon: string
  className?: string
}

export default function StatCard({ label, value, trend, icon, className = '' }: StatCardProps) {
  return (
    <GlassPanel className={`relative overflow-hidden p-5 rounded-2xl ${className}`}>
      {/* Background ghost icon */}
      <Icon
        name={icon}
        size={80}
        className="absolute -right-2 -bottom-2 text-on-surface opacity-[0.04] pointer-events-none"
      />

      <div className="relative z-10 flex flex-col gap-1">
        <span className="text-label-sm uppercase tracking-widest text-on-surface-variant">
          {label}
        </span>

        <span className="text-headline-lg text-primary">{value}</span>

        {trend && (
          <span className="inline-flex items-center gap-1 text-label-sm text-tertiary">
            <Icon name="trending_up" size={16} />
            {trend}
          </span>
        )}
      </div>
    </GlassPanel>
  )
}
