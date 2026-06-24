/* ============================================================
   ForgeCAD — ui.js
   Shared UI helpers: toast, modal, dropdowns, bottom sheet,
   properties panel builder, status bar updates.
   ============================================================ */
(function (global) {
  'use strict';

  var ui = {

    /* ---------- Toast ---------- */
    toast: function (msg, ms) {
      var el = document.getElementById('toast');
      if (!el) return;
      el.innerHTML = '';
      el.appendChild(document.createTextNode(msg));
      el.className = el.className.replace(/\bhidden\b/g, '').trim();
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(function () {
        el.className += ' hidden';
      }, ms || 2500);
    },

    /* ---------- Modal ---------- */
    modal: function (title, bodyHTML) {
      var backdrop = document.getElementById('modal-backdrop');
      var titleEl = document.getElementById('modal-title');
      var bodyEl = document.getElementById('modal-body');
      if (!backdrop) return;
      titleEl.innerHTML = '';
      titleEl.appendChild(document.createTextNode(title));
      bodyEl.innerHTML = bodyHTML;
      backdrop.className = backdrop.className.replace(/\bhidden\b/g, '').trim();
    },

    modalClose: function () {
      var backdrop = document.getElementById('modal-backdrop');
      if (backdrop && backdrop.className.indexOf('hidden') === -1) {
        backdrop.className += ' hidden';
      }
    },

    /* ---------- Status bar ---------- */
    status: function (left, center) {
      if (left) {
        var l = document.getElementById('status-left');
        if (l) l.innerHTML = '';
        if (l && left) l.appendChild(document.createTextNode(left));
      }
      if (center !== undefined) {
        var c = document.getElementById('status-center');
        if (c) c.innerHTML = '';
        if (c && center) c.appendChild(document.createTextNode(center));
      }
    },

    setObjects: function (n) {
      var el = document.getElementById('status-objects');
      if (el) el.innerHTML = n + ' objects';
    },

    setFps: (function () {
      var el = null;
      var lastUpdate = 0;
      return function (fps) {
        if (!el) el = document.getElementById('status-fps');
        if (!el) return;
        var now = Date.now();
        if (now - lastUpdate < 500) return; // throttle UI updates
        lastUpdate = now;
        el.innerHTML = Math.round(fps) + ' fps';
      };
    })(),

    setPerf: function (tier) {
      var el = document.getElementById('status-perf');
      if (el) el.innerHTML = tier + ' tier';
    },

    /* ---------- Dropdown positioning ---------- */
    showDropdown: function (id, anchorEl) {
      var dd = document.getElementById(id);
      if (!dd || !anchorEl) return;
      // Hide any other open dropdown
      var all = document.querySelectorAll('.dropdown');
      for (var i = 0; i < all.length; i++) {
        if (all[i] !== dd) all[i].className += ' hidden';
      }
      var rect = anchorEl.getBoundingClientRect();
      dd.style.top = (rect.bottom + 4) + 'px';
      dd.style.right = (window.innerWidth - rect.right) + 'px';
      dd.style.left = 'auto';
      dd.className = dd.className.replace(/\bhidden\b/g, '').trim();
    },

    hideDropdowns: function () {
      var all = document.querySelectorAll('.dropdown');
      for (var i = 0; i < all.length; i++) {
        if (all[i].className.indexOf('hidden') === -1) {
          all[i].className += ' hidden';
        }
      }
    },

    /* ---------- Bottom sheet (mobile) ---------- */
    bottomSheetOpen: function (html) {
      var sheet = document.getElementById('bottom-sheet');
      var content = document.getElementById('bottom-sheet-content');
      if (!sheet || !content) return;
      content.innerHTML = html;
      sheet.className = sheet.className.replace(/\bhidden\b/g, '').trim();
    },

    bottomSheetClose: function () {
      var sheet = document.getElementById('bottom-sheet');
      if (sheet && sheet.className.indexOf('hidden') === -1) {
        sheet.className += ' hidden';
      }
    },

    bottomSheetToggle: function (html) {
      var sheet = document.getElementById('bottom-sheet');
      if (!sheet) return;
      if (sheet.className.indexOf('hidden') !== -1) {
        this.bottomSheetOpen(html);
      } else {
        this.bottomSheetClose();
      }
    },

    /* ---------- Properties panel builder ---------- */
    clearProperties: function () {
      var body = document.getElementById('right-panel-body');
      if (body) body.innerHTML = '<div class="empty-state">Select an object to edit properties.</div>';
      var title = document.getElementById('right-panel-title');
      if (title) { title.innerHTML = ''; title.appendChild(document.createTextNode('Properties')); }
    },

    setPropertiesTitle: function (title) {
      var el = document.getElementById('right-panel-title');
      if (el) {
        el.innerHTML = '';
        el.appendChild(document.createTextNode(title));
      }
    },

    setPropertiesHTML: function (html) {
      var body = document.getElementById('right-panel-body');
      if (body) body.innerHTML = html;
    },

    /* ---------- Properties panel helper: build a row ---------- */
    propRow: function (label, controlHTML) {
      return '<div class="prop-row"><label>' + label + '</label>' + controlHTML + '</div>';
    },

    propRow3: function (label, vals, keys, onUpdate) {
      var html = '<div class="prop-row"><label>' + label + '</label><div class="prop-row-three">';
      for (var i = 0; i < 3; i++) {
        html += '<div class="axis-input"><span>' + 'XYZ'[i] + '</span>' +
                '<input type="number" step="0.1" data-prop="' + keys[i] + '" value="' + (vals[i] != null ? vals[i] : 0) + '">' +
                '</div>';
      }
      html += '</div></div>';
      return html;
    },

    /* ---------- Color picker (simple) ---------- */
    colorRow: function (label, currentColor, onPick) {
      var palette = ['#e74c3c','#e67e22','#f1c40f','#2ecc71','#1abc9c','#3498db','#9b59b6','#ecf0f1','#95a5a6','#34495e'];
      var swatchesHTML = '';
      for (var i = 0; i < palette.length; i++) {
        swatchesHTML += '<button class="color-swatch-mini" data-color="' + palette[i] + '" style="background:' + palette[i] + ';width:20px;height:20px;border:1px solid #555;border-radius:3px;display:inline-block;margin:2px;cursor:pointer;"></button>';
      }
      return '<div class="prop-row"><label>' + label + '</label>' +
             '<div class="color-swatch" style="background:' + currentColor + ';" id="current-color-swatch"></div>' +
             '<input type="text" id="current-color-text" value="' + currentColor + '" style="width:80px;">' +
             '</div>' +
             '<div class="prop-row"><div style="margin-left:78px;">' + swatchesHTML + '</div></div>';
    },

    /* ---------- Quick confirm ---------- */
    confirm: function (msg, onYes) {
      var html = '<p>' + msg + '</p>' +
                 '<div style="margin-top:16px;text-align:right;">' +
                 '<button class="tb-btn" id="confirm-no" style="margin-right:8px;">Cancel</button>' +
                 '<button class="tb-btn primary" id="confirm-yes">OK</button>' +
                 '</div>';
      this.modal('Confirm', html);
      var self = this;
      document.getElementById('confirm-yes').addEventListener('click', function () {
        self.modalClose();
        if (onYes) onYes();
      });
      document.getElementById('confirm-no').addEventListener('click', function () {
        self.modalClose();
      });
    }
  };

  global.ForgeCAD = global.ForgeCAD || {};
  global.ForgeCAD.ui = ui;

})(typeof window !== 'undefined' ? window : this);
