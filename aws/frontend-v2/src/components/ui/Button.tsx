import { type ButtonHTMLAttributes, type ReactNode } from 'react'

type ButtonVariant = 'primary' | 'ghost' | 'secondary' | 'danger'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  children: ReactNode
  className?: string
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    'bg-primary text-on-primary font-bold rounded-xl hover:brightness-110 active:scale-95 transition-all',
  ghost:
    'border border-primary/30 text-primary hover:bg-primary/10 rounded-xl transition-all active:scale-95',
  secondary:
    'bg-secondary-container text-on-secondary-container font-bold rounded-xl hover:brightness-110 active:scale-95 transition-all',
  danger:
    'bg-error-container text-on-error-container rounded-xl hover:brightness-110 active:scale-95 transition-all',
}

export default function Button({
  variant = 'primary',
  children,
  className = '',
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={`
        inline-flex items-center justify-center gap-2 px-5 py-2.5 text-label-md
        ${variantStyles[variant]}
        ${disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}
        ${className}
      `}
      disabled={disabled}
      {...rest}
    >
      {children}
    </button>
  )
}
