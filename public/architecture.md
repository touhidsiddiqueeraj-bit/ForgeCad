# ForgeCAD — Architecture

This document describes the internal architecture of ForgeCAD: module layout,
data flow, key design decisions, and technology rationale.

---

## 1. High-Level Overview

ForgeCAD is a **single-page vanilla-JS application** with no framework, no
bundler, and no build step. It runs entirely client-side.

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser                                                        │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  index.html                                             │    │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────────┐    │    │
│  │  │ Topbar     │  │ Left panel │  │ Right panel    │    │    │
│  │  │ (mode/tab/ │  │ (shapes or │  │ (properties)   │    │    │
│  │  │  export)   │  │  comps)    │  │                │    │    │
│  │  └────────────┘  └────────────┘  └────────────────┘    │    │
│  │  ┌─────────────────────────────────────────────────┐   │    │
│  │  │  Viewport (canvas-3d or svg-circuits)           │   │    │
│  │  │  + floating toolbars (3D gizmo / circuits zoom) │   │    │
│  │  └─────────────────────────────────────────────────┘   │    │
│  │  ┌────────────┐                                        │    │
│  │  │ Status bar │                                        │    │
│  │  └────────────┘                                        │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                  │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  ForgeCAD global object (window.ForgeCAD)               │    │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌──────────┐         │    │
│  │  │ app    │ │ mode3D │ │ modeC  │ │ storage  │         │    │
│  │  ├────────┤ ├────────┤ ├────────┤ ├──────────┤         │    │
│  │  │ theme  │ │ ui     │ │compat  │ │tutorial  │         │    │
│  │  ├────────┤ ├────────┤ ├────────┤ ├──────────┤         │    │
│  │  │exporters│ │        │ │        │ │          │         │    │
│  │  └────────┘ └────────┘ └────────┘ └──────────┘         │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                  │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Browser APIs                                           │    │
│  │  WebGL 1  │  SVG  │  IndexedDB  │  localStorage         │    │
│  │  File API │  Blob  │  URL.createObjectURL                │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

There is no backend. All data (scenes, projects, autosaves) lives in the
browser. The only network requests are:
- Initial load of the app's own JS/CSS files
- Three.js FontLoader fetching a font JSON from jsdelivr CDN (text shapes only)
- `navigator.storage.estimate()` for quota info

---

## 2. Module Layout

All app code lives under `public/js/`. Load order matters — later modules
depend on earlier ones.

| File | Lines | Purpose | Depends on |
|------|-------|---------|------------|
| `polyfills.js` | 401 | Shims for ancient browsers (Promise, fetch, classList, etc.) | — |
| `compat.js` | 229 | Browser/device detection, performance tier | polyfills |
| `theme.js` | 65 | Dark/light theme toggle (persisted) | — |
| `ui.js` | 207 | Shared UI: toast, modal, dropdown, properties builder | — |
| `storage.js` | 306 | IndexedDB project persistence (localStorage fallback) | ui |
| `exporters.js` | 314 | STL/OBJ/GLTF/PNG exporters + JSON project save/load | ui |
| `mode-3d.js` | 1691 | 3D Design mode (Three.js scene, primitives, gizmo, transform) | compat, ui, exporters |
| `mode-circuits.js` | 2075 | Circuits mode (SVG breadboard, components, wires, solver) | ui |
| `tutorial.js` | 488 | Interactive tutorials with spotlight overlay | ui |
| `main.js` | 709 | App entry, mode switching, top bar, projects modal, autosave | all above |

Vendor libraries under `public/vendor/`:
- `three.min.js` (r128) — WebGL 1, ES5-compatible build
- `OrbitControls.js` (r128) — camera controls
- `STLExporter.js`, `OBJExporter.js`, `GLTFExporter.js` (r128)

---

## 3. Module Responsibilities

### 3.1 `polyfills.js`

