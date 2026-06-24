/* ============================================================
   ForgeCAD — tutorial.js
   Interactive step-by-step tutorials for 3D Design and Circuits.
   Tutorials overlay a spotlight on the target element and show
   a popover with instructions + Next/Prev/Skip buttons.
   ============================================================ */
(function (global) {
  'use strict';

  var tutorial = {
    active: false,
    currentStep: 0,
    currentTutorial: null,
    _overlay: null,
    _popover: null,
    _spotlight: null,
    _dismissHandler: null,

    tutorials: {
      '3d-basics': {
        title: '3D Design Basics',
        mode: '3d',
        steps: [
          {
            target: '.shape-btn[data-shape="box"]',
            title: 'Step 1 / 7 — Add a shape',
            body: 'Click the "Box" button in the left panel to add a 3D box to the scene. You can also try sphere, cylinder, cone, torus, and more.',
            action: null
          },
          {
            target: '#canvas-3d',
            title: 'Step 2 / 7 — Select an object',
            body: 'Click on the box you just added. A yellow wireframe bounding box will appear around it, and the right panel will show its properties.',
            action: null
          },
          {
            target: '#transform-toolbar',
            title: 'Step 3 / 7 — Transform tools',
            body: 'The toolbar at the top center has Move (✥), Rotate (↻), and Scale (⤢) tools. Click Move, or press W on your keyboard.',
            action: null
          },
          {
            target: '#canvas-3d',
            title: 'Step 4 / 7 — Drag to move',
            body: 'With Move tool active, click and drag the selected object to move it on the workplane. The object snaps to 1mm grid.',
            action: null
          },
          {
            target: '#right-panel',
            title: 'Step 5 / 7 — Edit properties',
            body: 'The right panel shows Position, Rotation, Scale, and Dimensions. Type new values to edit precisely. Try changing the X position to 50.',
            action: null
          },
          {
            target: '#viewport-controls',
            title: 'Step 6 / 7 — Camera views',
            body: 'Use the buttons in the top-right corner to switch between Front (F), Top (T), Right (R), and Isometric views. Click [ ] to fit all objects in view.',
            action: null
          },
          {
            target: '#btn-export-menu',
            title: 'Step 7 / 7 — Export your model',
            body: 'When you are done, click Export to download your model as STL (for 3D printing), OBJ, GLTF, or PNG. You can also click "Save" to save the project as a JSON file.',
            action: null
          }
        ]
      },
      'circuits-basics': {
        title: 'Circuits Basics',
        mode: 'circuits',
        steps: [
          {
            target: '.shape-btn[data-component="battery"]',
            title: 'Step 1 / 6 — Add a power source',
            body: 'Click "Battery" in the left panel under "Power" to add a 5V battery to the breadboard.',
            action: null
          },
          {
            target: '.shape-btn[data-component="switch"]',
            title: 'Step 2 / 6 — Add a switch',
            body: 'Click "Switch" to add a switch component. Components are placed in a grid pattern so you can find them easily.',
            action: null
          },
          {
            target: '.shape-btn[data-component="led"]',
            title: 'Step 3 / 6 — Add an LED',
            body: 'Click "LED" under "Load" to add a light-emitting diode. The LED will light up when current flows through it.',
            action: null
          },
          {
            target: '#svg-circuits',
            title: 'Step 4 / 6 — Wire components',
            body: 'Click a blue pin on one component, then click another pin to connect them with a wire. The first pin turns yellow and pulses. Click empty space to cancel. Try connecting: Battery + → Switch a → Switch b → LED + → LED − → Battery −.',
            action: null
          },
          {
            target: '#wire-style-select',
            title: 'Step 5 / 6 — Wire style',
            body: 'Choose between Manhattan (L-shape), Curved (bezier), or Direct (straight) wire routing. Curved wires look nicer for presentations; Manhattan wires are easier to follow.',
            action: null
          },
          {
            target: '#sim-run',
            title: 'Step 6 / 6 — Run the simulation',
            body: 'Select the switch, check the "Closed" box in the properties panel, then click "Run". The wires turn green and the LED lights up red! Click "Stop" to end the simulation.',
            action: null
          }
        ]
      },
      'led-project': {
        title: 'Project: Build an LED Circuit',
        mode: 'circuits',
        steps: [
          {
            target: '.mode-btn[data-mode="circuits"]',
            title: 'Step 1 / 10 — Switch to Circuits mode',
            body: 'Click the "Circuits" tab at the top of the screen. The left panel will change to show circuit components.',
            action: function () {
              global.ForgeCAD.app.setMode('circuits');
            }
          },
          {
            target: '.shape-btn[data-component="battery"]',
            title: 'Step 2 / 10 — Add a battery',
            body: 'Click "Battery" in the left panel under "Power". A 5V battery appears on the breadboard. We will use it as our power source.',
            action: function () {
              global.ForgeCAD.modeCircuits.addComponent('battery');
            }
          },
          {
            target: '.shape-btn[data-component="switch"]',
            title: 'Step 3 / 10 — Add a switch',
            body: 'Click "Switch" to add a toggle switch. This will let us turn the LED on and off.',
            action: function () {
              global.ForgeCAD.modeCircuits.addComponent('switch');
            }
          },
          {
            target: '.shape-btn[data-component="led"]',
            title: 'Step 4 / 10 — Add an LED',
            body: 'Click "LED" under "Load". The LED is our light source. It will glow red when current flows through it.',
            action: function () {
              global.ForgeCAD.modeCircuits.addComponent('led');
            }
          },
          {
            target: '#svg-circuits',
            title: 'Step 5 / 10 — Arrange the components',
            body: 'Drag each component by clicking and holding on its body, then moving your cursor. Arrange them in a row: Battery → Switch → LED. They snap to the grid.',
            action: null
          },
          {
            target: '#svg-circuits',
            title: 'Step 6 / 10 — Connect Battery + to Switch',
            body: 'Click the "+" pin on the battery (the left pin). It turns yellow and pulses. Then click the "a" pin on the switch (its left pin). A wire connects them!',
            action: null
          },
          {
            target: '#svg-circuits',
            title: 'Step 7 / 10 — Connect Switch to LED',
            body: 'Click the "b" pin on the switch (right side). Then click the "+" pin on the LED (left side). Another wire appears.',
            action: null
          },
          {
            target: '#svg-circuits',
            title: 'Step 8 / 10 — Complete the circuit',
            body: 'Finally, click the "−" pin on the LED (right side), then click the "−" pin on the battery. The circuit loop is now complete!',
            action: null
          },
          {
            target: '#right-panel',
            title: 'Step 9 / 10 — Close the switch',
            body: 'Click on the switch to select it. In the right panel, check the "Closed" box. This completes the electrical connection inside the switch.',
            action: null
          },
          {
            target: '#sim-run',
            title: 'Step 10 / 10 — Run the simulation! 🎉',
            body: 'Click "Run" in the left panel. The wires turn green (current flowing!) and the LED glows red with a halo. You built a working circuit! Click "Stop" to end. Try opening the switch to see the LED turn off.',
            action: null
          }
        ]
      },
      'house-3d-project': {
        title: 'Project: Build a Simple House',
        mode: '3d',
        steps: [
          {
            target: '.mode-btn[data-mode="3d"]',
            title: 'Step 1 / 6 — Switch to 3D Design',
            body: 'Click the "3D Design" tab. We will build a simple house from primitive shapes.',
            action: function () {
              global.ForgeCAD.app.setMode('3d');
            }
          },
          {
            target: '.shape-btn[data-shape="box"]',
            title: 'Step 2 / 6 — Add the walls',
            body: 'Click "Box" to add the main body of the house. In the right panel, set Size to W=40, H=30, D=40 to make it house-shaped.',
            action: function () {
              global.ForgeCAD.mode3D.addShape('box');
              // Auto-resize via timeout (properties panel takes a frame to render)
              setTimeout(function () {
                var obj = global.ForgeCAD.mode3D.objects[global.ForgeCAD.mode3D.objects.length - 1];
                if (obj) {
                  obj.userData.dimensions = { w: 40, h: 30, d: 40 };
                  global.ForgeCAD.mode3D._rebuildGeometry(obj);
                  global.ForgeCAD.mode3D._refreshPropertyValues();
                }
              }, 100);
            }
          },
          {
            target: '.shape-btn[data-shape="roof"]',
            title: 'Step 3 / 6 — Add the roof',
            body: 'Click "Roof" to add a half-cylinder roof. We will place it on top of the walls.',
            action: function () {
              global.ForgeCAD.mode3D.addShape('roof');
              setTimeout(function () {
                var obj = global.ForgeCAD.mode3D.objects[global.ForgeCAD.mode3D.objects.length - 1];
                if (obj) {
                  obj.userData.dimensions = { w: 44, h: 20, d: 44 };
                  obj.position.y = 35; // sit on top of walls
                  obj.material.color.set('#8B4513'); // brown
                  global.ForgeCAD.mode3D._rebuildGeometry(obj);
                  global.ForgeCAD.mode3D._updateSelectionVisual();
                }
              }, 100);
            }
          },
          {
            target: '.shape-btn[data-shape="box"]',
            title: 'Step 4 / 6 — Add a door',
            body: 'Click "Box" again to add a door. We will make it brown and place it on the front of the house.',
            action: function () {
              global.ForgeCAD.mode3D.addShape('box');
              setTimeout(function () {
                var obj = global.ForgeCAD.mode3D.objects[global.ForgeCAD.mode3D.objects.length - 1];
                if (obj) {
                  obj.userData.dimensions = { w: 8, h: 16, d: 2 };
                  obj.position.set(0, 8, 21);
                  obj.material.color.set('#5C4033');
                  global.ForgeCAD.mode3D._rebuildGeometry(obj);
                  global.ForgeCAD.mode3D._updateSelectionVisual();
                }
              }, 100);
            }
          },
          {
            target: '.shape-btn[data-shape="box"]',
            title: 'Step 5 / 6 — Add windows',
            body: 'Click "Box" one more time for a window. Make it blue and place it beside the door.',
            action: function () {
              global.ForgeCAD.mode3D.addShape('box');
              setTimeout(function () {
                var obj = global.ForgeCAD.mode3D.objects[global.ForgeCAD.mode3D.objects.length - 1];
                if (obj) {
                  obj.userData.dimensions = { w: 8, h: 8, d: 2 };
                  obj.position.set(-14, 18, 21);
                  obj.material.color.set('#87CEEB');
                  global.ForgeCAD.mode3D._rebuildGeometry(obj);
                  global.ForgeCAD.mode3D._updateSelectionVisual();
                }
              }, 100);
            }
          },
          {
            target: '#viewport-controls [data-view="iso"]',
            title: 'Step 6 / 6 — Admire your house! 🏠',
            body: 'Click the iso (isometric) view button to see your house from an angle. You can drag empty space to orbit. Try adding a second window, a chimney, or trees to make it your own!',
            action: function () {
              global.ForgeCAD.mode3D.setView('iso');
            }
          }
        ]
      }
    },

    /* ---------- PUBLIC API ---------- */
    start: function (tutorialId) {
      if (!this.tutorials[tutorialId]) {
        global.ForgeCAD.ui.toast('Tutorial not found: ' + tutorialId);
        return;
      }
      this.currentTutorial = tutorialId;
      this.currentStep = 0;
      this.active = true;
      this._buildOverlay();
      this._showStep();
    },

    startForCurrentMode: function () {
      // Show a picker modal so users can choose between basic + project tutorials
      this.showPicker();
    },

    showPicker: function () {
      var self = this;
      var html = '<p style="margin-bottom:14px;color:#9aa3b2;font-size:13px;">Choose a tutorial. Each one walks you through the app step-by-step with a spotlight on the relevant buttons.</p>';
      // Build list of tutorials
      var tutorialList = [
        { id: '3d-basics', name: '3D Design Basics', desc: '7 steps · Learn shapes, selection, transform, properties, camera, export', mode: '3D' },
        { id: 'circuits-basics', name: 'Circuits Basics', desc: '6 steps · Learn components, wiring, wire styles, simulation', mode: 'Circ' },
        { id: 'led-project', name: '🔧 Project: Build an LED Circuit', desc: '10 steps · Build a working battery + switch + LED circuit from scratch', mode: 'Circ' },
        { id: 'house-3d-project', name: '🏠 Project: Build a Simple House', desc: '6 steps · Build a 3D house with walls, roof, door, and windows', mode: '3D' }
      ];
      for (var i = 0; i < tutorialList.length; i++) {
        var t = tutorialList[i];
        html += '<div class="tut-item" data-tid="' + t.id + '" style="padding:12px;border:1px solid #353f4f;border-radius:6px;margin-bottom:8px;cursor:pointer;display:flex;align-items:center;gap:12px;">';
        html += '<div style="width:40px;height:40px;display:flex;align-items:center;justify-content:center;background:#2a3340;border-radius:4px;font-size:18px;color:#3b82f6;">' + (t.mode === '3D' ? '⬢' : '⚡') + '</div>';
        html += '<div style="flex:1;">';
        html += '<div style="font-weight:600;font-size:13px;color:#e4e7ec;">' + t.name + '</div>';
        html += '<div style="font-size:11px;color:#6b7280;margin-top:2px;">' + t.desc + '</div>';
        html += '</div>';
        html += '<div style="font-size:18px;color:#3b82f6;">→</div>';
        html += '</div>';
      }
      global.ForgeCAD.ui.modal('📚 Tutorials', html);
      // Bind clicks
      var items = document.querySelectorAll('.tut-item');
      for (var j = 0; j < items.length; j++) {
        items[j].addEventListener('click', function (ev) {
          var tid = ev.currentTarget.getAttribute('data-tid');
          global.ForgeCAD.ui.modalClose();
          // Slight delay to let modal close
          setTimeout(function () {
            // Switch to the appropriate mode first
            var tut = self.tutorials[tid];
            if (tut && tut.mode === 'circuits') global.ForgeCAD.app.setMode('circuits');
            else if (tut && tut.mode === '3d') global.ForgeCAD.app.setMode('3d');
            self.start(tid);
          }, 200);
        });
      }
    },

    next: function () {
      if (!this.active) return;
      var tut = this.tutorials[this.currentTutorial];
      if (this.currentStep < tut.steps.length - 1) {
        this.currentStep++;
        this._showStep();
      } else {
        this.end();
      }
    },

    prev: function () {
      if (!this.active) return;
      if (this.currentStep > 0) {
        this.currentStep--;
        this._showStep();
      }
    },

    end: function () {
      this.active = false;
      this.currentTutorial = null;
      this.currentStep = 0;
      if (this._overlay) { this._overlay.parentNode.removeChild(this._overlay); this._overlay = null; }
      if (this._popover) { this._popover.parentNode.removeChild(this._popover); this._popover = null; }
      if (this._spotlight) { this._spotlight.parentNode.removeChild(this._spotlight); this._spotlight = null; }
      if (this._dismissHandler) {
        document.removeEventListener('keydown', this._dismissHandler);
        this._dismissHandler = null;
      }
    },

    /* ---------- INTERNAL ---------- */
    _buildOverlay: function () {
      // Backdrop dims the rest of the page
      this._overlay = document.createElement('div');
      this._overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:500;pointer-events:auto;';
      document.body.appendChild(this._overlay);

      // Spotlight — a transparent hole in the overlay that follows the target
      this._spotlight = document.createElement('div');
      this._spotlight.style.cssText = 'position:fixed;border:2px solid #fbbf24;border-radius:6px;box-shadow:0 0 0 9999px rgba(0,0,0,0.6);pointer-events:none;z-index:501;transition:all 0.3s ease;';
      document.body.appendChild(this._spotlight);

      // Popover with step text and buttons
      this._popover = document.createElement('div');
      this._popover.style.cssText = 'position:fixed;background:#1e2530;color:#c8cdd6;border:1px solid #353f4f;border-radius:8px;padding:16px;width:320px;max-width:90vw;z-index:502;box-shadow:0 8px 32px rgba(0,0,0,0.5);font-family:inherit;font-size:13px;line-height:1.5;';
      document.body.appendChild(this._popover);

      // Click on overlay (not popover) does nothing — user must use buttons
      var self = this;
      this._dismissHandler = function (ev) {
        if (ev.key === 'Escape') self.end();
        else if (ev.key === 'ArrowRight') self.next();
        else if (ev.key === 'ArrowLeft') self.prev();
      };
      document.addEventListener('keydown', this._dismissHandler);
    },

    _showStep: function () {
      var tut = this.tutorials[this.currentTutorial];
      var step = tut.steps[this.currentStep];
      var self = this;

      // Execute the step's action (e.g., switch mode, add a component)
      if (step.action) {
        try { step.action(); } catch (e) { console.warn('[tutorial] action failed:', e); }
      }

      // Find target element
      var targetEl = null;
      if (step.target) {
        try { targetEl = document.querySelector(step.target); } catch (e) { targetEl = null; }
      }

      // Position spotlight on target
      if (targetEl) {
        var rect = targetEl.getBoundingClientRect();
        var pad = 4;
        this._spotlight.style.left = (rect.left - pad) + 'px';
        this._spotlight.style.top = (rect.top - pad) + 'px';
        this._spotlight.style.width = (rect.width + pad * 2) + 'px';
        this._spotlight.style.height = (rect.height + pad * 2) + 'px';
        this._spotlight.style.display = 'block';
        // Scroll target into view if needed
        if (rect.top < 0 || rect.bottom > window.innerHeight || rect.left < 0 || rect.right > window.innerWidth) {
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
        }
      } else {
        // No target — center the spotlight off-screen
        this._spotlight.style.display = 'none';
      }

      // Build popover content
      var isLast = this.currentStep === tut.steps.length - 1;
      var isFirst = this.currentStep === 0;
      var html = '';
      html += '<div style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#fbbf24;margin-bottom:6px;font-weight:600;">' + tut.title + '</div>';
      html += '<div style="font-size:14px;font-weight:600;margin-bottom:8px;color:#e4e7ec;">' + step.title + '</div>';
      html += '<div style="margin-bottom:14px;">' + step.body + '</div>';
      html += '<div style="display:flex;justify-content:space-between;align-items:center;">';
      html += '<span style="font-size:11px;color:#6b7280;">' + (this.currentStep + 1) + ' of ' + tut.steps.length + '</span>';
      html += '<div>';
      html += '<button id="tut-skip" style="background:transparent;border:1px solid #353f4f;color:#9aa3b2;padding:6px 12px;border-radius:4px;font-size:12px;cursor:pointer;margin-right:6px;">Skip</button>';
      if (!isFirst) {
        html += '<button id="tut-prev" style="background:transparent;border:1px solid #353f4f;color:#c8cdd6;padding:6px 12px;border-radius:4px;font-size:12px;cursor:pointer;margin-right:6px;">← Prev</button>';
      }
      html += '<button id="tut-next" style="background:#3b82f6;border:1px solid #2563eb;color:#fff;padding:6px 14px;border-radius:4px;font-size:12px;cursor:pointer;font-weight:600;">' + (isLast ? 'Finish ✓' : 'Next →') + '</button>';
      html += '</div></div>';
      this._popover.innerHTML = html;

      // Position popover near target (or center if no target)
      if (targetEl) {
        var tRect = targetEl.getBoundingClientRect();
        var popW = 320, popH = 200;  // approximate
        var placeBelow = tRect.bottom + popH < window.innerHeight;
        var placeRight = tRect.right + popW < window.innerWidth;
        var top, left;
        if (placeBelow) {
          top = tRect.bottom + 12;
        } else if (tRect.top - popH - 12 > 0) {
          top = tRect.top - popH - 12;
        } else {
          top = Math.max(12, (window.innerHeight - popH) / 2);
        }
        if (placeRight) {
          left = tRect.right + 12;
        } else if (tRect.left - popW - 12 > 0) {
          left = tRect.left - popW - 12;
        } else {
          left = Math.max(12, (window.innerWidth - popW) / 2);
        }
        this._popover.style.top = top + 'px';
        this._popover.style.left = left + 'px';
      } else {
        this._popover.style.top = '50%';
        this._popover.style.left = '50%';
        this._popover.style.transform = 'translate(-50%, -50%)';
      }

      // Bind buttons
      document.getElementById('tut-next').addEventListener('click', function () { self.next(); });
      document.getElementById('tut-skip').addEventListener('click', function () { self.end(); });
      var prevBtn = document.getElementById('tut-prev');
      if (prevBtn) prevBtn.addEventListener('click', function () { self.prev(); });
    }
  };

  global.ForgeCAD = global.ForgeCAD || {};
  global.ForgeCAD.tutorial = tutorial;

})(typeof window !== 'undefined' ? window : this);
