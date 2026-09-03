import js from '@eslint/js'
import react from 'eslint-plugin-react'
import hooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import ts from 'typescript-eslint'

export default ts.config(
  { ignores: ['dist', 'coverage'] },
  js.configs.recommended,
  ...ts.configs.strictTypeChecked,
  {
    files: ['**/*.{ts,tsx}'],
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
  { files: ['**/*.test.{ts,tsx}'], rules: { '@typescript-eslint/no-non-null-assertion': 'off' } },
)