Loaded first. Provides shims for:
- `console`, `Date.now`, `Object.keys`, `Object.create`
- `Array.isArray`, `Array.prototype.{forEach,indexOf,map,filter,reduce}`
- `Function.prototype.bind`, `String.prototype.trim`
- `JSON.stringify`, `JSON.parse` (naive — only for our own data)
- `requestAnimationFrame` (with vendor prefixes)
- `classList` (DOMTokenList shim via `Object.defineProperty`)
- `addEventListener` for IE8
- Minimal `Promise` (`.then`/`.catch`, no `race`/`all`)
- `fetch` (XHR-backed, returns a Promise)
- `Array.from`, `Element.matches`, `Element.closest`
- `URL.createObjectURL`, `Blob`, `Uint8Array` fallbacks

All polyfills are conditional — they only install if the native version is
missing.

### 3.2 `compat.js` — Capability Detection

`ForgeCAD.compat` is a singleton populated at load time. It detects:

- **Renderer**: WebGL 1 vs 2 (tries context names: `webgl2`, `experimental-webgl2`,
  `webgl`, `experimental-webgl`, `webkit-3d`, `moz-webgl`)
- **Browser identity**: ie/edge/firefox/chrome/safari/webkit + version
- **Device**: `navigator.deviceMemory` (Chrome-only, capped at 8GB for privacy),
  `navigator.hardwareConcurrency`, `devicePixelRatio`
- **Features**: flexbox, flexbox gap, CSS variables, ES6, localStorage, File API

Then computes a **performance tier** (`low`/`mid`/`high`) based on a weighted
score. The tier controls:
- `maxObjects` (100/250/500)
- `meshDetail` (low/mid/high) — segment counts for spheres, cylinders, etc.
- `enableShadows` (high only)
- `enableAntialias` (mid and high)
- `pixelRatioCap` (1/1.5/2)

### 3.3 `theme.js`

Two themes: `dark` (default) and `light`. Implemented via `.theme-dark` /
`.theme-light` classes on `<body>` — **no CSS custom properties** because
Safari 7 doesn't support them.

Persisted in `localStorage` under key `forgecad-theme`. On toggle, updates
`<meta name="theme-color">` and notifies `mode3D` to swap scene background.

### 3.4 `ui.js`

Shared UI primitives:
- `toast(msg, ms)` — bottom-center toast
- `modal(title, html)` / `modalClose()` — centered modal with backdrop
- `status(left, center)` / `setObjects(n)` / `setFps(fps)` / `setPerf(tier)`
- `showDropdown(id, anchor)` / `hideDropdowns()`
- `bottomSheetOpen/Close/Toggle(html)` — mobile bottom sheet
- `clearProperties()` / `setPropertiesTitle(title)` / `setPropertiesHTML(html)`
- `propRow3(label, vals, keys)` — generates a 3-axis input row (X/Y/Z).
  Sets both `id` and `data-prop` on each input (critical for property binding)
- `confirm(msg, onYes)` — modal-based confirm

### 3.5 `storage.js` — IndexedDB Persistence

Callback-based API over IndexedDB with localStorage fallback:

- `init(callback)` — opens DB, creates object stores on upgrade
- `saveProject(meta, data, callback)` — saves with auto-incrementing id.
  `meta` includes name, mode, optional thumbnail (48×48 PNG data URL)
- `listProjects(callback)` — returns array without heavy `data` payload
- `loadProject(id, callback)` — returns full record
- `deleteProject(id, callback)`, `renameProject(id, newName, callback)`
- `autoSave(data, callback)` / `loadAutoSave(callback)` — single-slot
  autosave (key: `'current'`)
- `stats(callback)` — backend name, project count, total size, quota/usage

**Schema**:
- `projects` store: keyPath=`id` (autoIncrement), indexes on `name`, `ts`, `mode`
- `autosave` store: keyPath=`slot` (single record with `slot='current'`)

**Fallback** (localStorage): all projects as a single JSON array under
`forgecad-projects`. Autosave under `forgecad-autosave`. ~5MB limit.

### 3.6 `exporters.js`

