const fs = require('fs');

const Terser = require('terser');

const path = require('path');

const crypto = require('crypto');

const minimatch = require('minimatch');

const stringify = require('json-stringify-safe'); // eslint-disable-line


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

function _ref4(pattern) {
  return typeof pattern === 'string' ? minimatch.makeRe(pattern) : pattern instanceof RegExp ? pattern : new Error(`[caddy-csp-plugin] Ignored patterns must be glob strings or regular expressions`);
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
    this.strictDynamic = this.scriptSrcHashes.includes('strict-dynamic');
    this.externalFiles = include_paths.map(filePath => {
      const content = minify_include_paths ? loadMinified(filePath) : fs.readFileSync(filePath, 'utf-8'); // eslint-disable-line

      if (!content) return;
      return Promise.resolve(crypto.createHash(this.hashFun).update(content).digest(`base64`)).then(hash => this.scriptSrcHashes += ` '${this.hashFun}-${hash}'`);
    }).filter(Boolean);
    this.ignore = ignore.map(_ref4);

    for (let p of this.ignore) {
      if (p instanceof Error) throw new Error(p);
    }

    this.base = ``;
  }

  createHeaders() {
    if (this.scriptSrcHashes.includes(`'strict-dynamic'`)) {
      this.scriptSrcHashes = this.scriptSrcHashes.replace(/(.*)('strict-dynamic')(.*)/, '$1 $3 __CSP_PLACEHOLDER__ $2');
    }

    this.policies.push(`${this.scriptSrcHashes} `);
    const headerContent = this.policies.join(`; `).replace(/\s\s/g, ' ');
    return [`Content-Security-Policy "${headerContent};"`, !this.ie ? void 0 : `X-Content-Security-Policy "${headerContent};"`].filter(Boolean);
  }

  createDirectives() {
    const csp = [// eslint-disable-line
    `header ${this.headerPath} {`, `  ${this.createHeaders().join('\n' + `  `)}`, `}`].join('\n');
    const notFound = [// eslint-disable-line
    `status 404 {`, `  ${path.normalize(`/` + this.filename)}`, `}`].join('\n');
    return [csp, notFound].filter(Boolean).join('\n\n');
  }

  async addHash(filename) {
    let p = path.normalize(`${this.base}/${filename}`);
    const input = fs.readFileSync(p);
    let hash = await crypto.createHash(this.hashFun).update(input.toString()).digest('base64');
    return this.scriptSrcHashes += ` '${this.hashFun}-${hash}'`;
  }

  filterFile(filename) {
    if (!/\.m?js$/.test(filename)) return false;
    if (!this.ignore.length) return true;
    return this.ignore.every(regex => !regex.test(filename));
  }

  apply(compiler) {
    this.base = compiler.options.output.path; // if ('SriPlugin' in stringify(compiler.options.plugins, null, 2)) {
    //   throw new Error('Detected!')
    // }

    compiler.hooks.afterEmit.tapAsync(`CaddyCSPPlugin`, async compilation => {
      let filenames = [];

      function _ref5(file) {
        return filenames.push(file);
      }

      const _defined = chunk => {
        const _defined4 = _ref5;
        const _defined5 = chunk.files;

        for (let _i3 = 0; _i3 <= _defined5.length - 1; _i3++) {
          _defined4(_defined5[_i3], _i3, _defined5);
        }
      };

      const _defined2 = compilation.chunks;

      for (let _i = 0; _i <= _defined2.length - 1; _i++) {
        _defined(_defined2[_i], _i, _defined2);
      }

      const _arr = filenames;
      filenames = [];

      const _defined3 = f => this.filterFile.call(this, f);

      for (let _i2 = 0; _i2 <= _arr.length - 1; _i2++) {
        if (_defined3(_arr[_i2], _i2, _arr)) filenames.push(_arr[_i2]);
      }

      for (let filename of filenames) {
        await this.addHash(filename);
      } // for (let filename of [
      //   ...Object.values(compilation.chunks).map(c => c.files),
      // ]) {
      //   if (this.filterFile(filename)) this.addHash(filename)
      // }


      fs.writeFileSync(`${compiler.options.output.path}/${this.filename}`, this.createDirectives());
    });
  }

}

module.exports = CaddyCSPPlugin;