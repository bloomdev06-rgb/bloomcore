import { useEffect, useRef } from 'react';
import { save } from './index';

// Enregistre `value` sous `key` à chaque changement RÉEL, jamais au premier rendu.
//
// Pourquoi ce garde-fou est nécessaire — et pourquoi il l'est devenu davantage.
// Les écrans éditeurs persistent leur état via un effet `useEffect(() => save(k, v), [v])`,
// qui se déclenche AUSSI au montage. Il repousse donc au serveur l'état INITIAL du composant,
// c'est-à-dire le cache local — qui peut être périmé (suppression faite sur un autre appareil)
// ou vide (données de site effacées, bootstrap pas encore résolu).
//
// Tant que le repli était le jeu de démonstration, ce défaut réintroduisait des entités de démo
// — c'est ce qui a ramené 5 lignes Bloom Bus en production. Depuis que le repli est un tableau
// VIDE sous session serveur (seedOrEmpty, le correctif de ce défaut), la même poussée au
// montage n'écrit plus de la démo mais du VIDE : elle EFFACERAIT la collection côté serveur.
// Le risque a donc changé de nature, pas disparu.
//
// BloomBusView portait déjà ce garde-fou à la main ; il est ici factorisé pour les autres
// collections exposées (départements, ministères, projets, comptes admin).
export function useSyncedSave<T>(key: string, value: T, enabled = true): void {
  const previousValue = useRef(value);
  const wasEnabled = useRef(enabled);
  useEffect(() => {
    // StrictMode rejoue les effets de montage : un simple booléen "skipFirst" persistait
    // alors les seeds au deuxième passage. Sans session validée, aucune écriture locale.
    if (!enabled) {
      wasEnabled.current = false;
      previousValue.current = value;
      return;
    }
    // Le passage « bootstrap terminé » active la persistance dans le même rendu qui pose
    // les données serveur. Celles-ci deviennent la nouvelle base ; ce n'est pas une édition.
    if (!wasEnabled.current) {
      wasEnabled.current = true;
      previousValue.current = value;
      return;
    }
    if (Object.is(value, previousValue.current)) return;
    previousValue.current = value;
    save(key, value);
  }, [enabled, key, value]);
}
