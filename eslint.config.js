import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

// Config volontairement ciblée (#8) : on n'active QUE les règles react-hooks — celles qui
// attrapent de vrais bugs (le bug Rétention était une dépendance de hook instable). On évite
// le preset recommended complet, qui noierait le signal sous des centaines de warnings de
// style sur un code MVP assumé (135 `any` documentés). exhaustive-deps en warn (bruyant mais
// utile), rules-of-hooks en error (jamais un faux positif légitime).
export default [
  { ignores: ['dist', 'node_modules'] },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  // Phase 1 (T1.5) — frontière serveur/frontend verrouillée par le lint : le serveur ne
  // doit plus jamais importer le code du front (packages/domain est le seul domaine
  // partagé légitime). Seule exception documentée : server/seedData.ts (ponytail),
  // désactivée localement par une directive eslint-disable-next-line ciblée.
  {
    files: ['server/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
    },
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['*/src/*', '../src/*', '../../src/*'],
          message: 'Le serveur ne doit pas importer le frontend (src/). Utiliser packages/domain — exception documentée uniquement dans server/seedData.ts.',
        }],
      }],
    },
  },
];
