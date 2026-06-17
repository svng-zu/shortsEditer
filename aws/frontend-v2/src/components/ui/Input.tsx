import { type InputHTMLAttributes, forwardRef } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  className?: string
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, className = '', id, ...rest }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined)

    return (
      <div className={`flex flex-col gap-1.5 ${className}`}>
        {label && (
          <label htmlFor={inputId} className="text-label-sm text-on-surface-variant">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className="
            bg-surface-container-lowest border border-outline-variant/50 rounded-xl
            px-4 py-3 text-on-surface text-body-md placeholder:text-on-surface-variant/50
            focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none
            transition-colors
          "
          {...rest}
        />
      </div>
    )
  },
)

Input.displayName = 'Input'

export default Input
