/* ============================================================
   ForgeCAD — mode-circuits.js
   Circuits mode (SVG-based for max compatibility with low-end):
     - Breadboard grid (SVG)
     - 16+ components: LED, resistor, battery, switch, button, buzzer,
       wire, Arduino, potentiometer, capacitor, transistor, diode,
       motor, RGB LED, LDR, 7-segment display, IC chip
     - Custom element maker (user-defined components)
     - Drag-to-move components
     - Custom wire routing with draggable bend points
     - 3 wire routing styles (manhattan, bezier, direct) + custom
     - Component size + rotation properties
     - Basic DC simulation (battery voltage, LED on/off)
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
    pins: [],              // { id, component, x, y, label }
    customTypes: [],       // user-defined component types
    gridSpacing: 20,
    gridOffsetX: 40,
    gridOffsetY: 40,
    gridCols: 30,
    gridRows: 20,
    wireStyle: 'manhattan',  // 'manhattan' | 'bezier' | 'direct' | 'custom'
    snapToGrid: true,

    // Drag state
    _dragComp: null,       // component being dragged
    _dragOffset: { x: 0, y: 0 },
    _dragMoved: false,

    // Wire bend editing
    _dragBendWire: null,   // wire being bent
    _dragBendIdx: -1,      // index of bend point being dragged

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
      // Defs for filters
      var defs = document.createElementNS(this.ns, 'defs');
      this._ensureGlowFilter(); // will create defs if needed; safe to call
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
      holesGroup.setAttribute('id', 'holes-layer');
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
      // Power rails
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
      // Rail labels
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
        { label: 'Power', items: [['battery','Battery'],['button','Button'],['switch','Switch'],['solarcell','Solar Cell']] },
        { label: 'Load', items: [['led','LED'],['rgbled','RGB LED'],['buzzer','Buzzer'],['motor','Motor'],['lamp','Lamp']] },
        { label: 'Passive', items: [['resistor','Resistor'],['pot','Potentiometer'],['capacitor','Capacitor'],['inductor','Inductor']] },
        { label: 'Semiconductor', items: [['diode','Diode'],['transistor','Transistor (NPN)'],['ldr','LDR (Photo)']] },
        { label: 'Display', items: [['sevenseg','7-Segment'],['ic','IC Chip']] },
        { label: 'Logic', items: [['arduino','Arduino (visual)']] },
        { label: 'Custom', items: [['custom','⚙ Custom Element Maker']] }
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
      // Render any custom types the user has defined
      if (this.customTypes.length > 0) {
        html += '<div class="shape-section-label">My Custom Elements</div>';
        html += '<div class="shape-grid">';
        for (var k = 0; k < this.customTypes.length; k++) {
          html += '<button class="shape-btn" data-component="custom_' + this.customTypes[k].id + '">' +
                  '<span class="shape-glyph">' + (this.customTypes[k].glyph || '◆') + '</span>' +
                  '<span>' + this.customTypes[k].name + '</span></button>';
        }
        html += '</div>';
      }
      html += '<div class="shape-section-label">Wire Style</div>';
      html += '<div style="padding:8px 4px;">';
      html += '<select id="wire-style-select" style="width:100%;padding:6px;font-size:12px;background:' + (global.ForgeCAD.theme.current === 'dark' ? '#161b25' : '#fff') + ';color:inherit;border:1px solid ' + (global.ForgeCAD.theme.current === 'dark' ? '#353f4f' : '#d1d5db') + ';border-radius:3px;">';
      html += '<option value="manhattan"' + (this.wireStyle === 'manhattan' ? ' selected' : '') + '>Manhattan (L-shape)</option>';
      html += '<option value="bezier"' + (this.wireStyle === 'bezier' ? ' selected' : '') + '>Curved (bezier)</option>';
      html += '<option value="direct"' + (this.wireStyle === 'direct' ? ' selected' : '') + '>Direct (straight)</option>';
      html += '<option value="custom"' + (this.wireStyle === 'custom' ? ' selected' : '') + '>Custom (click wire to add bend)</option>';
      html += '</select>';
      html += '<label style="display:flex;align-items:center;margin-top:6px;font-size:11px;color:#6b7280;cursor:pointer;">';
      html += '<input type="checkbox" id="snap-grid" ' + (this.snapToGrid ? 'checked' : '') + ' style="margin-right:6px;"> Snap to grid';
      html += '</label>';
      html += '</div>';
      html += '<div class="shape-section-label">Simulate</div>';
      html += '<div style="padding:8px 4px;">';
      html += '<button class="tb-btn primary" id="sim-run" style="width:100%;margin-bottom:6px;">▶ Run</button>';
      html += '<button class="tb-btn" id="sim-stop" style="width:100%;">■ Stop</button>';
      html += '</div>';
      body.innerHTML = html;
      var self = this;
      var btns = body.querySelectorAll('[data-component]');
      for (var m = 0; m < btns.length; m++) {
        btns[m].addEventListener('click', function (ev) {
          self.addComponent(ev.currentTarget.getAttribute('data-component'));
        });
      }
      document.getElementById('sim-run').addEventListener('click', function () { self.runSim(); });
      document.getElementById('sim-stop').addEventListener('click', function () { self.stopSim(); });
      var wireStyleSelect = document.getElementById('wire-style-select');
      if (wireStyleSelect) {
        wireStyleSelect.addEventListener('change', function () {
          self.wireStyle = wireStyleSelect.value;
          for (var i = 0; i < self.wires.length; i++) self._renderWire(self.wires[i]);
          global.ForgeCAD.ui.status('Wire style: ' + self.wireStyle);
        });
      }
      var snapChk = document.getElementById('snap-grid');
      if (snapChk) {
        snapChk.addEventListener('change', function () {
          self.snapToGrid = snapChk.checked;
        });
      }
    },

    _glyph: function (type) {
      // Handle custom types
      if (type.indexOf('custom_') === 0) {
        var cid = type.substring(7);
        for (var i = 0; i < this.customTypes.length; i++) {
          if (this.customTypes[i].id === cid) return this.customTypes[i].glyph || '◆';
        }
        return '◆';
      }
      var g = {
        battery: '⚡', button: '⏺', switch: '⇋', solarcell: '☀',
        led: '◉', rgbled: '✱', buzzer: '♫', motor: '⌽', lamp: '💡',
        resistor: '⌇', pot: '⊥', capacitor: '☰', inductor: '∿',
        diode: '▷', transistor: 'ⓣ', ldr: '◐',
        sevenseg: '8', ic: '⬚', arduino: '⬚', wire: '━', custom: '⚙'
      };
      return g[type] || '◆';
    },

    /* ==================== EVENTS ==================== */
    _bindEvents: function () {
      var self = this;
      this.svg.addEventListener('mousedown', function (ev) { self._onMouseDown(ev); });
      this.svg.addEventListener('mousemove', function (ev) { self._onMouseMove(ev); });
      this.svg.addEventListener('mouseup',   function (ev) { self._onMouseUp(ev); });
      // Touch
      this.svg.addEventListener('touchstart', function (ev) {
        if (ev.touches.length === 1) self._onMouseDown(ev.touches[0]);
      }, { passive: true });
      this.svg.addEventListener('touchmove', function (ev) {
        if (ev.touches.length === 1) self._onMouseMove(ev.touches[0]);
      }, { passive: true });
      this.svg.addEventListener('touchend', function (ev) {
        var t = ev.changedTouches[0];
        if (t) self._onMouseUp(t);
      }, { passive: true });
      // Click for pin connection / wire bend add
      this.svg.addEventListener('click', function (ev) { self._onClick(ev); });
    },

    _svgPoint: function (clientX, clientY) {
      var pt = this.svg.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      try {
        return pt.matrixTransform(this.svg.getScreenCTM().inverse());
      } catch (e) {
        return pt;
      }
    },

    _onMouseDown: function (ev) {
      var target = ev.target;
      this._dragMoved = false;
      this._downPoint = { x: ev.clientX, y: ev.clientY };

      // Pin hit area? (start wire drag — handled in click for tap, but
      // we also support drag-to-connect for power users)
      if (target.hasAttribute && target.hasAttribute('data-pin-id')) {
        return; // let click handler deal with it
      }

      // Wire bend point being dragged?
      if (target.hasAttribute && target.hasAttribute('data-bend-idx')) {
        var wireId = target.getAttribute('data-wire-id');
        var bendIdx = parseInt(target.getAttribute('data-bend-idx'), 10);
        this._dragBendWire = this._findWire(wireId);
        this._dragBendIdx = bendIdx;
        return;
      }

      // Component body? Start drag
      var compEl = target.closest ? target.closest('[data-comp-id]') : null;
      if (compEl) {
        var compId = compEl.getAttribute('data-comp-id');
        var comp = this._findComponent(compId);
        if (comp) {
          this._dragComp = comp;
          var pt = this._svgPoint(ev.clientX, ev.clientY);
          this._dragOffset = { x: pt.x - comp.x, y: pt.y - comp.y };
        }
      }
    },

    _onMouseMove: function (ev) {
      // Dragging a component
      if (this._dragComp) {
        var pt = this._svgPoint(ev.clientX, ev.clientY);
        var newX = pt.x - this._dragOffset.x;
        var newY = pt.y - this._dragOffset.y;
        if (this.snapToGrid) {
          newX = Math.round(newX / this.gridSpacing) * this.gridSpacing;
          newY = Math.round(newY / this.gridSpacing) * this.gridSpacing;
        }
        this._dragComp.x = newX;
        this._dragComp.y = newY;
        this._renderComponent(this._dragComp);
        this._dragMoved = true;
        return;
      }
      // Dragging a bend point
      if (this._dragBendWire && this._dragBendIdx >= 0) {
        var bpt = this._svgPoint(ev.clientX, ev.clientY);
        if (!this._dragBendWire.bends) this._dragBendWire.bends = [];
        if (this.snapToGrid) {
          bpt.x = Math.round(bpt.x / this.gridSpacing) * this.gridSpacing;
          bpt.y = Math.round(bpt.y / this.gridSpacing) * this.gridSpacing;
        }
        this._dragBendWire.bends[this._dragBendIdx] = { x: bpt.x, y: bpt.y };
        this._renderWire(this._dragBendWire);
        this._dragMoved = true;
        return;
      }
      // Wire preview
      if (this.wireStartPin) {
        var mpt = this._svgPoint(ev.clientX, ev.clientY);
        this._updateWirePreview(mpt.x, mpt.y);
      }
    },

    _onMouseUp: function (ev) {
      // If we didn't move, the click handler will handle pin selection etc.
      this._dragComp = null;
      this._dragBendWire = null;
      this._dragBendIdx = -1;
    },

    _onClick: function (ev) {
      var target = ev.target;
      var self = this;

      // Ignore if we just finished dragging
      if (this._dragMoved) {
        this._dragMoved = false;
        return;
      }

      // Pin hit area?
      if (target.hasAttribute && target.hasAttribute('data-pin-id')) {
        var pinId = target.getAttribute('data-pin-id');
        self._onPinClick(pinId, target);
        return;
      }

      // Wire path clicked? (in custom mode, add a bend point)
      if (target.hasAttribute && target.hasAttribute('data-wire-id')) {
        if (self.wireStyle === 'custom' || self.wireStyle === 'manhattan') {
          var wid = target.getAttribute('data-wire-id');
          var wire = self._findWire(wid);
          if (wire) {
            var spt = self._svgPoint(ev.clientX, ev.clientY);
            if (!wire.bends) wire.bends = [];
            if (self.snapToGrid) {
              spt.x = Math.round(spt.x / self.gridSpacing) * self.gridSpacing;
              spt.y = Math.round(spt.y / self.gridSpacing) * self.gridSpacing;
            }
            // Insert bend at appropriate position (sorted by distance along path)
            wire.bends.push({ x: spt.x, y: spt.y });
            // Force custom style for this wire so bends are respected
            wire.styleOverride = 'custom';
            self._renderWire(wire);
            global.ForgeCAD.ui.status('Bend point added — drag it to route the wire');
            return;
          }
        } else {
          // Other styles: clicking a wire selects it (could add delete)
          return;
        }
      }

      // Component body clicked (no drag)? Select it.
      var compEl = target.closest ? target.closest('[data-comp-id]') : null;
      if (compEl) {
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

      // Empty click — cancel wire + deselect
      if (self.wireStartPin) {
        self.wireStartPin = null;
        self._updateWirePreview();
        self._highlightWireStartPin(null);
        global.ForgeCAD.ui.status('Wire cancelled');
      }
      self.selectComponent(null);
    },

    /* ==================== COMPONENT CREATION ==================== */
    addComponent: function (type) {
      // Handle custom type
      if (type.indexOf('custom_') === 0) {
        var cid = type.substring(7);
        var ct = null;
        for (var i = 0; i < this.customTypes.length; i++) {
          if (this.customTypes[i].id === cid) { ct = this.customTypes[i]; break; }
        }
        if (!ct) { global.ForgeCAD.ui.toast('Custom type not found'); return; }
        this._addCustomInstance(ct);
        return;
      }
      // Open custom element maker
      if (type === 'custom') {
        this.openCustomMaker();
        return;
      }
      // Place new components in a grid pattern
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
        width: this._defaultWidth(type),
        height: this._defaultHeight(type),
        props: this._defaultProps(type)
      };
      this.components.push(comp);
      this._renderComponent(comp);
      this.selectComponent(id);
      global.ForgeCAD.ui.status('Added ' + type + ' — drag to move, click pins to wire');
    },

    _defaultWidth: function (type) {
      var sizes = {
        battery: 50, button: 40, switch: 50, solarcell: 40,
        led: 30, rgbled: 36, buzzer: 30, motor: 36, lamp: 30,
        resistor: 40, pot: 40, capacitor: 30, inductor: 40,
        diode: 36, transistor: 36, ldr: 30,
        sevenseg: 50, ic: 80, arduino: 120
      };
      return sizes[type] || 40;
    },

    _defaultHeight: function (type) {
      var sizes = {
        battery: 20, button: 26, switch: 16, solarcell: 30,
        led: 18, rgbled: 24, buzzer: 30, motor: 30, lamp: 24,
        resistor: 14, pot: 30, capacitor: 22, inductor: 18,
        diode: 16, transistor: 30, ldr: 24,
        sevenseg: 70, ic: 50, arduino: 60
      };
      return sizes[type] || 24;
    },

    _defaultProps: function (type) {
      switch (type) {
        case 'battery': return { voltage: 5 };
        case 'solarcell': return { voltage: 0.5 };
        case 'led': return { color: '#ff0000', onThreshold: 1.8 };
        case 'rgbled': return { color: '#ffffff', onThreshold: 2.5 };
        case 'lamp': return { voltage: 5, onThreshold: 3 };
        case 'resistor': return { resistance: 220 };
        case 'inductor': return { inductance: 100 };
        case 'button': return { closed: false };
        case 'switch': return { closed: false };
        case 'buzzer': return { frequency: 440 };
        case 'motor': return { voltage: 3 };
        case 'pot': return { resistance: 10000, position: 0.5 };
        case 'capacitor': return { capacitance: 100 };
        case 'transistor': return { gain: 100 };
        case 'diode': return { onThreshold: 0.7 };
        case 'ldr': return { resistance: 1000, light: 50 };
        case 'sevenseg': return { value: '0' };
        case 'ic': return { label: 'IC', pins: 8 };
        case 'arduino': return { label: 'Arduino Uno' };
        default: return {};
      }
    },

    _pinsFor: function (comp) {
      // Returns array of [dx, dy, label] in component-local coords (pre-rotation)
      var type = comp.type;
      var w = comp.width || 40;
      var h = comp.height || 24;
      var hw = w / 2, hh = h / 2;
      switch (type) {
        case 'battery':
        case 'solarcell':
          return [[-hw, 0, '+'], [hw, 0, '−']];
        case 'led':
        case 'lamp':
          return [[-hw, 0, '+'], [hw, 0, '−']];
        case 'rgbled':
          return [[-hw, -6, 'R'], [-hw, 6, 'G'], [hw, -6, 'B'], [hw, 6, '−']];
        case 'resistor':
        case 'inductor':
        case 'buzzer':
        case 'switch':
        case 'button':
        case 'capacitor':
        case 'diode':
        case 'ldr':
          return [[-hw, 0, 'a'], [hw, 0, 'b']];
        case 'motor':
          return [[-hw, -6, '+'], [hw, -6, '−'], [0, hh + 4, 'm']];
        case 'pot':
          return [[-hw, 0, 'a'], [0, -hh, 'w'], [hw, 0, 'b']];
        case 'transistor':
          // Base, Collector, Emitter
          return [[-hw, 0, 'B'], [0, -hh, 'C'], [0, hh, 'E']];
        case 'sevenseg':
          // 7 segment + common
          var segs = [];
          for (var i = 0; i < 7; i++) segs.push([-hw, -hh + (i * (h / 6)), String.fromCharCode(65 + i)]);
          segs.push([hw, 0, 'COM']);
          return segs;
        case 'ic':
          var n = comp.props.pins || 8;
          var half = Math.ceil(n / 2);
          var icPins = [];
          for (var j = 0; j < half; j++) {
            icPins.push([-hw, -hh + (j + 0.5) * (h / half), String(j + 1)]);
          }
          for (var k = 0; k < (n - half); k++) {
            icPins.push([hw, hh - (k + 0.5) * (h / (n - half)), String(n - k)]);
          }
          return icPins;
        case 'arduino':
          return [[-hw, -10, 'GND'], [-hw, 10, '5V'], [hw, -10, 'D13'], [hw, 10, 'D12']];
        default:
          // Custom type
          if (comp._customType) {
            return comp._customType.pins;
          }
          return [[-hw, 0, 'a'], [hw, 0, 'b']];
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

      // Body
      var body = this._componentBody(comp);
      for (var i = 0; i < body.length; i++) g.appendChild(body[i]);

      // Pins
      var pins = this._pinsFor(comp);
      for (var j = 0; j < pins.length; j++) {
        var p = pins[j];
        var pinId = comp.id + '_pin_' + j;
        // Update pin world position (accounting for rotation)
        var cos = Math.cos(comp.rotation);
        var sin = Math.sin(comp.rotation);
        var wx = comp.x + p[0] * cos - p[1] * sin;
        var wy = comp.y + p[0] * sin + p[1] * cos;
        var existingIdx = -1;
        for (var k = 0; k < this.pins.length; k++) {
          if (this.pins[k].id === pinId) { existingIdx = k; break; }
        }
        if (existingIdx >= 0) {
          this.pins[existingIdx].x = wx;
          this.pins[existingIdx].y = wy;
        } else {
          this.pins.push({ id: pinId, component: comp.id, x: wx, y: wy, label: p[2] });
        }
        // Invisible hit area
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
        // Visible pin
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
        c.setAttribute('pointer-events', 'none');
        g.appendChild(c);
        // Label
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

      // Re-render connected wires
      this._rerenderWiresForComponent(comp.id);
    },

    _componentBody: function (comp) {
      var bodies = [];
      var type = comp.type;
      var w = comp.width || 40;
      var h = comp.height || 24;
      var self = this;
      var makeRect = function (rw, rh, fill, rx) {
        var r = document.createElementNS(self.ns, 'rect');
        r.setAttribute('x', -rw / 2); r.setAttribute('y', -rh / 2);
        r.setAttribute('width', rw); r.setAttribute('height', rh);
        r.setAttribute('rx', rx || 3);
        if (fill) r.setAttribute('fill', fill);
        r.setAttribute('vector-effect', 'non-scaling-stroke');
        return r;
      };
      var makeLine = function (x1, y1, x2, y2) {
        var l = document.createElementNS(self.ns, 'line');
        l.setAttribute('x1', x1); l.setAttribute('y1', y1);
        l.setAttribute('x2', x2); l.setAttribute('y2', y2);
        l.setAttribute('vector-effect', 'non-scaling-stroke');
        return l;
      };
      var makeText = function (x, y, txt, fill, size) {
        var t = document.createElementNS(self.ns, 'text');
        t.setAttribute('x', x); t.setAttribute('y', y);
        t.setAttribute('text-anchor', 'middle');
        t.setAttribute('font-size', size || '9');
        t.setAttribute('fill', fill || '#888');
        t.setAttribute('pointer-events', 'none');
        t.textContent = txt;
        return t;
      };
      var makeCircle = function (cx, cy, r, fill) {
        var c = document.createElementNS(self.ns, 'circle');
        c.setAttribute('cx', cx); c.setAttribute('cy', cy);
        c.setAttribute('r', r);
        if (fill) c.setAttribute('fill', fill);
        return c;
      };
      var makePolygon = function (pts, fill) {
        var p = document.createElementNS(self.ns, 'polygon');
        p.setAttribute('points', pts);
        if (fill) p.setAttribute('fill', fill);
        return p;
      };
      switch (type) {
        case 'battery':
          bodies.push(makeRect(w, h, '#fbbf24'));
          bodies.push(makeLine(-8, -h/3, -8, h/3));
          bodies.push(makeLine(8, -h/2, 8, h/2));
          bodies.push(makeText(0, -h/2 - 4, '+', '#000'));
          break;
        case 'solarcell':
          bodies.push(makeRect(w, h, '#1e40af'));
          // Grid lines for solar cell look
          for (var sc = -w/4; sc <= w/4; sc += w/4) bodies.push(makeLine(sc, -h/2, sc, h/2));
          bodies.push(makeLine(-w/2, 0, w/2, 0));
          bodies.push(makeText(0, 3, 'SOLAR', '#fff', 7));
          break;
        case 'led':
          bodies.push(makeRect(w, h, comp.props.color || '#ff0000'));
          bodies.push(makeText(0, 3, 'LED', '#fff'));
          break;
        case 'rgbled':
          bodies.push(makeRect(w, h, '#1f2937'));
          // 3 colored dots
          bodies.push(makeCircle(-w/6, 0, 4, '#ff0000'));
          bodies.push(makeCircle(0, 0, 4, '#00ff00'));
          bodies.push(makeCircle(w/6, 0, 4, '#0000ff'));
          bodies.push(makeText(0, h/2 + 10, 'RGB', '#888', 8));
          break;
        case 'lamp':
          bodies.push(makeCircle(0, 0, w/2, '#fde047'));
          bodies.push(makeLine(-w/3, -w/3, w/3, w/3));
          bodies.push(makeLine(-w/3, w/3, w/3, -w/3));
          break;
        case 'resistor':
          bodies.push(makeRect(w, h, '#92400e'));
          // Zigzag for resistor symbol
          var zx = -w/3;
          var zy = 0;
          for (var zi = 0; zi < 4; zi++) {
            bodies.push(makeLine(zx, 0, zx + w/12, -h/3));
            bodies.push(makeLine(zx + w/12, -h/3, zx + w/6, h/3));
            zx += w/6;
          }
          break;
        case 'inductor':
          bodies.push(makeRect(w, h, '#0e7490'));
          // 3 small arcs (curves) for inductor symbol
          for (var ii = 0; ii < 3; ii++) {
            var path = document.createElementNS(this.ns, 'path');
            var ix = -w/3 + ii * w/3;
            path.setAttribute('d', 'M ' + ix + ' 0 Q ' + (ix + w/6) + ' ' + (-h/2) + ' ' + (ix + w/3) + ' 0');
            path.setAttribute('fill', 'none');
            path.setAttribute('stroke', '#fff');
            path.setAttribute('stroke-width', '1.5');
            bodies.push(path);
          }
          break;
        case 'capacitor':
          bodies.push(makeRect(w, h, '#0891b2'));
          bodies.push(makeLine(-w/6, -h/2, -w/6, h/2));
          bodies.push(makeLine(w/6, -h/2, w/6, h/2));
          break;
        case 'button':
          bodies.push(makeRect(w, h, '#1f2937'));
          bodies.push(makeRect(w/2, h/2, '#ef4444'));
          break;
        case 'switch':
          bodies.push(makeRect(w, h, '#1f2937'));
          bodies.push(makeLine(-w/3, 0, w/4, -h/2));
          bodies.push(makeCircle(w/4, 0, 2, '#fff'));
          break;
        case 'buzzer':
          bodies.push(makeCircle(0, 0, w/2, '#7c3aed'));
          // Sound waves
          bodies.push(makeText(0, 3, 'BZ', '#fff'));
          break;
        case 'motor':
          bodies.push(makeCircle(0, 0, w/2, '#475569'));
          bodies.push(makeText(0, 2, 'M', '#fff'));
          break;
        case 'pot':
          bodies.push(makeRect(w, h, '#0369a1'));
          bodies.push(makeRect(w/4, h/3, '#94a3b8'));
          bodies.push(makeText(0, h + 12, 'POT', '#888', 8));
          break;
        case 'diode':
          bodies.push(makePolygon((-w/3) + ',0 ' + (w/4) + ',' + (-h/2) + ' ' + (w/4) + ',' + h/2, '#1f2937'));
          bodies.push(makeLine(w/4, -h/2, w/4, h/2));
          break;
        case 'transistor':
          bodies.push(makeCircle(0, 0, w/2, '#1f2937'));
          bodies.push(makeLine(-w/3, 0, w/6, 0)); // base line
          bodies.push(makeLine(w/6, -h/3, w/6, h/3)); // vertical
          bodies.push(makeLine(w/6, -h/3, w/2, -h/2)); // collector
          bodies.push(makeLine(w/6, h/3, w/2, h/2)); // emitter (with arrow)
          bodies.push(makeText(0, h + 12, 'NPN', '#888', 8));
          break;
        case 'ldr':
          bodies.push(makeCircle(0, 0, w/2, '#f59e0b'));
          bodies.push(makeText(0, 2, 'LDR', '#fff', 7));
          // Arrows indicating light
          bodies.push(makeLine(-w, -h, -w/2, -h/2));
          bodies.push(makeLine(w, -h, w/2, -h/2));
          break;
        case 'sevenseg':
          // 7-segment display body
          bodies.push(makeRect(w, h, '#1f2937'));
          // Digit segments (just show "8" outline)
          bodies.push(makeText(0, h/3, '8', '#ef4444', '28'));
          break;
        case 'ic':
          bodies.push(makeRect(w, h, '#0e7490'));
          // Pin numbers
          var pn = comp.props.pins || 8;
          var halfN = Math.ceil(pn / 2);
          for (var ip = 0; ip < halfN; ip++) {
            bodies.push(makeText(-w/2 + 8, -h/2 + (ip + 0.5) * (h/halfN) + 3, String(ip + 1), '#fff', 7));
          }
          for (var jp = 0; jp < (pn - halfN); jp++) {
            bodies.push(makeText(w/2 - 8, h/2 - (jp + 0.5) * (h/(pn-halfN)) + 3, String(pn - jp), '#fff', 7));
          }
          bodies.push(makeText(0, 3, comp.props.label || 'IC', '#fff'));
          // Notch indicating pin 1
          bodies.push(makeCircle(-w/2 + 4, -h/2 + 4, 2, '#000'));
          break;
        case 'arduino':
          bodies.push(makeRect(w, h, '#0e7490'));
          bodies.push(makeText(0, -6, 'Arduino', '#fff'));
          bodies.push(makeText(0, 10, 'Uno R3', '#fff'));
          break;
        default:
          // Custom type
          if (comp._customType) {
            var ct = comp._customType;
            if (ct.bodyShape === 'circle') {
              bodies.push(makeCircle(0, 0, w/2, ct.color || '#475569'));
            } else {
              bodies.push(makeRect(w, h, ct.color || '#475569', ct.cornerRadius || 3));
            }
            bodies.push(makeText(0, 3, ct.label || ct.name, ct.textColor || '#fff', 9));
          } else {
            bodies.push(makeRect(w, h, '#475569'));
          }
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
          var wire = {
            id: 'w' + Date.now() + '_' + Math.floor(Math.random() * 1000),
            from: this.wireStartPin,
            to: pinId,
            bends: []
          };
          this.wires.push(wire);
          this._renderWire(wire);
          this._highlightWireStartPin(null);
          this.wireStartPin = null;
          this._updateWirePreview();
          global.ForgeCAD.ui.status('Wire connected' + (this.wireStyle === 'custom' || this.wireStyle === 'manhattan' ? ' — click it to add bend points' : ''));
        } else {
          this._highlightWireStartPin(null);
          this.wireStartPin = null;
          this._updateWirePreview();
          global.ForgeCAD.ui.status('Wire cancelled');
        }
      }
    },

    _highlightWireStartPin: function (pinId) {
      var allPins = this.svg.querySelectorAll('.circuits-pin');
      for (var i = 0; i < allPins.length; i++) {
        allPins[i].setAttribute('fill', '#3b82f6');
        allPins[i].setAttribute('r', 5);
        allPins[i].setAttribute('class', 'circuits-pin');
      }
      if (pinId) {
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

      // Also remove any existing bend handles for this wire
      var oldHandles = this.svg.querySelectorAll('[data-wire-id="' + wire.id + '"][data-bend-idx]');
      for (var oh = 0; oh < oldHandles.length; oh++) oldHandles[oh].parentNode.removeChild(oldHandles[oh]);

      var p1 = this._findPin(wire.from);
      var p2 = this._findPin(wire.to);
      if (!p1 || !p2) return;

      var style = wire.styleOverride || this.wireStyle;
      var bends = wire.bends || [];
      var d;

      if (style === 'custom' && bends.length > 0) {
        // Build path: start → bend points (manhattan between consecutive) → end
        d = 'M ' + p1.x + ' ' + p1.y;
        var prev = { x: p1.x, y: p1.y };
        for (var bi = 0; bi < bends.length; bi++) {
          var b = bends[bi];
          // Manhattan segment from prev to b
          var midXB = (prev.x + b.x) / 2;
          d += ' L ' + midXB + ' ' + prev.y + ' L ' + midXB + ' ' + b.y + ' L ' + b.x + ' ' + b.y;
          prev = b;
        }
        // Manhattan segment from prev to p2
        var midXE = (prev.x + p2.x) / 2;
        d += ' L ' + midXE + ' ' + prev.y + ' L ' + midXE + ' ' + p2.y + ' L ' + p2.x + ' ' + p2.y;
      } else if (style === 'bezier') {
        var dx = p2.x - p1.x;
        var dy = p2.y - p1.y;
        var cpLen = Math.max(30, Math.abs(dx) * 0.5);
        var c1x = p1.x + (Math.abs(dx) > Math.abs(dy) ? cpLen * Math.sign(dx || 1) : 0);
        var c1y = p1.y + (Math.abs(dx) > Math.abs(dy) ? 0 : cpLen * Math.sign(dy || 1));
        var c2x = p2.x - (Math.abs(dx) > Math.abs(dy) ? cpLen * Math.sign(dx || 1) : 0);
        var c2y = p2.y - (Math.abs(dx) > Math.abs(dy) ? 0 : cpLen * Math.sign(dy || 1));
        d = 'M ' + p1.x + ' ' + p1.y + ' C ' + c1x + ' ' + c1y + ' ' + c2x + ' ' + c2y + ' ' + p2.x + ' ' + p2.y;
      } else if (style === 'direct') {
        d = 'M ' + p1.x + ' ' + p1.y + ' L ' + p2.x + ' ' + p2.y;
      } else {
        // Manhattan (default)
        var midX = (p1.x + p2.x) / 2;
        d = 'M ' + p1.x + ' ' + p1.y + ' L ' + midX + ' ' + p1.y + ' L ' + midX + ' ' + p2.y + ' L ' + p2.x + ' ' + p2.y;
      }

      var path = document.createElementNS(this.ns, 'path');
      path.setAttribute('d', d);
      path.setAttribute('class', 'wire-line');
      path.setAttribute('data-wire-id', wire.id);
      path.setAttribute('data-from', wire.from);
      path.setAttribute('data-to', wire.to);

      // Insert before components so wires are under
      var firstComp = this.svg.querySelector('[data-comp-id]');
      if (firstComp) {
        this.svg.insertBefore(path, firstComp);
      } else {
        this.svg.appendChild(path);
      }

      // Render bend point handles (draggable circles)
      if (bends.length > 0) {
        var handlesG = document.createElementNS(this.ns, 'g');
        handlesG.setAttribute('class', 'bend-handles');
        for (var hi = 0; hi < bends.length; hi++) {
          var handle = document.createElementNS(this.ns, 'circle');
          handle.setAttribute('cx', bends[hi].x);
          handle.setAttribute('cy', bends[hi].y);
          handle.setAttribute('r', 6);
          handle.setAttribute('fill', '#fbbf24');
          handle.setAttribute('stroke', '#fff');
          handle.setAttribute('stroke-width', '1.5');
          handle.setAttribute('class', 'bend-handle');
          handle.setAttribute('data-wire-id', wire.id);
          handle.setAttribute('data-bend-idx', hi);
          handle.setAttribute('style', 'cursor: move;');
          // Right-click to delete bend
          handle.addEventListener('contextmenu', (function (w, idx) {
            return function (e) {
              e.preventDefault();
              if (w.bends && w.bends.length > idx) {
                w.bends.splice(idx, 1);
                if (w.bends.length === 0) w.styleOverride = null;
                global.ForgeCAD.modeCircuits._renderWire(w);
                global.ForgeCAD.ui.status('Bend point removed');
              }
            };
          })(wire, hi));
          handlesG.appendChild(handle);
        }
        this.svg.appendChild(handlesG);
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
      var path = document.createElementNS(this.ns, 'path');
      var style = this.wireStyle;
      var d;
      if (style === 'bezier') {
        var dx = mx - p1.x, dy = my - p1.y;
        var cpLen = Math.max(30, Math.abs(dx) * 0.5);
        var c1x = p1.x + (Math.abs(dx) > Math.abs(dy) ? cpLen * Math.sign(dx || 1) : 0);
        var c1y = p1.y + (Math.abs(dx) > Math.abs(dy) ? 0 : cpLen * Math.sign(dy || 1));
        var c2x = mx - (Math.abs(dx) > Math.abs(dy) ? cpLen * Math.sign(dx || 1) : 0);
        var c2y = my - (Math.abs(dx) > Math.abs(dy) ? 0 : cpLen * Math.sign(dy || 1));
        d = 'M ' + p1.x + ' ' + p1.y + ' C ' + c1x + ' ' + c1y + ' ' + c2x + ' ' + c2y + ' ' + mx + ' ' + my;
      } else if (style === 'direct') {
        d = 'M ' + p1.x + ' ' + p1.y + ' L ' + mx + ' ' + my;
      } else {
        var midX = (p1.x + mx) / 2;
        d = 'M ' + p1.x + ' ' + p1.y + ' L ' + midX + ' ' + p1.y + ' L ' + midX + ' ' + my + ' L ' + mx + ' ' + my;
      }
      path.setAttribute('id', 'wire-preview');
      path.setAttribute('d', d);
      path.setAttribute('class', 'wire-line wire-preview');
      path.setAttribute('opacity', 0.6);
      path.setAttribute('pointer-events', 'none');
      this.svg.appendChild(path);
    },

    _findPin: function (id) {
      for (var i = 0; i < this.pins.length; i++) {
        if (this.pins[i].id === id) return this.pins[i];
      }
      return null;
    },

    _findWire: function (id) {
      for (var i = 0; i < this.wires.length; i++) {
        if (this.wires[i].id === id) return this.wires[i];
      }
      return null;
    },

    _findComponent: function (id) {
      for (var i = 0; i < this.components.length; i++) {
        if (this.components[i].id === id) return this.components[i];
      }
      return null;
    },

    /* ==================== SELECTION ==================== */
    selectComponent: function (id) {
      var all = this.svg.querySelectorAll('.circuits-component');
      for (var i = 0; i < all.length; i++) all[i].setAttribute('class', 'circuits-component');
      if (!id) {
        this.selected = null;
        global.ForgeCAD.ui.clearProperties();
        return;
      }
      this.selected = id;
      var el = this.svg.querySelector('[data-comp-id="' + id + '"]');
      if (el) el.setAttribute('class', 'circuits-component selected');
      this._showProperties(id);
    },

    /* ==================== PROPERTIES ==================== */
    _showProperties: function (id) {
      var comp = this._findComponent(id);
      if (!comp) return;
      global.ForgeCAD.ui.setPropertiesTitle('Properties — ' + comp.type);
      var p = objProps(comp);
      var color = comp.props.color || '#3b82f6';
      var isHole = false;
      var html = '';
      html += '<div class="prop-section"><div class="prop-section-title">Position</div>';
      html += global.ForgeCAD.ui.propRow3('Pos', [Math.round(comp.x), Math.round(comp.y), Math.round(comp.rotation * 180 / Math.PI)], ['cx','cy','cr']);
      html += '</div>';
      html += '<div class="prop-section"><div class="prop-section-title">Size</div>';
      html += global.ForgeCAD.ui.propRow3('Size', [Math.round(comp.width), Math.round(comp.height), ''], ['cw','ch','_unused']);
      html += '</div>';
      html += '<div class="prop-section"><div class="prop-section-title">Component</div>';
      if (comp.type === 'battery' || comp.type === 'solarcell') {
        html += '<div class="prop-row"><label>Volts</label><input type="number" id="prop-voltage" value="' + comp.props.voltage + '" step="0.1"></div>';
      } else if (comp.type === 'led' || comp.type === 'lamp') {
        html += '<div class="prop-row"><label>Color</label><div class="color-swatch" id="current-color-swatch" style="background:' + color + ';"></div><input type="text" id="current-color-text" value="' + color + '" style="width:80px;"></div>';
        var palette = ['#ff0000','#00ff00','#0000ff','#ffff00','#ff00ff','#00ffff','#ffffff'];
        html += '<div class="prop-row"><div style="margin-left:78px;" id="color-palette">';
        for (var i = 0; i < palette.length; i++) {
          html += '<button class="color-swatch-mini" data-color="' + palette[i] + '" style="background:' + palette[i] + ';width:20px;height:20px;border:1px solid #555;border-radius:3px;display:inline-block;margin:2px;cursor:pointer;"></button>';
        }
        html += '</div></div>';
        html += '<div class="prop-row"><label>Vf</label><input type="number" id="prop-vf" value="' + comp.props.onThreshold + '" step="0.1"></div>';
      } else if (comp.type === 'resistor' || comp.type === 'pot') {
        html += '<div class="prop-row"><label>Ohms</label><input type="number" id="prop-resistance" value="' + comp.props.resistance + '" step="10"></div>';
        if (comp.type === 'pot') {
          html += '<div class="prop-row"><label>Position</label><input type="range" id="prop-position" min="0" max="1" step="0.01" value="' + comp.props.position + '"></div>';
        }
      } else if (comp.type === 'capacitor') {
        html += '<div class="prop-row"><label>μF</label><input type="number" id="prop-capacitance" value="' + comp.props.capacitance + '" step="1"></div>';
      } else if (comp.type === 'inductor') {
        html += '<div class="prop-row"><label>μH</label><input type="number" id="prop-inductance" value="' + comp.props.inductance + '" step="1"></div>';
      } else if (comp.type === 'buzzer') {
        html += '<div class="prop-row"><label>Hz</label><input type="number" id="prop-freq" value="' + comp.props.frequency + '" step="10"></div>';
      } else if (comp.type === 'motor') {
        html += '<div class="prop-row"><label>Volts</label><input type="number" id="prop-voltage" value="' + comp.props.voltage + '" step="0.1"></div>';
      } else if (comp.type === 'button' || comp.type === 'switch') {
        html += '<div class="prop-row"><label>Closed</label><input type="checkbox" id="prop-closed" ' + (comp.props.closed ? 'checked' : '') + '></div>';
      } else if (comp.type === 'diode' || comp.type === 'rgbled') {
        html += '<div class="prop-row"><label>Vf</label><input type="number" id="prop-vf" value="' + comp.props.onThreshold + '" step="0.1"></div>';
        if (comp.type === 'rgbled') {
          html += '<div class="prop-row"><label>Color</label><div class="color-swatch" id="current-color-swatch" style="background:' + color + ';"></div><input type="text" id="current-color-text" value="' + color + '" style="width:80px;"></div>';
        }
      } else if (comp.type === 'transistor') {
        html += '<div class="prop-row"><label>Gain (β)</label><input type="number" id="prop-gain" value="' + comp.props.gain + '" step="10"></div>';
      } else if (comp.type === 'ldr') {
        html += '<div class="prop-row"><label>Light (Ω)</label><input type="number" id="prop-resistance" value="' + comp.props.resistance + '" step="100"></div>';
        html += '<div class="prop-row"><label>Light Lvl</label><input type="range" id="prop-light" min="0" max="100" value="' + comp.props.light + '"></div>';
      } else if (comp.type === 'ic') {
        html += '<div class="prop-row"><label>Label</label><input type="text" id="prop-label" value="' + (comp.props.label || 'IC') + '"></div>';
        html += '<div class="prop-row"><label>Pins</label><input type="number" id="prop-pins" value="' + (comp.props.pins || 8) + '" min="4" max="40" step="2"></div>';
      } else if (comp.type === 'sevenseg') {
        html += '<div class="prop-row"><label>Display</label><input type="text" id="prop-value" value="' + (comp.props.value || '0') + '" maxlength="1"></div>';
      }
      html += '</div>';
      html += '<div class="prop-section"><div class="prop-section-title">Actions</div>';
      html += '<div class="prop-row"><button class="tb-btn" id="btn-rotate-comp" style="width:100%;">Rotate 90°</button></div>';
      html += '<div class="prop-row"><button class="tb-btn" id="btn-duplicate-comp" style="width:100%;">Duplicate</button></div>';
      html += '<div class="prop-row"><button class="tb-btn" id="btn-delete-comp" style="width:100%;">Delete</button></div>';
      html += '</div>';
      global.ForgeCAD.ui.setPropertiesHTML(html);

      var self = this;
      var bind = function (id, key, parser) {
        var el = document.getElementById(id);
        if (!el) return;
        var handler = function () {
          var v = parser ? parser(el.value) : el.value;
          comp.props[key] = v;
          if (key === 'color') {
            var sw = document.getElementById('current-color-swatch');
            if (sw) sw.style.background = v;
            self._renderComponent(comp);
          } else if (key === 'pins' || key === 'label' || key === 'value') {
            self._renderComponent(comp);
          }
        };
        el.addEventListener('input', handler);
        el.addEventListener('change', handler);
      };
      bind('prop-voltage', 'voltage', parseFloat);
      bind('prop-resistance', 'resistance', parseFloat);
      bind('prop-capacitance', 'capacitance', parseFloat);
      bind('prop-inductance', 'inductance', parseFloat);
      bind('prop-freq', 'frequency', parseFloat);
      bind('prop-vf', 'onThreshold', parseFloat);
      bind('prop-gain', 'gain', parseFloat);
      bind('prop-light', 'light', parseFloat);
      bind('prop-position', 'position', parseFloat);
      bind('prop-label', 'label');
      bind('prop-value', 'value');
      bind('prop-pins', 'pins', function (v) { return parseInt(v, 10); });
      bind('prop-closed', 'closed', function () { return document.getElementById('prop-closed').checked; });
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
      // Position / size / rotation
      ['cx','cy','cr','cw','ch'].forEach(function (id, idx) {
        var el = document.getElementById(id);
        if (!el) el = document.querySelector('[data-prop="' + id + '"]');
        if (el) {
          var posHandler = function () {
            var v = parseFloat(el.value);
            if (isNaN(v)) return;
            if (id === 'cx') comp.x = v;
            else if (id === 'cy') comp.y = v;
            else if (id === 'cr') comp.rotation = v * Math.PI / 180;
            else if (id === 'cw') comp.width = Math.max(10, v);
            else if (id === 'ch') comp.height = Math.max(8, v);
            self._renderComponent(comp);
          };
          el.addEventListener('input', posHandler);
          el.addEventListener('change', posHandler);
        }
      });
      // Buttons
      var rotBtn = document.getElementById('btn-rotate-comp');
      if (rotBtn) rotBtn.addEventListener('click', function () {
        comp.rotation += Math.PI / 2;
        self._renderComponent(comp);
        self._showProperties(comp.id);
      });
      var dupBtn = document.getElementById('btn-duplicate-comp');
      if (dupBtn) dupBtn.addEventListener('click', function () {
        var newId = 'c' + Date.now() + '_' + self.components.length;
        var newComp = JSON.parse(JSON.stringify(comp));
        newComp.id = newId;
        newComp.x += 60;
        newComp.y += 30;
        self.components.push(newComp);
        self._renderComponent(newComp);
        self.selectComponent(newId);
      });
      var delBtn = document.getElementById('btn-delete-comp');
      if (delBtn) delBtn.addEventListener('click', function () {
        self.deleteComponent(comp.id);
      });
    },

    deleteComponent: function (id) {
      for (var i = 0; i < this.components.length; i++) {
        if (this.components[i].id === id) { this.components.splice(i, 1); break; }
      }
      var newPins = [];
      for (var j = 0; j < this.pins.length; j++) {
        if (this.pins[j].component !== id) newPins.push(this.pins[j]);
      }
      this.pins = newPins;
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
      var el = this.svg.querySelector('[data-comp-id="' + id + '"]');
      if (el) el.parentNode.removeChild(el);
      this.selectComponent(null);
    },

    /* ==================== SIMULATION (very basic) ==================== */
    simRunning: false,
    simTimer: null,

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
      var liveWires = this.svg.querySelectorAll('.wire-line.live');
      for (var i = 0; i < liveWires.length; i++) liveWires[i].setAttribute('class', 'wire-line');
      // Reset LEDs and other loads
      var comps = this.svg.querySelectorAll('[data-comp-id]');
      for (var j = 0; j < comps.length; j++) {
        var cid = comps[j].getAttribute('data-comp-id');
        var comp = this._findComponent(cid);
        if (!comp) continue;
        var body = comps[j].querySelector('rect, circle');
        if (!body) continue;
        if (comp.type === 'led' || comp.type === 'lamp' || comp.type === 'rgbled') {
          body.setAttribute('fill', comp.props.color || '#ff0000');
          body.setAttribute('opacity', 0.4);
          body.removeAttribute('filter');
        }
      }
      global.ForgeCAD.ui.status('Stopped');
    },

    _simulateStep: function () {
      var battery = null;
      for (var i = 0; i < this.components.length; i++) {
        if (this.components[i].type === 'battery' || this.components[i].type === 'solarcell') {
          battery = this.components[i]; break;
        }
      }
      if (!battery) return;
      var circuitClosed = true;
      for (var j = 0; j < this.components.length; j++) {
        var c = this.components[j];
        if ((c.type === 'switch' || c.type === 'button') && !c.props.closed) {
          circuitClosed = false; break;
        }
      }
      var wires = this.svg.querySelectorAll('.wire-line');
      for (var k = 0; k < wires.length; k++) {
        if (circuitClosed) wires[k].setAttribute('class', 'wire-line live');
        else wires[k].setAttribute('class', 'wire-line');
      }
      for (var m = 0; m < this.components.length; m++) {
        var comp = this.components[m];
        if (comp.type !== 'led' && comp.type !== 'lamp' && comp.type !== 'rgbled') continue;
        var el = this.svg.querySelector('[data-comp-id="' + comp.id + '"]');
        if (!el) continue;
        var body = el.querySelector('rect, circle');
        if (!body) continue;
        if (circuitClosed && battery.props.voltage > (comp.props.onThreshold || 1.8)) {
          body.setAttribute('fill', comp.props.color || '#ff0000');
          body.setAttribute('opacity', 1.0);
          body.setAttribute('filter', 'url(#led-glow)');
          this._ensureGlowFilter();
        } else {
          body.setAttribute('fill', comp.props.color || '#ff0000');
          body.setAttribute('opacity', 0.35);
          body.removeAttribute('filter');
        }
      }
    },

    _ensureGlowFilter: function () {
      var existing = this.svg.querySelector('#led-glow');
      if (existing) return;
      var defs = this.svg.querySelector('defs') || document.createElementNS(this.ns, 'defs');
      if (!defs.parentNode) this.svg.insertBefore(defs, this.svg.firstChild);
      var filter = document.createElementNS(this.ns, 'filter');
      filter.setAttribute('id', 'led-glow');
      filter.setAttribute('x', '-50%'); filter.setAttribute('y', '-50%');
      filter.setAttribute('width', '200%'); filter.setAttribute('height', '200%');
      var glow = document.createElementNS(this.ns, 'feGaussianBlur');
      glow.setAttribute('stdDeviation', '3');
      glow.setAttribute('result', 'glow');
      filter.appendChild(glow);
      var merge = document.createElementNS(this.ns, 'feMerge');
      var m1 = document.createElementNS(this.ns, 'feMergeNode');
      m1.setAttribute('in', 'glow');
      var m2 = document.createElementNS(this.ns, 'feMergeNode');
      m2.setAttribute('in', 'SourceGraphic');
      merge.appendChild(m1); merge.appendChild(m2);
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
        version: 2,
        mode: 'circuits',
        wireStyle: this.wireStyle,
        snapToGrid: this.snapToGrid,
        components: JSON.parse(JSON.stringify(this.components)),
        wires: JSON.parse(JSON.stringify(this.wires)),
        customTypes: JSON.parse(JSON.stringify(this.customTypes))
      };
    },

    deserialize: function (data) {
      var self = this;
      this.clearAll();
      this.components = [];
      this.pins = [];
      this.wires = [];
      this._drawBreadboard();
      if (!data) return;
      if (data.wireStyle) this.wireStyle = data.wireStyle;
      if (data.snapToGrid !== undefined) this.snapToGrid = data.snapToGrid;
      if (data.customTypes) this.customTypes = data.customTypes;
      if (!data.components) return;
      for (var i = 0; i < data.components.length; i++) {
        var c = data.components[i];
        // Re-attach custom type if applicable
        if (c.type.indexOf('custom_') === 0) {
          var cid = c.type.substring(7);
          for (var ci = 0; ci < this.customTypes.length; ci++) {
            if (this.customTypes[ci].id === cid) { c._customType = this.customTypes[ci]; break; }
          }
        }
        this.components.push(c);
        this._renderComponent(c);
      }
      if (data.wires) {
        for (var j = 0; j < data.wires.length; j++) {
          this.wires.push(data.wires[j]);
          this._renderWire(data.wires[j]);
        }
      }
      this._populatePanel();
      global.ForgeCAD.ui.toast('Loaded ' + data.components.length + ' components');
    },

    /* ==================== CUSTOM ELEMENT MAKER ==================== */
    openCustomMaker: function () {
      var self = this;
      var html = '';
      html += '<p style="margin-bottom:12px;font-size:12px;color:#9aa3b2;">Define a custom component. Set name, glyph, body shape, size, color, and pins. The component will appear in the left panel under "My Custom Elements".</p>';
      html += '<div class="prop-section">';
      html += '<div class="prop-row"><label>Name</label><input type="text" id="cm-name" value="My Part" style="width:60%;"></div>';
      html += '<div class="prop-row"><label>Glyph</label><input type="text" id="cm-glyph" value="◆" maxlength="2" style="width:40px;text-align:center;"></div>';
      html += '<div class="prop-row"><label>Label</label><input type="text" id="cm-label" value="X" maxlength="4" style="width:60px;text-align:center;"></div>';
      html += '<div class="prop-row"><label>Body</label><select id="cm-shape" style="flex:1;"><option value="rect">Rectangle</option><option value="circle">Circle</option></select></div>';
      html += '<div class="prop-row"><label>Width</label><input type="number" id="cm-width" value="50" min="20" max="200" style="width:80px;"></div>';
      html += '<div class="prop-row"><label>Height</label><input type="number" id="cm-height" value="30" min="10" max="200" style="width:80px;"></div>';
      html += '<div class="prop-row"><label>Color</label><div class="color-swatch" id="cm-color-swatch" style="background:#475569;"></div><input type="text" id="cm-color" value="#475569" style="width:80px;"></div>';
      html += '<div class="prop-row"><label>Text</label><input type="text" id="cm-textcolor" value="#ffffff" style="width:80px;"></div>';
      html += '</div>';
      html += '<div class="prop-section"><div class="prop-section-title">Pins</div>';
      html += '<div id="cm-pins-list" style="max-height:200px;overflow-y:auto;border:1px solid #353f4f;border-radius:4px;padding:4px;margin-bottom:8px;"></div>';
      html += '<button class="tb-btn" id="cm-add-pin" style="width:100%;margin-bottom:8px;">+ Add Pin</button>';
      html += '</div>';
      html += '<div style="text-align:right;margin-top:12px;">';
      html += '<button class="tb-btn" id="cm-cancel" style="margin-right:6px;">Cancel</button>';
      html += '<button class="tb-btn primary" id="cm-save">Create Element</button>';
      html += '</div>';
      global.ForgeCAD.ui.modal('⚙ Custom Element Maker', html);

      var pins = [
        { label: 'a', x: -25, y: 0 },
        { label: 'b', x: 25, y: 0 }
      ];
      var renderPins = function () {
        var listEl = document.getElementById('cm-pins-list');
        if (!listEl) return;
        var ph = '';
        for (var i = 0; i < pins.length; i++) {
          ph += '<div style="display:flex;gap:4px;margin-bottom:4px;align-items:center;">';
          ph += '<input type="text" class="cm-pin-label" data-idx="' + i + '" value="' + pins[i].label + '" style="width:40px;" placeholder="lbl">';
          ph += '<input type="number" class="cm-pin-x" data-idx="' + i + '" value="' + pins[i].x + '" style="width:60px;" placeholder="X">';
          ph += '<input type="number" class="cm-pin-y" data-idx="' + i + '" value="' + pins[i].y + '" style="width:60px;" placeholder="Y">';
          ph += '<button class="tb-btn cm-pin-del" data-idx="' + i + '" style="font-size:11px;padding:2px 6px;color:#e74c3c;">×</button>';
          ph += '</div>';
        }
        listEl.innerHTML = ph;
        // Bind
        var labelEls = listEl.querySelectorAll('.cm-pin-label');
        for (var li = 0; li < labelEls.length; li++) {
          labelEls[li].addEventListener('input', function (ev) {
            var idx = parseInt(ev.target.getAttribute('data-idx'), 10);
            pins[idx].label = ev.target.value;
          });
        }
        var xEls = listEl.querySelectorAll('.cm-pin-x');
        for (var xi = 0; xi < xEls.length; xi++) {
          xEls[xi].addEventListener('input', function (ev) {
            var idx = parseInt(ev.target.getAttribute('data-idx'), 10);
            pins[idx].x = parseFloat(ev.target.value) || 0;
          });
        }
        var yEls = listEl.querySelectorAll('.cm-pin-y');
        for (var yi = 0; yi < yEls.length; yi++) {
          yEls[yi].addEventListener('input', function (ev) {
            var idx = parseInt(ev.target.getAttribute('data-idx'), 10);
            pins[idx].y = parseFloat(ev.target.value) || 0;
          });
        }
        var delEls = listEl.querySelectorAll('.cm-pin-del');
        for (var di = 0; di < delEls.length; di++) {
          delEls[di].addEventListener('click', function (ev) {
            var idx = parseInt(ev.target.getAttribute('data-idx'), 10);
            pins.splice(idx, 1);
            renderPins();
          });
        }
      };
      renderPins();
      document.getElementById('cm-add-pin').addEventListener('click', function () {
        pins.push({ label: 'p' + (pins.length + 1), x: 0, y: 25 });
        renderPins();
      });

      // Color picker
      var colorText = document.getElementById('cm-color');
      var colorSwatch = document.getElementById('cm-color-swatch');
      colorText.addEventListener('input', function () {
        colorSwatch.style.background = colorText.value;
      });

      document.getElementById('cm-cancel').addEventListener('click', function () {
        global.ForgeCAD.ui.modalClose();
      });
      document.getElementById('cm-save').addEventListener('click', function () {
        var name = document.getElementById('cm-name').value || 'Custom';
        var glyph = document.getElementById('cm-glyph').value || '◆';
        var label = document.getElementById('cm-label').value || name.substring(0, 3);
        var shape = document.getElementById('cm-shape').value;
        var w = parseInt(document.getElementById('cm-width').value, 10) || 50;
        var h = parseInt(document.getElementById('cm-height').value, 10) || 30;
        var color = document.getElementById('cm-color').value || '#475569';
        var textColor = document.getElementById('cm-textcolor').value || '#ffffff';
        var ct = {
          id: 'ct' + Date.now(),
          name: name,
          glyph: glyph,
          label: label,
          bodyShape: shape,
          width: w,
          height: h,
          color: color,
          textColor: textColor,
          pins: pins.slice()
        };
        self.customTypes.push(ct);
        self._populatePanel();
        global.ForgeCAD.ui.modalClose();
        global.ForgeCAD.ui.toast('Created "' + name + '" — find it under "My Custom Elements"');
      });
    },

    _addCustomInstance: function (ct) {
      var n = this.components.length;
      var cx = 150 + (n % 5) * 100;
      var cy = 180 + Math.floor(n / 5) * 80;
      var comp = {
        id: 'c' + Date.now() + '_' + n,
        type: 'custom_' + ct.id,
        x: cx,
        y: cy,
        rotation: 0,
        width: ct.width,
        height: ct.height,
        props: {},
        _customType: ct
      };
      this.components.push(comp);
      this._renderComponent(comp);
      this.selectComponent(comp.id);
      global.ForgeCAD.ui.status('Added ' + ct.name);
    },

    /* ==================== MOBILE ==================== */
    showMobilePanel: function () {
      var html = '<div style="padding:8px;">';
      html += '<div style="font-size:11px;text-transform:uppercase;color:#6b7280;margin-bottom:8px;">Add Component</div>';
      html += '<div style="display:flex;flex-wrap:wrap;">';
      var items = [
        ['battery','⚡ Battery'],['button','⏺ Button'],['switch','⇋ Switch'],['solarcell','☀ Solar'],
        ['led','◉ LED'],['rgbled','✱ RGB LED'],['buzzer','♫ Buzzer'],['motor','⌽ Motor'],['lamp','💡 Lamp'],
        ['resistor','⌇ Resistor'],['pot','⊥ Pot'],['capacitor','☰ Cap'],['inductor','∿ Inductor'],
        ['diode','▷ Diode'],['transistor','ⓣ NPN'],['ldr','◐ LDR'],
        ['sevenseg','8 7-Seg'],['ic','⬚ IC'],['arduino','⬚ Arduino']
      ];
      for (var i = 0; i < items.length; i++) {
        html += '<button class="shape-btn" data-component="' + items[i][0] + '" style="width:33%;"><span class="shape-glyph">' + items[i][1].split(' ')[0] + '</span><span>' + items[i][1].split(' ').slice(1).join(' ') + '</span></button>';
      }
      html += '<button class="shape-btn" data-component="custom" style="width:33%;"><span class="shape-glyph">⚙</span><span>Custom Maker</span></button>';
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

  // Helper for the properties panel (kept outside the object literal for clarity)
  function objProps(comp) {
    return comp.props || {};
  }

  global.ForgeCAD = global.ForgeCAD || {};
  global.ForgeCAD.modeCircuits = modeC;

})(typeof window !== 'undefined' ? window : this);
