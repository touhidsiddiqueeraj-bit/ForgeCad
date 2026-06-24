/* ============================================================
   ForgeCAD — mode-3d.js
   3D Design mode:
     - Scene setup (renderer, camera, lights, grid, workplane)
     - Primitives: box, sphere, cylinder, cone, torus, wedge, text, roof, polygon
     - Selection (click), multi-select (shift-click)
     - Transform: move / rotate / scale via on-screen gizmo
     - Boolean flags: solid / hole (visual); group / ungroup
     - Properties panel (position, rotation, scale, color, dimensions)
     - Camera presets: front / top / right / iso / fit
     - Snap-to-grid (1mm by default)
     - Mobile touch (orbit, pinch zoom, two-finger pan)
     - Adaptive quality (from compat.tier)
     - Save / load to JSON
   ============================================================ */
(function (global) {
  'use strict';

  var mode3D = {
    // THREE objects
    renderer: null,
    scene: null,
    camera: null,
    controls: null,
    raycaster: null,
    gridHelper: null,
    workplane: null,

    // State
    objects: [],              // array of Mesh
    selected: [],             // array of selected Mesh
    hoverObj: null,
    transformMode: 'move',    // 'move' | 'rotate' | 'scale'
    isHoleMode: false,        // when true, newly added shapes are holes
    snapEnabled: true,
    snapSize: 1,              // 1 mm
    tool: 'move',
    multiSelectMode: false,  // toggle via toolbar button — no shift needed

    // Animation
    animating: false,
    lastFrameTime: 0,
    fpsAccum: 0,
    fpsFrames: 0,

    // Internal
    _canvas: null,
    _pointerDown: null,
    _pointerMoved: false,
    _objectsGroup: null,      // group node containing all meshes
    _bboxHelper: null,
    _themeClear: { dark: 0x2a323e, light: 0xe5e7eb },
    _themeGrid: { dark: 0x3a4452, light: 0xb8bec7 },

    /* ==================== INIT ==================== */
    init: function () {
      var compat = global.ForgeCAD.compat;
      this._canvas = document.getElementById('canvas-3d');
      if (!this._canvas || !global.THREE) {
        global.ForgeCAD.ui.toast('3D mode unavailable: Three.js missing');
        return;
      }

      // Renderer
      try {
        var rendererOpts = {
          antialias: compat.enableAntialias,
          alpha: false,
          preserveDrawingBuffer: true   // for PNG export
        };
        this.renderer = new THREE.WebGLRenderer(rendererOpts);
      } catch (e) {
        // WebGL init failed — would need canvas2D fallback (not implemented for 3D)
        global.ForgeCAD.ui.toast('WebGL init failed: ' + e.message);
        return;
      }
      this.renderer.setPixelRatio(compat.pixelRatioCap);
      this._resizeRenderer();
      // Insert the renderer's canvas right after the original, then remove
      // the original. Keeping both around with id="canvas-3d" creates
      // duplicate IDs which breaks event handling and CSS targeting.
      var originalCanvas = this._canvas;
      this._canvas.parentNode.insertBefore(this.renderer.domElement, originalCanvas);
      this.renderer.domElement.id = 'canvas-3d';
      originalCanvas.id = 'canvas-3d-original';
      originalCanvas.parentNode.removeChild(originalCanvas);
      this._canvas = this.renderer.domElement;

      // Scene
      this.scene = new THREE.Scene();
      this._applyThemeColors();

      // Camera (perspective)
      var aspect = this._canvas.clientWidth / Math.max(1, this._canvas.clientHeight);
      this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 10000);
      this.camera.position.set(150, 120, 180);
      this.camera.lookAt(0, 0, 0);

      // Controls (orbit)
      if (THREE.OrbitControls) {
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = false; // disable for low-end perf
        this.controls.target.set(0, 0, 0);
        this.controls.minDistance = 10;
        this.controls.maxDistance = 2000;
      }

      // Lights
      var amb = new THREE.AmbientLight(0xffffff, 0.55);
      this.scene.add(amb);
      var dir = new THREE.DirectionalLight(0xffffff, 0.7);
      dir.position.set(100, 200, 100);
      this.scene.add(dir);
      var dir2 = new THREE.DirectionalLight(0xffffff, 0.3);
      dir2.position.set(-100, 80, -100);
      this.scene.add(dir2);
      if (compat.enableShadows) {
        dir.castShadow = true;
        this.renderer.shadowMap.enabled = true;
      }

      // Grid + workplane
      this.gridHelper = new THREE.GridHelper(400, 80, this._themeGrid[global.ForgeCAD.theme.current], this._themeGrid[global.ForgeCAD.theme.current]);
      this.gridHelper.material.opacity = 0.4;
      this.gridHelper.material.transparent = true;
      this.scene.add(this.gridHelper);

      // Workplane (transparent plane for raycasting)
      var planeGeo = new THREE.PlaneGeometry(2000, 2000);
      var planeMat = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });
      this.workplane = new THREE.Mesh(planeGeo, planeMat);
      this.workplane.rotation.x = -Math.PI / 2;
      this.workplane.visible = false; // invisible but raycastable
      this.workplane.name = '__workplane__';
      this.scene.add(this.workplane);

      // Group for all user objects
      this._objectsGroup = new THREE.Group();
      this._objectsGroup.name = '__objects__';
      this.scene.add(this._objectsGroup);

      // Raycaster
      this.raycaster = new THREE.Raycaster();
      this._pointer = new THREE.Vector2();

      // Axes (small triad in corner)
      this._addAxesTriad();

      // Selection outline (a wireframe box we move to selection)
      var boxGeo = new THREE.BoxGeometry(1, 1, 1);
      var boxMat = new THREE.MeshBasicMaterial({ color: 0x3b82f6, wireframe: true, transparent: true, opacity: 0.8 });
      this._bboxHelper = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
        new THREE.LineBasicMaterial({ color: 0xfbbf24, linewidth: 2, transparent: true, opacity: 0.95, depthTest: false })
      );
      this._bboxHelper.renderOrder = 999; // draw on top
      this._bboxHelper.visible = false;
      this.scene.add(this._bboxHelper);

      // Axis gizmo — 3 colored arrows (X=red, Y=green, Z=blue) that appear on
      // the selected object. Click an arrow to constrain drag to that axis.
      this._gizmo = this._buildGizmo();
      this._gizmo.visible = false;
      this.scene.add(this._gizmo);
      this._activeAxis = null;  // 'x' | 'y' | 'z' | null

      // Bind events
      this._bindEvents();
      this._bindShapeButtons();

      // Resize observer (manual)
      window.addEventListener('resize', this._onResize.bind(this));

      // Start render loop
      this._startLoop();

      global.ForgeCAD.ui.setPerf(compat.tier);
    },

    _applyThemeColors: function () {
      if (!this.scene) return;
      var t = global.ForgeCAD.theme.current;
      this.scene.background = new THREE.Color(this._themeClear[t]);
      if (this.gridHelper && this.gridHelper.material) {
        // GridHelper has two materials (center + grid)
        // Easier: rebuild it
        var newGrid = new THREE.GridHelper(400, 80, this._themeGrid[t], this._themeGrid[t]);
        newGrid.material.opacity = 0.4;
        newGrid.material.transparent = true;
        if (this.gridHelper.parent) {
          this.gridHelper.parent.remove(this.gridHelper);
          this.gridHelper.geometry.dispose();
        }
        this.gridHelper = newGrid;
        this.scene.add(this.gridHelper);
      }
    },

    onThemeChange: function (/* newTheme */) {
      this._applyThemeColors();
    },

    _addAxesTriad: function () {
      // Small axes drawn at world origin (X red, Y green, Z blue)
      var make = function (color, dir) {
        var geo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(0, 0, 0), dir
        ]);
        var mat = new THREE.LineBasicMaterial({ color: color });
        return new THREE.Line(geo, mat);
      };
      this.scene.add(make(0xff5555, new THREE.Vector3(40, 0, 0)));
      this.scene.add(make(0x55ff55, new THREE.Vector3(0, 40, 0)));
      this.scene.add(make(0x5599ff, new THREE.Vector3(0, 0, 40)));
    },

    /* ==================== RESIZE ==================== */
    _resizeRenderer: function () {
      if (!this.renderer || !this._canvas) return;
      var w = this._canvas.clientWidth || this._canvas.parentNode.clientWidth;
      var h = this._canvas.clientHeight || this._canvas.parentNode.clientHeight;
      this.renderer.setSize(w, h, false);
      if (this.camera) {
        this.camera.aspect = w / Math.max(1, h);
        this.camera.updateProjectionMatrix();
      }
    },

    _onResize: function () {
      this._resizeRenderer();
    },

    /* ==================== RENDER LOOP ==================== */
    _startLoop: function () {
      this.animating = true;
      this.lastFrameTime = Date.now();
      var self = this;
      function frame() {
        if (!self.animating) return;
        var now = Date.now();
        var dt = now - self.lastFrameTime;
        self.lastFrameTime = now;
        // FPS tracking (rolling)
        self.fpsAccum += dt;
        self.fpsFrames++;
        if (self.fpsAccum >= 1000) {
          var fps = (self.fpsFrames * 1000) / self.fpsAccum;
          global.ForgeCAD.ui.setFps(fps);
          self._adaptPerformance(fps);
          self.fpsAccum = 0;
          self.fpsFrames = 0;
        }
        if (self.controls) self.controls.update();
        self.renderer.render(self.scene, self.camera);
        global.requestAnimationFrame(frame);
      }
      global.requestAnimationFrame(frame);
    },

    _adaptPerformance: function (fps) {
      // Require sustained low FPS (3 consecutive sub-15 readings) before downgrading.
      // This prevents transient hiccups (scene init, garbage collection, tab switch)
      // from permanently dropping a capable machine to low tier.
      var compat = global.ForgeCAD.compat;
      if (fps < 15) {
        this._lowFpsCount = (this._lowFpsCount || 0) + 1;
      } else {
        this._lowFpsCount = 0;
      }
      // Only downgrade if we've seen 3 consecutive low FPS readings AND the device
      // isn't clearly high-tier (>=8GB RAM + >=4 cores). High-tier machines get the
      // benefit of the doubt — one bad frame shouldn't cripple them.
      var isHighTierHardware = compat.deviceMemoryMB >= 8192 && compat.hardwareConcurrency >= 4;
      var threshold = isHighTierHardware ? 6 : 3;  // high-tier needs 6 consecutive low readings
      if (this._lowFpsCount >= threshold && compat.tier !== 'low') {
        compat.tier = 'low';
        compat.maxObjects = Math.max(50, compat.maxObjects - 100);
        compat.enableShadows = false;
        compat.enableAntialias = false;
        compat.meshDetail = 'low';
        if (this.renderer) this.renderer.shadowMap.enabled = false;
        if (this.renderer) this.renderer.setPixelRatio(1);
        global.ForgeCAD.ui.setPerf('low (auto)');
      }
    },

    render: function () {
      if (this.renderer && this.scene && this.camera) {
        this.renderer.render(this.scene, this.camera);
      }
    },

    /* ==================== EVENTS ==================== */
    _bindEvents: function () {
      var dom = this.renderer.domElement;
      var self = this;

      // Drag state
      this._dragCandidate = null;     // raycast hit on pointer down
      this._dragging = false;
      this._dragTarget = null;        // object being dragged
      this._dragStartRotation = { x: 0, y: 0, z: 0 };
      this._dragStartScale = { x: 1, y: 1, z: 1 };
      this._dragStartPos = { x: 0, y: 0, z: 0 };
      this._dragHitPoint = null;      // world point where ray hit the object
      this._dragWorkY = 0;            // Y of the workplane for this drag

      // Reusable temp objects (avoid GC)
      this._tmpVec = new THREE.Vector3();
      this._tmpPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

      var getNDC = function (clientX, clientY) {
        var rect = dom.getBoundingClientRect();
        return {
          x: ((clientX - rect.left) / rect.width) * 2 - 1,
          y: -((clientY - rect.top) / rect.height) * 2 + 1
        };
      };

      var raycastObjects = function (ndc) {
        self._pointer.set(ndc.x, ndc.y);
        self.raycaster.setFromCamera(self._pointer, self.camera);
        // recursive=true so we hit meshes inside groups too
        return self.raycaster.intersectObjects(self.objects, true);
      };

      var onDown = function (clientX, clientY, ev) {
        self._pointerDown = { x: clientX, y: clientY };
        self._pointerMoved = false;
        self._dragCandidate = null;
        self._dragging = false;
        self._activeAxis = null;
        self._shiftKey = !!(ev && ev.shiftKey);

        // Skip right-click (let context menu show)
        if (ev && ev.button !== undefined && ev.button !== 0) return;

        var ndc = getNDC(clientX, clientY);

        // First: check if we clicked a gizmo handle (axis arrow)
        if (self._gizmo && self._gizmo.visible && self.selected.length === 1) {
          self._pointer.set(ndc.x, ndc.y);
          self.raycaster.setFromCamera(self._pointer, self.camera);
          var gizmoHits = self.raycaster.intersectObjects(self._gizmo.children, true);
          for (var gi = 0; gi < gizmoHits.length; gi++) {
            var gh = gizmoHits[gi];
            var w = gh.object;
            while (w && !w.userData.axis) w = w.parent;
            if (w && w.userData.axis) {
              self._activeAxis = w.userData.axis;
              self._dragTarget = self.selected[0];
              self._dragStartRotation = { x: self._dragTarget.rotation.x, y: self._dragTarget.rotation.y, z: self._dragTarget.rotation.z };
              self._dragStartScale = { x: self._dragTarget.scale.x, y: self._dragTarget.scale.y, z: self._dragTarget.scale.z };
              self._dragStartPos = { x: self._dragTarget.position.x, y: self._dragTarget.position.y, z: self._dragTarget.position.z };
              self._dragHitPoint = gh.point.clone();
              if (self.controls) self.controls.enabled = false;
              return;
            }
          }
        }

        var hits = raycastObjects(ndc);
        if (hits.length > 0) {
          var hit = hits[0];
          self._dragCandidate = hit;
          self._dragHitPoint = hit.point.clone();

          // Determine drag target (mesh, or its parent group if grouped)
          var target = hit.object;
          // Find tracked object by walking up the parent chain
          var trackedTarget = null;
          var walker = hit.object;
          while (walker) {
            for (var i = 0; i < self.objects.length; i++) {
              if (self.objects[i] === walker) { trackedTarget = self.objects[i]; break; }
            }
            if (trackedTarget) break;
            walker = walker.parent;
          }
          target = trackedTarget || hit.object;

          self._dragTarget = target;
          self._dragStartRotation = { x: target.rotation.x, y: target.rotation.y, z: target.rotation.z };
          self._dragStartScale = { x: target.scale.x, y: target.scale.y, z: target.scale.z };
          self._dragStartPos = { x: target.position.x, y: target.position.y, z: target.position.z };
          self._dragWorkY = target.position.y;

          // Disable orbit controls so we can drag without rotating camera.
          // They'll be re-enabled on pointer up.
          if (self.controls) self.controls.enabled = false;
        }
      };

      var onMove = function (clientX, clientY) {
        if (!self._pointerDown) return;
        var dx = clientX - self._pointerDown.x;
        var dy = clientY - self._pointerDown.y;
        if (dx * dx + dy * dy > 16) {
          self._pointerMoved = true;
          // Start dragging if we have either an object candidate OR an active gizmo axis
          if ((self._dragCandidate || self._activeAxis) && !self._dragging) {
            self._dragging = true;
            global.ForgeCAD.ui.status('Dragging — ' + self.tool + (self._activeAxis ? ' (' + self._activeAxis.toUpperCase() + ' axis)' : ''));
          }
          if (self._dragging) {
            self._performDrag(clientX, clientY);
          }
        }
      };

      var onUp = function (clientX, clientY) {
        if (!self._pointerDown) return;
        var wasDragging = self._dragging;
        var wasMoved = self._pointerMoved;
        var shiftKey = self._shiftKey;
        self._pointerDown = null;
        self._pointerMoved = false;
        self._dragCandidate = null;
        self._dragging = false;
        self._shiftKey = false;

        // Re-enable orbit controls
        if (self.controls) self.controls.enabled = true;

        if (!wasDragging && !wasMoved) {
          // Treat as click — select / deselect
          self._handleClickAt(clientX, clientY, shiftKey);
        } else if (wasDragging) {
          // Update properties panel after drag
          self._showProperties();
          global.ForgeCAD.ui.status('Ready');
        }
      };

      // Mouse events — we use pointer events when available (matches what
      // OrbitControls uses), falling back to mouse events for very old browsers.
      // Note: OrbitControls captures pointer events, but mousedown/mouseup
      // still fire alongside pointerdown/pointerup, so we use both for safety.
      var supportsPointer = (typeof window !== 'undefined' && window.PointerEvent);
      if (supportsPointer) {
        dom.addEventListener('pointerdown', function (ev) { onDown(ev.clientX, ev.clientY, ev); });
        // pointermove and pointerup need to be on document since pointer capture
        // may redirect them away from the canvas
        document.addEventListener('pointermove', function (ev) {
          if (self._pointerDown) onMove(ev.clientX, ev.clientY);
        });
        document.addEventListener('pointerup', function (ev) {
          if (self._pointerDown) onUp(ev.clientX, ev.clientY);
        });
        document.addEventListener('pointercancel', function (ev) {
          if (self._pointerDown) onUp(self._pointerDown.x, self._pointerDown.y);
        });
      } else {
        dom.addEventListener('mousedown', function (ev) { onDown(ev.clientX, ev.clientY, ev); });
        document.addEventListener('mousemove', function (ev) {
          if (self._pointerDown) onMove(ev.clientX, ev.clientY);
        });
        document.addEventListener('mouseup', function (ev) {
          if (self._pointerDown) onUp(ev.clientX, ev.clientY);
        });
      }
      // Mouse leave on canvas — end drag gracefully
      dom.addEventListener('mouseleave', function () {
        // Don't end on mouseleave during drag — document listeners handle it
      });

      // Touch (single-finger only; multi-finger goes to OrbitControls for pinch/pan)
      // Touch fires alongside pointer events on most browsers, but we keep these
      // for old WebKit that doesn't fire pointer events.
      if (!supportsPointer) {
        dom.addEventListener('touchstart', function (ev) {
          if (ev.touches.length === 1) onDown(ev.touches[0].clientX, ev.touches[0].clientY, ev);
        }, { passive: true });
        dom.addEventListener('touchmove', function (ev) {
          if (ev.touches.length === 1) onMove(ev.touches[0].clientX, ev.touches[0].clientY);
        }, { passive: true });
        dom.addEventListener('touchend', function (ev) {
          var t = ev.changedTouches[0];
          if (t) onUp(t.clientX, t.clientY);
        }, { passive: true });
      }

      // Keyboard shortcuts
      document.addEventListener('keydown', function (ev) {
        if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
        var k = ev.key.toLowerCase();
        if (k === 'w') self.setTool('move');
        else if (k === 'e') self.setTool('rotate');
        else if (k === 'r') self.setTool('scale');
        else if (k === 'g') self.groupSelected();
        else if (k === 'h') self.toggleHoleSelected();
        else if (k === 'd' && ev.ctrlKey === false && ev.metaKey === false) {
          ev.preventDefault(); self.duplicateSelected();
        }
        else if (ev.key === 'Delete' || ev.key === 'Backspace') {
          if (self.selected.length > 0) { ev.preventDefault(); self.deleteSelected(); }
        } else if (ev.key === 'Escape') {
          self.selected = [];
          self._updateSelectionVisual();
          global.ForgeCAD.ui.clearProperties();
        }
      });

      // Transform toolbar
      var ttBtns = document.querySelectorAll('.tt-btn');
      for (var i = 0; i < ttBtns.length; i++) {
        ttBtns[i].addEventListener('click', function (ev) {
          var t = ev.currentTarget.getAttribute('data-tool');
          if (t === 'move' || t === 'rotate' || t === 'scale') {
            self.setTool(t);
          } else if (t === 'group') self.groupSelected();
          else if (t === 'ungroup') self.ungroupSelected();
          else if (t === 'hole') self.toggleHoleSelected();
          else if (t === 'duplicate') self.duplicateSelected();
          else if (t === 'delete') self.deleteSelected();
        });
      }

      // View controls
      var vcBtns = document.querySelectorAll('.vc-btn');
      for (var j = 0; j < vcBtns.length; j++) {
        vcBtns[j].addEventListener('click', function (ev) {
          var view = ev.currentTarget.getAttribute('data-view');
          self.setView(view);
        });
      }
    },

    /* ==================== DRAG LOGIC ==================== */
    _performDrag: function (clientX, clientY) {
      if (!this._dragTarget) return;
      var target = this._dragTarget;
      var rect = this.renderer.domElement.getBoundingClientRect();
      this._pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      this._pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      this.raycaster.setFromCamera(this._pointer, this.camera);

      if (this.tool === 'move') {
        // If an axis is active (gizmo handle was grabbed), constrain to that axis
        if (this._activeAxis) {
          // Project ray onto a plane that contains the axis and faces the camera
          var axisVec = new THREE.Vector3();
          if (this._activeAxis === 'x') axisVec.set(1, 0, 0);
          else if (this._activeAxis === 'y') axisVec.set(0, 1, 0);
          else axisVec.set(0, 0, 1);
          // Plane normal = cross(axis, camera-to-origin) — gives a plane containing the axis
          var camDir = new THREE.Vector3();
          this.camera.getWorldDirection(camDir);
          var planeNormal = new THREE.Vector3().crossVectors(axisVec, camDir).cross(axisVec).normalize();
          this._tmpPlane.setFromNormalAndCoplanarPoint(planeNormal, this._dragHitPoint);
          if (this.raycaster.ray.intersectPlane(this._tmpPlane, this._tmpVec)) {
            // Project the intersection onto the axis
            var delta = this._tmpVec.clone().sub(this._dragHitPoint);
            var axisDelta = delta.dot(axisVec);
            var newVal = this._dragStartPos[this._activeAxis] + axisDelta;
            if (this.snapEnabled) {
              newVal = Math.round(newVal / this.snapSize) * this.snapSize;
            }
            target.position[this._activeAxis] = newVal;
          }
        } else {
          // Free move on XZ plane (original behavior)
          this._tmpPlane.normal.set(0, 1, 0);
          this._tmpPlane.constant = -this._dragWorkY;
          if (this.raycaster.ray.intersectPlane(this._tmpPlane, this._tmpVec)) {
            var offsetX = this._dragStartPos.x - this._dragHitPoint.x;
            var offsetZ = this._dragStartPos.z - this._dragHitPoint.z;
            var newX = this._tmpVec.x + offsetX;
            var newZ = this._tmpVec.z + offsetZ;
            if (this.snapEnabled) {
              newX = Math.round(newX / this.snapSize) * this.snapSize;
              newZ = Math.round(newZ / this.snapSize) * this.snapSize;
            }
            target.position.x = newX;
            target.position.z = newZ;
            target.position.y = this._dragStartPos.y;
          }
        }
      } else if (this.tool === 'rotate') {
        var dxR = clientX - this._pointerDown.x;
        var dyR = clientY - this._pointerDown.y;
        // Horizontal drag = rotate around Y, vertical = rotate around X
        target.rotation.y = this._dragStartRotation.y + dxR * 0.01;
        target.rotation.x = this._dragStartRotation.x + dyR * 0.01;
      } else if (this.tool === 'scale') {
        var dyS = clientY - this._pointerDown.y;
        // Drag up = bigger, down = smaller
        var factor = 1 - dyS * 0.01;
        factor = Math.max(0.1, Math.min(10, factor));
        target.scale.x = this._dragStartScale.x * factor;
        target.scale.y = this._dragStartScale.y * factor;
        target.scale.z = this._dragStartScale.z * factor;
      }
      this._updateSelectionVisual();
      this._refreshPropertyValues();
    },

    /* ==================== CLICK HANDLER (selection) ==================== */
    // Called from main.js _bindTopBar via app — kept for backward compat
    _handleClick: function (ev) {
      if (ev && ev.clientX !== undefined) {
        this._handleClickAt(ev.clientX, ev.clientY, ev.shiftKey);
      }
    },

    _handleClickAt: function (clientX, clientY, shiftKey) {
      var rect = this.renderer.domElement.getBoundingClientRect();
      this._pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      this._pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      this.raycaster.setFromCamera(this._pointer, this.camera);
      var intersects = this.raycaster.intersectObjects(this.objects, true);
      if (intersects.length > 0) {
        // Walk up to find the top-level user object (mesh or group)
        var hit = intersects[0].object;
        // Find tracked object by walking up the parent chain
        var tracked = null;
        var walker = hit;
        while (walker) {
          for (var j = 0; j < this.objects.length; j++) {
            if (this.objects[j] === walker) { tracked = this.objects[j]; break; }
          }
          if (tracked) break;
          walker = walker.parent;
        }
        if (!tracked) tracked = hit;
        // Multi-select if shift held OR multi-select toggle is on
        var additive = !!shiftKey || !!this.multiSelectMode;
        if (additive) {
          var idx = this.selected.indexOf(tracked);
          if (idx >= 0) this.selected.splice(idx, 1);
          else this.selected.push(tracked);
        } else {
          this.selected = [tracked];
        }
        this._updateSelectionVisual();
        this._showProperties();
        global.ForgeCAD.ui.status('Selected: ' + (tracked.userData.name || tracked.userData.shapeType || 'object'));
      } else {
        // Click empty space — clear selection (unless shift or multi-select mode)
        if (!shiftKey && !this.multiSelectMode) {
          this.selected = [];
          this._updateSelectionVisual();
          global.ForgeCAD.ui.clearProperties();
        }
      }
    },

    _bindShapeButtons: function () {
      // Delegated click handler — buttons are created dynamically
      var self = this;
      var body = document.getElementById('left-panel-body');
      if (!body) return;
      body.addEventListener('click', function (ev) {
        var btn = ev.target.closest ? ev.target.closest('[data-shape]') : null;
        if (!btn) return;
        var shape = btn.getAttribute('data-shape');
        self.addShape(shape);
      });
    },

    populateShapePanel: function () {
      var body = document.getElementById('left-panel-body');
      if (!body) return;
      var html = '';
      html += '<div class="shape-section-label">Basic</div>';
      html += '<div class="shape-grid">';
      html += this._shapeBtn('box', '◼', 'Box');
      html += this._shapeBtn('sphere', '●', 'Sphere');
      html += this._shapeBtn('cylinder', '⬭', 'Cylinder');
      html += this._shapeBtn('cone', '▲', 'Cone');
      html += this._shapeBtn('torus', '◯', 'Torus');
      html += '</div>';
      html += '<div class="shape-section-label">Specialty</div>';
      html += '<div class="shape-grid">';
      html += this._shapeBtn('wedge', '◣', 'Wedge');
      html += this._shapeBtn('roof', '◢', 'Roof');
      html += this._shapeBtn('text', 'T', 'Text');
      html += this._shapeBtn('polygon', '⬠', 'Polygon');
      html += this._shapeBtn('tube', '⌭', 'Tube');
      html += this._shapeBtn('heart', '♥', 'Heart');
      html += '</div>';
      html += '<div class="shape-section-label">Holes</div>';
      html += '<div style="padding:8px 4px;">';
      html += '<button class="tb-btn" id="hole-mode-toggle" style="width:100%;">' + (this.isHoleMode ? 'Hole mode: ON' : 'Hole mode: OFF') + '</button>';
      html += '<p style="font-size:11px;color:#6b7280;margin-top:6px;line-height:1.4;">When ON, new shapes are created as holes (subtracted during export).</p>';
      html += '</div>';
      body.innerHTML = html;
      var self = this;
      var toggle = document.getElementById('hole-mode-toggle');
      if (toggle) {
        toggle.addEventListener('click', function () {
          self.isHoleMode = !self.isHoleMode;
          toggle.innerHTML = self.isHoleMode ? 'Hole mode: ON' : 'Hole mode: OFF';
          if (self.isHoleMode) toggle.className += ' primary';
          else toggle.className = toggle.className.replace(/\bprimary\b/g, '').trim();
        });
      }
    },

    _shapeBtn: function (shape, glyph, label) {
      return '<button class="shape-btn" data-shape="' + shape + '">' +
             '<span class="shape-glyph">' + glyph + '</span>' +
             '<span>' + label + '</span></button>';
    },

    /* ==================== SELECTION ==================== */
    // _handleClick and _handleClickAt are defined above (after _performDrag).
    // Selection logic lives there so drag and click share the same raycast path.

    _buildGizmo: function () {
      // Build 3 arrows (X red, Y green, Z blue). Each arrow is a Group containing
      // a cylinder (shaft), a cone (head), and an invisible cylindrical hit area
      // covering the full length for easy raycasting.
      // The gizmo is built at unit scale and resized in _updateSelectionVisual.
      var gizmo = new THREE.Group();
      gizmo.name = '__gizmo__';
      var axes = [
        { dir: 'x', color: 0xef4444, rot: { x: 0, y: 0, z: -Math.PI / 2 } },
        { dir: 'y', color: 0x22c55e, rot: { x: 0, y: 0, z: 0 } },
        { dir: 'z', color: 0x3b82f6, rot: { x: Math.PI / 2, y: 0, z: 0 } }
      ];
      var shaftLen = 1.0;   // unit length; gizmo scaled per-selection
      var shaftRad = 0.04;
      var headLen = 0.25;
      var headRad = 0.1;
      for (var i = 0; i < axes.length; i++) {
        var a = axes[i];
        var group = new THREE.Group();
        group.userData.axis = a.dir;
        // Shaft
        var shaftGeo = new THREE.CylinderGeometry(shaftRad, shaftRad, shaftLen, 8);
        var shaftMat = new THREE.MeshBasicMaterial({ color: a.color, depthTest: false, transparent: true, opacity: 0.95 });
        var shaft = new THREE.Mesh(shaftGeo, shaftMat);
        shaft.position.y = shaftLen / 2;
        shaft.renderOrder = 1000;
        group.add(shaft);
        // Head (cone)
        var headGeo = new THREE.ConeGeometry(headRad, headLen, 12);
        var headMat = new THREE.MeshBasicMaterial({ color: a.color, depthTest: false, transparent: true, opacity: 0.95 });
        var head = new THREE.Mesh(headGeo, headMat);
        head.position.y = shaftLen + headLen / 2;
        head.renderOrder = 1000;
        group.add(head);
        // Invisible hit cylinder covering full arrow length (for easy raycasting)
        var totalLen = shaftLen + headLen;
        var hitGeo = new THREE.CylinderGeometry(headRad * 1.5, headRad * 1.5, totalLen, 8);
        var hitMat = new THREE.MeshBasicMaterial({ visible: false });
        var hit = new THREE.Mesh(hitGeo, hitMat);
        hit.position.y = totalLen / 2;
        hit.userData.axis = a.dir;
        hit.userData.isGizmoHandle = true;
        group.add(hit);
        // Apply rotation to align with axis
        group.rotation.set(a.rot.x, a.rot.y, a.rot.z);
        gizmo.add(group);
      }
      // Center sphere (origin marker)
      var centerGeo = new THREE.SphereGeometry(0.08, 12, 12);
      var centerMat = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: 0.9 });
      var center = new THREE.Mesh(centerGeo, centerMat);
      center.renderOrder = 1000;
      gizmo.add(center);
      return gizmo;
    },

    _updateSelectionVisual: function () {
      // Walk all nodes (including children of groups) and apply emissive based on
      // whether their root ancestor is in this.selected
      var allNodes = [];
      var collectNodes = function (obj) {
        allNodes.push(obj);
        if (obj.children) {
          for (var i = 0; i < obj.children.length; i++) collectNodes(obj.children[i]);
        }
      };
      for (var k = 0; k < this.objects.length; k++) collectNodes(this.objects[k]);

      // Build a set of selected root objects
      var selectedSet = {};
      for (var s = 0; s < this.selected.length; s++) {
        selectedSet[this.selected[s].uuid] = true;
      }

      // For each node, find its root ancestor in this.objects, check if selected
      for (var i = 0; i < allNodes.length; i++) {
        var node = allNodes[i];
        if (!node.material) continue;
        // Find root ancestor in this.objects
        var root = node;
        var walker = node;
        while (walker) {
          if (selectedSet[walker.uuid]) { root = walker; break; }
          walker = walker.parent;
        }
        var isSel = !!selectedSet[root.uuid];
        if (node.material.emissive) {
          node.material.emissive.setHex(isSel ? 0x3b82f6 : 0x000000);
          node.material.emissiveIntensity = isSel ? 0.6 : 0;
        }
      }

      // Update bbox helper — show for any selection (single or multi)
      if (this.selected.length > 0) {
        var box = new THREE.Box3();
        for (var j = 0; j < this.selected.length; j++) {
          box.expandByObject(this.selected[j]);
        }
        var size = new THREE.Vector3();
        var center = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(center);
        // Pad slightly so bbox is visible outside the mesh
        size.multiplyScalar(1.05);
        if (size.x < 0.1) size.x = 0.1;
        if (size.y < 0.1) size.y = 0.1;
        if (size.z < 0.1) size.z = 0.1;
        this._bboxHelper.scale.copy(size);
        this._bboxHelper.position.copy(center);
        this._bboxHelper.visible = true;
        // Position gizmo at selection center (only for single selection + move tool)
        if (this.selected.length === 1 && this.tool === 'move') {
          this._gizmo.position.copy(center);
          // Scale gizmo to ~60% of the selection's largest dimension
          // (so arrows extend just past the object edge)
          var maxDim = Math.max(size.x, size.y, size.z);
          var gizmoScale = maxDim * 0.6;
          // Don't let it get too tiny or huge
          gizmoScale = Math.max(5, Math.min(80, gizmoScale));
          this._gizmo.scale.set(gizmoScale, gizmoScale, gizmoScale);
          this._gizmo.visible = true;
        } else {
          this._gizmo.visible = false;
        }
      } else {
        this._bboxHelper.visible = false;
        this._gizmo.visible = false;
      }
      global.ForgeCAD.ui.setObjects(this.objects.length);
    },

    /* ==================== PROPERTIES ==================== */
    _showProperties: function () {
      if (this.selected.length === 0) {
        global.ForgeCAD.ui.clearProperties();
        return;
      }
      if (this.selected.length > 1) {
        global.ForgeCAD.ui.setPropertiesTitle('Properties — ' + this.selected.length + ' selected');
        global.ForgeCAD.ui.setPropertiesHTML(
          '<div class="empty-state">' + this.selected.length + ' objects selected.<br><br>' +
          'Press G to group, H to toggle hole, D to duplicate, Delete to remove.' +
          '</div>'
        );
        return;
      }
      var obj = this.selected[0];
      global.ForgeCAD.ui.setPropertiesTitle('Properties — ' + (obj.userData.shapeType || 'object'));
      var p = obj.position, r = obj.rotation, s = obj.scale;
      var dim = obj.userData.dimensions || { w: 20, h: 20, d: 20 };
      var color = obj.material && obj.material.color ? '#' + obj.material.color.getHexString() : '#3b82f6';
      var isHole = obj.userData.isHole === true;

      var html = '';
      html += '<div class="prop-section"><div class="prop-section-title">Position</div>';
      html += global.ForgeCAD.ui.propRow3('Pos', [round1(p.x), round1(p.y), round1(p.z)], ['px','py','pz']);
      html += '</div>';
      html += '<div class="prop-section"><div class="prop-section-title">Rotation (deg)</div>';
      html += global.ForgeCAD.ui.propRow3('Rot', [round1(r.x * 180 / Math.PI), round1(r.y * 180 / Math.PI), round1(r.z * 180 / Math.PI)], ['rx','ry','rz']);
      html += '</div>';
      html += '<div class="prop-section"><div class="prop-section-title">Scale</div>';
      html += global.ForgeCAD.ui.propRow3('Scale', [round2(s.x), round2(s.y), round2(s.z)], ['sx','sy','sz']);
      html += '</div>';
      html += '<div class="prop-section"><div class="prop-section-title">Dimensions (mm)</div>';
      html += global.ForgeCAD.ui.propRow3('Size', [round1(dim.w), round1(dim.h), round1(dim.d)], ['dw','dh','dd']);
      html += '</div>';
      html += '<div class="prop-section"><div class="prop-section-title">Appearance</div>';
      html += '<div class="prop-row"><label>Color</label><div class="color-swatch" id="current-color-swatch" style="background:' + color + ';"></div><input type="text" id="current-color-text" value="' + color + '" style="width:80px;"></div>';
      html += '<div class="prop-row"><div style="margin-left:78px;" id="color-palette"></div></div>';
      html += '<div class="prop-row"><label>Hole</label><input type="checkbox" id="prop-is-hole" ' + (isHole ? 'checked' : '') + ' style="margin-left:0;"></div>';
      html += '</div>';
      global.ForgeCAD.ui.setPropertiesHTML(html);

      // Build color palette
      var palette = ['#e74c3c','#e67e22','#f1c40f','#2ecc71','#1abc9c','#3498db','#9b59b6','#ecf0f1','#95a5a6','#34495e'];
      var palHTML = '';
      for (var i = 0; i < palette.length; i++) {
        palHTML += '<button class="color-swatch-mini" data-color="' + palette[i] + '" style="background:' + palette[i] + ';width:20px;height:20px;border:1px solid #555;border-radius:3px;display:inline-block;margin:2px;cursor:pointer;"></button>';
      }
      var pal = document.getElementById('color-palette');
      if (pal) pal.innerHTML = palHTML;

      // Bind prop inputs
      this._bindPropertyInputs(obj);
    },

    _bindPropertyInputs: function (obj) {
      var self = this;
      // Use 'input' event for live updates as user types, plus 'change' for
      // browsers that don't fire 'input' reliably on number inputs.
      var bind = function (id, key, isNum, mult) {
        var el = document.getElementById(id);
        if (!el) {
          // Fallback: look up by data-prop
          el = document.querySelector('[data-prop="' + id + '"]');
        }
        if (!el) return;
        var handler = function () {
          var v = isNum ? parseFloat(el.value) : el.value;
          if (isNum && isNaN(v)) return;
          self._applyProp(obj, key, v, mult);
        };
        el.addEventListener('input', handler);
        el.addEventListener('change', handler);
      };
      bind('px', 'position.x', true, 1);
      bind('py', 'position.y', true, 1);
      bind('pz', 'position.z', true, 1);
      bind('rx', 'rotation.x', true, Math.PI / 180);
      bind('ry', 'rotation.y', true, Math.PI / 180);
      bind('rz', 'rotation.z', true, Math.PI / 180);
      bind('sx', 'scale.x', true, 1);
      bind('sy', 'scale.y', true, 1);
      bind('sz', 'scale.z', true, 1);
      bind('dw', 'dimensions.w', true, 1);
      bind('dh', 'dimensions.h', true, 1);
      bind('dd', 'dimensions.d', true, 1);

      var colorText = document.getElementById('current-color-text');
      if (colorText) {
        var colorHandler = function () {
          var v = colorText.value.trim();
          if (/^#[0-9a-f]{6}$/i.test(v) || /^#[0-9a-f]{3}$/i.test(v)) {
            obj.material.color.set(v);
            var sw = document.getElementById('current-color-swatch');
            if (sw) sw.style.background = v;
          }
        };
        colorText.addEventListener('input', colorHandler);
        colorText.addEventListener('change', colorHandler);
      }
      var palBtns = document.querySelectorAll('.color-swatch-mini');
      for (var i = 0; i < palBtns.length; i++) {
        palBtns[i].addEventListener('click', function (ev) {
          var c = ev.currentTarget.getAttribute('data-color');
          obj.material.color.set(c);
          var sw = document.getElementById('current-color-swatch');
          if (sw) sw.style.background = c;
          var txt = document.getElementById('current-color-text');
          if (txt) txt.value = c;
        });
      }
      var holeChk = document.getElementById('prop-is-hole');
      if (holeChk) {
        holeChk.addEventListener('change', function () {
          obj.userData.isHole = holeChk.checked;
          self._applyHoleVisual(obj);
        });
      }
    },

    _applyProp: function (obj, key, value, mult) {
      if (!obj) return;
      var parts = key.split('.');
      if (parts[0] === 'position' || parts[0] === 'rotation' || parts[0] === 'scale') {
        obj[parts[0]][parts[1]] = value * (mult || 1);
      } else if (parts[0] === 'dimensions') {
        // userData.dimensions.w / .h / .d
        if (!obj.userData.dimensions) obj.userData.dimensions = { w: 20, h: 20, d: 20 };
        obj.userData.dimensions[parts[1]] = value * (mult || 1);
        // Rebuild geometry with new dimensions
        this._rebuildGeometry(obj);
      } else {
        // Simple property on userData
        obj.userData[parts[0]] = value;
      }
      this._updateSelectionVisual();
      // Don't re-render the properties panel here — it would steal focus
      // from the input the user is typing in. The values will sync on next
      // selection or drag end.
    },

    /* Refresh the values shown in the properties panel to match the
       currently-selected object's state. Called after drag, etc.
       Does NOT rebuild the panel (preserves input focus). */
    _refreshPropertyValues: function () {
      if (this.selected.length !== 1) return;
      var obj = this.selected[0];
      var p = obj.position, r = obj.rotation, s = obj.scale;
      var dim = obj.userData.dimensions || { w: 20, h: 20, d: 20 };
      var setVal = function (id, val) {
        var el = document.getElementById(id);
        if (!el) el = document.querySelector('[data-prop="' + id + '"]');
        if (el && document.activeElement !== el) el.value = val;
      };
      setVal('px', round1(p.x));
      setVal('py', round1(p.y));
      setVal('pz', round1(p.z));
      setVal('rx', round1(r.x * 180 / Math.PI));
      setVal('ry', round1(r.y * 180 / Math.PI));
      setVal('rz', round1(r.z * 180 / Math.PI));
      setVal('sx', round2(s.x));
      setVal('sy', round2(s.y));
      setVal('sz', round2(s.z));
      setVal('dw', round1(dim.w));
      setVal('dh', round1(dim.h));
      setVal('dd', round1(dim.d));
    },

    _rebuildGeometry: function (obj) {
      var type = obj.userData.shapeType;
      var dim = obj.userData.dimensions || { w: 20, h: 20, d: 20 };
      var compat = global.ForgeCAD.compat;
      var seg = compat.getSegments(24);
      var geo = null;
      switch (type) {
        case 'box': geo = new THREE.BoxGeometry(dim.w, dim.h, dim.d); break;
        case 'sphere': geo = new THREE.SphereGeometry(dim.w / 2, Math.max(8, seg), Math.max(6, seg / 2)); break;
        case 'cylinder': geo = new THREE.CylinderGeometry(dim.w / 2, dim.w / 2, dim.h, Math.max(8, seg)); break;
        case 'cone': geo = new THREE.ConeGeometry(dim.w / 2, dim.h, Math.max(8, seg)); break;
        case 'torus': geo = new THREE.TorusGeometry(dim.w / 2, dim.d / 4, Math.max(6, seg / 2), Math.max(8, seg)); break;
        case 'wedge':
          geo = this._wedgeGeometry(dim.w, dim.h, dim.d);
          break;
        case 'roof':
          geo = this._roofGeometry(dim.w, dim.h, dim.d);
          break;
        case 'text':
          // Text uses FontLoader async — skip rebuilding
          return;
        case 'polygon':
          geo = this._polygonGeometry(dim.w, dim.h, 6);
          break;
        case 'tube':
          geo = new THREE.TorusGeometry(dim.w / 2, Math.max(1, dim.d / 8), Math.max(6, seg / 2), Math.max(8, seg));
          break;
        case 'heart':
          geo = this._heartGeometry(dim.w);
          break;
        default: return;
      }
      if (geo) {
        obj.geometry.dispose();
        obj.geometry = geo;
      }
    },

    /* ==================== SHAPE CREATION ==================== */
    addShape: function (type) {
      var compat = global.ForgeCAD.compat;
      if (this.objects.length >= compat.maxObjects) {
        global.ForgeCAD.ui.toast('Max objects reached (' + compat.maxObjects + ') for performance tier');
        return;
      }
      var seg = compat.getSegments(24);
      var geo = null;
      var dim = { w: 20, h: 20, d: 20 };
      switch (type) {
        case 'box': geo = new THREE.BoxGeometry(20, 20, 20); break;
        case 'sphere': geo = new THREE.SphereGeometry(10, Math.max(8, seg), Math.max(6, seg / 2)); break;
        case 'cylinder': geo = new THREE.CylinderGeometry(10, 10, 20, Math.max(8, seg)); break;
        case 'cone': geo = new THREE.ConeGeometry(10, 20, Math.max(8, seg)); break;
        case 'torus': geo = new THREE.TorusGeometry(10, 3, Math.max(6, seg / 2), Math.max(8, seg)); break;
        case 'wedge': geo = this._wedgeGeometry(20, 20, 20); dim = { w: 20, h: 20, d: 20 }; break;
        case 'roof': geo = this._roofGeometry(20, 20, 20); dim = { w: 20, h: 20, d: 20 }; break;
        case 'text': this._addTextShape('Forge'); return;
        case 'polygon': geo = this._polygonGeometry(20, 10, 6); dim = { w: 20, h: 10, d: 20 }; break;
        case 'tube': geo = new THREE.TorusGeometry(10, 2, Math.max(6, seg / 2), Math.max(8, seg)); break;
        case 'heart': geo = this._heartGeometry(20); dim = { w: 20, h: 18, d: 4 }; break;
        default:
          global.ForgeCAD.ui.toast('Unknown shape: ' + type);
          return;
      }
      // Default color
      var color = this.isHoleMode ? 0xe74c3c : 0x3b82f6;
      var mat = new THREE.MeshPhongMaterial({
        color: color,
        flatShading: false,
        transparent: this.isHoleMode,
        opacity: this.isHoleMode ? 0.45 : 1.0
      });
      var mesh = new THREE.Mesh(geo, mat);
      mesh.userData = {
        shapeType: type,
        dimensions: dim,
        isHole: this.isHoleMode,
        name: type + '_' + (this.objects.length + 1)
      };
      // Place at workplane intersection if available, else origin
      mesh.position.set(0, dim.h / 2, 0);
      this._objectsGroup.add(mesh);
      this.objects.push(mesh);
      this.selected = [mesh];
      this._updateSelectionVisual();
      this._showProperties();
      global.ForgeCAD.ui.status('Added ' + type);
      global.ForgeCAD.ui.setObjects(this.objects.length);
    },

    _wedgeGeometry: function (w, h, d) {
      // Right-triangle prism (Tinkercad wedge)
      var geo = new THREE.BufferGeometry();
      var hw = w / 2, hh = h / 2, hd = d / 2;
      var vertices = new Float32Array([
        // front triangle
        -hw, -hh,  hd,   hw, -hh,  hd,   hw,  hh,  hd,
        -hw, -hh,  hd,   hw,  hh,  hd,  -hw,  hh,  hd,
        // back triangle
        -hw, -hh, -hd,   hw,  hh, -hd,   hw, -hh, -hd,
        -hw, -hh, -hd,  -hw,  hh, -hd,   hw,  hh, -hd,
        // bottom
        -hw, -hh,  hd,  -hw, -hh, -hd,   hw, -hh, -hd,
        -hw, -hh,  hd,   hw, -hh, -hd,   hw, -hh,  hd,
        // slope
        -hw,  hh,  hd,   hw,  hh,  hd,   hw,  hh, -hd,
        -hw,  hh,  hd,   hw,  hh, -hd,  -hw,  hh, -hd,
        // left
        -hw, -hh,  hd,  -hw,  hh,  hd,  -hw,  hh, -hd,
        -hw, -hh,  hd,  -hw,  hh, -hd,  -hw, -hh, -hd,
        // right
         hw, -hh,  hd,   hw,  hh, -hd,   hw,  hh,  hd,
         hw, -hh,  hd,   hw, -hh, -hd,   hw,  hh, -hd
      ]);
      geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
      geo.computeVertexNormals();
      return geo;
    },

    _roofGeometry: function (w, h, d) {
      // Half-cylinder roof, centered at origin (y from -h/2 to +h/2).
      // Uses enough segments for a smooth curve regardless of perf tier.
      var seg = global.ForgeCAD.compat.getSegments(24);
      var halfSeg = Math.max(8, Math.floor(seg));  // at least 8 segments for smoothness
      var hw = w / 2, hd = d / 2;
      var positions = [];
      var indices = [];
      // Generate half-cylinder vertices: curve in XY plane, extruded along Z.
      // a goes 0..PI. y = sin(a)*h - h/2 → ranges -h/2 (base) to +h/2 (top).
      for (var i = 0; i <= halfSeg; i++) {
        var a = (i / halfSeg) * Math.PI;
        var x = Math.cos(a) * hw;
        var y = Math.sin(a) * h - h / 2;
        positions.push(x, y, -hd);  // index i*2
        positions.push(x, y,  hd);  // index i*2 + 1
      }
      // Side faces (the curved part) — two triangles per quad
      for (var f = 0; f < halfSeg; f++) {
        var a = f * 2, b = f * 2 + 1, c = (f + 1) * 2, dd = (f + 1) * 2 + 1;
        // Outward-facing winding (CCW when viewed from outside)
        indices.push(a, c, b);
        indices.push(b, c, dd);
      }
      // End caps (flat semi-disc at each end) — fan triangulation from center
      var n = (halfSeg + 1) * 2;
      // Left cap center (z = -hd)
      positions.push(0, -h / 2, -hd);
      var cl = n;
      for (var g = 0; g < halfSeg; g++) {
        var e = g * 2, g2 = (g + 1) * 2;
        // Wind so normal points in -Z (outward for left cap)
        indices.push(cl, g2, e);
      }
      // Right cap center (z = +hd)
      positions.push(0, -h / 2, hd);
      var cr = n + 1;
      for (var gg = 0; gg < halfSeg; gg++) {
        var e2 = gg * 2 + 1, g2b = (gg + 1) * 2 + 1;
        // Wind so normal points in +Z (outward for right cap)
        indices.push(cr, e2, g2b);
      }
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      return geo;
    },

    _polygonGeometry: function (w, h, sides) {
      // Regular n-gon prism
      var positions = [], indices = [];
      var r = w / 2, hd = h / 2;
      var ns = Math.max(3, sides || 6);
      for (var i = 0; i < ns; i++) {
        var a = (i / ns) * Math.PI * 2;
        var x = Math.cos(a) * r, y = Math.sin(a) * r;
        positions.push(x, y, -hd);
        positions.push(x, y,  hd);
      }
      for (var f = 0; f < ns; f++) {
        var a = f * 2, b = f * 2 + 1, c = ((f + 1) % ns) * 2, d = ((f + 1) % ns) * 2 + 1;
        indices.push(a, b, c); indices.push(b, d, c);
      }
      // Caps
      positions.push(0, 0, -hd);
      positions.push(0, 0, hd);
      var cl = ns * 2, cr = ns * 2 + 1;
      for (var g = 0; g < ns; g++) {
        var e = g * 2, g2 = ((g + 1) % ns) * 2;
        indices.push(cl, e, g2);
        indices.push(cr, g2 + 1, e + 1);
      }
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      return geo;
    },

    _heartGeometry: function (w) {
      // Simple heart shape — extruded
      var shape = new THREE.Shape();
      var s = w / 16;
      shape.moveTo(0, 5 * s);
      shape.bezierCurveTo(0, 5 * s, -5 * s, 15 * s, -15 * s, 8 * s);
      shape.bezierCurveTo(-25 * s, 0, -10 * s, -10 * s, 0, -10 * s);
      shape.bezierCurveTo(10 * s, -10 * s, 25 * s, 0, 15 * s, 8 * s);
      shape.bezierCurveTo(5 * s, 15 * s, 0, 5 * s, 0, 5 * s);
      var extr = { depth: w / 5, bevelEnabled: false };
      var geo = new THREE.ExtrudeGeometry(shape, extr);
      geo.center();
      return geo;
    },

    _addTextShape: function (text) {
      var self = this;
      if (!THREE.FontLoader) {
        global.ForgeCAD.ui.toast('FontLoader not available');
        return;
      }
      // Use a built-in Three.js font from CDN
      var fontUrl = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/fonts/helvetiker_regular.typeface.json';
      var loader = new THREE.FontLoader();
      loader.load(fontUrl, function (font) {
        var seg = global.ForgeCAD.compat.getSegments(6);
        var geo = new THREE.TextGeometry(text || 'Text', {
          font: font,
          size: 12,
          height: 3,
          curveSegments: Math.max(2, seg / 4),
          bevelEnabled: false
        });
        geo.center();
        var color = self.isHoleMode ? 0xe74c3c : 0x3b82f6;
        var mat = new THREE.MeshPhongMaterial({
          color: color,
          transparent: self.isHoleMode,
          opacity: self.isHoleMode ? 0.45 : 1.0
        });
        var mesh = new THREE.Mesh(geo, mat);
        mesh.userData = {
          shapeType: 'text',
          dimensions: { w: 20, h: 12, d: 3 },
          isHole: self.isHoleMode,
          name: 'text_' + (self.objects.length + 1),
          text: text || 'Text'
        };
        mesh.position.set(0, 6, 0);
        self._objectsGroup.add(mesh);
        self.objects.push(mesh);
        self.selected = [mesh];
        self._updateSelectionVisual();
        self._showProperties();
        global.ForgeCAD.ui.status('Added text');
      }, undefined, function (err) {
        global.ForgeCAD.ui.toast('Failed to load font: ' + (err && err.message ? err.message : 'network'));
      });
    },

    /* ==================== TRANSFORM ==================== */
    setTool: function (tool) {
      this.tool = tool;
      // Update toolbar active state
      var btns = document.querySelectorAll('.tt-btn[data-tool]');
      for (var i = 0; i < btns.length; i++) {
        var t = btns[i].getAttribute('data-tool');
        if (t === 'move' || t === 'rotate' || t === 'scale') {
          if (t === tool) {
            btns[i].className = btns[i].className.replace(/\bactive\b/g, '').trim() + ' active';
          } else {
            btns[i].className = btns[i].className.replace(/\bactive\b/g, '').trim();
          }
        }
      }
      global.ForgeCAD.ui.status('Tool: ' + tool);
    },

    /* ==================== BOOLEAN OPS ==================== */
    groupSelected: function () {
      if (this.selected.length < 2) {
        global.ForgeCAD.ui.toast('Select 2+ objects to group');
        return;
      }
      var group = new THREE.Group();
      group.userData = { isGroup: true, name: 'group_' + Date.now() };
      // Detach selected from objects group, attach to new group at same world position
      for (var i = 0; i < this.selected.length; i++) {
        var obj = this.selected[i];
        // Preserve world transform
        var wp = new THREE.Vector3();
        var wq = new THREE.Quaternion();
        var ws = new THREE.Vector3();
        obj.updateMatrixWorld();
        obj.matrixWorld.decompose(wp, wq, ws);
        this._objectsGroup.remove(obj);
        group.attach(obj);
      }
      this._objectsGroup.add(group);
      // Remove the grouped children from the objects array and add the group instead
      for (var j = this.objects.length - 1; j >= 0; j--) {
        if (this.selected.indexOf(this.objects[j]) !== -1) {
          this.objects.splice(j, 1);
        }
      }
      this.objects.push(group);
      // Replace selection with group
      this.selected = [group];
      this._updateSelectionVisual();
      global.ForgeCAD.ui.toast('Grouped ' + (group.children.length) + ' objects');
    },

    ungroupSelected: function () {
      if (this.selected.length === 0) {
        global.ForgeCAD.ui.toast('Select a group first');
        return;
      }
      var ungrouped = 0;
      var newSelected = [];
      for (var i = this.selected.length - 1; i >= 0; i--) {
        var obj = this.selected[i];
        if (!obj.userData || !obj.userData.isGroup) continue;
        // Detach children from the group, attach to _objectsGroup at world position
        var children = obj.children.slice();
        for (var j = 0; j < children.length; j++) {
          var child = children[j];
          // Preserve world transform when re-parenting
          obj.remove(child);
          this._objectsGroup.attach(child);
          this.objects.push(child);
          newSelected.push(child);
          ungrouped++;
        }
        // Remove the group itself
        if (obj.parent) obj.parent.remove(obj);
        // Remove group from objects array
        var gidx = this.objects.indexOf(obj);
        if (gidx >= 0) this.objects.splice(gidx, 1);
        // Remove group from selection
        var sidx = this.selected.indexOf(obj);
        if (sidx >= 0) this.selected.splice(sidx, 1);
      }
      if (ungrouped === 0) {
        global.ForgeCAD.ui.toast('Selected object is not a group');
        return;
      }
      // Add newly-ungrouped children to selection
      for (var k = 0; k < newSelected.length; k++) {
        this.selected.push(newSelected[k]);
      }
      this._updateSelectionVisual();
      global.ForgeCAD.ui.toast('Ungrouped ' + ungrouped + ' objects');
    },

    toggleHoleSelected: function () {
      if (this.selected.length === 0) {
        global.ForgeCAD.ui.toast('Select an object first');
        return;
      }
      for (var i = 0; i < this.selected.length; i++) {
        var obj = this.selected[i];
        obj.userData.isHole = !obj.userData.isHole;
        this._applyHoleVisual(obj);
      }
      this._showProperties();
    },

    _applyHoleVisual: function (obj) {
      if (!obj.material) return;
      if (obj.userData.isHole) {
        obj.material.transparent = true;
        obj.material.opacity = 0.45;
        obj.material.color.setHex(0xe74c3c);
      } else {
        obj.material.transparent = false;
        obj.material.opacity = 1.0;
      }
    },

    duplicateSelected: function () {
      if (this.selected.length === 0) return;
      var newSel = [];
      for (var i = 0; i < this.selected.length; i++) {
        var obj = this.selected[i];
        if (obj.userData.isGroup) {
          // Shallow clone group
          var g = obj.clone();
          g.userData = { isGroup: true, name: 'group_' + Date.now() };
          this._objectsGroup.add(g);
          this.objects.push(g);
          newSel.push(g);
        } else {
          var clone = obj.clone();
          clone.material = obj.material.clone();
          clone.position.x += 25;
          clone.userData = JSON.parse(JSON.stringify(obj.userData));
          this._objectsGroup.add(clone);
          this.objects.push(clone);
          newSel.push(clone);
        }
      }
      this.selected = newSel;
      this._updateSelectionVisual();
      this._showProperties();
    },

    deleteSelected: function () {
      if (this.selected.length === 0) return;
      for (var i = 0; i < this.selected.length; i++) {
        var obj = this.selected[i];
        // Remove from objects array (including children if group)
        var toRemove = obj.userData.isGroup ? obj.children : [obj];
        for (var j = 0; j < toRemove.length; j++) {
          var idx = this.objects.indexOf(toRemove[j]);
          if (idx >= 0) this.objects.splice(idx, 1);
        }
        var grpIdx = this.objects.indexOf(obj);
        if (grpIdx >= 0) this.objects.splice(grpIdx, 1);
        // Dispose geometry/material
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) obj.material.dispose();
        if (obj.parent) obj.parent.remove(obj);
      }
      this.selected = [];
      this._updateSelectionVisual();
      global.ForgeCAD.ui.clearProperties();
      global.ForgeCAD.ui.setObjects(this.objects.length);
    },

    /* ==================== CAMERA PRESETS ==================== */
    setView: function (view) {
      if (!this.camera || !this.controls) return;
      var d = 250;
      switch (view) {
        case 'front': this.camera.position.set(0, 0, d); break;
        case 'top':   this.camera.position.set(0, d, 0.001); break;
        case 'right': this.camera.position.set(d, 0, 0); break;
        case 'iso':   this.camera.position.set(d * 0.6, d * 0.5, d * 0.6); break;
        case 'fit':   this._fitView(); return;
      }
      this.camera.lookAt(0, 0, 0);
      this.controls.target.set(0, 0, 0);
      this.controls.update();
    },

    _fitView: function () {
      if (this.objects.length === 0) {
        this.camera.position.set(150, 120, 180);
        this.camera.lookAt(0, 0, 0);
        if (this.controls) { this.controls.target.set(0, 0, 0); this.controls.update(); }
        return;
      }
      var box = new THREE.Box3();
      for (var i = 0; i < this.objects.length; i++) {
        if (this.objects[i].geometry) box.expandByObject(this.objects[i]);
      }
      var size = new THREE.Vector3();
      var center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);
      var maxDim = Math.max(size.x, size.y, size.z);
      var fov = this.camera.fov * Math.PI / 180;
      var dist = (maxDim / 2) / Math.tan(fov / 2) * 1.6;
      this.camera.position.set(center.x + dist * 0.6, center.y + dist * 0.5, center.z + dist * 0.6);
      this.camera.lookAt(center);
      if (this.controls) { this.controls.target.copy(center); this.controls.update(); }
    },

    /* ==================== GRID ==================== */
    toggleGrid: function () {
      if (this.gridHelper) {
        this.gridHelper.visible = !this.gridHelper.visible;
      }
    },

    clearScene: function () {
      var self = this;
      global.ForgeCAD.ui.confirm('Clear all objects?', function () {
        for (var i = 0; i < self.objects.length; i++) {
          var obj = self.objects[i];
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) obj.material.dispose();
          if (obj.parent) obj.parent.remove(obj);
        }
        self.objects = [];
        self.selected = [];
        // Clear groups too
        if (self._objectsGroup) {
          while (self._objectsGroup.children.length > 0) {
            self._objectsGroup.remove(self._objectsGroup.children[0]);
          }
        }
        self._updateSelectionVisual();
        global.ForgeCAD.ui.clearProperties();
        global.ForgeCAD.ui.toast('Scene cleared');
      });
    },

    /* ==================== SAVE / LOAD ==================== */
    serialize: function () {
      var objs = [];
      for (var i = 0; i < this.objects.length; i++) {
        var obj = this.objects[i];
        var o = {
          type: obj.userData.shapeType || 'object',
          name: obj.userData.name || 'object',
          isHole: obj.userData.isHole === true,
          isGroup: obj.userData.isGroup === true,
          position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
          rotation: { x: obj.rotation.x, y: obj.rotation.y, z: obj.rotation.z },
          scale: { x: obj.scale.x, y: obj.scale.y, z: obj.scale.z },
          dimensions: obj.userData.dimensions ? JSON.parse(JSON.stringify(obj.userData.dimensions)) : null,
          color: obj.material && obj.material.color ? '#' + obj.material.color.getHexString() : '#3b82f6',
          text: obj.userData.text || null
        };
        if (obj.userData.isGroup) {
          o.children = [];
          for (var j = 0; j < obj.children.length; j++) {
            var ch = obj.children[j];
            o.children.push({
              type: ch.userData.shapeType || 'object',
              name: ch.userData.name || 'object',
              isHole: ch.userData.isHole === true,
              position: { x: ch.position.x, y: ch.position.y, z: ch.position.z },
              rotation: { x: ch.rotation.x, y: ch.rotation.y, z: ch.rotation.z },
              scale: { x: ch.scale.x, y: ch.scale.y, z: ch.scale.z },
              dimensions: ch.userData.dimensions ? JSON.parse(JSON.stringify(ch.userData.dimensions)) : null,
              color: ch.material && ch.material.color ? '#' + ch.material.color.getHexString() : '#3b82f6',
              text: ch.userData.text || null
            });
          }
        }
        objs.push(o);
      }
      return {
        version: 1,
        mode: '3d',
        objects: objs
      };
    },

    deserialize: function (data) {
      var self = this;
      this.clearScene();
      // Clear immediately since confirm is async
      for (var i = 0; i < this.objects.length; i++) {
        var o = this.objects[i];
        if (o.parent) o.parent.remove(o);
      }
      this.objects = [];
      this.selected = [];
      if (!data || !data.objects) return;
      var remaining = data.objects.length;
      var finalize = function () {
        remaining--;
        if (remaining <= 0) {
          self._updateSelectionVisual();
          global.ForgeCAD.ui.setObjects(self.objects.length);
          global.ForgeCAD.ui.toast('Loaded ' + data.objects.length + ' objects');
        }
      };
      for (var k = 0; k < data.objects.length; k++) {
        this._deserializeOne(data.objects[k], finalize);
      }
    },

    _deserializeOne: function (o, done) {
      var self = this;
      // Recreate based on type
      var afterMesh = function (mesh) {
        mesh.position.set(o.position.x, o.position.y, o.position.z);
        mesh.rotation.set(o.rotation.x, o.rotation.y, o.rotation.z);
        mesh.scale.set(o.scale.x, o.scale.y, o.scale.z);
        mesh.userData = {
          shapeType: o.type,
          dimensions: o.dimensions || { w: 20, h: 20, d: 20 },
          isHole: o.isHole === true,
          name: o.name || (o.type + '_' + (self.objects.length + 1)),
          text: o.text || null
        };
        if (mesh.material && o.color) mesh.material.color.set(o.color);
        self._applyHoleVisual(mesh);
        self._objectsGroup.add(mesh);
        self.objects.push(mesh);
        done();
      };
      if (o.type === 'text') {
        // Async font load
        if (!THREE.FontLoader) { done(); return; }
        var loader = new THREE.FontLoader();
        loader.load('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/fonts/helvetiker_regular.typeface.json',
          function (font) {
            var geo = new THREE.TextGeometry(o.text || 'Text', {
              font: font, size: 12, height: 3, curveSegments: 2, bevelEnabled: false
            });
            geo.center();
            var mat = new THREE.MeshPhongMaterial({ color: o.color || 0x3b82f6 });
            afterMesh(new THREE.Mesh(geo, mat));
          },
          undefined,
          function () { done(); }
        );
        return;
      }
      // Reuse shape creation logic
      var seg = global.ForgeCAD.compat.getSegments(24);
      var dim = o.dimensions || { w: 20, h: 20, d: 20 };
      var geo = null;
      switch (o.type) {
        case 'box': geo = new THREE.BoxGeometry(dim.w, dim.h, dim.d); break;
        case 'sphere': geo = new THREE.SphereGeometry(dim.w / 2, Math.max(8, seg), Math.max(6, seg / 2)); break;
        case 'cylinder': geo = new THREE.CylinderGeometry(dim.w / 2, dim.w / 2, dim.h, Math.max(8, seg)); break;
        case 'cone': geo = new THREE.ConeGeometry(dim.w / 2, dim.h, Math.max(8, seg)); break;
        case 'torus': geo = new THREE.TorusGeometry(dim.w / 2, dim.d / 4, Math.max(6, seg / 2), Math.max(8, seg)); break;
        case 'wedge': geo = self._wedgeGeometry(dim.w, dim.h, dim.d); break;
        case 'roof': geo = self._roofGeometry(dim.w, dim.h, dim.d); break;
        case 'polygon': geo = self._polygonGeometry(dim.w, dim.h, 6); break;
        case 'tube': geo = new THREE.TorusGeometry(dim.w / 2, Math.max(1, dim.d / 8), Math.max(6, seg / 2), Math.max(8, seg)); break;
        case 'heart': geo = self._heartGeometry(dim.w); break;
        default: geo = new THREE.BoxGeometry(dim.w, dim.h, dim.d); break;
      }
      var mat = new THREE.MeshPhongMaterial({ color: o.color || 0x3b82f6 });
      afterMesh(new THREE.Mesh(geo, mat));
    },

    /* ==================== MOBILE ==================== */
    showMobilePanel: function () {
      // Build a bottom sheet with shape buttons + transform tools
      var html = '<div style="padding:8px;">';
      html += '<div style="font-size:11px;text-transform:uppercase;color:#6b7280;margin-bottom:8px;">Add Shape</div>';
      html += '<div style="display:flex;flex-wrap:wrap;">';
      var shapes = [
        ['box','◼ Box'],['sphere','● Sphere'],['cylinder','⬭ Cylinder'],['cone','▲ Cone'],
        ['torus','◯ Torus'],['wedge','◣ Wedge'],['roof','◢ Roof'],['text','T Text'],
        ['polygon','⬠ Polygon'],['tube','⌭ Tube'],['heart','♥ Heart']
      ];
      for (var i = 0; i < shapes.length; i++) {
        html += '<button class="shape-btn" data-shape="' + shapes[i][0] + '" style="width:33%;"><span class="shape-glyph">' + shapes[i][1].split(' ')[0] + '</span><span>' + shapes[i][1].split(' ')[1] + '</span></button>';
      }
      html += '</div>';
      html += '<div style="font-size:11px;text-transform:uppercase;color:#6b7280;margin:12px 0 8px;">Tools</div>';
      html += '<div style="display:flex;gap:4px;flex-wrap:wrap;">';
      html += '<button class="tb-btn" data-tool="move" style="flex:1;">Move</button>';
      html += '<button class="tb-btn" data-tool="rotate" style="flex:1;">Rotate</button>';
      html += '<button class="tb-btn" data-tool="scale" style="flex:1;">Scale</button>';
      html += '<button class="tb-btn" data-tool="group" style="flex:1;">Group</button>';
      html += '<button class="tb-btn" data-tool="hole" style="flex:1;">Hole</button>';
      html += '<button class="tb-btn" data-tool="duplicate" style="flex:1;">Dup</button>';
      html += '<button class="tb-btn" data-tool="delete" style="flex:1;">Del</button>';
      html += '</div>';
      html += '</div>';
      global.ForgeCAD.ui.bottomSheetToggle(html);
      // Bind buttons in sheet
      var self = this;
      var sheet = document.getElementById('bottom-sheet');
      if (!sheet) return;
      var btns = sheet.querySelectorAll('[data-shape]');
      for (var j = 0; j < btns.length; j++) {
        btns[j].addEventListener('click', function (ev) {
          self.addShape(ev.currentTarget.getAttribute('data-shape'));
        });
      }
      var toolBtns = sheet.querySelectorAll('[data-tool]');
      for (var k = 0; k < toolBtns.length; k++) {
        toolBtns[k].addEventListener('click', function (ev) {
          var t = ev.currentTarget.getAttribute('data-tool');
          if (t === 'move' || t === 'rotate' || t === 'scale') self.setTool(t);
          else if (t === 'group') self.groupSelected();
          else if (t === 'hole') self.toggleHoleSelected();
          else if (t === 'duplicate') self.duplicateSelected();
          else if (t === 'delete') self.deleteSelected();
        });
      }
    }
  };

  // Helpers
  function round1(v) { return Math.round(v * 10) / 10; }
  function round2(v) { return Math.round(v * 100) / 100; }

  global.ForgeCAD = global.ForgeCAD || {};
  global.ForgeCAD.mode3D = mode3D;

})(typeof window !== 'undefined' ? window : this);
