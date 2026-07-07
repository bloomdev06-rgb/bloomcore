// Variants d'entrée partagés (motion/react) — même cadence que le stagger du Dashboard,
// réutilisés sur les grilles/listes de toutes les vues pour une animation cohérente.
export const staggerParent = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.03 } },
};

export const staggerItem = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 350, damping: 30 } },
};