- `download(filename, content, mimeType)` — Blob-based with data URI fallback
- `exportSTL(scene, filename)` — binary STL via Three.js STLExporter
- `exportOBJ(scene, filename)` — ASCII OBJ
- `exportGLTF(scene, filename)` — JSON GLTF (not binary GLB)
- `exportPNG(canvas, filename)` — `canvas.toDataURL` → Blob. Requires
  `preserveDrawingBuffer: true` on the WebGL renderer
- `exportProject(projectData, filename)` — JSON serialization
- `importProject(file, callback)` — reads `.json` via FileReader
- `importMesh(file, callback)` — parses `.stl` (binary or ASCII) and `.obj`
  into Three.js BufferGeometry

### 3.7 `mode-3d.js` — 3D Design Mode

The largest module (1691 lines). Holds all 3D state:

- `renderer` (WebGLRenderer), `scene`, `camera` (PerspectiveCamera),
  `controls` (OrbitControls), `raycaster`
- `objects[]` — tracked meshes/groups
- `selected[]` — currently selected objects
- `tool` — current transform tool (`move`/`rotate`/`scale`)
- `multiSelectMode` — toggle via toolbar button (no Shift needed)
- `_gizmo` — XYZ axis arrows Group (red=X, green=Y, blue=Z)

**Initialization**: creates WebGLRenderer, replaces the placeholder canvas
(removes original to avoid duplicate IDs), sets up scene/camera/lights/grid/
workplane/axes/bbox helper/gizmo, binds events, starts render loop.

**Event handling**: uses **pointer events** when available (matches
OrbitControls), falling back to mouse events. `pointerdown` on canvas raycasts
objects; if hit, marks drag candidate and disables OrbitControls.
`pointermove` on document (pointer capture redirects events): if dragging,
calls `_performDrag`. `pointerup` on document: if no drag, treat as click.

**Gizmo**: 3 colored arrows built at unit scale, resized to 60% of the
selection's largest dimension (clamped 5–80 units). Each arrow has an
invisible cylindrical hit area covering the full length. Click an arrow →
`_activeAxis` set → `_performDrag` constrains movement to that axis using
plane projection (plane contains axis + faces camera).

**Drag logic** (`_performDrag`):
- **Move + axis**: project ray onto plane containing the axis and facing
  camera, compute axis delta, apply with snap
- **Move free**: project onto horizontal plane at object's Y, move on XZ
- **Rotate**: horizontal drag = Y rotation, vertical = X rotation
- **Scale**: vertical drag = uniform scale

**Selection** (`_handleClickAt`): raycast all objects (recursive), walk
parent chain to find tracked root, shift-click or multi-select toggle adds
to selection. Yellow bbox + blue emissive on selected.

**Properties** (`_showProperties` + `_bindPropertyInputs`): generates HTML
via `ui.propRow3`, binds `input` AND `change` events for live updates.
`_applyProp` handles dotted keys (`position.x`, `dimensions.w`).
`_refreshPropertyValues` updates inputs without rebuilding panel (preserves
focus) — called after drag.

### 3.8 `mode-circuits.js` — Circuits Mode

SVG-based (works on every browser since IE9). 2075 lines. Holds:

- `components[]` — `{id, type, x, y, rotation, width, height, props}`
- `pins[]` — `{id, component, x, y, label}` (world coords, rotation-aware)
- `wires[]` — `{id, from, to, bends[], styleOverride}`
- `customTypes[]` — user-defined component types
- `wireStyle` — manhattan/bezier/direct/custom
- `zoom`, `panX`, `panY` — viewBox-based zoom/pan

**Breadboard**: SVG grid of holes + power rails. ViewBox reflects zoom/pan.

**Components**: 20 built-in types + custom types. Each rendered as SVG `<g>`
with transform. Body shapes vary by type (rect/circle/polygon/path). Each pin
has TWO elements: 12px invisible hit area + 5px visible pin with
`pointer-events: none`. Component values (resistance, voltage, capacitance)
displayed as text below the body.

