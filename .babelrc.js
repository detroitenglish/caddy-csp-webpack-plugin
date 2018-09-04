module.exports = {
  presets: [
    [
      '@babel/preset-env',
      {
        useBuiltIns: 'usage',
        modules: false,
        targets: {
          node: '6',
        },
        exclude: ['es6.promise'],
        debug: !!process.env.DEBUG,
      },
    ],
  ],
  plugins: ['module:faster.js', 'closure-elimination'],
}
