/* ============================================================
   ForgeCAD — theme.js
   Dark/light toggle. Persisted in localStorage when available.
   ============================================================ */
(function (global) {
  'use strict';

  var theme = {
    current: 'dark',
    key: 'forgecad-theme',

    init: function () {
      // Restore saved
      var saved = null;
      try { saved = localStorage.getItem(this.key); } catch (e) {}
      if (saved === 'light' || saved === 'dark') {
        this.current = saved;
      } else {
        // Default to dark (Pro CAD dark style requested)
        this.current = 'dark';
      }
      this.apply();
      this.bind();
    },

    apply: function () {
      var body = document.body;
      var html = document.documentElement;
      // Remove both, add current
      body.className = body.className.replace(/\btheme-dark\b/g, '').replace(/\btheme-light\b/g, '').replace(/\s+/g, ' ').trim();
      body.className += ' theme-' + this.current;
      html.className = html.className.replace(/\bdark\b/g, '').replace(/\blight\b/g, '').trim();
      html.className += ' ' + this.current;
      // Update theme-color meta
      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) {
        meta.setAttribute('content', this.current === 'dark' ? '#1e2530' : '#ffffff');
      }
      // Update icon
      var icon = document.getElementById('theme-icon');
      if (icon) icon.innerHTML = this.current === 'dark' ? '◐' : '◑';
      // Notify 3D mode so it can swap background/clear color
      if (global.ForgeCAD && global.ForgeCAD.mode3D && global.ForgeCAD.mode3D.onThemeChange) {
        global.ForgeCAD.mode3D.onThemeChange(this.current);
      }
    },

    toggle: function () {
      this.current = (this.current === 'dark') ? 'light' : 'dark';
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
