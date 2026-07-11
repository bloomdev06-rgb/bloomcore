import { useEffect, useState } from "react"
import { motion } from "motion/react"
import { CheckCircle2, XCircle, Info } from "lucide-react"
import { cn } from "../../lib/utils"

type ToastType = "success" | "error" | "info"
interface ToastItem {
  id: number
  type: ToastType
  message: string
}

let toasts: ToastItem[] = []
let listeners: Array<(items: ToastItem[]) => void> = []
let counter = 0

function emit() {
  listeners.forEach((l) => l(toasts))
}

function push(message: string, type: ToastType) {
  const id = ++counter
  toasts = [...toasts, { id, type, message }]
  emit()
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id)
    emit()
  }, 4000)
}

// ponytail: module-level pub-sub, not Context — toast() is called from
// files scattered across lazy-loaded view chunks, a provider would need
// wiring in every one of them for no benefit over a single mounted container.
export const toast = {
  success: (message: string) => push(message, "success"),
  error: (message: string) => push(message, "error"),
  info: (message: string) => push(message, "info"),
}

const ICON: Record<ToastType, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
}

const TONE: Record<ToastType, string> = {
  success: "text-bc-success",
  error: "text-bc-danger",
  info: "text-bc-cerulean",
}

export function ToastContainer() {
  const [items, setItems] = useState<ToastItem[]>([])

  useEffect(() => {
    listeners.push(setItems)
    return () => {
      listeners = listeners.filter((l) => l !== setItems)
    }
  }, [])

  if (items.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 items-end pointer-events-none">
      {items.map((t) => {
        const Icon = ICON[t.type]
        return (
          <motion.div
            key={t.id}
            role="status"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="pointer-events-auto flex items-center gap-2 bg-white border border-bc-border shadow-2xl rounded-2xl px-4 py-3 text-sm font-medium text-bc-text max-w-sm"
          >
            <Icon size={18} className={cn("shrink-0", TONE[t.type])} />
            {t.message}
          </motion.div>
        )
      })}
    </div>
  )
}
