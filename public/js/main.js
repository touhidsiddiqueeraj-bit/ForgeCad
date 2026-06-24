/* ============================================================
   ForgeCAD — main.js
   App entry point. Wires together:
     - Mode switching (3D / Circuits)
     - Top bar buttons (import, export, save, theme, menu)
     - Dropdowns (export, more menu)
     - Mobile bottom sheet trigger
     - File input (import project)
   ============================================================ */
(function (global) {
  'use strict';

  var app = {
    currentMode: '3d',
    initialized: false,

    init: function () {
      if (this.initialized) return;
      this.initialized = true;
      var self = this;
      // Theme first
      global.ForgeCAD.theme.init();
      // Initialize modes (3D needs WebGL which we check inside)
      if (global.ForgeCAD.mode3D) global.ForgeCAD.mode3D.init();
      if (global.ForgeCAD.modeCircuits) global.ForgeCAD.modeCircuits.init();
      // Populate shape panel for current mode
      this._populateModePanel();
      // Bind UI events
      this._bindTopBar();
      this._bindModeSwitch();
      this._bindMobileTrigger();
      this._bindModalClose();
      this._bindKeyboard();
      this._bindHelpHint();
      // Apply mode
      this.setMode('3d');
      // Welcome
      global.ForgeCAD.ui.status('Ready — ' + global.ForgeCAD.compat.browser + ' ' + global.ForgeCAD.compat.browserVersion + ' (' + global.ForgeCAD.compat.tier + ' tier)');
      // Touch outside dropdown to close
      document.addEventListener('click', function (ev) {
        if (!ev.target.closest || (!ev.target.closest('.dropdown') && !ev.target.closest('#btn-export-menu') && !ev.target.closest('#btn-menu'))) {
          global.ForgeCAD.ui.hideDropdowns();
        }
      });
    },

    /* ---------- Mode switching ---------- */
    setMode: function (mode) {
      this.currentMode = mode;
      // Update body class
      document.body.className = document.body.className.replace(/\bapp-mode-\w+\b/g, '').trim() + ' app-mode-' + mode;
      // Update tab buttons
      var btns = document.querySelectorAll('.mode-btn');
      for (var i = 0; i < btns.length; i++) {
        var m = btns[i].getAttribute('data-mode');
        if (m === mode) btns[i].className += ' active';
        else btns[i].className = btns[i].className.replace(/\bactive\b/g, '').trim();
      }
      // Show/hide canvases
      var canvas3D = document.getElementById('canvas-3d');
      var canvasC = document.getElementById('canvas-circuits');
      var transformToolbar = document.getElementById('transform-toolbar');
      var leftPanelTitle = document.getElementById('left-panel-title');
      // Show/hide help hint variant
      var hint3D = document.querySelector('.help-hint-3d');
      var hintC = document.querySelector('.help-hint-circuits');
      if (mode === '3d') {
        if (canvas3D) canvas3D.style.display = 'block';
        if (canvasC) canvasC.className += ' hidden';
        if (transformToolbar) transformToolbar.style.display = 'flex';
        if (leftPanelTitle) { leftPanelTitle.innerHTML = ''; leftPanelTitle.appendChild(document.createTextNode('Shapes')); }
        if (hint3D) hint3D.className = hint3D.className.replace(/\bhidden\b/g, '').trim();
        if (hintC && hintC.className.indexOf('hidden') === -1) hintC.className += ' hidden';
        global.ForgeCAD.mode3D.populateShapePanel();
        global.ForgeCAD.mode3D._resizeRenderer();
      } else {
        if (canvas3D) canvas3D.style.display = 'none';
        if (canvasC) canvasC.className = canvasC.className.replace(/\bhidden\b/g, '').trim();
        if (transformToolbar) transformToolbar.style.display = 'none';
        if (leftPanelTitle) { leftPanelTitle.innerHTML = ''; leftPanelTitle.appendChild(document.createTextNode('Components')); }
        if (hintC) hintC.className = hintC.className.replace(/\bhidden\b/g, '').trim();
        if (hint3D && hint3D.className.indexOf('hidden') === -1) hint3D.className += ' hidden';
        global.ForgeCAD.modeCircuits._populatePanel();
      }
      global.ForgeCAD.ui.clearProperties();
      global.ForgeCAD.ui.status('Mode: ' + (mode === '3d' ? '3D Design' : 'Circuits'));
    },

    _bindModeSwitch: function () {
      var self = this;
      var btns = document.querySelectorAll('.mode-btn');
      for (var i = 0; i < btns.length; i++) {
        btns[i].addEventListener('click', function (ev) {
          var m = ev.currentTarget.getAttribute('data-mode');
          self.setMode(m);
        });
      }
    },

    _populateModePanel: function () {
      // Will be populated by setMode, but call once to populate default
    },

    /* ---------- Top bar ---------- */
    _bindTopBar: function () {
      var self = this;
      // Export menu
      var exportMenuBtn = document.getElementById('btn-export-menu');
      if (exportMenuBtn) {
        exportMenuBtn.addEventListener('click', function (ev) {
          ev.stopPropagation();
          global.ForgeCAD.ui.showDropdown('export-menu', exportMenuBtn);
        });
      }
      // Export menu items
      var exportMenu = document.getElementById('export-menu');
      if (exportMenu) {
        var btns = exportMenu.querySelectorAll('button');
        for (var i = 0; i < btns.length; i++) {
          btns[i].addEventListener('click', function (ev) {
            var fmt = ev.currentTarget.getAttribute('data-export');
            self.exportAs(fmt);
            global.ForgeCAD.ui.hideDropdowns();
          });
        }
      }
      // Save project
      var saveBtn = document.getElementById('btn-export-proj');
      if (saveBtn) {
        saveBtn.addEventListener('click', function () { self.saveProject(); });
      }
      // Import project
      var importBtn = document.getElementById('btn-import');
      if (importBtn) {
        importBtn.addEventListener('click', function () { self.importProject(); });
      }
      // More menu
      var menuBtn = document.getElementById('btn-menu');
      if (menuBtn) {
        menuBtn.addEventListener('click', function (ev) {
          ev.stopPropagation();
          global.ForgeCAD.ui.showDropdown('more-menu', menuBtn);
        });
      }
      var moreMenu = document.getElementById('more-menu');
      if (moreMenu) {
        var mbtns = moreMenu.querySelectorAll('button');
        for (var j = 0; j < mbtns.length; j++) {
          mbtns[j].addEventListener('click', function (ev) {
            var action = ev.currentTarget.getAttribute('data-action');
            self.handleMenuAction(action);
            global.ForgeCAD.ui.hideDropdowns();
          });
        }
      }
      // Brand — about modal
      var brand = document.getElementById('brand-btn');
      if (brand) {
        brand.addEventListener('click', function () {
          self.handleMenuAction('about');
        });
      }
    },

    _bindModalClose: function () {
      var self = this;
      var backdrop = document.getElementById('modal-backdrop');
      var closeBtn = document.getElementById('modal-close');
      if (closeBtn) closeBtn.addEventListener('click', function () { global.ForgeCAD.ui.modalClose(); });
      if (backdrop) {
        backdrop.addEventListener('click', function (ev) {
          if (ev.target === backdrop) global.ForgeCAD.ui.modalClose();
        });
      }
    },

    _bindHelpHint: function () {
      var dismiss = document.getElementById('help-hint-dismiss');
      var hint = document.getElementById('help-hint');
      if (dismiss && hint) {
        dismiss.addEventListener('click', function () {
          hint.className += ' hidden';
        });
      }
    },

    _bindMobileTrigger: function () {
      var self = this;
      var btn = document.getElementById('mobile-panel-toggle');
      if (btn) {
        btn.addEventListener('click', function () {
          if (self.currentMode === '3d') {
            global.ForgeCAD.mode3D.showMobilePanel();
          } else {
            global.ForgeCAD.modeCircuits.showMobilePanel();
          }
        });
      }
    },

    _bindKeyboard: function () {
      var self = this;
      document.addEventListener('keydown', function (ev) {
        if (ev.key === 'Escape') {
          global.ForgeCAD.ui.modalClose();
          global.ForgeCAD.ui.bottomSheetClose();
          global.ForgeCAD.ui.hideDropdowns();
        }
      });
    },

    /* ---------- Export ---------- */
    exportAs: function (fmt) {
      var self = this;
      var projName = (document.getElementById('proj-name').value || 'project').replace(/[^a-z0-9_-]/gi, '_');
      if (this.currentMode !== '3d') {
        if (fmt === 'png') {
          // Serialize SVG to PNG via canvas
          this._svgToPng(function (err, canvas) {
            if (err) {
              global.ForgeCAD.ui.toast('PNG export failed: ' + err.message);
              return;
            }
            global.ForgeCAD.exporters.exportPNG(canvas, projName + '.png');
          });
          return;
        }
        global.ForgeCAD.ui.toast('Export only available in 3D Design mode for ' + fmt.toUpperCase());
        return;
      }
      var scene = global.ForgeCAD.mode3D.scene;
      var canvas = document.getElementById('canvas-3d');
      switch (fmt) {
        case 'stl': global.ForgeCAD.exporters.exportSTL(scene, projName + '.stl'); break;
        case 'obj': global.ForgeCAD.exporters.exportOBJ(scene, projName + '.obj'); break;
        case 'gltf': global.ForgeCAD.exporters.exportGLTF(scene, projName + '.gltf'); break;
        case 'png': global.ForgeCAD.exporters.exportPNG(canvas, projName + '.png'); break;
      }
    },

    _svgToPng: function (callback) {
      var svg = document.getElementById('svg-circuits');
      if (!svg) { callback(new Error('No SVG')); return; }
      try {
        var xml = new XMLSerializer().serializeToString(svg);
        var svg64 = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(xml)));
        var img = new Image();
        img.onload = function () {
          var canvas = document.createElement('canvas');
          canvas.width = 1200;
          canvas.height = 800;
          var ctx = canvas.getContext('2d');
          ctx.fillStyle = global.ForgeCAD.theme.current === 'dark' ? '#2a323e' : '#e5e7eb';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          callback(null, canvas);
        };
        img.onerror = function () { callback(new Error('SVG to PNG conversion failed')); };
        img.src = svg64;
      } catch (e) { callback(e); }
    },

    /* ---------- Save / Load project ---------- */
    saveProject: function () {
      var projName = (document.getElementById('proj-name').value || 'project').replace(/[^a-z0-9_-]/gi, '_');
      var data;
      if (this.currentMode === '3d') data = global.ForgeCAD.mode3D.serialize();
      else data = global.ForgeCAD.modeCircuits.serialize();
      data.name = document.getElementById('proj-name').value || 'Untitled Project';
      data.timestamp = Date.now();
      global.ForgeCAD.exporters.exportProject(data, projName + '.json');
    },

    importProject: function () {
      var self = this;
      var input = document.getElementById('file-input');
      if (!input) return;
      // Reset to trigger change event even if same file
      input.value = '';
      input.accept = '.json';
      input.onchange = function (ev) {
        var file = ev.target.files[0];
        if (!file) return;
        global.ForgeCAD.exporters.importProject(file, function (err, data) {
          if (err) {
            global.ForgeCAD.ui.toast('Import failed: ' + err.message);
            return;
          }
          // Detect mode from data
          if (data.mode === 'circuits') {
            self.setMode('circuits');
            global.ForgeCAD.modeCircuits.deserialize(data);
          } else {
            self.setMode('3d');
            global.ForgeCAD.mode3D.deserialize(data);
          }
          if (data.name) document.getElementById('proj-name').value = data.name;
        });
      };
      input.click();
    },

    /* ---------- Menu actions ---------- */
    handleMenuAction: function (action) {
      var self = this;
      switch (action) {
        case 'clear':
          if (this.currentMode === '3d') global.ForgeCAD.mode3D.clearScene();
          else global.ForgeCAD.modeCircuits.clearAll();
          break;
        case 'fit':
          if (this.currentMode === '3d') global.ForgeCAD.mode3D.setView('fit');
          break;
        case 'grid':
          if (this.currentMode === '3d') global.ForgeCAD.mode3D.toggleGrid();
          break;
        case 'perf':
          var summary = global.ForgeCAD.compat.summary();
          var html = '<div>';
          var keys = Object.keys(summary);
          for (var i = 0; i < keys.length; i++) {
            html += '<div class="stat-row"><span>' + keys[i] + '</span><span>' + summary[keys[i]] + '</span></div>';
          }
          html += '</div>';
          html += '<p style="margin-top:16px;font-size:12px;color:#6b7280;">Performance tier automatically scales mesh detail, max objects, shadows, and antialiasing based on your device capability and measured FPS.</p>';
          global.ForgeCAD.ui.modal('Performance & Browser Info', html);
          break;
        case 'about':
          global.ForgeCAD.ui.modal('About ForgeCAD', this._aboutHTML());
          break;
      }
    },

    _aboutHTML: function () {
      return '<p><strong>ForgeCAD</strong> v1.0 — a lightweight Tinkercad-inspired 3D modeler & circuit simulator, designed to run on extremely low-end devices (under 1GB RAM) and old browsers (down to Safari 7 / 2013).</p>' +
             '<p style="margin-top:8px;"><strong>Features:</strong></p>' +
             '<ul style="margin-left:24px;line-height:1.6;">' +
             '<li>3D Design: 11 primitive shapes (box, sphere, cylinder, cone, torus, wedge, roof, text, polygon, tube, heart)</li>' +
             '<li>Boolean operations: visual solid/hole mode + grouping</li>' +
             '<li>Transform: move, rotate, scale (with W/E/R shortcuts)</li>' +
             '<li>Circuits: breadboard, 10 component types, wire routing, live simulation</li>' +
             '<li>Export: STL (binary), OBJ, GLTF, PNG snapshot</li>' +
             '<li>Save/Load: project JSON import/export</li>' +
             '<li>Adaptive performance: auto-scales quality based on device RAM, CPU cores, and sustained FPS</li>' +
             '<li>Theme: Pro CAD dark + light mode (persisted)</li>' +
             '<li>Responsive: desktop, tablet, mobile (touch gestures)</li>' +
             '</ul>' +
             '<p style="margin-top:12px;font-size:11px;color:#6b7280;">Built with Three.js r128 (WebGL 1) + SVG (circuits). No backend. All data stays in your browser.</p>';
    }
  };

  global.ForgeCAD = global.ForgeCAD || {};
  global.ForgeCAD.app = app;

  // Boot
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { app.init(); });
  } else {
    app.init();
  }

})(typeof window !== 'undefined' ? window : this);