**Wire routing** (`_renderWire`):
- **Manhattan**: L-shape via midpoint
- **Bezier**: cubic bezier with control points extending from each pin
- **Direct**: straight line
- **Custom**: Manhattan segments between bend points. Bend points rendered as
  draggable yellow circles

**Wire editing**: single-click selects (yellow highlight), double-click adds
bend point, right-click bend deletes it. Delete key removes selected wire.

**Zoom & pan**: mouse wheel zooms around cursor, drag empty space or
middle-click pans. ViewBox updates accordingly.

**Circuit solver** (`_solveCircuit`): proper nodal analysis
1. Union-find groups pins into electrical nodes via wires
2. Collects resistive components (resistors, pots, LDRs, LEDs, motors, etc.)
3. Finds battery nodes (or uses multimeter probes if no battery)
4. Gauss-Seidel iteration (200 iterations) solves node voltages
5. Computes total current leaving battery+ terminal
6. Equivalent resistance = V / I

The multimeter uses this solver:
- **Voltage mode**: measures voltage difference between the two nodes its
  probes connect to
- **Resistance mode**: works without a battery — uses meter's probes as
  measurement points with hypothetical 1V source
- **Current mode**: I = V / R_eq

**Simulation** (`_simulateStep`): runs every 100ms via setTimeout
- Checks: battery present? All switches closed?
- Animates wires (green when live)
- Animates load components: LED/lamp glow, buzzer pulses, motor spins,
  7-segment shows digit
- Always updates multimeters (even without battery)

### 3.9 `tutorial.js`

4 predefined tutorials:
- `3d-basics` (7 steps), `circuits-basics` (6 steps)
- `led-project` (10 steps), `house-3d-project` (6 steps)

Each step has a `target` CSS selector and optional `action` function. The
tutorial builds an overlay (semi-transparent backdrop), a spotlight (yellow
border with `box-shadow: 0 0 0 9999px rgba(0,0,0,0.6)`), and a popover with
Prev/Next/Skip buttons. Steps with `action` auto-perform actions (add
components, switch modes, etc.) so the user sees the project build itself.

Keyboard: `Esc` ends, `→` next, `←` prev.

### 3.10 `main.js` — App Entry

`ForgeCAD.app` singleton coordinates everything:

- **`init()`**: theme → storage.init → mode3D.init → modeCircuits.init →
  bind top bar → bind mode switch → bind circuits toolbar → bind multi-select
  toggle → start autosave → setMode('3d')
- **`setMode(mode)`**: toggle body class, mode tabs, canvas visibility,
  toolbar visibility (3D toolbar vs circuits toolbar), help hint
- **Autosave**: every 30s + on `beforeunload`. On startup, prompts to restore
- **Projects modal**: lists IndexedDB projects with thumbnails, load/rename/
  delete, storage stats footer
- **Export menu**: STL/OBJ/GLTF/PNG dropdown
- **Keyboard**: Esc closes dialogs, Delete removes selected wire in circuits

---

## 4. Data Flow

### 4.1 Add a 3D shape

```
User clicks "Box" button
  → left-panel click handler
  → mode3D.addShape('box')
  → creates Mesh with BoxGeometry
  → adds to _objectsGroup, pushes to objects[]
  → sets selected = [mesh]
  → _updateSelectionVisual() — emissive glow + bbox + gizmo
  → _showProperties() — builds right panel with propRow3
  → _bindPropertyInputs() — attaches input/change listeners
  → render loop picks up new mesh
```

### 4.2 Drag via gizmo

```
User clicks X arrow on gizmo
  → pointerdown: raycast gizmo children → hit → _activeAxis = 'x'
  → _dragTarget = selected[0], _dragHitPoint = hit point
  → OrbitControls disabled
User moves mouse
  → pointermove on document: if _activeAxis and moved > 4px → _dragging = true
  → _performDrag:
      - axisVec = (1,0,0)
      - planeNormal = cross(axisVec, camDir).cross(axisVec)
      - plane through _dragHitPoint
      - intersect ray with plane → _tmpVec
      - axisDelta = (_tmpVec - _dragHitPoint) · axisVec
      - target.position.x = _dragStartPos.x + axisDelta (with snap)
  → _updateSelectionVisual() — moves bbox + gizmo
  → _refreshPropertyValues() — updates inputs without rebuilding
User releases
  → pointerup: _showProperties() rebuilds panel with final values
  → OrbitControls re-enabled
```

