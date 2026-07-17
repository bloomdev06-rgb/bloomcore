import { Period } from "../../data/kpi";

// Sélecteur de période partagé (#10) — 5 vues dupliquaient ce bloc (select 5 presets +
// inputs date en mode « Personnalisé »). Seule la palette variait selon le fond : `dark`
// pour le hero de l'Accueil, `light` pour les cartes. L'état (period/customFrom/customTo)
// reste chez l'appelant : ce composant est purement présentationnel.
interface PeriodSelectorProps {
  period: Period;
  onPeriodChange: (p: Period) => void;
  customFrom: string;
  customTo: string;
  onCustomFromChange: (v: string) => void;
  onCustomToChange: (v: string) => void;
  variant?: "light" | "dark";
  className?: string;
}

const OPTIONS: [Period, string][] = [
  ["week", "Cette Semaine"],
  ["month", "Ce Mois"],
  ["quarter", "Ce Trimestre"],
  ["year", "Cette Année"],
  ["custom", "Personnalisé"],
];

export function PeriodSelector({
  period,
  onPeriodChange,
  customFrom,
  customTo,
  onCustomFromChange,
  onCustomToChange,
  variant = "light",
  className,
}: PeriodSelectorProps) {
  const ctrl =
    variant === "dark"
      ? "bg-white/10 border-white/20 text-white focus:ring-white"
      : "bg-white border-bc-border text-bc-text focus:ring-bc-green";
  const scheme = variant === "dark" ? "[color-scheme:dark]" : "";
  const arrow = variant === "dark" ? "text-white/60" : "text-bc-text-secondary";

  return (
    <div className={`flex flex-col md:flex-row md:items-center gap-2 ${className ?? ""}`}>
      <select
        value={period}
        onChange={(e) => onPeriodChange(e.target.value as Period)}
        className={`border rounded-full px-4 py-2 text-xs font-bold focus:outline-none focus:ring-1 cursor-pointer w-full md:w-auto ${ctrl}`}
      >
        {OPTIONS.map(([v, label]) => (
          <option key={v} value={v}>
            {label}
          </option>
        ))}
      </select>
      {period === "custom" && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={customFrom}
            onChange={(e) => onCustomFromChange(e.target.value)}
            className={`border rounded-full px-3 py-1.5 text-xs font-bold focus:outline-none focus:ring-1 cursor-pointer ${ctrl} ${scheme}`}
          />
          <span className={`text-xs ${arrow}`}>→</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => onCustomToChange(e.target.value)}
            className={`border rounded-full px-3 py-1.5 text-xs font-bold focus:outline-none focus:ring-1 cursor-pointer ${ctrl} ${scheme}`}
          />
        </div>
      )}
    </div>
  );
}
