/* ============================================================
   ForgeCAD — polyfills.js
   Targeting Safari 7 (2013) and other ancient browsers.
   Must load BEFORE any other script.
   Provides:
     - console stub (ancient IE)
     - Date.now fallback
     - Object.keys / Object.create
     - Array.prototype.forEach / indexOf / map / filter / reduce
     - Function.prototype.bind
     - String.prototype.trim
     - JSON (very old)
     - requestAnimationFrame
     - Promise (minimal, no full spec — just enough for our usage)
   ============================================================ */
(function () {
  var global = this;

  // ---- console ----
  if (!global.console) {
    global.console = {};
  }
  var noop = function () {};
  ['log', 'info', 'warn', 'error', 'debug'].forEach(function (m) {
    if (typeof global.console[m] !== 'function') global.console[m] = noop;
  });

  // ---- Date.now ----
  if (!Date.now) {
    Date.now = function () { return new Date().getTime(); };
  }

  // ---- Object.keys ----
  if (!Object.keys) {
    Object.keys = function (obj) {
      var keys = [], k;
      for (k in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, k)) keys.push(k);
      }
      return keys;
    };
  }

  // ---- Object.create (minimal) ----
  if (!Object.create) {
    Object.create = function (proto) {
      if (proto === null) { return {}; }
      function F() {}
      F.prototype = proto;
      return new F();
    };
  }

  // ---- Array.isArray ----
  if (!Array.isArray) {
    Array.isArray = function (a) {
      return Object.prototype.toString.call(a) === '[object Array]';
    };
  }

  // ---- Array.prototype.forEach ----
  if (!Array.prototype.forEach) {
    Array.prototype.forEach = function (fn, ctx) {
      var i, len = this.length;
      for (i = 0; i < len; i++) {
        if (i in this) fn.call(ctx, this[i], i, this);
      }
    };
  }

  // ---- Array.prototype.indexOf ----
  if (!Array.prototype.indexOf) {
    Array.prototype.indexOf = function (item, from) {
      var i, len = this.length;
      from = from || 0;
      if (from < 0) from += len;
      for (i = from; i < len; i++) {
        if (this[i] === item) return i;
      }
      return -1;
    };
  }

  // ---- Array.prototype.map ----
  if (!Array.prototype.map) {
    Array.prototype.map = function (fn, ctx) {
      var out = [], i, len = this.length;
      for (i = 0; i < len; i++) {
        if (i in this) out.push(fn.call(ctx, this[i], i, this));
      }
      return out;
    };
  }

  // ---- Array.prototype.filter ----
  if (!Array.prototype.filter) {
    Array.prototype.filter = function (fn, ctx) {
      var out = [], i, len = this.length, v;
      for (i = 0; i < len; i++) {
        if (i in this) {
          v = this[i];
          if (fn.call(ctx, v, i, this)) out.push(v);
        }
      }
      return out;
    };
  }

  // ---- Array.prototype.reduce ----
  if (!Array.prototype.reduce) {
    Array.prototype.reduce = function (fn, init) {
      var i = 0, len = this.length, acc;
      if (arguments.length < 2) {
        if (len === 0) throw new TypeError('Reduce of empty array with no initial value');
        acc = this[0];
        i = 1;
      } else {
        acc = init;
      }
      for (; i < len; i++) {
        if (i in this) acc = fn(acc, this[i], i, this);
      }
      return acc;
    };
  }

  // ---- Function.prototype.bind ----
  if (!Function.prototype.bind) {
    Function.prototype.bind = function (ctx) {
      var fn = this, args = Array.prototype.slice.call(arguments, 1);
      return function () {
        return fn.apply(ctx, args.concat(Array.prototype.slice.call(arguments)));
      };
    };
  }

  // ---- String.prototype.trim ----
  if (!String.prototype.trim) {
    String.prototype.trim = function () {
      return this.replace(/^\s+|\s+$/g, '');
    };
  }

  // ---- JSON (very minimal — only if native missing, e.g. pre-IE8) ----
  if (!global.JSON) {
    global.JSON = {};
  }
  if (!global.JSON.stringify) {
    // Naive, sufficient for our data shapes (no cyclic, no functions)
    global.JSON.stringify = function (val) {
      var out = '', k, i, len;
      if (val === null) return 'null';
      if (typeof val === 'undefined') return undefined;
      if (typeof val === 'boolean') return val ? 'true' : 'false';
      if (typeof val === 'number') return isFinite(val) ? String(val) : 'null';
      if (typeof val === 'string') {
        out = val.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
                 .replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
        return '"' + out + '"';
      }
      if (typeof val === 'object') {
        if (Array.isArray(val)) {
          out = '[';
          for (i = 0, len = val.length; i < len; i++) {
            out += (i > 0 ? ',' : '') + global.JSON.stringify(val[i]);
          }
          return out + ']';
        }
        out = '{';
        i = 0;
        for (k in val) {
          if (Object.prototype.hasOwnProperty.call(val, k)) {
            out += (i > 0 ? ',' : '') + '"' + k + '":' + global.JSON.stringify(val[k]);
            i++;
          }
        }
        return out + '}';
      }
      return 'null';
    };
  }
  if (!global.JSON.parse) {
    // Use Function constructor — same as the old polyfill approach.
    // Safe in our context because we only parse our own exported JSON.
    global.JSON.parse = function (str) {
      return (new Function('return (' + str + ')'))();
    };
  }

  // ---- requestAnimationFrame ----
  var last = 0, vendors = ['webkit', 'moz', 'ms', 'o'];
  for (var v = 0; v < vendors.length && !global.requestAnimationFrame; v++) {
    var vp = vendors[v];
    if (global[vp + 'RequestAnimationFrame']) {
      global.requestAnimationFrame = function (cb) {
        return global[vp + 'RequestAnimationFrame'](cb);
      };
      global.cancelAnimationFrame = function (id) {
        global[vp + 'CancelAnimationFrame'](id);
      };
    }
  }
  if (!global.requestAnimationFrame) {
    global.requestAnimationFrame = function (cb) {
      var now = Date.now(), wait = Math.max(0, 16 - (now - last));
      last = now + wait;
      return setTimeout(function () { cb(now + wait); }, wait);
    };
    global.cancelAnimationFrame = function (id) { clearTimeout(id); };
  }

  // ---- classList shim ----
  if (typeof document !== 'undefined' && !('classList' in document.createElement('div'))) {
    var DOMTokenList = function (el) { this.el = el; };
    DOMTokenList.prototype = {
      add: function (c) {
        if (!this.contains(c)) this.el.className += ' ' + c;
      },
      remove: function (c) {
        this.el.className = (' ' + this.el.className + ' ').replace(' ' + c + ' ', ' ').trim();
      },
      toggle: function (c) {
        if (this.contains(c)) this.remove(c); else this.add(c);
      },
      contains: function (c) {
        return (' ' + this.el.className + ' ').indexOf(' ' + c + ' ') !== -1;
      }
    };
    var defineClassList = function (proto) {
      try {
        Object.defineProperty(proto, 'classList', {
          get: function () { return new DOMTokenList(this); }
        });
      } catch (e) {
        // IE8 — would need different approach. Skip gracefully.
      }
    };
    defineClassList(Element.prototype);
  }

  // ---- addEventListener / removeEventListener for very old IE ----
  // (Safari 7 has these natively, but we include for IE9/10 safety)
  if (typeof window !== 'undefined' && !window.addEventListener && window.attachEvent) {
    window.addEventListener = function (ev, fn) { window.attachEvent('on' + ev, fn); };
    window.removeEventListener = function (ev, fn) { window.detachEvent('on' + ev, fn); };
    document.addEventListener = function (ev, fn) { document.attachEvent('on' + ev, fn); };
    document.removeEventListener = function (ev, fn) { document.detachEvent('on' + ev, fn); };
  }

  // ---- Minimal Promise (just enough for our use: .then/.catch, no chaining/race) ----
  if (!global.Promise) {
    global.Promise = function (executor) {
      var self = this;
      self.state = 'pending';
      self.value = undefined;
      self._cbs = [];
      function resolve(v) {
        if (self.state !== 'pending') return;
        self.state = 'fulfilled';
        self.value = v;
        self._cbs.forEach(function (c) { c.onFulfilled(v); });
      }
      function reject(e) {
        if (self.state !== 'pending') return;
        self.state = 'rejected';
        self.value = e;
        self._cbs.forEach(function (c) { c.onRejected(e); });
      }
      try { executor(resolve, reject); } catch (e) { reject(e); }
    };
    global.Promise.prototype.then = function (onFulfilled, onRejected) {
      var self = this;
      return new global.Promise(function (resolve, reject) {
        var handle = {
          onFulfilled: function (v) {
            try {
              if (typeof onFulfilled === 'function') resolve(onFulfilled(v));
              else resolve(v);
            } catch (e) { reject(e); }
          },
          onRejected: function (e) {
            try {
              if (typeof onRejected === 'function') resolve(onRejected(e));
              else reject(e);
            } catch (err) { reject(err); }
          }
        };
        if (self.state === 'fulfilled') handle.onFulfilled(self.value);
        else if (self.state === 'rejected') handle.onRejected(self.value);
        else self._cbs.push(handle);
      });
    };
    global.Promise.prototype.catch = function (onRejected) {
      return this.then(null, onRejected);
    };
    global.Promise.resolve = function (v) { return new global.Promise(function (r) { r(v); }); };
    global.Promise.reject = function (e) { return new global.Promise(function (_, r) { r(e); }); };
  }

  // ---- XHR-based fetch fallback ----
  if (!global.fetch) {
    global.fetch = function (url, opts) {
      opts = opts || {};
      return new global.Promise(function (resolve, reject) {
        var xhr = new XMLHttpRequest();
        xhr.open(opts.method || 'GET', url);
        if (opts.headers) {
          for (var h in opts.headers) {
            if (Object.prototype.hasOwnProperty.call(opts.headers, h)) {
              xhr.setRequestHeader(h, opts.headers[h]);
            }
          }
        }
        xhr.responseType = 'text';
        xhr.onreadystatechange = function () {
          if (xhr.readyState === 4) {
            var ok = xhr.status >= 200 && xhr.status < 300;
            resolve({
              ok: ok,
              status: xhr.status,
              statusText: xhr.statusText,
              text: function () {
                return global.Promise.resolve(xhr.responseText);
              },
              json: function () {
                return global.Promise.resolve(JSON.parse(xhr.responseText));
              },
              blob: function () {
                return global.Promise.resolve(new Blob([xhr.responseText]));
              }
            });
          }
        };
        xhr.onerror = function () { reject(new Error('XHR error: ' + url)); };
        xhr.send(opts.body || null);
      });
    };
  }

  // ---- Array.from ----
  if (!Array.from) {
    Array.from = function (arrLike) {
      var out = [], i, len = arrLike.length;
      for (i = 0; i < len; i++) out.push(arrLike[i]);
      return out;
    };
  }

  // ---- element.matches shim ----
  if (typeof Element !== 'undefined' && !Element.prototype.matches) {
    Element.prototype.matches =
      Element.prototype.webkitMatchesSelector ||
      Element.prototype.msMatchesSelector ||
      Element.prototype.mozMatchesSelector ||
      function (sel) {
        var matches = (this.document || this.ownerDocument).querySelectorAll(sel);
        var i = matches.length;
        while (--i >= 0 && matches.item(i) !== this) {}
        return i > -1;
      };
  }

  // ---- Element.closest ----
  if (typeof Element !== 'undefined' && !Element.prototype.closest) {
    Element.prototype.closest = function (sel) {
      var el = this;
      while (el && el.nodeType === 1) {
        if (el.matches(sel)) return el;
        el = el.parentNode;
      }
      return null;
    };
  }

  // ---- URL.createObjectURL fallback (for download) ----
  if (typeof window !== 'undefined' && !window.URL) {
    window.URL = window.webkitURL || window;
  }
  if (typeof window !== 'undefined' && !window.URL.createObjectURL && window.Blob) {
    // Crude fallback — won't trigger download in ancient browsers, but won't crash.
    window.URL.createObjectURL = function (blob) { return 'blob:fallback'; };
    window.URL.revokeObjectURL = function () {};
  }

  // ---- Blob ----
  if (typeof window !== 'undefined' && !window.Blob) {
    window.Blob = function (parts, opts) {
      this.parts = parts;
      this.size = (parts || []).reduce(function (a, p) { return a + (p.length || p.byteLength || 0); }, 0);
      this.type = (opts && opts.type) || '';
    };
  }

  // ---- ArrayBuffer / Uint8Array fallback (very crude, only for STL byte export) ----
  if (typeof window !== 'undefined' && !window.Uint8Array) {
    window.Uint8Array = Array;
  }

  // Mark polyfills loaded
  global.__FORGECAD_POLYFILLS_LOADED = true;
})();
