module.exports = {
  presets: [
    [
      '@babel/preset-env',
      {
        useBuiltIns: 'usage',
        modules: false,
        corejs: 2,
        targets: {
          node: '8',
        },
        debug: !!process.env.DEBUG,
      },
    ],
  ],
  plugins: [
    'module:faster.js',
    '@babel/plugin-proposal-throw-expressions',
    'closure-elimination',
  ],
}
