import { useEffect, useRef } from "react"
import type { ReactNode } from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"
import { cn } from "../../lib/utils"

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  icon?: ReactNode
  children: ReactNode
  maxWidth?: string
  className?: string
}

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

export function Modal({ open, onClose, title, icon, children, maxWidth = "max-w-2xl", className }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useRef(`modal-title-${Math.random().toString(36).slice(2)}`).current

  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    const firstFocusable = panel?.querySelector<HTMLElement>(FOCUSABLE)
    firstFocusable?.focus()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose()
        return
      }
      if (e.key !== "Tab" || !panel) return
      const focusables = (Array.from(panel.querySelectorAll(FOCUSABLE)) as HTMLElement[]).filter((el) => !el.hasAttribute("disabled"))
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener("keydown", onKeyDown)
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKeyDown)
      document.body.style.overflow = ""
      previouslyFocused?.focus()
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        className={cn(
          "bg-white rounded-[2rem] w-full p-6 border border-bc-border shadow-2xl relative max-h-[90vh] overflow-y-auto",
          maxWidth,
          className
        )}
      >
        <button
          onClick={onClose}
          aria-label="Fermer"
          className="absolute top-4 right-4 p-2 text-bc-text-secondary hover:text-bc-text transition-colors active-scale"
        >
          <X size={20} />
        </button>

        {title && (
          <h3 id={titleId} className="text-base font-ui font-bold text-bc-text flex items-center gap-2 mb-4 pr-8">
            {icon}
            {title}
          </h3>
        )}

        {children}
      </div>
    </div>,
    document.body
  )
}
