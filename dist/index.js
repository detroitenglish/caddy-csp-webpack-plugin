function asyncGeneratorStep(gen, resolve, reject, _next, _throw, key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { Promise.resolve(value).then(_next, _throw); } }

function _asyncToGenerator(fn) { return function () { var self = this, args = arguments; return new Promise(function (resolve, reject) { var gen = fn.apply(self, args); function _next(value) { asyncGeneratorStep(gen, resolve, reject, _next, _throw, "next", value); } function _throw(err) { asyncGeneratorStep(gen, resolve, reject, _next, _throw, "throw", err); } _next(undefined); }); }; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; var ownKeys = Object.keys(source); if (typeof Object.getOwnPropertySymbols === 'function') { ownKeys = ownKeys.concat(Object.getOwnPropertySymbols(source).filter(function (sym) { return Object.getOwnPropertyDescriptor(source, sym).enumerable; })); } const _defined = function _defined(key) { _defineProperty(target, key, source[key]); }; for (let _i = 0; _i <= ownKeys.length - 1; _i++) { _defined(ownKeys[_i], _i, ownKeys); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

const fs = require('fs');

const UglifyJS = require('uglify-es');

const path = require('path');

const crypto = require('crypto');

function _ref2(p) {
  return /^script/.test(p);
}

function _ref3(p) {
  return !/^script/.test(p);
}

function _ref4(p) {
  return p.replace(/;/g, ``);
}

class CaddyCSPPlugin {
  constructor({
    filename = `csp-headers.caddy`,
    headerPath = `/`,
    policies = [],
    include_paths = [],
    minify_include_paths = true,
    ie_header = false,
    hashFunction = `sha256`,
    sourcemap_credentials = {
      user: void 0,
      pw: void 0
    }
  }) {
    this.filename = filename;
    this.headerPath = path.normalize(`/` + headerPath);
    this.ie = ie_header;
    this.hashFun = hashFunction;
    this.scriptSrcHashes = policies.find(_ref2).replace(/;/g, ``) || `script-src`;
    this.policies = policies.filter(_ref3).map(_ref4);
    this.externalFiles = include_paths.map(filePath => {
      const code = fs.readFileSync(filePath, 'utf-8'); // eslint-disable-line

      const result = minify_include_paths ? UglifyJS.minify(code) : {
        code
      };
      if (result.error) return '';
      return Promise.resolve(crypto.createHash(this.hashFun).update(result.code).digest(`base64`)).then(hash => this.scriptSrcHashes += ` '${this.hashFun}-${hash}'`);
    });
    this.mapFiles = [];
    this.maps = !!Object.keys(sourcemap_credentials).length;
    this.creds = _objectSpread({}, sourcemap_credentials);
  }

  apply(compiler) {
    var _this = this;

    function _ref5() {
      _this.policies.push(_this.scriptSrcHashes);

      const headerContent = _this.policies.join(`; `);

      return [`Content-Security-Policy "${headerContent};"`, !_this.ie ? void 0 : `X-Content-Security-Policy "${headerContent};"`].filter(Boolean);
    }

    function _ref6() {
      let safeMaps;
      const createHeaders = _ref5;

      if (_this.maps) {
        const _this$creds = _this.creds,
              user = _this$creds.user,
              pw = _this$creds.pw;
        safeMaps = [// eslint-disable-line
        `basicauth ${user} ${pw} {`, _this.mapFiles.join('\n'), `}`].join('\n');
      }

      const csp = [// eslint-disable-line
      `header ${_this.headerPath} {`, `  ${createHeaders().join('\n' + `  `)}`, `}`].join('\n');
      const notFound = [// eslint-disable-line
      `status 404 {`, `  ${path.normalize(`/` + _this.filename)}`, `}`].join('\n');
      return [csp, notFound, safeMaps].filter(Boolean).join('\n\n');
    }

    function* _ref7(compilation) {
      const createDirectives = _ref6;

      for (let asset in compilation.assets) {
        if (/\.js$/.test(asset)) {
          let content = compilation.assets[asset].source();
          _this.scriptSrcHashes += ` '${_this.hashFun}-${yield crypto.createHash(_this.hashFun).update(content).digest('base64')}'`;
          continue;
        }

        if (_this.maps && /\.map$/.test(asset)) {
          _this.mapFiles.push(`  /${asset}`);

          continue;
        }
      }

      const directives = createDirectives();
      compilation.assets[_this.filename] = {
        source: function source() {
          return directives;
        },
        size: function size() {
          return directives.length;
        }
      };
      return true;
    }

    return compiler.hooks.emit.tapPromise(`CaddyCSPPlugin`,
    /*#__PURE__*/
    function () {
      var _ref = _asyncToGenerator(_ref7);

      return function (_x) {
        return _ref.apply(this, arguments);
      };
    }());
  }

}

module.exports = CaddyCSPPlugin;