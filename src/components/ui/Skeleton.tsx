// Skeleton loaders (charte §5.5/§7) — formes gris neutre pulsantes, câble le
// .animate-skeleton d'index.css (jusqu'ici défini mais inutilisé). PageSkeleton sert
// de fallback générique aux vues chargées en lazy (Suspense, App.tsx).
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-skeleton rounded-xl bg-bc-warmgrey/70 ${className}`} />;
}

// ponytail: divs natives dans la boucle (pas <Skeleton key=…>) — sans @types/react,
// key sur un composant custom ne typecheck pas (cf. quirk connu du repo).
export function PageSkeleton() {
  return (
    <div className="flex-1 p-4 sm:p-6 space-y-6" aria-busy="true" aria-label="Chargement">
      <div className="animate-skeleton h-8 w-1/3 rounded-xl bg-bc-warmgrey/70" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="animate-skeleton h-32 rounded-2xl bg-bc-warmgrey/70" />
        ))}
      </div>
    </div>
  );
}
