interface ProgressBarProps {
  progress: number
  color?: 'primary' | 'tertiary' | 'secondary'
  glow?: boolean
  className?: string
}

const colorMap = {
  primary: 'bg-primary',
  tertiary: 'bg-tertiary',
  secondary: 'bg-secondary-container',
}

export default function ProgressBar({
  progress,
  color = 'primary',
  glow = false,
  className = '',
}: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, progress))

  return (
    <div
      className={`
        ${glow ? 'h-3' : 'h-1.5'} w-full bg-surface-container-highest rounded-full overflow-hidden
        ${className}
      `}
    >
      <div
        className={`
          h-full ${colorMap[color]} rounded-full transition-all duration-500 ease-out
          ${glow ? 'shadow-[0_0_15px_rgba(173,198,255,0.5)]' : ''}
        `}
        style={{ width: `${clamped}%` }}
      />
    </div>
  )
}
