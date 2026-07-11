import { createPortal } from "react-dom"
import { X } from "lucide-react"

interface PhotoLightboxProps {
  src: string
  alt?: string
  onClose: () => void
}

export function PhotoLightbox({ src, alt, onClose }: PhotoLightboxProps) {
  return createPortal(
    <div
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-6"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-6 right-6 p-2 bg-white/10 rounded-full text-white hover:bg-white/20 transition-colors"
      >
        <X size={22} />
      </button>
      <img
        src={src}
        alt={alt || ""}
        className="max-w-full max-h-full rounded-2xl object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>,
    document.body
  )
}
