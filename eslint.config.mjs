const rules = {
  'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  'no-undef': 'error',
  'no-unreachable': 'error',
  'no-constant-condition': 'error',
  'no-duplicate-case': 'error',
  'no-fallthrough': 'error',
  'no-self-assign': 'error',
  'use-isnan': 'error',
  'valid-typeof': 'error',
  'eqeqeq': ['error', 'always'],
  'no-var': 'error',
  'prefer-const': 'error',
  'no-shadow': 'error',
  'no-eval': 'error',
  'no-implied-eval': 'error',
  'no-new-func': 'error',
  'no-script-url': 'error',
};

export default [
  { ignores: ['node_modules/'] },
  {
    files: ['js/**/*.js', 'hindustani/js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        window: 'readonly',
        document: 'readonly',
        AudioContext: 'readonly',
        ResizeObserver: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        location: 'readonly',
        console: 'readonly',
        performance: 'readonly',
        requestAnimationFrame: 'readonly',
      },
    },
    rules,
  },
  {
    files: ['scripts/**/*.mjs', 'eslint.config.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      // The smoke test also defines functions that run inside the page.
      globals: {
        console: 'readonly', process: 'readonly', window: 'readonly', document: 'readonly',
        performance: 'readonly', setTimeout: 'readonly', Image: 'readonly',
        AudioNode: 'readonly', AudioDestinationNode: 'readonly',
      },
    },
    rules,
  },
];
