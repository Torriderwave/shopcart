import js from '@eslint/js';
import boundaries from 'eslint-plugin-boundaries';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['**/*.mjs'],
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly', setTimeout: 'readonly' },
    },
  },

  // ── Reglas de dependencias (ARQUITECTURA §4) ────────────────────────────────
  {
    files: ['api/src/**/*.ts', 'contracts/src/**/*.ts'],
    plugins: { boundaries },
    settings: {
      'import/resolver': {
        typescript: {
          project: ['api/tsconfig.json', 'contracts/tsconfig.json'],
          noWarnOnMultipleProjects: true,
        },
      },
      'boundaries/elements': [
        { type: 'contracts', pattern: 'contracts/src' },
        { type: 'shared', pattern: 'api/src/shared' },
        { type: 'module', pattern: 'api/src/modules/*', capture: ['moduleName'] },
        { type: 'job', pattern: 'api/src/jobs' },
      ],
    },
    rules: {
      'boundaries/dependencies': [
        2,
        {
          default: 'allow',
          policies: [
            // 3. contracts no depende de la API.
            {
              from: { element: { type: 'contracts' } },
              disallow: {
                to: { element: { types: { anyOf: ['shared', 'module', 'job'] } } },
              },
            },
            // 4. api/shared no importa módulos.
            {
              from: { element: { type: 'shared' } },
              disallow: { to: { element: { type: 'module' } } },
            },
            // 4. Un módulo no importa otro módulo.
            {
              from: { element: { type: 'module' } },
              disallow: {
                to: {
                  element: {
                    type: 'module',
                    captured: { moduleName: '!{{ from.captured.moduleName }}' },
                  },
                },
              },
            },
          ],
        },
      ],
    },
  },
);
