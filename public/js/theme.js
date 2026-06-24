/* ============================================================
   ForgeCAD — theme.js
   Dark/light toggle. Auto-detects device preference on first
   visit, then persists user's manual choice in localStorage.
   Listens for system theme changes and follows them if the
   user hasn't manually toggled.
   ============================================================ */
(function (global) {
  'use strict';

  var theme = {
    current: 'dark',
    key: 'forgecad-theme',
    userOverride: false,  // true once user manually toggles

    init: function () {
      var self = this;
      // Check if user has a saved preference
      var saved = null;
      try { saved = localStorage.getItem(this.key); } catch (e) {}
      if (saved === 'light' || saved === 'dark') {
        this.current = saved;
        this.userOverride = true;
      } else {
        // No saved preference — auto-detect from device
        this.current = this._detectSystemTheme();
        this.userOverride = false;
      }
      this.apply();
      this.bind();
      // Listen for system theme changes (follow automatically unless user overrode)
      this._watchSystemTheme();
    },

    _detectSystemTheme: function () {
      // prefers-color-scheme is supported in Safari 12.1+, Chrome 76+, Firefox 67+
      try {
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
          return 'dark';
        }
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
          return 'light';
        }
      } catch (e) {}
      // Fallback: default to dark
      return 'dark';
    },

    _watchSystemTheme: function () {
      var self = this;
      try {
        var mq = window.matchMedia('(prefers-color-scheme: dark)');
        if (mq && mq.addEventListener) {
          mq.addEventListener('change', function (ev) {
            // Only follow system if user hasn't manually set a preference
            if (!self.userOverride) {
              self.current = ev.matches ? 'dark' : 'light';
              self.apply();
            }
          });
        } else if (mq && mq.addListener) {
          // Older browsers (Safari < 14)
          mq.addListener(function (ev) {
            if (!self.userOverride) {
              self.current = ev.matches ? 'dark' : 'light';
              self.apply();
            }
          });
        }
      } catch (e) {}
    },

    apply: function () {
      var body = document.body;
      var html = document.documentElement;
      body.className = body.className.replace(/\btheme-dark\b/g, '').replace(/\btheme-light\b/g, '').replace(/\s+/g, ' ').trim();
      body.className += ' theme-' + this.current;
      html.className = html.className.replace(/\bdark\b/g, '').replace(/\blight\b/g, '').trim();
      html.className += ' ' + this.current;
      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) {
        meta.setAttribute('content', this.current === 'dark' ? '#1e2530' : '#ffffff');
      }
      var icon = document.getElementById('theme-icon');
      if (icon) icon.innerHTML = this.current === 'dark' ? '◐' : '◑';
      if (global.ForgeCAD && global.ForgeCAD.mode3D && global.ForgeCAD.mode3D.onThemeChange) {
        global.ForgeCAD.mode3D.onThemeChange(this.current);
      }
    },

    toggle: function () {
      this.current = (this.current === 'dark') ? 'light' : 'dark';
      this.userOverride = true;  // user manually chose — stop following system
      try { localStorage.setItem(this.key, this.current); } catch (e) {}
      this.apply();
    },

    bind: function () {
      var btn = document.getElementById('btn-theme');
      if (btn) {
        btn.addEventListener('click', this.toggle.bind(this));
      }
    }
  };

  global.ForgeCAD = global.ForgeCAD || {};
  global.ForgeCAD.theme = theme;

})(typeof window !== 'undefined' ? window : this);
