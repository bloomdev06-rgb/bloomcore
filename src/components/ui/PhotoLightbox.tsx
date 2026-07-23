import { useState } from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"
import { photoSrc, largePhotoUrl } from "../../data/api"

interface PhotoLightboxProps {
  src: string
  alt?: string
  onClose: () => void
}

export function PhotoLightbox({ src, alt, onClose }: PhotoLightboxProps) {
  // On tente la version large (nette en plein écran) ; si elle n'existe pas — photo legacy,
  // avatar créé hors-ligne, URL externe — on retombe sur la vignette fournie.
  const [failed, setFailed] = useState(false)
  const large = largePhotoUrl(src)
  const shown = failed || !large ? src : large
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
        src={photoSrc(shown)}
        alt={alt || ""}
        onError={() => { if (!failed) setFailed(true) }}
        className="max-w-full max-h-full rounded-2xl object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>,
    document.body
  )
}
