import { type ReactNode } from 'react'

type BadgeVariant = 'sports' | 'economy' | 'politics' | 'tech' | 'active' | 'idle' | 'error'

interface BadgeProps {
  variant: BadgeVariant
  children: ReactNode
  className?: string
}

const variantStyles: Record<BadgeVariant, string> = {
  sports: 'bg-tertiary/10 text-tertiary border-tertiary/20',
  tech: 'bg-tertiary/10 text-tertiary border-tertiary/20',
  economy: 'bg-secondary-container/10 text-secondary-fixed-dim border-secondary-fixed/20',
  politics: 'bg-error/10 text-error border-error/20',
  active: 'bg-tertiary/10 text-tertiary border-tertiary/20',
  idle: 'bg-surface-variant text-on-surface-variant border-outline-variant/20',
  error: 'bg-error/10 text-error border-error/20',
}

export default function Badge({ variant, children, className = '' }: BadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center text-[10px] font-bold uppercase tracking-widest
        px-2 py-0.5 rounded border
        ${variantStyles[variant]}
        ${className}
      `}
    >
      {children}
    </span>
  )
}
