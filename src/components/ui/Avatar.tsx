import type { LucideIcon } from "lucide-react"
import { cn } from "../../lib/utils"
import { photoSrc } from "../../data/api"

interface AvatarProps {
  src?: string
  icon?: LucideIcon
  initials?: string
  size?: "sm" | "md" | "lg"
  className?: string
}

const SIZE_CLASS = {
  sm: "w-6 h-6 text-[9px]",
  md: "w-9 h-9 text-[10px]",
  lg: "w-16 h-16 text-lg",
} as const

const ICON_SIZE = { sm: 12, md: 16, lg: 28 } as const

export function Avatar({ src, icon: Icon, initials, size = "md", className }: AvatarProps) {
  const base = cn(
    "rounded-full flex items-center justify-center shrink-0 font-ui font-bold overflow-hidden",
    SIZE_CLASS[size],
    className
  )

  if (src) {
    return <img src={photoSrc(src)} alt={initials || ""} className={cn(base, "object-cover")} />
  }

  if (Icon) {
    return (
      <div className={base}>
        <Icon size={ICON_SIZE[size]} />
      </div>
    )
  }

  return <div className={base}>{initials}</div>
}
