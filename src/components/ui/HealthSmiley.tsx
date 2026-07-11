// Santé spirituelle → smiley emoji natif type iPhone (échelle 1-5 des critères du rapport Bloom Bus).
// 1 Très mal · 2 Mal · 3 Moyen · 4 Bien · 5 Très bien. Représentation unique dans toute l'app.
export const HEALTH_EMOJI: Record<number, string> = {
  0: '😶',
  1: '😡',
  2: '😕',
  3: '😐',
  4: '🙂',
  5: '😄',
};

export function HealthSmiley({ value, size = 24 }: { value: number; size?: number }) {
  const level = Math.max(0, Math.min(5, Math.round(value)));
  return (
    <span
      role="img"
      aria-label={`Niveau ${level || 'inconnu'} sur 5`}
      style={{ fontSize: size * 0.85, lineHeight: 1 }}
      className={`inline-block select-none ${level === 0 ? 'grayscale opacity-50' : ''}`}
    >
      {HEALTH_EMOJI[level]}
    </span>
  );
}
