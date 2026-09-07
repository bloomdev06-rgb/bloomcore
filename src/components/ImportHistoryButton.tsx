import { useState } from 'react';
import { History, RotateCcw } from 'lucide-react';
import type { ImportBatch, ImportBatchKind, ImportUndoResult } from '../types';
import { apiListImportBatches, apiUndoImportBatch } from '../data/api';
import { Modal } from './ui/Modal';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { toast } from './ui/Toast';

interface Props {
  kind: ImportBatchKind;
  onUndone: (result: ImportUndoResult) => void;
  compact?: boolean;
}

export function ImportHistoryButton({ kind, onUndone, compact = false }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [confirming, setConfirming] = useState<ImportBatch | null>(null);
  const [undoing, setUndoing] = useState(false);

  const show = async () => {
    setOpen(true);
    setLoading(true);
    const data = await apiListImportBatches(kind);
    setLoading(false);
    if (!data) return toast.error("Impossible de charger l’historique des imports.");
    setBatches(data);
  };

  const undo = async () => {
    if (!confirming) return;
    setUndoing(true);
    const response = await apiUndoImportBatch(confirming.id);
    setUndoing(false);
    setConfirming(null);
    if (!response.ok || !response.result) return toast.error(response.error ?? "Impossible d’annuler cet import.");
    onUndone(response.result);
    setBatches(prev => prev.map(batch => batch.id === response.result!.batch.id ? response.result!.batch : batch));
    if (response.result.conflicts.length) {
      toast.error(`Annulation partielle : ${response.result.conflicts.length} élément(s) modifié(s) ont été conservés.`);
    } else {
      toast.success('Import annulé avec succès.');
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={show}
        title="Historique des imports"
        aria-label="Historique des imports"
        className={compact
          ? 'p-1.5 rounded-full border border-bc-border text-bc-text hover:bg-bc-canvas active-scale'
          : 'px-4 py-2.5 rounded-full font-ui font-bold text-xs text-bc-text border border-bc-border bg-white hover:bg-bc-canvas flex items-center gap-1.5 min-h-[48px] active:scale-95'}
      >
        <History size={compact ? 14 : 16} />
        {!compact && <span className="hidden sm:inline">Historique imports</span>}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Historique des imports" icon={<History size={18} />}>
        <p className="text-sm text-bc-text-secondary mb-4">
          Une annulation conserve automatiquement tout élément modifié après son import.
        </p>
        {loading ? (
          <p className="py-8 text-center text-sm text-bc-text-secondary">Chargement…</p>
        ) : batches.length === 0 ? (
          <div className="py-8 text-center rounded-2xl bg-bc-canvas text-sm text-bc-text-secondary">Aucun import enregistré.</div>
        ) : (
          <div className="space-y-2">
            {batches.map(batch => (
              <div key={batch.id} className="rounded-2xl border border-bc-border p-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-ui font-bold text-sm text-bc-text">{batch.itemCount} {kind === 'members' ? 'membre(s)' : 'Bloom Bus'}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${batch.status === 'active' ? 'bg-bc-green/10 text-bc-green' : batch.status === 'partial' ? 'bg-bc-warning/10 text-bc-warning' : 'bg-bc-canvas text-bc-text-secondary'}`}>
                      {batch.status === 'active' ? 'Annulable' : batch.status === 'partial' ? 'Partiel' : 'Annulé'}
                    </span>
                  </div>
                  <p className="text-xs text-bc-text-secondary mt-1">
                    {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(batch.createdAt))} · {batch.createdByName}
                  </p>
                  {!!batch.conflicts?.length && <p className="text-xs text-bc-warning mt-1">{batch.conflicts.length} élément(s) conservé(s) car modifié(s).</p>}
                </div>
                {batch.status === 'active' && (
                  <button type="button" onClick={() => setConfirming(batch)} className="shrink-0 px-3 py-2 rounded-xl border border-red-200 text-red-700 hover:bg-red-50 text-xs font-bold flex items-center justify-center gap-1.5">
                    <RotateCcw size={14} /> Annuler l’import
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!confirming}
        onCancel={() => !undoing && setConfirming(null)}
        onConfirm={undo}
        title="Annuler cet import ?"
        message="Les profils ou affectations créés par ce lot seront retirés. Les éléments modifiés depuis seront conservés et signalés."
        confirmLabel={undoing ? 'Annulation…' : 'Confirmer l’annulation'}
      />
    </>
  );
}
