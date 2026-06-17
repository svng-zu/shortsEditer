import { type SelectHTMLAttributes, type ReactNode, forwardRef } from 'react'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  children: ReactNode
  className?: string
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, children, className = '', id, ...rest }, ref) => {
    const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined)

    return (
      <div className={`flex flex-col gap-1.5 ${className}`}>
        {label && (
          <label htmlFor={selectId} className="text-label-sm text-on-surface-variant">
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          className="
            appearance-none bg-surface-container-lowest border border-outline-variant/50 rounded-xl
            px-4 py-3 text-on-surface text-body-md
            focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none
            transition-colors cursor-pointer
            bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2012%2012%22%3E%3Cpath%20fill%3D%22%238c909f%22%20d%3D%22M6%208L1%203h10z%22%2F%3E%3C%2Fsvg%3E')]
            bg-[length:12px] bg-[position:right_16px_center] bg-no-repeat pr-10
          "
          {...rest}
        >
          {children}
        </select>
      </div>
    )
  },
)

Select.displayName = 'Select'

export default Select
