/* ============================================================
   ForgeCAD — compat.js
   Browser capability detection + adaptive performance tier.
   Provides a global ForgeCAD.compat object.
   ============================================================ */
(function (global) {
  'use strict';

  var compat = {
    // Renderer
    hasWebGL: false,
    webglVersion: 0,
    hasCanvas2D: false,
    hasSVG: false,

    // Browser identity
    browser: 'unknown',
    browserVersion: 0,
    isMobile: false,
    isTouch: false,

    // Device capability
    deviceMemoryMB: 0,        // navigator.deviceMemory (Chrome only) or estimate
    hardwareConcurrency: 1,
    pixelRatio: 1,
    screenWidth: 0,
    screenHeight: 0,

    // Performance tier (computed)
    tier: 'low',              // 'low' | 'mid' | 'high'
    maxObjects: 100,          // adaptive cap
    enableShadows: false,
    enableAntialias: false,
    pixelRatioCap: 1,
    meshDetail: 'low',        // 'low' | 'mid' | 'high' — controls segment counts

    // Feature flags
    hasFlexbox: false,
    hasFlexGap: false,
    hasCSSVariables: false,
    hasES6: false,
    hasLocalStorage: false,
    hasFileAPI: false,
    hasBlob: false,

    // Detection
    detect: function () {
      this._detectBrowser();
      this._detectRenderer();
      this._detectDevice();
      this._detectFeatures();
      this._computeTier();
      return this;
    },

    _detectBrowser: function () {
      var ua = (navigator.userAgent || '').toLowerCase();
      var m;
      if (/trident/.test(ua)) {
        this.browser = 'ie'; m = /msie (\d+)/.exec(ua) || /rv:(\d+)/.exec(ua);
      } else if (/edge\/(\d+)/.test(ua)) {
        this.browser = 'edge'; m = /edge\/(\d+)/.exec(ua);
      } else if (/edg\/(\d+)/.test(ua)) {
        this.browser = 'edge-chromium'; m = /edg\/(\d+)/.exec(ua);
      } else if (/firefox\/(\d+)/.test(ua)) {
        this.browser = 'firefox'; m = /firefox\/(\d+)/.exec(ua);
      } else if (/chrome\/(\d+)/.test(ua)) {
        this.browser = 'chrome'; m = /chrome\/(\d+)/.exec(ua);
      } else if (/version\/(\d+).*safari/.test(ua)) {
        this.browser = 'safari'; m = /version\/(\d+)/.exec(ua);
      } else if (/\bwebkit\b/.test(ua)) {
        this.browser = 'webkit'; m = /applewebkit\/(\d+)/.exec(ua);
      }
      if (m) this.browserVersion = parseInt(m[1], 10) || 0;

      // Mobile / touch
      this.isMobile = /android|iphone|ipad|ipod|windows phone|blackberry|opera mini|mobile/i.test(ua);
      this.isTouch = ('ontouchstart' in global) ||
                     (navigator.maxTouchPoints && navigator.maxTouchPoints > 0);
    },

    _detectRenderer: function () {
      // WebGL detection (works back to Safari 7 with -webkit-webgl)
      var canvas = document.createElement('canvas');
      var gl = null;
      var names = ['webgl2', 'experimental-webgl2', 'webgl', 'experimental-webgl', 'webkit-3d', 'moz-webgl'];
      for (var i = 0; i < names.length; i++) {
        try {
          gl = canvas.getContext(names[i]);
          if (gl) {
            this.hasWebGL = true;
            this.webglVersion = (names[i].indexOf('webgl2') === 0) ? 2 : 1;
            break;
          }
        } catch (e) { /* ignore */ }
      }
      // Canvas 2D
      try {
        var c2 = canvas.getContext('2d');
        this.hasCanvas2D = !!c2;
      } catch (e) { this.hasCanvas2D = false; }
      // SVG
      this.hasSVG = !!document.implementation && document.implementation.hasFeature('http://www.w3.org/TR/SVG11/feature#BasicStructure', '1.1');
    },

    _detectDevice: function () {
      // navigator.deviceMemory is Chrome-only
      this.deviceMemoryMB = (navigator.deviceMemory ? navigator.deviceMemory * 1024 : 0);
      if (!this.deviceMemoryMB) {
        // Heuristic estimate
        if (this.isMobile) this.deviceMemoryMB = 1024; // assume 1GB on unknown mobile
        else this.deviceMemoryMB = 4096;
      }
      this.hardwareConcurrency = navigator.hardwareConcurrency || (this.isMobile ? 2 : 4);
      this.pixelRatio = window.devicePixelRatio || 1;
      this.screenWidth = window.screen ? window.screen.width : window.innerWidth;
      this.screenHeight = window.screen ? window.screen.height : window.innerHeight;
    },

    _detectFeatures: function () {
      // CSS features
      var el = document.createElement('div');
      el.style.display = 'flex';
      this.hasFlexbox = (el.style.display === 'flex');
      el.style.gap = '10px';
      this.hasFlexGap = (el.style.gap === '10px');
      // CSS variables
      try {
        el.style.setProperty('--t', '1');
        this.hasCSSVariables = el.style.getPropertyValue('--t') === '1';
      } catch (e) { this.hasCSSVariables = false; }
      // ES6 (let/const/arrow)
      try {
        new Function('(function () { "use strict"; var x = () => 1; let y = 2; const z = 3; return x() + y + z; })()');
        this.hasES6 = true;
      } catch (e) { this.hasES6 = false; }
      // Storage
      try {
        var k = '__test__';
        window.localStorage.setItem(k, '1');
        window.localStorage.removeItem(k);
        this.hasLocalStorage = true;
      } catch (e) { this.hasLocalStorage = false; }
      // File API
      this.hasFileAPI = !!(window.File && window.FileReader && window.FileList);
      this.hasBlob = !!window.Blob;
    },

    _computeTier: function () {
      var score = 0;
      // RAM-based
      if (this.deviceMemoryMB >= 4096) score += 3;
      else if (this.deviceMemoryMB >= 2048) score += 2;
      else if (this.deviceMemoryMB >= 1024) score += 1;
      // Cores
      if (this.hardwareConcurrency >= 8) score += 3;
      else if (this.hardwareConcurrency >= 4) score += 2;
      else if (this.hardwareConcurrency >= 2) score += 1;
      // WebGL version
      if (this.webglVersion === 2) score += 2;
      else if (this.webglVersion === 1) score += 1;
      // Mobile penalty
      if (this.isMobile) score -= 1;
      // Old browser penalty
      if (this.browser === 'safari' && this.browserVersion < 11) score -= 1;
      if (this.browser === 'ie') score -= 2;

      if (score >= 7) {
        this.tier = 'high';
        this.maxObjects = 500;
        this.enableShadows = true;
        this.enableAntialias = true;
        this.pixelRatioCap = Math.min(this.pixelRatio, 2);
        this.meshDetail = 'high';
      } else if (score >= 4) {
        this.tier = 'mid';
        this.maxObjects = 250;
        this.enableShadows = false;
        this.enableAntialias = true;
        this.pixelRatioCap = Math.min(this.pixelRatio, 1.5);
        this.meshDetail = 'mid';
      } else {
        this.tier = 'low';
        this.maxObjects = 100;
        this.enableShadows = false;
        this.enableAntialias = false;
        this.pixelRatioCap = 1;
        this.meshDetail = 'low';
      }
    },

    // Get mesh segments for current tier
    getSegments: function (defaultSeg) {
      if (this.meshDetail === 'high') return defaultSeg;
      if (this.meshDetail === 'mid') return Math.max(8, Math.round(defaultSeg * 0.6));
      return Math.max(6, Math.round(defaultSeg * 0.35));
    },

    // Pretty summary for the perf modal
    summary: function () {
      return {
        'Browser': this.browser + ' ' + this.browserVersion,
        'WebGL': this.hasWebGL ? ('v' + this.webglVersion) : 'not supported (canvas 2D fallback)',
        'Canvas 2D': this.hasFlexbox ? 'yes' : 'no',
        'SVG': this.hasSVG ? 'yes' : 'no',
        'Device RAM (est.)': this.deviceMemoryMB + ' MB',
        'CPU cores': String(this.hardwareConcurrency),
        'Pixel ratio': String(this.pixelRatio),
        'Touch': this.isTouch ? 'yes' : 'no',
        'Mobile': this.isMobile ? 'yes' : 'no',
        'Flexbox': this.hasFlexbox ? 'yes' : 'no',
        'CSS variables': this.hasCSSVariables ? 'yes' : 'no (using class-based theme)',
        'ES6': this.hasES6 ? 'yes' : 'no (using ES5)',
        'Local storage': this.hasLocalStorage ? 'yes' : 'no',
        'Performance tier': this.tier,
        'Max objects': String(this.maxObjects),
        'Mesh detail': this.meshDetail,
        'Shadows': this.enableShadows ? 'on' : 'off',
        'Antialias': this.enableAntialias ? 'on' : 'off'
      };
    }
  };

  global.ForgeCAD = global.ForgeCAD || {};
  global.ForgeCAD.compat = compat.detect();

})(typeof window !== 'undefined' ? window : this);
