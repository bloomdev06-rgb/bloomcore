import { AlertTriangle } from "lucide-react"
import { Modal } from "./Modal"
import { Button } from "./Button"

interface ConfirmDialogProps {
  open: boolean
  onCancel: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
}

export function ConfirmDialog({
  open,
  onCancel,
  onConfirm,
  title,
  message,
  confirmLabel = "Supprimer",
  cancelLabel = "Annuler",
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onCancel} title={title} icon={<AlertTriangle size={18} className="text-bc-danger" />} maxWidth="max-w-sm">
      <p className="text-sm text-bc-text-secondary mb-6">{message}</p>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>{cancelLabel}</Button>
        <Button
          variant="danger"
          onClick={() => {
            onConfirm()
            onCancel()
          }}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}
