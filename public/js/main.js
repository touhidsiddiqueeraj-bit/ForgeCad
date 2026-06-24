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
      // Initialize storage (async, but don't block)
      if (global.ForgeCAD.storage) {
        global.ForgeCAD.storage.init(function (ok) {
          if (ok) console.log('[ForgeCAD] IndexedDB initialized');
          // Try to load autosave on startup
          self._tryAutoLoad();
        });
      }
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
      this._bindCircuitsToolbar();
      this._bindMultiSelectToggle();
      this._startAutoSave();
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

    /* ---------- Autosave ---------- */
    _autoSaveTimer: null,
    _startAutoSave: function () {
      var self = this;
      // Save every 30 seconds
      this._autoSaveTimer = setInterval(function () {
        self._doAutoSave();
      }, 30000);
      // Also save when user leaves the page
      window.addEventListener('beforeunload', function () {
        self._doAutoSave();
      });
    },
    _doAutoSave: function () {
      if (!global.ForgeCAD.storage) return;
      var data;
      try {
        if (this.currentMode === '3d') data = global.ForgeCAD.mode3D.serialize();
        else data = global.ForgeCAD.modeCircuits.serialize();
        data.name = document.getElementById('proj-name').value || 'Untitled Project';
        data.timestamp = Date.now();
        global.ForgeCAD.storage.autoSave(data, function (err) {
          if (err) console.warn('[ForgeCAD] autosave failed:', err);
        });
      } catch (e) {
        console.warn('[ForgeCAD] autosave serialize error:', e);
      }
    },
    _tryAutoLoad: function () {
      if (!global.ForgeCAD.storage) return;
      var self = this;
      global.ForgeCAD.storage.loadAutoSave(function (err, data) {
        if (err || !data) return;
        // Only restore if there are objects/components to restore
        if (data.objects && data.objects.length > 0) {
          var doRestore = confirm('Found auto-saved work from "' + (data.name || 'Untitled') + '" (' + new Date(data.timestamp).toLocaleString() + '). Restore it?');
          if (doRestore) {
            if (data.mode === 'circuits') {
              self.setMode('circuits');
              global.ForgeCAD.modeCircuits.deserialize(data);
            } else {
              self.setMode('3d');
              global.ForgeCAD.mode3D.deserialize(data);
            }
            if (data.name) document.getElementById('proj-name').value = data.name;
            global.ForgeCAD.ui.toast('Restored auto-saved work');
          }
        }
      });
    },

    /* ---------- Projects manager ---------- */
    showProjectsModal: function () {
      var self = this;
      global.ForgeCAD.storage.listProjects(function (err, list) {
        if (err) {
          global.ForgeCAD.ui.toast('Error listing projects: ' + err.message);
          return;
        }
        var html = '';
        // Header with stats + Save current button
        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">';
        html += '<strong>' + (list.length) + ' saved project' + (list.length !== 1 ? 's' : '') + '</strong>';
        html += '<button class="tb-btn primary" id="proj-save-current" style="font-size:12px;">Save Current Scene</button>';
        html += '</div>';
        if (list.length === 0) {
          html += '<div style="text-align:center;padding:24px;color:#6b7280;">No saved projects yet.<br>Click "Save Current Scene" to save your work to the browser.</div>';
        } else {
          html += '<div style="max-height:50vh;overflow-y:auto;border:1px solid ' + (global.ForgeCAD.theme.current === 'dark' ? '#353f4f' : '#d1d5db') + ';border-radius:4px;">';
          for (var i = 0; i < list.length; i++) {
            var p = list[i];
            html += '<div class="project-item" data-pid="' + p.id + '" style="display:flex;align-items:center;padding:8px 12px;border-bottom:1px solid ' + (global.ForgeCAD.theme.current === 'dark' ? '#2a3340' : '#e5e7eb') + ';gap:12px;">';
            // Thumbnail or icon
            if (p.thumbnail) {
              html += '<img src="' + p.thumbnail + '" style="width:48px;height:48px;object-fit:cover;border-radius:4px;border:1px solid #353f4f;" alt="">';
            } else {
              var icon = p.mode === 'circuits' ? '⚡' : '⬢';
              html += '<div style="width:48px;height:48px;display:flex;align-items:center;justify-content:center;background:' + (global.ForgeCAD.theme.current === 'dark' ? '#2a3340' : '#f3f4f6') + ';border-radius:4px;font-size:24px;">' + icon + '</div>';
            }
            // Name + meta
            html += '<div style="flex:1;min-width:0;">';
            html += '<div style="font-weight:600;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(p.name) + '</div>';
            html += '<div style="font-size:11px;color:#6b7280;margin-top:2px;">' + (p.mode === 'circuits' ? 'Circuits' : '3D Design') + ' · ' + global.ForgeCAD.storage.formatSize(p.size) + ' · ' + global.ForgeCAD.storage.formatDate(p.ts) + '</div>';
            html += '</div>';
            // Actions
            html += '<button class="tb-btn proj-load" data-pid="' + p.id + '" style="font-size:11px;padding:4px 8px;">Load</button>';
            html += '<button class="tb-btn proj-rename" data-pid="' + p.id + '" style="font-size:11px;padding:4px 8px;">Rename</button>';
            html += '<button class="tb-btn proj-delete" data-pid="' + p.id + '" style="font-size:11px;padding:4px 8px;color:#e74c3c;">Delete</button>';
            html += '</div>';
          }
          html += '</div>';
        }
        // Storage stats
        html += '<div id="storage-stats" style="margin-top:12px;font-size:11px;color:#6b7280;text-align:center;"></div>';
        global.ForgeCAD.ui.modal('📁 My Projects', html);

        // Bind buttons
        var saveBtn = document.getElementById('proj-save-current');
        if (saveBtn) saveBtn.addEventListener('click', function () { self._saveCurrentToProjects(); });

        var loadBtns = document.querySelectorAll('.proj-load');
        for (var j = 0; j < loadBtns.length; j++) {
          loadBtns[j].addEventListener('click', function (ev) {
            var pid = parseInt(ev.currentTarget.getAttribute('data-pid'), 10);
            self._loadProjectById(pid);
          });
        }
        var renameBtns = document.querySelectorAll('.proj-rename');
        for (var k = 0; k < renameBtns.length; k++) {
          renameBtns[k].addEventListener('click', function (ev) {
            var pid = parseInt(ev.currentTarget.getAttribute('data-pid'), 10);
            self._renameProjectById(pid);
          });
        }
        var deleteBtns = document.querySelectorAll('.proj-delete');
        for (var m = 0; m < deleteBtns.length; m++) {
          deleteBtns[m].addEventListener('click', function (ev) {
            var pid = parseInt(ev.currentTarget.getAttribute('data-pid'), 10);
            self._deleteProjectById(pid);
          });
        }

        // Show storage stats
        if (global.ForgeCAD.storage.stats) {
          global.ForgeCAD.storage.stats(function (stats) {
            var statsEl = document.getElementById('storage-stats');
            if (statsEl) {
              var s = 'Backend: ' + stats.backend + ' · ' + stats.projectCount + ' projects · ' + global.ForgeCAD.storage.formatSize(stats.totalSize);
              if (stats.quota) {
                s += ' · ' + global.ForgeCAD.storage.formatSize(stats.usage) + ' / ' + global.ForgeCAD.storage.formatSize(stats.quota) + ' used';
              }
              statsEl.textContent = s;
            }
          });
        }
      });
    },

    _saveCurrentToProjects: function () {
      var self = this;
      var name = document.getElementById('proj-name').value || 'Untitled Project';
      var data;
      if (this.currentMode === '3d') data = global.ForgeCAD.mode3D.serialize();
      else data = global.ForgeCAD.modeCircuits.serialize();
      data.name = name;
      data.timestamp = Date.now();
      // Capture thumbnail (3D only)
      var thumbnail = null;
      if (this.currentMode === '3d') {
        try {
          var canvas = document.getElementById('canvas-3d');
          thumbnail = canvas.toDataURL('image/png');
          // Resize to small thumbnail (48x48) via temp canvas
          var tmp = document.createElement('canvas');
          tmp.width = 48; tmp.height = 48;
          var tctx = tmp.getContext('2d');
          var img = new Image();
          img.onload = function () {
            tctx.drawImage(img, 0, 0, 48, 48);
            var thumb = tmp.toDataURL('image/png');
            finishSave(thumb);
          };
          img.src = thumbnail;
          return;
        } catch (e) { /* fall through */ }
      }
      finishSave(null);

      function finishSave(thumb) {
        var meta = { name: name, mode: self.currentMode, thumbnail: thumb };
        global.ForgeCAD.storage.saveProject(meta, data, function (err, newId) {
          if (err) {
            global.ForgeCAD.ui.toast('Save failed: ' + err.message);
          } else {
            global.ForgeCAD.ui.toast('Saved as "' + name + '"');
            global.ForgeCAD.ui.modalClose();
            // Refresh the modal
            setTimeout(function () { self.showProjectsModal(); }, 300);
          }
        });
      }
    },

    _loadProjectById: function (id) {
      var self = this;
      global.ForgeCAD.storage.loadProject(id, function (err, proj) {
        if (err || !proj) {
          global.ForgeCAD.ui.toast('Load failed: ' + (err ? err.message : 'not found'));
          return;
        }
        var data = proj.data;
        if (data.mode === 'circuits') {
          self.setMode('circuits');
          global.ForgeCAD.modeCircuits.deserialize(data);
        } else {
          self.setMode('3d');
          global.ForgeCAD.mode3D.deserialize(data);
        }
        document.getElementById('proj-name').value = proj.name || 'Untitled';
        global.ForgeCAD.ui.modalClose();
        global.ForgeCAD.ui.toast('Loaded "' + proj.name + '"');
      });
    },

    _renameProjectById: function (id) {
      var self = this;
      var newName = prompt('Enter new name:');
      if (!newName) return;
      global.ForgeCAD.storage.renameProject(id, newName, function (err) {
        if (err) global.ForgeCAD.ui.toast('Rename failed: ' + err.message);
        else {
          global.ForgeCAD.ui.toast('Renamed');
          self.showProjectsModal();
        }
      });
    },

    _deleteProjectById: function (id) {
      var self = this;
      global.ForgeCAD.ui.confirm('Delete this project?', function () {
        global.ForgeCAD.storage.deleteProject(id, function (err) {
          if (err) global.ForgeCAD.ui.toast('Delete failed: ' + err.message);
          else {
            global.ForgeCAD.ui.toast('Deleted');
            self.showProjectsModal();
          }
        });
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
      var circuitsToolbar = document.getElementById('circuits-toolbar');
      var leftPanelTitle = document.getElementById('left-panel-title');
      // Show/hide help hint variant
      var hint3D = document.querySelector('.help-hint-3d');
      var hintC = document.querySelector('.help-hint-circuits');
      if (mode === '3d') {
        if (canvas3D) canvas3D.style.display = 'block';
        if (canvasC) canvasC.className += ' hidden';
        if (transformToolbar) transformToolbar.style.display = 'flex';
        if (circuitsToolbar) circuitsToolbar.style.display = 'none';
        if (leftPanelTitle) { leftPanelTitle.innerHTML = ''; leftPanelTitle.appendChild(document.createTextNode('Shapes')); }
        if (hint3D) hint3D.className = hint3D.className.replace(/\bhidden\b/g, '').trim();
        if (hintC && hintC.className.indexOf('hidden') === -1) hintC.className += ' hidden';
        global.ForgeCAD.mode3D.populateShapePanel();
        global.ForgeCAD.mode3D._resizeRenderer();
      } else {
        if (canvas3D) canvas3D.style.display = 'none';
        if (canvasC) canvasC.className = canvasC.className.replace(/\bhidden\b/g, '').trim();
        if (transformToolbar) transformToolbar.style.display = 'none';
        if (circuitsToolbar) circuitsToolbar.style.display = 'flex';
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
      // Projects button (IndexedDB)
      var projectsBtn = document.getElementById('btn-projects');
      if (projectsBtn) {
        projectsBtn.addEventListener('click', function () { self.showProjectsModal(); });
      }
      // Tutorial button
      var tutBtn = document.getElementById('btn-tutorial');
      if (tutBtn) {
        tutBtn.addEventListener('click', function () {
          global.ForgeCAD.tutorial.startForCurrentMode();
        });
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

    _bindCircuitsToolbar: function () {
      var self = this;
      var btns = document.querySelectorAll('.ct-btn');
      for (var i = 0; i < btns.length; i++) {
        btns[i].addEventListener('click', function (ev) {
          var tool = ev.currentTarget.getAttribute('data-ctool');
          var mc = global.ForgeCAD.modeCircuits;
          if (tool === 'zoomin') mc.zoomIn();
          else if (tool === 'zoomout') mc.zoomOut();
          else if (tool === 'zoomfit') mc.zoomFit();
          else if (tool === 'rotate') {
            if (mc.selected) {
              var comp = mc._findComponent(mc.selected);
              if (comp) {
                comp.rotation += Math.PI / 2;
                mc._renderComponent(comp);
                mc._showProperties(comp.id);
              }
            } else {
              global.ForgeCAD.ui.toast('Select a component first');
            }
          } else if (tool === 'duplicate') {
            if (mc.selected) {
              mc._duplicateSelected();
            } else {
              global.ForgeCAD.ui.toast('Select a component first');
            }
          } else if (tool === 'delete') {
            if (mc.selected) {
              mc.deleteComponent(mc.selected);
            } else {
              global.ForgeCAD.ui.toast('Select a component first');
            }
          } else if (tool === 'select') {
            // Update active state
            var allBtns = document.querySelectorAll('.ct-btn[data-ctool="select"]');
            for (var j = 0; j < allBtns.length; j++) {
              allBtns[j].className = allBtns[j].className.replace(/\bactive\b/g, '').trim();
            }
            ev.currentTarget.className += ' active';
          }
        });
      }
      // Prevent context menu on SVG (right-click is used for pan)
      var svg = document.getElementById('svg-circuits');
      if (svg) {
        svg.addEventListener('contextmenu', function (ev) { ev.preventDefault(); });
      }
    },

    _bindMultiSelectToggle: function () {
      // The "multi" button in the 3D transform toolbar toggles multi-select mode.
      // When ON, clicking objects adds them to the selection (no shift needed).
      var multiBtn = document.querySelector('.tt-btn[data-tool="multi"]');
      if (multiBtn) {
        multiBtn.addEventListener('click', function (ev) {
          var m3d = global.ForgeCAD.mode3D;
          m3d.multiSelectMode = !m3d.multiSelectMode;
          if (m3d.multiSelectMode) {
            multiBtn.className = multiBtn.className.replace(/\bactive\b/g, '').trim() + ' active';
            global.ForgeCAD.ui.status('Multi-select ON — click objects to add to selection. Click again to toggle off.');
          } else {
            multiBtn.className = multiBtn.className.replace(/\bactive\b/g, '').trim();
            global.ForgeCAD.ui.status('Multi-select OFF');
          }
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
        // Delete key — delete selected wire in circuits mode
        if ((ev.key === 'Delete' || ev.key === 'Backspace') && self.currentMode === 'circuits') {
          if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
          var mc = global.ForgeCAD.modeCircuits;
          if (mc.selectedWire) {
            ev.preventDefault();
            mc.deleteWire(mc.selectedWire);
          }
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
             '<li>Circuits: breadboard, 10 component types, 3 wire routing styles (Manhattan, bezier, direct), live simulation</li>' +
             '<li>Export: STL (binary), OBJ, GLTF, PNG snapshot</li>' +
             '<li>Save/Load: IndexedDB project library with thumbnails + JSON file import/export</li>' +
             '<li>Auto-save: every 30 seconds to a special slot, restored on next visit</li>' +
             '<li>Tutorials: interactive step-by-step walkthroughs for both modes (click ? in top bar)</li>' +
             '<li>Adaptive performance: auto-scales quality based on device RAM, CPU cores, and sustained FPS</li>' +
             '<li>Theme: Pro CAD dark + light mode (persisted)</li>' +
             '<li>Responsive: desktop, tablet, mobile (touch gestures)</li>' +
             '</ul>' +
             '<p style="margin-top:12px;font-size:11px;color:#6b7280;">Built with Three.js r128 (WebGL 1) + SVG (circuits). No backend. All data stays in your browser.</p>';
    }
  };

  // HTML escape helper
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  global.ForgeCAD = global.ForgeCAD || {};
  global.ForgeCAD.app = app;

  // Boot
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { app.init(); });
  } else {
    app.init();
  }

})(typeof window !== 'undefined' ? window : this);
