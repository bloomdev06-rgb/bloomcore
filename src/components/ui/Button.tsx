import { forwardRef } from "react"
import type { ButtonHTMLAttributes, ReactNode } from "react"
import { Loader2 } from "lucide-react"
import { cn } from "../../lib/utils"

type Variant = "primary" | "secondary" | "danger"
type Size = "sm" | "md"

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  icon?: ReactNode
}

const VARIANT_CLASS: Record<Variant, string> = {
  primary: "bg-bc-green text-white hover:opacity-90",
  secondary: "border border-bc-border text-bc-text-secondary hover:bg-bc-canvas",
  danger: "bg-bc-danger text-white hover:opacity-90",
}

const SIZE_CLASS: Record<Size, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-5 py-2 text-xs",
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading = false, icon, disabled, className, children, type = "button", ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-full font-bold whitespace-nowrap transition-colors active-scale disabled:opacity-40 disabled:pointer-events-none",
        VARIANT_CLASS[variant],
        SIZE_CLASS[size],
        className
      )}
      {...props}
    >
      {loading ? <Loader2 className="animate-spin" size={14} /> : icon}
      {children}
    </button>
  )
})
