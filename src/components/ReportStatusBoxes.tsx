import { memo } from 'react';
import { X, AlertTriangle, Check } from 'lucide-react';
import { Report } from '../types';
import { reportingWindow } from '../data/week';
import { memberWeekStatus } from '../data/completude';

// Affichage à 2 cases (S-2 puis S-1) du statut des rapports Bloom Bus d'un membre :
//   croix rouge   → non rempli
//   triangle jaune → rempli par le membre, en attente de validation du capitaine
//   coche verte    → validé (rempli par le capitaine, ou membre puis validé)
// `onValidate(week)` optionnel : si fourni, une case « en attente » devient cliquable pour
// valider (réservé au capitaine / hiérarchie).
// ponytail: memo — rendu par ligne de membre (listes Membres/Nouveaux) ; ne recalcule les 2 cases
// que si memberId/reports/onValidate changent.
export const ReportStatusBoxes = memo(function ReportStatusBoxes({
  memberId,
  reports,
  now = new Date(),
  onValidate,
  size = 22,
}: {
  memberId: string;
  reports: Report[];
  now?: Date;
  onValidate?: (week: string) => void;
  size?: number;
}) {
  const { s1, s2 } = reportingWindow(now);
  const weeks: { label: string; week: string }[] = [
    { label: 'S-2', week: s2 },
    { label: 'S-1', week: s1 },
  ];
  return (
    <div className="flex gap-1">
      {weeks.map(({ label, week }) => {
        const status = memberWeekStatus(memberId, week, reports);
        const clickable = status === 'pending' && !!onValidate;
        const cls =
          status === 'validated' ? 'text-bc-success bg-bc-success/10'
          : status === 'pending' ? 'text-bc-warning bg-bc-warning/10'
          : 'text-bc-danger bg-bc-danger/10';
        const Icon = status === 'validated' ? Check : status === 'pending' ? AlertTriangle : X;
        const title =
          `${label} — ${status === 'validated' ? 'validé' : status === 'pending' ? 'en attente de validation' : 'non rempli'}`
          + (clickable ? ' · cliquer pour valider' : '');
        return (
          <button
            key={label}
            type="button"
            disabled={!clickable}
            onClick={clickable ? (e) => { e.stopPropagation(); onValidate!(week); } : undefined}
            title={title}
            aria-label={title}
            style={{ width: size, height: size }}
            className={`rounded-md flex items-center justify-center shrink-0 ${cls} ${clickable ? 'cursor-pointer active-scale ring-1 ring-bc-warning/50' : 'cursor-default'}`}
          >
            <Icon size={Math.round(size * 0.58)} />
          </button>
        );
      })}
    </div>
  );
});

export default ReportStatusBoxes;
