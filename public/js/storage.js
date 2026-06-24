/* ============================================================
   ForgeCAD — storage.js
   IndexedDB-based project persistence with multi-project storage.
   Falls back to localStorage on browsers without IndexedDB.
   Provides:
     - saveProject(meta, data)     → saves with auto-incrementing id
     - listProjects()              → returns array of {id, name, mode, ts, thumbnail}
     - loadProject(id)             → returns full project data
     - deleteProject(id)           → removes a project
     - renameProject(id, newName)  → updates name
     - autoSave(data)              → saves to a special "current" slot
     - loadAutoSave()              → loads the "current" slot
   ============================================================ */
(function (global) {
  'use strict';

  var DB_NAME = 'forgecad';
  var DB_VERSION = 1;
  var STORE_PROJECTS = 'projects';   // named projects (user saves)
  var STORE_AUTOSAVE = 'autosave';   // single slot for current work
  var storage = {
    useIndexedDB: false,
    _db: null,
    _localStorageFallback: false,
    _lsKey: 'forgecad-projects',  // for fallback

    /* ---------- INIT ---------- */
    init: function (callback) {
      var self = this;
      // Detect IndexedDB
      if (typeof indexedDB !== 'undefined') {
        try {
          var req = indexedDB.open(DB_NAME, DB_VERSION);
          req.onupgradeneeded = function (ev) {
            var db = ev.target.result;
            if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
              var store = db.createObjectStore(STORE_PROJECTS, { keyPath: 'id', autoIncrement: true });
              store.createIndex('name', 'name', { unique: false });
              store.createIndex('ts', 'ts', { unique: false });
              store.createIndex('mode', 'mode', { unique: false });
            }
            if (!db.objectStoreNames.contains(STORE_AUTOSAVE)) {
              db.createObjectStore(STORE_AUTOSAVE, { keyPath: 'slot' });
            }
          };
          req.onsuccess = function (ev) {
            self._db = ev.target.result;
            self.useIndexedDB = true;
            if (callback) callback(true);
          };
          req.onerror = function () {
            self._fallbackToLocalStorage(callback);
          };
        } catch (e) {
          self._fallbackToLocalStorage(callback);
        }
      } else {
        self._fallbackToLocalStorage(callback);
      }
    },

    _fallbackToLocalStorage: function (callback) {
      this._localStorageFallback = true;
      console.warn('[ForgeCAD.storage] IndexedDB unavailable — falling back to localStorage (5MB limit)');
      if (callback) callback(false);
    },

    /* ---------- Helpers ---------- */
    _tx: function (storeName, mode) {
      var tx = this._db.transaction(storeName, mode);
      return tx.objectStore(storeName);
    },

    _lsGetAll: function () {
      try {
        var raw = localStorage.getItem(this._lsKey);
        return raw ? JSON.parse(raw) : [];
      } catch (e) { return []; }
    },
    _lsSetAll: function (arr) {
      try { localStorage.setItem(this._lsKey, JSON.stringify(arr)); return true; }
      catch (e) {
        // Probably quota exceeded
        global.ForgeCAD.ui.toast('Storage full — delete some projects');
        return false;
      }
    },

    /* ---------- SAVE PROJECT ---------- */
    saveProject: function (meta, data, callback) {
      // meta: {name, mode, thumbnail?}
      // data: full scene JSON
      var record = {
        name: meta.name || 'Untitled',
        mode: meta.mode || '3d',
        ts: Date.now(),
        thumbnail: meta.thumbnail || null,  // data URL (optional)
        data: data
      };
      if (this.useIndexedDB) {
        try {
          var store = this._tx(STORE_PROJECTS, 'readwrite');
          var req = store.add(record);
          req.onsuccess = function (ev) {
            if (callback) callback(null, ev.target.result);
          };
          req.onerror = function () { if (callback) callback(new Error('save failed')); };
        } catch (e) { if (callback) callback(e); }
      } else {
        var arr = this._lsGetAll();
        record.id = arr.length > 0 ? (arr[arr.length - 1].id + 1) : 1;
        arr.push(record);
        var ok = this._lsSetAll(arr);
        if (callback) callback(ok ? null : new Error('localStorage full'), record.id);
      }
    },

    /* ---------- LIST PROJECTS (without heavy data) ---------- */
    listProjects: function (callback) {
      if (this.useIndexedDB) {
        try {
          var store = this._tx(STORE_PROJECTS, 'readonly');
          var req = store.getAll();
          req.onsuccess = function (ev) {
            var results = ev.target.result.map(function (r) {
              return {
                id: r.id,
                name: r.name,
                mode: r.mode,
                ts: r.ts,
                thumbnail: r.thumbnail,
                size: r.data ? JSON.stringify(r.data).length : 0
              };
            });
            // Sort newest first
            results.sort(function (a, b) { return b.ts - a.ts; });
            if (callback) callback(null, results);
          };
          req.onerror = function () { if (callback) callback(new Error('list failed')); };
        } catch (e) { if (callback) callback(e); }
      } else {
        var arr = this._lsGetAll();
        var results = arr.map(function (r) {
          return {
            id: r.id,
            name: r.name,
            mode: r.mode,
            ts: r.ts,
            thumbnail: r.thumbnail,
            size: r.data ? JSON.stringify(r.data).length : 0
          };
        });
        results.sort(function (a, b) { return b.ts - a.ts; });
        if (callback) callback(null, results);
      }
    },

    /* ---------- LOAD PROJECT ---------- */
    loadProject: function (id, callback) {
      if (this.useIndexedDB) {
        try {
          var store = this._tx(STORE_PROJECTS, 'readonly');
          var req = store.get(id);
          req.onsuccess = function (ev) {
            var result = ev.target.result;
            if (callback) callback(result ? null : new Error('not found'), result);
          };
          req.onerror = function () { if (callback) callback(new Error('load failed')); };
        } catch (e) { if (callback) callback(e); }
      } else {
        var arr = this._lsGetAll();
        var found = null;
        for (var i = 0; i < arr.length; i++) {
          if (arr[i].id === id) { found = arr[i]; break; }
        }
        if (callback) callback(found ? null : new Error('not found'), found);
      }
    },

    /* ---------- DELETE PROJECT ---------- */
    deleteProject: function (id, callback) {
      if (this.useIndexedDB) {
        try {
          var store = this._tx(STORE_PROJECTS, 'readwrite');
          var req = store.delete(id);
          req.onsuccess = function () { if (callback) callback(null); };
          req.onerror = function () { if (callback) callback(new Error('delete failed')); };
        } catch (e) { if (callback) callback(e); }
      } else {
        var arr = this._lsGetAll();
        var newArr = arr.filter(function (r) { return r.id !== id; });
        this._lsSetAll(newArr);
        if (callback) callback(null);
      }
    },

    /* ---------- RENAME PROJECT ---------- */
    renameProject: function (id, newName, callback) {
      var self = this;
      if (this.useIndexedDB) {
        this.loadProject(id, function (err, proj) {
          if (err || !proj) { if (callback) callback(err || new Error('not found')); return; }
          proj.name = newName;
          try {
            var store = self._tx(STORE_PROJECTS, 'readwrite');
            var req = store.put(proj);
            req.onsuccess = function () { if (callback) callback(null); };
            req.onerror = function () { if (callback) callback(new Error('rename failed')); };
          } catch (e) { if (callback) callback(e); }
        });
      } else {
        var arr = this._lsGetAll();
        for (var i = 0; i < arr.length; i++) {
          if (arr[i].id === id) { arr[i].name = newName; break; }
        }
        this._lsSetAll(arr);
        if (callback) callback(null);
      }
    },

    /* ---------- AUTOSAVE (single-slot current work) ---------- */
    autoSave: function (data, callback) {
      var record = { slot: 'current', data: data, ts: Date.now() };
      if (this.useIndexedDB) {
        try {
          var store = this._tx(STORE_AUTOSAVE, 'readwrite');
          var req = store.put(record);
          req.onsuccess = function () { if (callback) callback(null); };
          req.onerror = function () { if (callback) callback(new Error('autosave failed')); };
        } catch (e) { if (callback) callback(e); }
      } else {
        try {
          localStorage.setItem('forgecad-autosave', JSON.stringify(record));
          if (callback) callback(null);
        } catch (e) { if (callback) callback(e); }
      }
    },

    loadAutoSave: function (callback) {
      if (this.useIndexedDB) {
        try {
          var store = this._tx(STORE_AUTOSAVE, 'readonly');
          var req = store.get('current');
          req.onsuccess = function (ev) {
            var result = ev.target.result;
            if (callback) callback(null, result ? result.data : null);
          };
          req.onerror = function () { if (callback) callback(new Error('autosave load failed')); };
        } catch (e) { if (callback) callback(e); }
      } else {
        try {
          var raw = localStorage.getItem('forgecad-autosave');
          if (raw) {
            var rec = JSON.parse(raw);
            if (callback) callback(null, rec.data);
          } else {
            if (callback) callback(null, null);
          }
        } catch (e) { if (callback) callback(e); }
      }
    },

    /* ---------- STORAGE STATS ---------- */
    stats: function (callback) {
      var self = this;
      var result = { backend: this.useIndexedDB ? 'IndexedDB' : 'localStorage' };
      this.listProjects(function (err, list) {
        result.projectCount = list ? list.length : 0;
        result.totalSize = list ? list.reduce(function (a, p) { return a + (p.size || 0); }, 0) : 0;
        if (navigator.storage && navigator.storage.estimate) {
          navigator.storage.estimate().then(function (est) {
            result.quota = est.quota;
            result.usage = est.usage;
            if (callback) callback(result);
          }).catch(function () { if (callback) callback(result); });
        } else {
          if (callback) callback(result);
        }
      });
    },

    /* ---------- HUMAN FRIENDLY SIZE ---------- */
    formatSize: function (bytes) {
      if (!bytes) return '0 B';
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    },

    formatDate: function (ts) {
      if (!ts) return '';
      var d = new Date(ts);
      var now = new Date();
      var diff = now - d;
      if (diff < 60000) return 'just now';
      if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
      if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
      if (diff < 7 * 86400000) return Math.floor(diff / 86400000) + 'd ago';
      return d.toLocaleDateString();
    }
  };

  global.ForgeCAD = global.ForgeCAD || {};
  global.ForgeCAD.storage = storage;

})(typeof window !== 'undefined' ? window : this);
