/* ============================================================
   ForgeCAD — mode-circuits.js
   Circuits mode (SVG-based for max compatibility with low-end):
     - Breadboard grid (SVG)
     - Components: LED, resistor, battery, switch, button, buzzer,
       wire, Arduino (visual), potentiometer, capacitor
     - Wire connections (click component pin -> click another pin)
     - Basic DC simulation (battery voltage, resistor divider,
       LED on/off based on current direction)
     - Component properties (value, color for LED)
     - Save / load to JSON
   ============================================================ */
(function (global) {
  'use strict';

  var modeC = {
    svg: null,
    ns: 'http://www.w3.org/2000/svg',
    components: [],
    selected: null,
    wires: [],
    wireStartPin: null,    // pending wire connection
    pins: [],              // { id, component, x, y }
    gridSpacing: 20,
    gridOffsetX: 40,
    gridOffsetY: 40,
    gridCols: 30,
    gridRows: 20,

    /* ==================== INIT ==================== */
    init: function () {
      this.svg = document.getElementById('svg-circuits');
      if (!this.svg) return;
      this._drawBreadboard();
      this._bindEvents();
      this._populatePanel();
    },

    _drawBreadboard: function () {
      var svg = this.svg;
      // Clear
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      // Background
      var bg = document.createElementNS(this.ns, 'rect');
      bg.setAttribute('x', 0);
      bg.setAttribute('y', 0);
      bg.setAttribute('width', '100%');
      bg.setAttribute('height', '100%');
      bg.setAttribute('class', 'circuits-grid-bg');
      svg.appendChild(bg);
      // Holes
      var holesGroup = document.createElementNS(this.ns, 'g');
      for (var r = 0; r < this.gridRows; r++) {
        for (var c = 0; c < this.gridCols; c++) {
          var cx = this.gridOffsetX + c * this.gridSpacing;
          var cy = this.gridOffsetY + r * this.gridSpacing;
          var h = document.createElementNS(this.ns, 'circle');
          h.setAttribute('cx', cx);
          h.setAttribute('cy', cy);
          h.setAttribute('r', 2);
          h.setAttribute('class', 'circuits-hole');
          holesGroup.appendChild(h);
        }
      }
      svg.appendChild(holesGroup);
      // Power rails (top + bottom)
      var railTop = document.createElementNS(this.ns, 'line');
      railTop.setAttribute('x1', this.gridOffsetX);
      railTop.setAttribute('y1', this.gridOffsetY - 12);
      railTop.setAttribute('x2', this.gridOffsetX + (this.gridCols - 1) * this.gridSpacing);
      railTop.setAttribute('y2', this.gridOffsetY - 12);
      railTop.setAttribute('stroke', '#e74c3c');
      railTop.setAttribute('stroke-width', 2);
      railTop.setAttribute('opacity', 0.5);
      svg.appendChild(railTop);
      var railBot = document.createElementNS(this.ns, 'line');
      railBot.setAttribute('x1', this.gridOffsetX);
      railBot.setAttribute('y1', this.gridOffsetY + this.gridRows * this.gridSpacing + 12);
      railBot.setAttribute('x2', this.gridOffsetX + (this.gridCols - 1) * this.gridSpacing);
      railBot.setAttribute('y2', this.gridOffsetY + this.gridRows * this.gridSpacing + 12);
      railBot.setAttribute('stroke', '#3498db');
      railBot.setAttribute('stroke-width', 2);
      railBot.setAttribute('opacity', 0.5);
      svg.appendChild(railBot);
      // Labels
      var labelP = document.createElementNS(this.ns, 'text');
      labelP.setAttribute('x', 8);
      labelP.setAttribute('y', this.gridOffsetY - 8);
      labelP.setAttribute('fill', '#e74c3c');
      labelP.setAttribute('font-size', '10');
      labelP.textContent = '+';
      svg.appendChild(labelP);
      var labelG = document.createElementNS(this.ns, 'text');
      labelG.setAttribute('x', 8);
      labelG.setAttribute('y', this.gridOffsetY + this.gridRows * this.gridSpacing + 18);
      labelG.setAttribute('fill', '#3498db');
      labelG.setAttribute('font-size', '10');
      labelG.textContent = '−';
      svg.appendChild(labelG);
    },

    _populatePanel: function () {
      var body = document.getElementById('left-panel-body');
      if (!body) return;
      var groups = [
        { label: 'Power', items: [['battery','Battery'],['button','Button'],['switch','Switch']] },
        { label: 'Load', items: [['led','LED'],['buzzer','Buzzer']] },
        { label: 'Passive', items: [['resistor','Resistor'],['pot','Potentiometer'],['capacitor','Capacitor']] },
        { label: 'Logic', items: [['arduino','Arduino (visual)']] },
        { label: 'Wire', items: [['wire','Wire']] }
      ];
      var html = '';
      for (var i = 0; i < groups.length; i++) {
        html += '<div class="shape-section-label">' + groups[i].label + '</div>';
        html += '<div class="shape-grid">';
        for (var j = 0; j < groups[i].items.length; j++) {
          html += '<button class="shape-btn" data-component="' + groups[i].items[j][0] + '">' +
                  '<span class="shape-glyph">' + this._glyph(groups[i].items[j][0]) + '</span>' +
                  '<span>' + groups[i].items[j][1] + '</span></button>';
        }
        html += '</div>';
      }
      html += '<div class="shape-section-label">Simulate</div>';
      html += '<div style="padding:8px 4px;">';
      html += '<button class="tb-btn primary" id="sim-run" style="width:100%;margin-bottom:6px;">▶ Run</button>';
      html += '<button class="tb-btn" id="sim-stop" style="width:100%;">■ Stop</button>';
      html += '</div>';
      body.innerHTML = html;
      var self = this;
      var btns = body.querySelectorAll('[data-component]');
      for (var k = 0; k < btns.length; k++) {
        btns[k].addEventListener('click', function (ev) {
          self.addComponent(ev.currentTarget.getAttribute('data-component'));
        });
      }
      document.getElementById('sim-run').addEventListener('click', function () { self.runSim(); });
      document.getElementById('sim-stop').addEventListener('click', function () { self.stopSim(); });
    },

    _glyph: function (type) {
      var g = {
        battery: '⚡', button: '⏺', switch: '⇋',
        led: '◉', buzzer: '♫', resistor: '⌇',
        pot: '⊥', capacitor: '☰', arduino: '⬚', wire: '━'
      };
      return g[type] || '◆';
    },

    /* ==================== EVENTS ==================== */
    _bindEvents: function () {
      var self = this;
      this.svg.addEventListener('click', function (ev) {
        var target = ev.target;
        // Check if a pin was clicked — use hasAttribute for robustness
        // (getAttribute('class') can fail on some old browsers when other
        // classes are added; hasAttribute('data-pin-id') is more reliable.)
        if (target.hasAttribute && target.hasAttribute('data-pin-id')) {
          var pinId = target.getAttribute('data-pin-id');
          self._onPinClick(pinId, target);
          return;
        }
        // Check if a component was clicked (background)
        var compEl = target.closest ? target.closest('[data-comp-id]') : null;
        if (compEl) {
          // If we're in wire-start mode, don't select the component — just cancel the wire
          if (self.wireStartPin) {
            self.wireStartPin = null;
            self._updateWirePreview();
            self._highlightWireStartPin(null);
            global.ForgeCAD.ui.status('Wire cancelled');
            return;
          }
          var compId = compEl.getAttribute('data-comp-id');
          self.selectComponent(compId);
          return;
        }
        // Empty click (or click on a wire line) — cancel any pending wire + clear selection
        if (self.wireStartPin) {
          self.wireStartPin = null;
          self._updateWirePreview();
          self._highlightWireStartPin(null);
          global.ForgeCAD.ui.status('Wire cancelled');
        }
        self.selectComponent(null);
      });
      this.svg.addEventListener('mousemove', function (ev) {
        if (self.wireStartPin) {
          var pt = self._svgPoint(ev);
          self._updateWirePreview(pt.x, pt.y);
        }
      });
    },

    _svgPoint: function (ev) {
      var pt = this.svg.createSVGPoint();
      pt.x = ev.clientX;
      pt.y = ev.clientY;
      try {
        return pt.matrixTransform(this.svg.getScreenCTM().inverse());
      } catch (e) {
        return pt;
      }
    },

    /* ==================== COMPONENT CREATION ==================== */
    addComponent: function (type) {
      // Place new components in a predictable grid pattern near the center
      // so users can find them easily (instead of random positions).
      var n = this.components.length;
      var cols = 5;
      var cellW = 100;
      var cellH = 80;
      var startX = 150;
      var startY = 180;
      var cx = startX + (n % cols) * cellW;
      var cy = startY + Math.floor(n / cols) * cellH;
      var id = 'c' + Date.now() + '_' + this.components.length;
      var comp = {
        id: id,
        type: type,
        x: cx,
        y: cy,
        rotation: 0,
        props: this._defaultProps(type)
      };
      this.components.push(comp);
      this._renderComponent(comp);
      this.selectComponent(id);
      global.ForgeCAD.ui.status('Added ' + type + ' — drag values in Properties to move, click pins to wire');
    },

    _defaultProps: function (type) {
      switch (type) {
        case 'battery': return { voltage: 5 };
        case 'led': return { color: '#ff0000', onThreshold: 1.8 };
        case 'resistor': return { resistance: 220 };
        case 'button': return { closed: false };
        case 'switch': return { closed: false };
        case 'buzzer': return { frequency: 440 };
        case 'pot': return { resistance: 10000, position: 0.5 };
        case 'capacitor': return { capacitance: 100 };
        case 'arduino': return { label: 'Arduino Uno' };
        case 'wire': return {};
        default: return {};
      }
    },

    _pinsFor: function (type) {
      // Returns array of [dx, dy, label]
      switch (type) {
        case 'battery': return [[-30, 0, '+'], [30, 0, '−']];
        case 'led': return [[-15, 0, '+'], [15, 0, '−']];
        case 'resistor':
        case 'buzzer':
        case 'switch':
        case 'button':
        case 'capacitor': return [[-25, 0, 'a'], [25, 0, 'b']];
        case 'pot': return [[-25, 0, 'a'], [0, -25, 'w'], [25, 0, 'b']];
        case 'arduino': return [[-50, -10, 'GND'], [-50, 10, '5V'], [50, -10, 'D13'], [50, 10, 'D12']];
        case 'wire': return [];
        default: return [[-20, 0, 'a'], [20, 0, 'b']];
      }
    },

    _renderComponent: function (comp) {
      // Remove existing
      var existing = this.svg.querySelector('[data-comp-id="' + comp.id + '"]');
      if (existing) existing.parentNode.removeChild(existing);

      var g = document.createElementNS(this.ns, 'g');
      g.setAttribute('data-comp-id', comp.id);
      g.setAttribute('class', 'circuits-component');
      g.setAttribute('transform', 'translate(' + comp.x + ',' + comp.y + ') rotate(' + (comp.rotation * 180 / Math.PI) + ')');

      // Body shape varies by type
      var body = this._componentBody(comp.type);
      for (var i = 0; i < body.length; i++) {
        g.appendChild(body[i]);
      }
      // Pins
      var pins = this._pinsFor(comp.type);
      for (var j = 0; j < pins.length; j++) {
        var p = pins[j];
        var pinId = comp.id + '_pin_' + j;
        // Remove existing pin from pins array
        var existingIdx = -1;
        for (var k = 0; k < this.pins.length; k++) {
          if (this.pins[k].id === pinId) { existingIdx = k; break; }
        }
        if (existingIdx >= 0) {
          this.pins[existingIdx].x = comp.x + p[0];
          this.pins[existingIdx].y = comp.y + p[1];
        } else {
          this.pins.push({ id: pinId, component: comp.id, x: comp.x + p[0], y: comp.y + p[1], label: p[2] });
        }
        // Large invisible hit area for easier clicking (r=12)
        var hit = document.createElementNS(this.ns, 'circle');
        hit.setAttribute('cx', p[0]);
        hit.setAttribute('cy', p[1]);
        hit.setAttribute('r', 12);
        hit.setAttribute('fill', 'transparent');
        hit.setAttribute('class', 'circuits-pin-hit');
        hit.setAttribute('data-pin-id', pinId);
        hit.setAttribute('data-comp-id', comp.id);
        hit.setAttribute('style', 'cursor: crosshair;');
        g.appendChild(hit);
        // Visible pin (r=5, on top of hit area)
        var c = document.createElementNS(this.ns, 'circle');
        c.setAttribute('cx', p[0]);
        c.setAttribute('cy', p[1]);
        c.setAttribute('r', 5);
        c.setAttribute('class', 'circuits-pin');
        c.setAttribute('fill', '#3b82f6');
        c.setAttribute('stroke', '#fff');
        c.setAttribute('stroke-width', '1.5');
        c.setAttribute('data-pin-id', pinId);
        c.setAttribute('data-comp-id', comp.id);
        c.setAttribute('pointer-events', 'none'); // clicks go to the hit area below
        g.appendChild(c);
        // Pin label
        var lbl = document.createElementNS(this.ns, 'text');
        lbl.setAttribute('x', p[0]);
        lbl.setAttribute('y', p[1] - 8);
        lbl.setAttribute('text-anchor', 'middle');
        lbl.setAttribute('font-size', '9');
        lbl.setAttribute('font-weight', 'bold');
        lbl.setAttribute('class', 'circuits-component-label');
        lbl.setAttribute('pointer-events', 'none');
        lbl.textContent = p[2];
        g.appendChild(lbl);
      }
      this.svg.appendChild(g);

      // Re-render any wires connected to this component's pins
      this._rerenderWiresForComponent(comp.id);
    },

    _componentBody: function (type) {
      var bodies = [];
      var makeRect = function (w, h, fill) {
        var r = document.createElementNS(this.ns, 'rect');
        r.setAttribute('x', -w / 2); r.setAttribute('y', -h / 2);
        r.setAttribute('width', w); r.setAttribute('height', h);
        r.setAttribute('rx', 3);
        if (fill) r.setAttribute('fill', fill);
        r.setAttribute('vector-effect', 'non-scaling-stroke');
        return r;
      }.bind(this);
      var makeLine = function (x1, y1, x2, y2) {
        var l = document.createElementNS(this.ns, 'line');
        l.setAttribute('x1', x1); l.setAttribute('y1', y1);
        l.setAttribute('x2', x2); l.setAttribute('y2', y2);
        l.setAttribute('vector-effect', 'non-scaling-stroke');
        return l;
      }.bind(this);
      var makeText = function (x, y, txt, fill) {
        var t = document.createElementNS(this.ns, 'text');
        t.setAttribute('x', x); t.setAttribute('y', y);
        t.setAttribute('text-anchor', 'middle');
        t.setAttribute('font-size', '9');
        t.setAttribute('fill', fill || '#888');
        t.setAttribute('pointer-events', 'none');
        t.textContent = txt;
        return t;
      }.bind(this);
      switch (type) {
        case 'battery':
          bodies.push(makeRect(50, 20, '#fbbf24'));
          bodies.push(makeLine(-8, -8, -8, 8));
          bodies.push(makeLine(8, -12, 8, 12));
          bodies.push(makeText(0, -14, '+', '#000'));
          bodies.push(makeText(0, 22, '−', '#000'));
          break;
        case 'led':
          bodies.push(makeRect(30, 18, '#ff0000'));
          bodies.push(makeText(0, 3, 'LED', '#fff'));
          break;
        case 'resistor':
          bodies.push(makeRect(40, 14, '#92400e'));
          bodies.push(makeText(0, 3, 'R', '#fff'));
          break;
        case 'button':
          bodies.push(makeRect(40, 26, '#1f2937'));
          bodies.push(makeRect(20, 14, '#ef4444'));
          bodies.push(makeText(0, 24, 'BTN', '#fff'));
          break;
        case 'switch':
          bodies.push(makeRect(50, 16, '#1f2937'));
          bodies.push(makeLine(-20, 0, 12, -8));
          bodies.push(makeText(0, 24, 'SW', '#fff'));
          break;
        case 'buzzer':
          bodies.push(makeRect(30, 30, '#7c3aed'));
          bodies.push(makeText(0, 3, 'BZ', '#fff'));
          break;
        case 'pot':
          bodies.push(makeRect(40, 30, '#0369a1'));
          bodies.push(makeRect(8, 8, '#94a3b8'));
          bodies.push(makeText(0, 22, 'POT', '#fff'));
          break;
        case 'capacitor':
          bodies.push(makeRect(30, 22, '#0891b2'));
          bodies.push(makeText(0, 3, 'C', '#fff'));
          break;
        case 'arduino':
          bodies.push(makeRect(120, 60, '#0e7490'));
          bodies.push(makeText(0, -10, 'Arduino', '#fff'));
          bodies.push(makeText(0, 10, 'Uno R3', '#fff'));
          break;
        default:
          bodies.push(makeRect(30, 20, '#475569'));
      }
      return bodies;
    },

    /* ==================== WIRE CONNECTION ==================== */
    _onPinClick: function (pinId, targetEl) {
      if (!this.wireStartPin) {
        this.wireStartPin = pinId;
        this._highlightWireStartPin(pinId);
        global.ForgeCAD.ui.status('Wire mode: click another pin to connect (or click empty space to cancel)');
      } else {
        if (this.wireStartPin !== pinId) {
          // Create wire
          var wire = { id: 'w' + Date.now() + '_' + Math.floor(Math.random() * 1000), from: this.wireStartPin, to: pinId };
          this.wires.push(wire);
          this._renderWire(wire);
          this._highlightWireStartPin(null);
          this.wireStartPin = null;
          this._updateWirePreview();
          global.ForgeCAD.ui.status('Wire connected');
        } else {
          // Clicked same pin — cancel
          this._highlightWireStartPin(null);
          this.wireStartPin = null;
          this._updateWirePreview();
          global.ForgeCAD.ui.status('Wire cancelled');
        }
      }
    },

    _highlightWireStartPin: function (pinId) {
      // Reset all pin visuals (only the visible pin circles, not the hit areas)
      var allPins = this.svg.querySelectorAll('.circuits-pin');
      for (var i = 0; i < allPins.length; i++) {
        allPins[i].setAttribute('fill', '#3b82f6');
        allPins[i].setAttribute('r', 5);
        allPins[i].setAttribute('class', 'circuits-pin');
      }
      if (pinId) {
        // Highlight both the visible pin and add pulse class
        var els = this.svg.querySelectorAll('[data-pin-id="' + pinId + '"]');
        for (var j = 0; j < els.length; j++) {
          if (els[j].getAttribute('class') === 'circuits-pin' ||
              els[j].getAttribute('class') === 'circuits-pin wire-start') {
            els[j].setAttribute('fill', '#fbbf24');
            els[j].setAttribute('r', 7);
            els[j].setAttribute('class', 'circuits-pin wire-start');
          }
        }
      }
    },

    _renderWire: function (wire) {
      var existing = this.svg.querySelector('[data-wire-id="' + wire.id + '"]');
      if (existing) existing.parentNode.removeChild(existing);
      var p1 = this._findPin(wire.from);
      var p2 = this._findPin(wire.to);
      if (!p1 || !p2) return;
      var line = document.createElementNS(this.ns, 'path');
      // Manhattan routing
      var midX = (p1.x + p2.x) / 2;
      var d = 'M ' + p1.x + ' ' + p1.y + ' L ' + midX + ' ' + p1.y + ' L ' + midX + ' ' + p2.y + ' L ' + p2.x + ' ' + p2.y;
      line.setAttribute('d', d);
      line.setAttribute('class', 'wire-line');
      line.setAttribute('data-wire-id', wire.id);
      line.setAttribute('data-from', wire.from);
      line.setAttribute('data-to', wire.to);
      // Insert before components so wires are under
      var firstComp = this.svg.querySelector('[data-comp-id]');
      if (firstComp) {
        this.svg.insertBefore(line, firstComp);
      } else {
        this.svg.appendChild(line);
      }
    },

    _rerenderWiresForComponent: function (compId) {
      for (var i = 0; i < this.wires.length; i++) {
        var w = this.wires[i];
        if (w.from.indexOf(compId) === 0 || w.to.indexOf(compId) === 0) {
          this._renderWire(w);
        }
      }
    },

    _updateWirePreview: function (mx, my) {
      var existing = this.svg.querySelector('#wire-preview');
      if (existing) existing.parentNode.removeChild(existing);
      if (!this.wireStartPin || mx == null) return;
      var p1 = this._findPin(this.wireStartPin);
      if (!p1) return;
      var line = document.createElementNS(this.ns, 'line');
      line.setAttribute('id', 'wire-preview');
      line.setAttribute('x1', p1.x); line.setAttribute('y1', p1.y);
      line.setAttribute('x2', mx); line.setAttribute('y2', my);
      line.setAttribute('class', 'wire-line wire-preview');
      line.setAttribute('opacity', 0.4);
      // Critical: preview must not intercept clicks — otherwise the user
      // can't click the second pin because the preview line is on top of it.
      line.setAttribute('pointer-events', 'none');
      this.svg.appendChild(line);
    },

    _findPin: function (id) {
      for (var i = 0; i < this.pins.length; i++) {
        if (this.pins[i].id === id) return this.pins[i];
      }
      return null;
    },

    /* ==================== SELECTION ==================== */
    selectComponent: function (id) {
      // Remove selected class from all
      var all = this.svg.querySelectorAll('.circuits-component');
      for (var i = 0; i < all.length; i++) {
        all[i].setAttribute('class', 'circuits-component');
      }
      if (!id) {
        this.selected = null;
        global.ForgeCAD.ui.clearProperties();
        global.ForgeCAD.ui.setPropertiesTitle('Properties');
        return;
      }
      this.selected = id;
      var el = this.svg.querySelector('[data-comp-id="' + id + '"]');
      if (el) el.setAttribute('class', 'circuits-component selected');
      this._showProperties(id);
    },

    _showProperties: function (id) {
      var comp = null;
      for (var i = 0; i < this.components.length; i++) {
        if (this.components[i].id === id) { comp = this.components[i]; break; }
      }
      if (!comp) return;
      global.ForgeCAD.ui.setPropertiesTitle('Properties — ' + comp.type);
      var html = '';
      html += '<div class="prop-section"><div class="prop-section-title">Position</div>';
      html += global.ForgeCAD.ui.propRow3('Pos', [Math.round(comp.x), Math.round(comp.y), Math.round(comp.rotation * 180 / Math.PI)], ['cx','cy','cr']);
      html += '</div>';
      html += '<div class="prop-section"><div class="prop-section-title">Component</div>';
      // Type-specific props
      if (comp.type === 'battery') {
        html += '<div class="prop-row"><label>Volts</label><input type="number" id="prop-voltage" value="' + comp.props.voltage + '" step="0.1"></div>';
      } else if (comp.type === 'led') {
        html += '<div class="prop-row"><label>Color</label><div class="color-swatch" id="current-color-swatch" style="background:' + comp.props.color + ';"></div><input type="text" id="current-color-text" value="' + comp.props.color + '" style="width:80px;"></div>';
        var palette = ['#ff0000','#00ff00','#0000ff','#ffff00','#ff00ff','#00ffff','#ffffff'];
        html += '<div class="prop-row"><div style="margin-left:78px;">';
        for (var p = 0; p < palette.length; p++) {
          html += '<button class="color-swatch-mini" data-color="' + palette[p] + '" style="background:' + palette[p] + ';width:20px;height:20px;border:1px solid #555;border-radius:3px;display:inline-block;margin:2px;cursor:pointer;"></button>';
        }
        html += '</div></div>';
        html += '<div class="prop-row"><label>Vf</label><input type="number" id="prop-vf" value="' + comp.props.onThreshold + '" step="0.1"></div>';
      } else if (comp.type === 'resistor') {
        html += '<div class="prop-row"><label>Ohms</label><input type="number" id="prop-resistance" value="' + comp.props.resistance + '" step="10"></div>';
      } else if (comp.type === 'button' || comp.type === 'switch') {
        html += '<div class="prop-row"><label>Closed</label><input type="checkbox" id="prop-closed" ' + (comp.props.closed ? 'checked' : '') + '></div>';
      } else if (comp.type === 'pot') {
        html += '<div class="prop-row"><label>Ohms</label><input type="number" id="prop-resistance" value="' + comp.props.resistance + '" step="100"></div>';
        html += '<div class="prop-row"><label>Position</label><input type="range" id="prop-position" min="0" max="1" step="0.01" value="' + comp.props.position + '"></div>';
      } else if (comp.type === 'capacitor') {
        html += '<div class="prop-row"><label>μF</label><input type="number" id="prop-capacitance" value="' + comp.props.capacitance + '" step="1"></div>';
      } else if (comp.type === 'buzzer') {
        html += '<div class="prop-row"><label>Hz</label><input type="number" id="prop-freq" value="' + comp.props.frequency + '" step="10"></div>';
      }
      html += '</div>';
      html += '<div class="prop-section"><div class="prop-section-title">Actions</div>';
      html += '<div class="prop-row"><button class="tb-btn" id="btn-rotate-comp" style="width:100%;">Rotate 90°</button></div>';
      html += '<div class="prop-row"><button class="tb-btn" id="btn-delete-comp" style="width:100%;">Delete</button></div>';
      html += '</div>';
      global.ForgeCAD.ui.setPropertiesHTML(html);

      // Bind
      var self = this;
      var bind = function (id, key, parser) {
        var el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('change', function () {
          var v = parser ? parser(el.value) : el.value;
          comp.props[key] = v;
          if (key === 'color') {
            var sw = document.getElementById('current-color-swatch');
            if (sw) sw.style.background = v;
          }
        });
      };
      bind('prop-voltage', 'voltage', parseFloat);
      bind('prop-resistance', 'resistance', parseFloat);
      bind('prop-capacitance', 'capacitance', parseFloat);
      bind('prop-freq', 'frequency', parseFloat);
      bind('prop-vf', 'onThreshold', parseFloat);
      bind('prop-position', 'position', parseFloat);
      bind('prop-closed', 'closed', function (v) { return document.getElementById('prop-closed').checked; });
      bind('current-color-text', 'color');
      var palBtns = document.querySelectorAll('.color-swatch-mini');
      for (var k = 0; k < palBtns.length; k++) {
        palBtns[k].addEventListener('click', function (ev) {
          var c = ev.currentTarget.getAttribute('data-color');
          comp.props.color = c;
          var sw = document.getElementById('current-color-swatch');
          if (sw) sw.style.background = c;
          var txt = document.getElementById('current-color-text');
          if (txt) txt.value = c;
          self._renderComponent(comp);
        });
      }
      // Position
      ['cx','cy','cr'].forEach(function (id, idx) {
        var el = document.getElementById(id);
        if (el) {
          el.addEventListener('change', function () {
            var v = parseFloat(el.value);
            if (isNaN(v)) return;
            if (idx === 0) comp.x = v;
            else if (idx === 1) comp.y = v;
            else comp.rotation = v * Math.PI / 180;
            self._renderComponent(comp);
          });
        }
      });
      // Buttons
      var rotBtn = document.getElementById('btn-rotate-comp');
      if (rotBtn) rotBtn.addEventListener('click', function () {
        comp.rotation += Math.PI / 2;
        self._renderComponent(comp);
        self._showProperties(comp.id);
      });
      var delBtn = document.getElementById('btn-delete-comp');
      if (delBtn) delBtn.addEventListener('click', function () {
        self.deleteComponent(comp.id);
      });
    },

    deleteComponent: function (id) {
      // Remove component
      for (var i = 0; i < this.components.length; i++) {
        if (this.components[i].id === id) {
          this.components.splice(i, 1);
          break;
        }
      }
      // Remove pins
      var newPins = [];
      for (var j = 0; j < this.pins.length; j++) {
        if (this.pins[j].component !== id) newPins.push(this.pins[j]);
      }
      this.pins = newPins;
      // Remove wires touching this component
      var newWires = [];
      for (var k = 0; k < this.wires.length; k++) {
        var w = this.wires[k];
        if (w.from.indexOf(id) === 0 || w.to.indexOf(id) === 0) {
          var line = this.svg.querySelector('[data-wire-id="' + w.id + '"]');
          if (line) line.parentNode.removeChild(line);
        } else {
          newWires.push(w);
        }
      }
      this.wires = newWires;
      // Remove DOM
      var el = this.svg.querySelector('[data-comp-id="' + id + '"]');
      if (el) el.parentNode.removeChild(el);
      this.selectComponent(null);
    },

    /* ==================== SIMULATION (very basic) ==================== */
    simRunning: false,
    simTimer: null,
    simState: { lit: false },

    runSim: function () {
      if (this.simRunning) return;
      this.simRunning = true;
      global.ForgeCAD.ui.status('Simulating...');
      var self = this;
      var tick = function () {
        if (!self.simRunning) return;
        self._simulateStep();
        self.simTimer = setTimeout(tick, 100);
      };
      tick();
    },

    stopSim: function () {
      this.simRunning = false;
      if (this.simTimer) clearTimeout(this.simTimer);
      this.simTimer = null;
      // Clear "live" wire class
      var liveWires = this.svg.querySelectorAll('.wire-line.live');
      for (var i = 0; i < liveWires.length; i++) {
        liveWires[i].setAttribute('class', 'wire-line');
      }
      // Reset LED bodies to red
      var leds = this.svg.querySelectorAll('[data-comp-id]');
      for (var j = 0; j < leds.length; j++) {
        var cid = leds[j].getAttribute('data-comp-id');
        var comp = null;
        for (var k = 0; k < this.components.length; k++) {
          if (this.components[k].id === cid) { comp = this.components[k]; break; }
        }
        if (comp && comp.type === 'led') {
          var body = leds[j].querySelector('rect');
          if (body) {
            body.setAttribute('fill', comp.props.color);
            body.setAttribute('opacity', 0.4);
            body.removeAttribute('filter');
          }
        }
      }
      global.ForgeCAD.ui.status('Stopped');
    },

    _simulateStep: function () {
      // Find battery
      var battery = null;
      for (var i = 0; i < this.components.length; i++) {
        if (this.components[i].type === 'battery') { battery = this.components[i]; break; }
      }
      if (!battery) return;
      // Check closed switches/buttons
      var circuitClosed = true;
      for (var j = 0; j < this.components.length; j++) {
        var c = this.components[j];
        if ((c.type === 'switch' || c.type === 'button') && !c.props.closed) {
          circuitClosed = false;
          break;
        }
      }
      // Light up wires if closed
      var wires = this.svg.querySelectorAll('.wire-line');
      for (var k = 0; k < wires.length; k++) {
        if (circuitClosed) {
          wires[k].setAttribute('class', 'wire-line live');
        } else {
          wires[k].setAttribute('class', 'wire-line');
        }
      }
      // Light up LEDs
      for (var m = 0; m < this.components.length; m++) {
        var comp = this.components[m];
        if (comp.type !== 'led') continue;
        var el = this.svg.querySelector('[data-comp-id="' + comp.id + '"]');
        if (!el) continue;
        var body = el.querySelector('rect');
        if (!body) continue;
        if (circuitClosed && battery.props.voltage > (comp.props.onThreshold || 1.8)) {
          // LIT: bright fill + glow filter
          body.setAttribute('fill', comp.props.color);
          body.setAttribute('opacity', 1.0);
          body.setAttribute('filter', 'url(#led-glow)');
          // Add a glow filter if not present
          this._ensureGlowFilter(comp.props.color);
        } else {
          // UNLIT: dim
          body.setAttribute('fill', comp.props.color);
          body.setAttribute('opacity', 0.35);
          body.removeAttribute('filter');
        }
      }
    },

    _ensureGlowFilter: function (color) {
      var existing = this.svg.querySelector('#led-glow');
      if (existing) return;
      var defs = this.svg.querySelector('defs') || document.createElementNS(this.ns, 'defs');
      if (!defs.parentNode) this.svg.insertBefore(defs, this.svg.firstChild);
      var filter = document.createElementNS(this.ns, 'filter');
      filter.setAttribute('id', 'led-glow');
      filter.setAttribute('x', '-50%');
      filter.setAttribute('y', '-50%');
      filter.setAttribute('width', '200%');
      filter.setAttribute('height', '200%');
      var glow = document.createElementNS(this.ns, 'feGaussianBlur');
      glow.setAttribute('stdDeviation', '3');
      glow.setAttribute('result', 'glow');
      filter.appendChild(glow);
      var merge = document.createElementNS(this.ns, 'feMerge');
      var m1 = document.createElementNS(this.ns, 'feMergeNode');
      m1.setAttribute('in', 'glow');
      var m2 = document.createElementNS(this.ns, 'feMergeNode');
      m2.setAttribute('in', 'SourceGraphic');
      merge.appendChild(m1);
      merge.appendChild(m2);
      filter.appendChild(merge);
      defs.appendChild(filter);
    },

    /* ==================== CLEAR ==================== */
    clearAll: function () {
      var self = this;
      global.ForgeCAD.ui.confirm('Clear all components?', function () {
        self.components = [];
        self.pins = [];
        self.wires = [];
        self.selected = null;
        self._drawBreadboard();
        global.ForgeCAD.ui.clearProperties();
        global.ForgeCAD.ui.status('Cleared');
      });
    },

    /* ==================== SAVE / LOAD ==================== */
    serialize: function () {
      return {
        version: 1,
        mode: 'circuits',
        components: JSON.parse(JSON.stringify(this.components)),
        wires: JSON.parse(JSON.stringify(this.wires))
      };
    },

    deserialize: function (data) {
      var self = this;
      this.clearAll();
      // Clear immediately
      this.components = [];
      this.pins = [];
      this.wires = [];
      this._drawBreadboard();
      if (!data || !data.components) return;
      for (var i = 0; i < data.components.length; i++) {
        var c = data.components[i];
        this.components.push(c);
        this._renderComponent(c);
      }
      if (data.wires) {
        for (var j = 0; j < data.wires.length; j++) {
          this.wires.push(data.wires[j]);
          this._renderWire(data.wires[j]);
        }
      }
      global.ForgeCAD.ui.toast('Loaded ' + data.components.length + ' components');
    },

    /* ==================== MOBILE ==================== */
    showMobilePanel: function () {
      var html = '<div style="padding:8px;">';
      html += '<div style="font-size:11px;text-transform:uppercase;color:#6b7280;margin-bottom:8px;">Add Component</div>';
      html += '<div style="display:flex;flex-wrap:wrap;">';
      var items = [
        ['battery','⚡ Battery'],['button','⏺ Button'],['switch','⇋ Switch'],
        ['led','◉ LED'],['buzzer','♫ Buzzer'],['resistor','⌇ Resistor'],
        ['pot','⊥ Pot'],['capacitor','☰ Cap'],['arduino','⬚ Arduino'],['wire','━ Wire']
      ];
      for (var i = 0; i < items.length; i++) {
        html += '<button class="shape-btn" data-component="' + items[i][0] + '" style="width:33%;"><span class="shape-glyph">' + items[i][1].split(' ')[0] + '</span><span>' + items[i][1].split(' ')[1] + '</span></button>';
      }
      html += '</div>';
      html += '<div style="margin-top:12px;display:flex;gap:4px;">';
      html += '<button class="tb-btn primary" id="m-sim-run" style="flex:1;">▶ Run</button>';
      html += '<button class="tb-btn" id="m-sim-stop" style="flex:1;">■ Stop</button>';
      html += '</div></div>';
      global.ForgeCAD.ui.bottomSheetToggle(html);
      var self = this;
      var sheet = document.getElementById('bottom-sheet');
      if (!sheet) return;
      var btns = sheet.querySelectorAll('[data-component]');
      for (var j = 0; j < btns.length; j++) {
        btns[j].addEventListener('click', function (ev) {
          self.addComponent(ev.currentTarget.getAttribute('data-component'));
        });
      }
      var r = document.getElementById('m-sim-run');
      var s = document.getElementById('m-sim-stop');
      if (r) r.addEventListener('click', function () { self.runSim(); });
      if (s) s.addEventListener('click', function () { self.stopSim(); });
    }
  };

  global.ForgeCAD = global.ForgeCAD || {};
  global.ForgeCAD.modeCircuits = modeC;

})(typeof window !== 'undefined' ? window : this);
