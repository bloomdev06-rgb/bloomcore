// ponytail: seeds encore définis côté front (src/mockData.ts) — les mêmes données
// alimentent l'app en localStorage-first ET le premier boot serveur (server/seed.ts),
// donc un seul point de vérité pour l'instant. À migrer vers server/seedData réel
// (déplacement, pas ré-export) le jour où les seeds front et serveur divergent, ou à
// la refonte du seed (ARCHITECTURE_TECHNIQUE.md §8). C'est la seule exception tolérée
// à la règle "server n'importe jamais src/" (voir eslint.config.js, no-restricted-imports).
// eslint-disable-next-line no-restricted-imports
export {
  INITIAL_MEMBERS,
  INITIAL_EVENTS,
  INITIAL_REPORTS,
  INITIAL_AUDITS,
  INITIAL_NOTIFICATIONS,
  DEFAULT_PERMISSION_MATRIX,
  INITIAL_SETTINGS,
  INITIAL_FORMS,
  INITIAL_MINISTRIES,
  INITIAL_DEPARTMENTS,
  INITIAL_ACTIVITIES,
  INITIAL_ADMINS,
  INITIAL_PROJECTS,
  INITIAL_BUS_LINES,
} from '../src/mockData.ts';
