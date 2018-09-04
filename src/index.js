const fs = require('fs')
const UglifyJS = require('uglify-es')
const path = require('path')
const crypto = require('crypto')

class CaddyCSPPlugin {
  constructor({
    filename = `csp-headers.caddy`,
    headerPath = `/`,
    policies = [],
    include_paths = [],
    minify_include_paths = true,
    ie_header = false,
    hashFunction = `sha256`,
    sourcemap_credentials = { user: void 0, pw: void 0 },
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

    this.externalFiles = include_paths.map(filePath => {
      const code = fs.readFileSync(filePath, 'utf-8') // eslint-disable-line
      const result = minify_include_paths ? UglifyJS.minify(code) : { code }
      if (result.error) return ''
      return Promise.resolve(
        crypto
          .createHash(this.hashFun)
          .update(result.code)
          .digest(`base64`)
      ).then(hash => (this.scriptSrcHashes += ` '${this.hashFun}-${hash}'`))
    })

    this.mapFiles = []

    this.maps = !!Object.keys(sourcemap_credentials).length
    this.creds = { ...sourcemap_credentials }
  }

  apply(compiler) {
    return compiler.hooks.emit.tapPromise(
      `CaddyCSPPlugin`,
      async compilation => {
        const createDirectives = () => {
          let safeMaps

          const createHeaders = () => {
            this.policies.push(this.scriptSrcHashes)
            const headerContent = this.policies.join(`; `)

            return [
              `Content-Security-Policy "${headerContent};"`,
              !this.ie
                ? void 0
                : `X-Content-Security-Policy "${headerContent};"`,
            ].filter(Boolean)
          }

          if (this.maps) {
            const { user, pw } = this.creds
            safeMaps = [ // eslint-disable-line
              `basicauth ${user} ${pw} {`,
              this.mapFiles.join('\n'),
              `}`,
            ].join('\n')
          }

          const csp = [ // eslint-disable-line
            `header ${this.headerPath} {`,
            `  ${createHeaders().join('\n' + `  `)}`,
            `}`,
          ].join('\n')

          const notFound = [ // eslint-disable-line
            `status 404 {`,
            `  ${path.normalize(`/` + this.filename)}`,
            `}`,
          ].join('\n')

          return [csp, notFound, safeMaps].filter(Boolean).join('\n\n')
        }

        for (let asset in compilation.assets) {
          if (/\.js$/.test(asset)) {
            let content = compilation.assets[asset].source()
            this.scriptSrcHashes += ` '${this.hashFun}-${await crypto
              .createHash(this.hashFun)
              .update(content)
              .digest('base64')}'`
            continue
          }
          if (this.maps && /\.map$/.test(asset)) {
            this.mapFiles.push(`  /${asset}`)
            continue
          }
        }

        const directives = createDirectives()

        compilation.assets[this.filename] = {
          source: function() {
            return directives
          },
          size: function() {
            return directives.length
          },
        }

        return true
      }
    )
  }
}

module.exports = CaddyCSPPlugin
