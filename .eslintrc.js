module.exports = {
  env: {
    node: true,
    es6: true,
  },
  parser: 'babel-eslint',
  plugins: ['prettier', 'babel'],
  extends: ['eslint:recommended', 'plugin:prettier/recommended'],
  parserOptions: {
    ecmaVersion: 9,
    sourceType: 'module',
  },
  rules: {
    'prettier/prettier': 'error',
    'no-console': 'off',
    'require-await': 'error',
  },
}