### 4.3 Connect circuit pins

```
User clicks pin A
  → SVG click: target has data-pin-id → _onPinClick(pinIdA)
  → wireStartPin = pinIdA
  → _highlightWireStartPin(pinIdA) — yellow + pulsing
User moves mouse
  → SVG mousemove: _updateWirePreview draws dashed line from pin A to cursor
User clicks pin B
  → SVG click: target has data-pin-id → _onPinClick(pinIdB)
  → wireStartPin !== pinIdB → create wire {id, from, to, bends: []}
  → push to wires[], _renderWire(wire)
  → clear preview, unhighlight
```

### 4.4 Multimeter measurement

```
Sim tick (every 100ms):
  → _simulateStep()
  → find battery (if any)
  → check circuit closed (switches)
  → animate wires/LEDs (if battery)
  → _updateMultimeters(battery, circuitClosed)
      → for each multimeter:
          → if resistance mode:
              → _solveCircuit(battery) — works with null battery
              → if totalR > 0: reading = totalR
              → else if probes shorted: reading = '0'
              → else: reading = 'OL'
          → if voltage mode (needs battery):
              → _solveCircuit → node voltages
              → reading = |V[nodeA] - V[nodeB]|
          → if current mode (needs battery):
              → reading = total current
          → update multimeter display text + properties panel input
```

---

## 5. Key Design Decisions

### 5.1 Why no framework?

The original target was Safari 7 (2013). React/Vue/Svelte all require modern
JS and produce bundles that assume ES6+. Vanilla ES5 has zero runtime
dependencies and works on every browser back to IE9. The only "framework" is
Three.js r128, which has an ES5-compatible build.

### 5.2 Why both `id` and `data-prop` on inputs?

`ui.propRow3` originally only set `data-prop="px"`. The binding code used
`getElementById('px')`, which returned null. Fix: set both. `getElementById`
is fastest for direct lookups; `querySelector('[data-prop="..."]')` is a
fallback if IDs collide or are missing.

### 5.3 Why pointer events, not mouse events?

OrbitControls uses pointer events with `setPointerCapture`. When capture is
active, mouse events may not fire reliably. By using pointer events ourselves
and listening on `document` (not canvas), we receive events even during
capture. For browsers without `PointerEvent` (Safari < 13), we fall back to
mouse events on document.

### 5.4 Why two pin elements (hit area + visible pin)?

Pins were originally 4px radius — too hard to click. Solution: 12px invisible
hit circle + 5px visible circle with `pointer-events: none`. Generous click
target without sacrificing visual elegance.

### 5.5 Why `pointer-events: none !important` on wire-preview?

The wire-preview line is drawn from the first pin to the cursor. When the
user moves to click the second pin, the preview is between cursor and pin.
CSS `.wire-line { pointer-events: stroke }` overrides the SVG attribute.
We need `!important` in `.wire-line.wire-preview` to win the cascade.

### 5.6 Why class-based theming, not CSS variables?

Safari 7 (2013) doesn't support CSS custom properties (added in Safari 9.1).
We use `.theme-dark` / `.theme-light` classes on `<body>` and write every
color twice. More verbose but works everywhere.

### 5.7 Why IndexedDB + localStorage fallback?

