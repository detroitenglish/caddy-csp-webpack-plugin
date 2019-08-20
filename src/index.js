const fs = require('fs')
const Terser = require('terser')
const path = require('path')
const crypto = require('crypto')
const minimatch = require('minimatch')
const stringify = require('json-stringify-safe') // eslint-disable-line
function loadMinified(filePath) {
  let code = fs.readFileSync(filePath, 'utf-8')
  let result = Terser.minify(code)
  if (result.error) {
    console.error(result.error)
    return false
  }
  return result.code
}

class CaddyCSPPlugin {
  constructor({
    filename = `csp-headers.caddy`,
    headerPath = `/`,
    policies = [],
    include_paths = [],
    ignore = [],
    minify_include_paths = false,
    ie_header = false,
    hashFunction = `sha256`,
  }) {
    this.filename = filename
    this.headerPath = path.normalize(`/` + headerPath)
    this.ie = ie_header
    this.hashFun = hashFunction
    this.scriptSrcHashes =
      policies.find(p => /^script/.test(p)).replace(/;/g, ``) || `script-src`
    this.policies = policies
      .filter(p => !/^script/.test(p))
      .map(p => p.replace(/;/g, ``))
    this.strictDynamic = this.scriptSrcHashes.includes('strict-dynamic')
    this.externalFiles = include_paths
      .map(filePath => {
      const content = minify_include_paths ? loadMinified(filePath) : fs.readFileSync(filePath, 'utf-8') // eslint-disable-line

        if (!content) return
        return Promise.resolve(
          crypto
            .createHash(this.hashFun)
            .update(content)
            .digest(`base64`)
        ).then(hash => (this.scriptSrcHashes += ` '${this.hashFun}-${hash}'`))
      })
      .filter(Boolean)

    this.ignore = ignore.map(pattern => {
      return typeof pattern === 'string'
        ? minimatch.makeRe(pattern)
        : pattern instanceof RegExp
        ? pattern
        : new Error(
            `[caddy-csp-plugin] Ignored patterns must be glob strings or regular expressions`
          )
    })
    for (let p of this.ignore) {
      if (p instanceof Error) throw new Error(p)
    }
    this.base = ``
  }
  createHeaders() {
    if (this.scriptSrcHashes.includes(`'strict-dynamic'`)) {
      this.scriptSrcHashes = this.scriptSrcHashes.replace(
        /(.*)('strict-dynamic')(.*)/,
        '$1 $3 __CSP_PLACEHOLDER__ $2'
      )
    }
    this.policies.push(`${this.scriptSrcHashes} `)
    const headerContent = this.policies.join(`; `).replace(/\s\s/g, ' ')

    return [
      `Content-Security-Policy "${headerContent};"`,
      !this.ie ? void 0 : `X-Content-Security-Policy "${headerContent};"`,
    ].filter(Boolean)
  }
  createDirectives() {
    const csp = [ // eslint-disable-line
      `header ${this.headerPath} {`,
      `  ${this.createHeaders().join('\n' + `  `)}`,
      `}`,
    ].join('\n')

        const notFound = [ // eslint-disable-line
      `status 404 {`,
      `  ${path.normalize(`/` + this.filename)}`,
      `}`,
    ].join('\n')

    return [csp, notFound].filter(Boolean).join('\n\n')
  }
  async addHash(filename) {
    let p = path.normalize(`${this.base}/${filename}`)
    const input = fs.readFileSync(p)
    let hash = await crypto
      .createHash(this.hashFun)
      .update(input.toString())
      .digest('base64')
    return (this.scriptSrcHashes += ` '${this.hashFun}-${hash}'`)
  }
  filterFile(filename) {
    if (!/\.m?js$/.test(filename)) return false
    if (!this.ignore.length) return true
    return this.ignore.every(regex => !regex.test(filename))
  }
  apply(compiler) {
    this.base = compiler.options.output.path
    // if ('SriPlugin' in stringify(compiler.options.plugins, null, 2)) {
    //   throw new Error('Detected!')
    // }
    compiler.hooks.afterEmit.tapAsync(`CaddyCSPPlugin`, async compilation => {
      let filenames = []
      compilation.chunks.forEach(chunk => {
        chunk.files.forEach(file => filenames.push(file))
      })
      filenames = filenames.filter(f => this.filterFile.call(this, f))

      for (let filename of filenames) {
        await this.addHash(filename)
      }

      // for (let filename of [
      //   ...Object.values(compilation.chunks).map(c => c.files),
      // ]) {
      //   if (this.filterFile(filename)) this.addHash(filename)
      // }

      fs.writeFileSync(
        `${compiler.options.output.path}/${this.filename}`,
        this.createDirectives()
      )
    })
  }
}

module.exports = CaddyCSPPlugin
