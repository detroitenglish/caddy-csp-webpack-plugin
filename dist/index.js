const fs = require('fs');

const Terser = require('terser');

const path = require('path');

const crypto = require('crypto');

const minimatch = require('minimatch');

function loadMinified(filePath) {
  let code = fs.readFileSync(filePath, 'utf-8');
  let result = Terser.minify(code);

  if (result.error) {
    console.error(result.error);
    return false;
  }

  return result.code;
}

function _ref(p) {
  return /^script/.test(p);
}

function _ref2(p) {
  return !/^script/.test(p);
}

function _ref3(p) {
  return p.replace(/;/g, ``);
}

function _ref4(e) {
  throw e;
}

function _ref5(pattern) {
  return typeof pattern === 'string' ? minimatch.makeRe(pattern) : pattern instanceof RegExp ? pattern : _ref4(new Error(`[caddy-csp-plugin] Ignored patterns must be glob strings or regular expressions`));
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
    hashFunction = `sha256`
  }) {
    this.filename = filename;
    this.headerPath = path.normalize(`/` + headerPath);
    this.ie = ie_header;
    this.hashFun = hashFunction;
    this.scriptSrcHashes = policies.find(_ref).replace(/;/g, ``) || `script-src`;
    this.policies = policies.filter(_ref2).map(_ref3);
    this.externalFiles = include_paths.map(filePath => {
      const content = minify_include_paths ? loadMinified(filePath) : fs.readFileSync(filePath, 'utf-8'); // eslint-disable-line

      if (!content) return;
      return Promise.resolve(crypto.createHash(this.hashFun).update(content).digest(`base64`)).then(hash => this.scriptSrcHashes += ` '${this.hashFun}-${hash}'`);
    }).filter(Boolean);
    this.ignore = ignore.map(_ref5);
  }

  apply(compiler) {
    return compiler.hooks.emit.tapPromise(`CaddyCSPPlugin`, async compilation => {
      const createDirectives = () => {
        const createHeaders = () => {
          this.policies.push(this.scriptSrcHashes);
          const headerContent = this.policies.join(`; `);
          return [`Content-Security-Policy "${headerContent};"`, !this.ie ? void 0 : `X-Content-Security-Policy "${headerContent};"`].filter(Boolean);
        };

        const csp = [// eslint-disable-line
        `header ${this.headerPath} {`, `  ${createHeaders().join('\n' + `  `)}`, `}`].join('\n');
        const notFound = [// eslint-disable-line
        `status 404 {`, `  ${path.normalize(`/` + this.filename)}`, `}`].join('\n');
        return [csp, notFound].filter(Boolean).join('\n\n');
      };

      for (let asset in compilation.assets) {
        if (/\.m?js$/.test(asset) && this.ignore.length && this.ignore.every(regex => !regex.test(asset))) {
          let content = compilation.assets[asset].source();
          this.scriptSrcHashes += ` '${this.hashFun}-${await crypto.createHash(this.hashFun).update(content).digest('base64')}'`;
        }
      }

      const directives = createDirectives();
      compilation.assets[this.filename] = {
        source: function () {
          return directives;
        },
        size: function () {
          return directives.length;
        }
      };
      return true;
    });
  }

}

module.exports = CaddyCSPPlugin;