import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

// Config volontairement ciblée (#8) : on n'active QUE les règles react-hooks — celles qui
// attrapent de vrais bugs (le bug Rétention était une dépendance de hook instable). On évite
// le preset recommended complet, qui noierait le signal sous des centaines de warnings de
// style sur un code MVP assumé (135 `any` documentés). exhaustive-deps en warn (bruyant mais
// utile), rules-of-hooks en error (jamais un faux positif légitime).
export default [
  { ignores: ['dist', 'node_modules', 'server'] },
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
];
