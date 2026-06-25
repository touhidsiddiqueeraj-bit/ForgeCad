/* ============================================================
   ForgeCAD — firebase-sync.js
   Cloud project sync via Firebase Auth + Firestore.
   Bridges between local IndexedDB storage and cloud.
   ============================================================ */
(function (global) {
  'use strict';

  var sync = {
    user: null,
    ready: false,
    syncing: false,

    init: function (callback) {
      var self = this;
      // Wait for Firebase to be ready
      if (global._firebaseReady) {
        this._setup();
      } else {
        global.addEventListener('firebase-ready', function () {
          self._setup();
        });
      }
      if (callback) callback();
    },

    _setup: function () {
      var self = this;
      this.ready = true;
      // Listen for auth state changes
      global._firebase.onAuth(function (user) {
        self.user = user;
        self._updateAuthUI();
        if (user) {
          global.ForgeCAD.ui.status('Signed in as ' + (user.displayName || user.uid.substring(0, 8)));
        }
      });
    },

    isLoggedIn: function () {
      return !!this.user;
    },

    signInGoogle: function () {
      var self = this;
      if (!this.ready) {
        global.ForgeCAD.ui.toast('Firebase not ready yet');
        return;
      }
      global.ForgeCAD.ui.status('Signing in with Google...');
      global._firebase.signInGoogle()
        .then(function (result) {
          self.user = result.user;
          self._updateAuthUI();
          global.ForgeCAD.ui.toast('Signed in as ' + (result.user.displayName || 'user'));
        })
        .catch(function (err) {
          global.ForgeCAD.ui.toast('Sign in failed: ' + err.message);
        });
    },

    signInAnonymous: function () {
      var self = this;
      if (!this.ready) {
        global.ForgeCAD.ui.toast('Firebase not ready yet');
        return;
      }
      global.ForgeCAD.ui.status('Signing in anonymously...');
      global._firebase.signInAnon()
        .then(function (result) {
          self.user = result.user;
          self._updateAuthUI();
          global.ForgeCAD.ui.toast('Signed in anonymously');
        })
        .catch(function (err) {
          global.ForgeCAD.ui.toast('Sign in failed: ' + err.message);
        });
    },

    signOut: function () {
      var self = this;
      if (!this.ready) return;
      global._firebase.signOut()
        .then(function () {
          self.user = null;
          self._updateAuthUI();
          global.ForgeCAD.ui.toast('Signed out');
        })
        .catch(function (err) {
          global.ForgeCAD.ui.toast('Sign out failed: ' + err.message);
        });
    },

    _updateAuthUI: function () {
      var btn = document.getElementById('btn-auth');
      if (!btn) return;
      if (this.user) {
        var name = this.user.displayName || this.user.email || 'user';
        var initial = name.charAt(0).toUpperCase();
        btn.innerHTML = '<span style="display:inline-block;width:20px;height:20px;background:#3b82f6;border-radius:50%;text-align:center;line-height:20px;font-size:11px;font-weight:700;margin-right:4px;">' + initial + '</span>' + name.substring(0, 12);
        btn.title = 'Signed in as ' + name + ' — click to sign out';
      } else {
        btn.innerHTML = '🔒 Sign In';
        btn.title = 'Sign in to sync projects across devices';
      }
    },

    /* Save current project to cloud */
    saveToCloud: function (projectData, callback) {
      if (!this.isLoggedIn()) {
        global.ForgeCAD.ui.toast('Sign in first to save to cloud');
        if (callback) callback(new Error('not logged in'));
        return;
      }
      var self = this;
      this.syncing = true;
      global.ForgeCAD.ui.status('Uploading to cloud...');
      var userId = this.user.uid;
      // Check if project already has a cloudId
      var cloudId = projectData.cloudId;
      if (cloudId) {
        global._firebase.updateCloudProject(userId, cloudId, projectData)
          .then(function () {
            self.syncing = false;
            global.ForgeCAD.ui.status('Ready');
            global.ForgeCAD.ui.toast('Updated in cloud');
            if (callback) callback(null, cloudId);
          })
          .catch(function (err) {
            self.syncing = false;
            global.ForgeCAD.ui.status('Ready');
            global.ForgeCAD.ui.toast('Cloud save failed: ' + err.message);
            if (callback) callback(err);
          });
      } else {
        global._firebase.saveCloudProject(userId, projectData)
          .then(function (newId) {
            self.syncing = false;
            global.ForgeCAD.ui.status('Ready');
            global.ForgeCAD.ui.toast('Saved to cloud');
            if (callback) callback(null, newId);
          })
          .catch(function (err) {
            self.syncing = false;
            global.ForgeCAD.ui.status('Ready');
            global.ForgeCAD.ui.toast('Cloud save failed: ' + err.message);
            if (callback) callback(err);
          });
      }
    },

    /* List all cloud projects */
    listCloudProjects: function (callback) {
      if (!this.isLoggedIn()) {
        if (callback) callback(new Error('not logged in'), []);
        return;
      }
      var userId = this.user.uid;
      global._firebase.listCloudProjects(userId)
        .then(function (projects) {
          if (callback) callback(null, projects);
        })
        .catch(function (err) {
          if (callback) callback(err, []);
        });
    },

    /* Load a cloud project */
    loadFromCloud: function (cloudId, callback) {
      if (!this.isLoggedIn()) {
        if (callback) callback(new Error('not logged in'));
        return;
      }
      var userId = this.user.uid;
      global.ForgeCAD.ui.status('Downloading from cloud...');
      global._firebase.getCloudProject(userId, cloudId)
        .then(function (data) {
          global.ForgeCAD.ui.status('Ready');
          if (callback) callback(null, data);
        })
        .catch(function (err) {
          global.ForgeCAD.ui.status('Ready');
          if (callback) callback(err);
        });
    },

    /* Delete a cloud project */
    deleteFromCloud: function (cloudId, callback) {
      if (!this.isLoggedIn()) {
        if (callback) callback(new Error('not logged in'));
        return;
      }
      var userId = this.user.uid;
      global._firebase.deleteCloudProject(userId, cloudId)
        .then(function () {
          if (callback) callback(null);
        })
        .catch(function (err) {
          if (callback) callback(err);
        });
    },

    /* Show the auth modal (login screen) */
    showAuthModal: function () {
      var html = '<div style="padding:20px;text-align:center;">';
      html += '<div style="font-size:32px;margin-bottom:16px;">☁️</div>';
      html += '<h2 style="margin-bottom:8px;">Cloud Sync</h2>';
      html += '<p style="color:#9aa3b2;margin-bottom:20px;">Sign in to sync your projects across devices. Your work stays private — only you can see your projects.</p>';
      html += '<button class="tb-btn primary" id="auth-google" style="width:100%;padding:12px;font-size:14px;margin-bottom:8px;display:flex;align-items:center;justify-content:center;gap:8px;">';
      html += '<svg width="18" height="18" viewBox="0 0 24 24"><path fill="#fff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#fff" opacity=".8" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#fff" opacity=".6" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#fff" opacity=".9" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>';
      html += 'Continue with Google</button>';
      html += '<button class="tb-btn" id="auth-anon" style="width:100%;padding:12px;font-size:14px;margin-bottom:16px;">Sign in anonymously</button>';
      html += '<p style="font-size:11px;color:#6b7280;line-height:1.4;">By signing in, your projects will be synced to the cloud and accessible from any device. You can sign out anytime.</p>';
      html += '</div>';
      global.ForgeCAD.ui.modal('Cloud Sync', html);
      var self = this;
      document.getElementById('auth-google').addEventListener('click', function () {
        global.ForgeCAD.ui.modalClose();
        self.signInGoogle();
      });
      document.getElementById('auth-anon').addEventListener('click', function () {
        global.ForgeCAD.ui.modalClose();
        self.signInAnonymous();
      });
    }
  };

  global.ForgeCAD = global.ForgeCAD || {};
  global.ForgeCAD.sync = sync;

})(typeof window !== 'undefined' ? window : this);
