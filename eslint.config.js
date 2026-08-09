const globals = require('globals');

module.exports = [
  {
    ignores: [
      'red-devil-manager.html',
      'vendor/**',
      'node_modules/**',
      'assets/**',
    ],
  },
  {
    files: ['src/**/*.js', 'service-worker.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: Object.assign({}, globals.browser, globals.serviceworker, { module: 'readonly' }),
    },
    rules: {
      'no-undef': 'error',
      'no-unreachable': 'error',
      'no-constant-condition': 'error',
      'no-dupe-keys': 'error',
      'no-redeclare': 'error',
    },
  },
  {
    files: ['tests/**/*.cjs', 'scripts/**/*.cjs', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: globals.node,
    },
    rules: {
      'no-undef': 'error',
      'no-unreachable': 'error',
      'no-dupe-keys': 'error',
    },
  },
];