IndexedDB: async (doesn't block UI), large quota (50%+ of free disk),
supports indexes. Available in all modern browsers + IE10+.
localStorage: sync, ~5MB, available everywhere (even IE8).
We use IndexedDB when available, fall back to localStorage otherwise.

### 5.8 Why auto-save AND manual project saves?

- **Auto-save** (single slot, every 30s) protects against crashes. Always
  overwrites itself. Prompted for restore on next visit.
- **Project saves** (named, IndexedDB) are user-curated snapshots with names
  and thumbnails. Can have many, delete, rename.

### 5.9 Why nodal analysis for the multimeter?

The original implementation just summed all resistances — wrong for parallel
circuits. The new solver uses union-find to group pins into nodes, builds a
resistor adjacency graph, and solves node voltages via Gauss-Seidel iteration.
This correctly handles series, parallel, and voltage divider configurations.

### 5.10 Why scale the gizmo to the selection?

The gizmo was originally a fixed 38-unit size — nearly 2x the size of a
20-unit object. Now it's built at unit scale and resized to 60% of the
selection's largest dimension (clamped 5–80 units). This keeps the arrows
proportional to the object being manipulated.

### 5.11 Why require sustained low FPS before downgrading tier?

A single bad frame (scene init, GC, tab switch) shouldn't permanently cripple
a capable machine. The auto-downgrade now requires 3 consecutive sub-15 FPS
readings (6 for high-tier hardware with ≥8GB RAM + ≥4 cores).

---

## 6. Performance Considerations

### 6.1 Adaptive quality

The compat tier (low/mid/high) controls:
- `maxObjects` — prevents unrenderable scene sizes
- `meshDetail` — sphere segment count, cylinder radial segments, etc.
  `low` uses ~35% of default, `mid` ~60%, `high` 100%
- `enableShadows` — only on `high`
- `enableAntialias` — only on `mid` and `high`
- `pixelRatioCap` — limits `renderer.setPixelRatio()` to 1/1.5/2

### 6.2 FPS-based auto-downgrade

Render loop tracks FPS over 1-second windows. If FPS stays below 15 for 3
consecutive seconds (6 for high-tier hardware), drops to `low` tier. This
handles cases where the device's score was optimistic but real-world
performance is poor.

### 6.3 Object disposal

`deleteSelected()` and `clearScene()` call `geometry.dispose()` and
`material.dispose()` to free GPU memory. Without this, repeatedly
adding/deleting objects would leak memory.

### 6.4 Reusable temp objects

`_performDrag` uses pre-allocated `this._tmpVec` and `this._tmpPlane` to
avoid creating new `THREE.Vector3` / `THREE.Plane` objects on every mouse
move. Reduces GC pressure during drags.

---

## 7. Browser Compatibility

### 7.1 Safari 7 (2013) — original floor

Works with polyfills. Known issues:
- No CSS variables → class-based theming
- No `let`/`const` → ES5 only
- No `fetch` → XHR-backed polyfill
- No `Promise` → minimal polyfill
- No Pointer events → mouse event fallback
- No `classList` on SVG → DOMTokenList shim
- WebGL 1 only (via `webkit-3d` context name)
- IndexedDB available but quirky → localStorage fallback

### 7.2 Modern browsers (Chrome 90+, Firefox 90+, Safari 14+)

All features work. High performance tier. Pointer events. IndexedDB with
large quota.

### 7.3 Mobile

Touch gestures: 1-finger orbit (3D) / drag (circuits), 2-finger pan/pinch
zoom. Bottom sheet UI for tool panels on screens < 768px wide.

---

## 8. Testing

Automated tests via Playwright (in `/scripts/`):
- `smoke-test.py` — basic load + add shapes + theme + mode switch
- `bugfix-test.py` — verifies selection, drag, wire connection
- `export-test.py` — verifies STL/OBJ/GLTF/PNG exports produce valid files
- `final-visual-test.py` — captures screenshots in various states

All tests pass with 0 errors.

---

## 9. Future Work

- **True CSG** — integrate three-bvh-csg for actual boolean subtraction
  during STL export
- **Offline font** — bundle Helvetiker font JSON locally for text shapes
- **Full Kirchhoff solver** — handle multiple batteries, AC sources, nonlinear
  components (diodes, transistors) with Newton-Raphson iteration
- **Undo/redo** — command pattern with history stack
- **Collaboration** — WebSocket real-time multi-user editing (would require
  a backend)
- **More export formats** — 3MF (3D printing with color), SVG (circuit
  schematics), PDF (documentation)
