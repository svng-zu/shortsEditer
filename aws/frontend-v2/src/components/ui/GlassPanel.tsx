import { type ElementType, type ComponentPropsWithoutRef, type ReactNode } from 'react'

type GlassPanelProps<T extends ElementType = 'div'> = {
  children?: ReactNode
  className?: string
  elevated?: boolean
  as?: T
} & Omit<ComponentPropsWithoutRef<T>, 'className' | 'children'>

export default function GlassPanel<T extends ElementType = 'div'>({
  children,
  className = '',
  elevated = false,
  as,
  ...rest
}: GlassPanelProps<T>) {
  const Component = as || 'div'
  const panelClass = elevated ? 'glass-panel-elevated' : 'glass-panel'

  return (
    <Component className={`${panelClass} ${className}`} {...rest}>
      {children}
    </Component>
  )
}
