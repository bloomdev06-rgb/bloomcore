import { forwardRef } from "react"
import type { ButtonHTMLAttributes, ReactNode } from "react"
import { Loader2 } from "lucide-react"
import { cn } from "../../lib/utils"

// Conforme CHARTE-GRAPHIQUE.md §5.1 : 5 variantes, hover→vert-700, anneau de focus,
// cible tactile ≥48px (§4/§9). ponytail: le primitive est prêt à être adopté — les
// ~234 <button> inline existants restent à migrer (chantier séparé, non fait ici).
type Variant = "primary" | "secondary" | "danger" | "excellence" | "ghost"
type Size = "sm" | "md"

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  icon?: ReactNode
}

const VARIANT_CLASS: Record<Variant, string> = {
  primary: "bg-gradient-to-b from-bc-green to-bc-green-hover text-white shadow-[0_4px_14px_-6px_rgba(0,108,103,.5)] hover:shadow-[0_7px_20px_-6px_rgba(0,108,103,.62)]", // Move 4 : sheen vertical + ombre verte teintée (lift au survol)
  secondary: "border border-bc-green text-bc-green hover:bg-bc-green/5",
  danger: "bg-bc-danger text-white hover:brightness-95",
  excellence: "bg-bc-gold text-bc-green-dark hover:brightness-95", // doré + texte vert foncé (§1.1 : jamais doré seul)
  ghost: "text-bc-green hover:bg-bc-green/5",
}

// md = taille par défaut, cible tactile ≥48px (terrain mobile) ; sm = contexte dense desktop.
const SIZE_CLASS: Record<Size, string> = {
  sm: "min-h-[40px] px-3 py-2 text-xs",
  md: "min-h-[48px] px-5 py-2.5 text-sm",
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
        "inline-flex items-center justify-center gap-1.5 rounded-full font-bold whitespace-nowrap transition active-scale disabled:opacity-40 disabled:pointer-events-none",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bc-green/50 focus-visible:ring-offset-2 focus-visible:ring-offset-bc-surface",
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
