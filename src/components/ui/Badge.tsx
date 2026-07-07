import type { ReactNode } from "react"
import { cn } from "../../lib/utils"

type Tone = "green" | "gold" | "cerulean" | "orange" | "purple" | "success" | "warning" | "danger"

interface BadgeProps {
  tone: Tone
  opacity?: 10 | 15 | 20
  className?: string
  children: ReactNode
}

const TONE_TEXT: Record<Tone, string> = {
  green: "text-bc-green",
  gold: "text-bc-gold",
  cerulean: "text-bc-cerulean",
  orange: "text-bc-orange",
  purple: "text-bc-purple",
  success: "text-bc-success",
  warning: "text-bc-warning",
  danger: "text-bc-danger",
}

const TONE_BG: Record<Tone, Record<10 | 15 | 20, string>> = {
  green: { 10: "bg-bc-green/10", 15: "bg-bc-green/15", 20: "bg-bc-green/20" },
  gold: { 10: "bg-bc-gold/10", 15: "bg-bc-gold/15", 20: "bg-bc-gold/20" },
  cerulean: { 10: "bg-bc-cerulean/10", 15: "bg-bc-cerulean/15", 20: "bg-bc-cerulean/20" },
  orange: { 10: "bg-bc-orange/10", 15: "bg-bc-orange/15", 20: "bg-bc-orange/20" },
  purple: { 10: "bg-bc-purple/10", 15: "bg-bc-purple/15", 20: "bg-bc-purple/20" },
  success: { 10: "bg-bc-success/10", 15: "bg-bc-success/15", 20: "bg-bc-success/20" },
  warning: { 10: "bg-bc-warning/10", 15: "bg-bc-warning/15", 20: "bg-bc-warning/20" },
  danger: { 10: "bg-bc-danger/10", 15: "bg-bc-danger/15", 20: "bg-bc-danger/20" },
}

export function Badge({ tone, opacity = 10, className, children }: BadgeProps) {
  return (
    <span
      className={cn(
        "text-[9px] font-bold px-2 py-0.5 rounded-full",
        TONE_BG[tone][opacity],
        TONE_TEXT[tone],
        className
      )}
    >
      {children}
    </span>
  )
}
