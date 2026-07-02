import { Angry, Frown, Meh, Smile, Laugh } from 'lucide-react';

// Santé spirituelle → smiley (échelle 1-5 des critères du rapport Bloom Bus).
// 1 Très mal · 2 Mal · 3 Moyen · 4 Bien · 5 Très bien. Représentation unique dans toute l'app.
export function HealthSmiley({ value, size = 24 }: { value: number; size?: number }) {
  switch (Math.round(value)) {
    case 1: return <Angry size={size} className="text-red-500" />;
    case 2: return <Frown size={size} className="text-orange-400" />;
    case 3: return <Meh size={size} className="text-yellow-500" />;
    case 4: return <Smile size={size} className="text-emerald-400" />;
    case 5: return <Laugh size={size} className="text-purple-500" />;
    default: return <Meh size={size} className="text-slate-400" />;
  }
}
