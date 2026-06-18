import js from '@eslint/js';
import globals from 'globals';
import prettierConfig from 'eslint-config-prettier';

/** @type {import('eslint').Linter.Config[]} */
export default [
  // Global ignores
  {
    ignores: ['node_modules/**', 'coverage/**', 'types/**']
  },

  // Base recommended rules
  {
    ...js.configs.recommended,
    files: ['**/*.js']
  },

  // Project-wide: all JS files
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.nodeBuiltin,
        ...globals.browser,
        performance: 'readonly'
      }
    },
    rules: {
      'no-use-before-define': ['error', {functions: false}],
      'no-param-reassign': ['error', {props: false}],
      'no-console': 'warn',
      'new-cap': 'off',
      'no-plusplus': 'off'
    }
  },

  // Prettier must be last -- disables all formatting rules
  prettierConfig
];
