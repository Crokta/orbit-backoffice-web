import js from '@eslint/js'
import react from 'eslint-plugin-react'
import hooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import ts from 'typescript-eslint'

export default ts.config(
  { ignores: ['dist', 'coverage'] },
  js.configs.recommended,

  {
    // Type-aware rules apply to source only. Spreading them at the top level makes
    // ESLint try to type-check its own config file, which is not in the tsconfig and
    // never will be.
    files: ['**/*.{ts,tsx}'],
    extends: [...ts.configs.strictTypeChecked],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { react, 'react-hooks': hooks },
    settings: { react: { version: 'detect' } },
    rules: {
      ...hooks.configs.recommended.rules,

      // The rule that matters most in this codebase. A floating promise in a mutation
      // handler is a request that silently never completed, and the user is left
      // looking at a spinner.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',

      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      'react/jsx-no-target-blank': 'error',
    },
  },

  {
    // The config files themselves: plain ESM, linted without type information.
    files: ['*.config.js', '*.config.ts'],
    languageOptions: { globals: globals.node },
    extends: [ts.configs.disableTypeChecked],
  },

  { files: ['**/*.test.{ts,tsx}'], rules: { '@typescript-eslint/no-non-null-assertion': 'off' } },
)
