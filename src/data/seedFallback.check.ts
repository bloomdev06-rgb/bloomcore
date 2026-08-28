// Régression : des entités de DÉMONSTRATION réapparues en production.
//
// Le repli sur le jeu de démo (`load('bc_bus_lines', INITIAL_BUS_LINES)`) se déclenche dès que
// le cache local est vide. Or c'est exactement l'état d'un navigateur dont on vient d'effacer
// les données de site — étape recommandée après une remise à zéro de production. La vue
// démarrait alors son état avec les 6 bus de démonstration, et la première vraie modification
// (un import CSV) poussait l'ensemble au serveur : 5 lignes fantômes en base.
//
// Deux correctifs antérieurs visaient la POUSSÉE (ne pas pousser au montage, pousser la
// suppression sans attendre le debounce) et n'ont donc rien changé : la donnée fautive entrait
// en amont, par le repli. Ce test verrouille la règle côté ENTRÉE.
import assert from 'node:assert';
import { seedOrEmpty } from './index.ts';

const DEMO = [{ id: 'bus_yop_maroc' }, { id: 'bus_coc_angre' }];

// Session serveur : le serveur est la source de vérité. Un cache vide veut dire
// « pas encore chargé », jamais « voici les données de démonstration ».
assert.deepEqual(
  seedOrEmpty(DEMO, true),
  [],
  'sous session serveur, le repli de démonstration doit être neutralisé',
);

// Démo pure (aucun backend) : le jeu de démonstration reste le comportement attendu,
// sinon la première ouverture de l'application afficherait des écrans vides.
assert.deepEqual(
  seedOrEmpty(DEMO, false),
  DEMO,
  'hors session, le jeu de démonstration doit rester le repli',
);

// Un tableau vide légitimement chargé depuis le serveur ne doit pas être « comblé » :
// zéro bus est une réponse valide, pas une absence de données.
assert.deepEqual(seedOrEmpty([], true), [], 'aucune donnée + session = vide, pas de démo');

console.log('seedFallback.check OK');
