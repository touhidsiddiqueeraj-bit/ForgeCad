# ForgeCAD — Architecture

This document describes the internal architecture of ForgeCAD: the module
layout, data flow, key design decisions, and the rationale behind the
technology choices.

---

## 1. High-level overview

ForgeCAD is a **single-page vanilla-JS application** with no framework, no
bundler, and no build step. It is served as static files (HTML + CSS + JS +
vendor JS) and runs entirely client-side.

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
- Initial load of the app's own JS/CSS files.
- Three.js FontLoader fetching a font JSON from jsdelivr CDN (for text shapes
  only — optional feature).
- `navigator.storage.estimate()` for storage quota info (read-only API call).

---

## 2. Module layout

All app code lives under `/public/js/`. Load order matters — later modules
depend on earlier ones.

| File | Purpose | Depends on |
|------|---------|------------|
| `polyfills.js` | Shims for ancient browsers (Promise, fetch, classList, etc.) | — |
| `compat.js` | Browser/device detection, performance tier computation | polyfills |
| `theme.js` | Dark/light theme toggle (persisted) | — |
| `ui.js` | Shared UI helpers: toast, modal, dropdown, properties builder | — |
| `storage.js` | IndexedDB project persistence (with localStorage fallback) | ui |
| `exporters.js` | STL/OBJ/GLTF/PNG exporters + JSON project save/load + STL/OBJ import | ui |
| `mode-3d.js` | 3D Design mode (Three.js scene, primitives, transform, selection) | compat, ui, exporters |
| `mode-circuits.js` | Circuits mode (SVG breadboard, components, wires, sim) | ui |
| `tutorial.js` | Interactive step-by-step tutorial overlay system | ui |
| `main.js` | App entry point. Wires everything together, mode switching, top bar, projects modal | all above |

Vendor libraries under `/public/vendor/`:
- `three.min.js` (r128) — WebGL 1, ES5-compatible build
- `OrbitControls.js` (r128) — camera controls
- `STLExporter.js`, `OBJExporter.js`, `GLTFExporter.js` (r128) — exporters

---

## 3. Module responsibilities

### 3.1 `polyfills.js`

Loaded first (before any other script). Provides shims for:

- `console`, `Date.now`, `Object.keys`, `Object.create`
- `Array.isArray`, `Array.prototype.{forEach,indexOf,map,filter,reduce}`
- `Function.prototype.bind`, `String.prototype.trim`
- `JSON.stringify`, `JSON.parse` (very naive — only for our own data shapes)
- `requestAnimationFrame` (with vendor prefixes)
- `classList` (DOMTokenList shim via `Object.defineProperty`)
- `addEventListener` / `removeEventListener` for IE8
- Minimal `Promise` (just enough for our usage — `.then`/`.catch`, no `race`/`all`)
- `fetch` (XHR-backed, returns a Promise)
- `Array.from`, `Element.matches`, `Element.closest`
- `URL.createObjectURL`, `Blob`, `Uint8Array` (crude fallbacks)

All polyfills are conditional — they only install themselves if the native
version is missing. This keeps the file small on modern browsers.

### 3.2 `compat.js` — capability detection

`ForgeCAD.compat` is a singleton populated at load time. It detects:

- **Renderer**: WebGL 1 vs 2 (tries context names in order: `webgl2`,
  `experimental-webgl2`, `webgl`, `experimental-webgl`, `webkit-3d`, `moz-webgl`).
  Also detects Canvas 2D and SVG support.
- **Browser identity**: parses `navigator.userAgent` to identify
  ie/edge/edge-chromium/firefox/chrome/safari/webkit and version.
- **Device capability**: `navigator.deviceMemory` (Chrome only, falls back to
  heuristic estimates), `navigator.hardwareConcurrency`, `devicePixelRatio`,
  screen dimensions.
- **Feature flags**: flexbox, flexbox gap, CSS variables, ES6, localStorage,
  File API, Blob.

Then computes a **performance tier** (`low` / `mid` / `high`) based on a
weighted score:

```
score = RAM_points + CPU_points + WebGL_points + mobile_penalty + old_browser_penalty
```

The tier controls:
- `maxObjects` (100 / 250 / 500)
- `meshDetail` (`low` / `mid` / `high`) — controls segment counts for spheres,
  cylinders, etc.
- `enableShadows` (only `high`)
- `enableAntialias` (only `mid` and `high`)
- `pixelRatioCap` (1 / 1.5 / 2)

The 3D mode's render loop monitors FPS and auto-downgrades to `low` if
sustained FPS drops below 20.

### 3.3 `theme.js`

Two themes: `dark` (default, Pro CAD style) and `light`. Implemented via
`.theme-dark` / `.theme-light` classes on `<body>` — **no CSS custom
properties** because Safari 7 (our floor) doesn't support them.

Theme choice is persisted in `localStorage` under key `forgecad-theme`.
On toggle, also updates the `<meta name="theme-color">` tag (for mobile
browser chrome) and notifies `mode3D` so it can swap the scene background
color and grid color.

### 3.4 `ui.js`

Shared UI primitives used by both modes:

- `toast(msg, ms)` — bottom-center toast notification
- `modal(title, html)` / `modalClose()` — centered modal with backdrop
- `status(left, center)` / `setObjects(n)` / `setFps(fps)` / `setPerf(tier)` —
  status bar updaters
- `showDropdown(id, anchorEl)` / `hideDropdowns()` — positioned dropdowns
- `bottomSheetOpen/Close/Toggle(html)` — mobile bottom sheet
- `clearProperties()` / `setPropertiesTitle(title)` / `setPropertiesHTML(html)` —
  right panel helpers
- `propRow3(label, vals, keys)` — generates a 3-axis input row (X/Y/Z) with
  **both** `id` and `data-prop` attributes on each input (critical for
  property binding to work — see §5.2)
- `confirm(msg, onYes)` — modal-based confirm dialog (no native `confirm()`)

### 3.5 `storage.js` — IndexedDB persistence

`ForgeCAD.storage` provides a callback-based API over IndexedDB:

- `init(callback)` — opens the DB, creates object stores on upgrade. Falls
  back to localStorage if IndexedDB is unavailable.
- `saveProject(meta, data, callback)` — saves a project with auto-incrementing
  id. `meta` includes name, mode, optional thumbnail (data URL). `data` is the
  full scene JSON.
- `listProjects(callback)` — returns array of `{id, name, mode, ts, thumbnail,
  size}` (without the heavy `data` payload).
- `loadProject(id, callback)` — returns the full record including `data`.
- `deleteProject(id, callback)`, `renameProject(id, newName, callback)`
- `autoSave(data, callback)` / `loadAutoSave(callback)` — single-slot
  autosave (key: `'current'`)
- `stats(callback)` — returns backend name, project count, total size,
  quota/usage (via `navigator.storage.estimate()`)
- `formatSize(bytes)` / `formatDate(ts)` — human-friendly formatters

**Schema**:
- `projects` store: keyPath=`id` (autoIncrement), indexes on `name`, `ts`, `mode`
- `autosave` store: keyPath=`slot` (single record with `slot='current'`)

**Fallback** (localStorage): all projects serialized as a single JSON array
under key `forgecad-projects`. Autosave under `forgecad-autosave`. Limited
to ~5MB.

### 3.6 `exporters.js`

- `download(filename, content, mimeType)` — generic Blob-based download with
  data URI fallback for ancient browsers.
- `exportSTL(scene, filename)` — uses Three.js `STLExporter` in binary mode,
  converts DataView to Uint8Array for Blob.
- `exportOBJ(scene, filename)` — uses Three.js `OBJExporter`.
- `exportGLTF(scene, filename)` — uses Three.js `GLTFExporter` in JSON mode
  (not binary GLB).
- `exportPNG(canvas, filename)` — `canvas.toDataURL('image/png')` → Blob.
  Requires `preserveDrawingBuffer: true` on the WebGL renderer.
- `exportProject(projectData, filename)` — JSON serialization.
- `importProject(file, callback)` — reads `.json` file via `FileReader`.
- `importMesh(file, callback)` — parses `.stl` (binary or ASCII) and `.obj`
  files into Three.js BufferGeometry. STL parser handles both binary (80-byte
  header + triangle count + 50 bytes per triangle) and ASCII (`vertex ...`
  lines). OBJ parser handles `v` and `f` lines with triangulation fan.

### 3.7 `mode-3d.js` — 3D Design mode

The largest module. Holds all 3D state:

- `renderer` (THREE.WebGLRenderer), `scene`, `camera` (PerspectiveCamera),
  `controls` (OrbitControls), `raycaster`
- `objects[]` — array of tracked meshes/groups
- `selected[]` — currently selected objects
- `tool` — current transform tool (`move` / `rotate` / `scale`)
- `isHoleMode` — when true, new shapes are created as holes

**Initialization** (`init`):
1. Get the placeholder `<canvas id="canvas-3d">` from HTML.
2. Create WebGLRenderer with `antialias` (per compat tier), `alpha: false`,
   `preserveDrawingBuffer: true` (for PNG export).
3. **Replace** the placeholder canvas with the renderer's canvas (and remove
   the placeholder to avoid duplicate IDs — a bug we hit earlier).
4. Set up scene, camera, lights (ambient + 2 directional), grid, workplane
   (invisible plane for raycasting), axes triad.
5. Create the bbox helper (yellow `LineSegments` with `depthTest: false` so
   it's always visible).
6. Bind events (see §5).
7. Start the render loop with FPS tracking.

**Event handling** (`_bindEvents`):
- Uses **pointer events** when available (`PointerEvent`), falling back to
  mouse events for old browsers. This was a critical fix — OrbitControls uses
  pointer events with `setPointerCapture`, which prevented our mouse events
  from firing reliably.
- `pointerdown` on canvas: raycast objects; if hit, mark as drag candidate
  and disable OrbitControls.
- `pointermove` on document (not canvas — pointer capture redirects events):
  if dragging, call `_performDrag`.
- `pointerup` on document: if no drag occurred, treat as click → select.
  Re-enable OrbitControls.
- Keyboard: W/E/R/G/H/D/Delete/Esc/Arrow keys.

**Drag logic** (`_performDrag`):
- **Move**: project ray onto horizontal plane at the object's Y. Maintain
  the original hit-point offset so the object doesn't jump to the cursor.
  Snap to 1mm grid.
- **Rotate**: horizontal drag = rotate around Y, vertical = rotate around X.
- **Scale**: vertical drag = uniform scale (up = bigger).

**Selection** (`_handleClickAt`):
- Raycast all tracked objects (recursive — hits children of groups).
- Walk parent chain to find the tracked root.
- Shift-click toggles in/out of selection.
- Update visuals: emissive glow on selected material + bbox helper.

**Properties** (`_showProperties` + `_bindPropertyInputs`):
- Generate HTML via `ui.propRow3` (which now sets both `id` and `data-prop`).
- Bind `input` AND `change` events for live updates.
- `_applyProp(obj, key, value, mult)` handles dotted keys:
  - `position.x` → `obj.position.x = value * mult`
  - `dimensions.w` → `obj.userData.dimensions.w = value` + rebuild geometry
- `_refreshPropertyValues()` updates input values without rebuilding the
  panel (preserves focus) — called after drag.

**Geometry builders** for non-primitives:
- `_wedgeGeometry(w, h, d)` — right-triangle prism (manual vertex generation)
- `_roofGeometry(w, h, d)` — half-cylinder (parametric)
- `_polygonGeometry(w, h, sides)` — n-gon prism
- `_heartGeometry(w)` — extruded bezier-curve heart shape

**Save/load** (`serialize` / `deserialize`):
- Serialize: walk `objects[]`, capture type, position, rotation, scale,
  dimensions, color, isHole, text. Groups include children.
- Deserialize: clear scene, recreate each object via `_deserializeOne` (which
  rebuilds geometry). Text shapes require async font loading.

### 3.8 `mode-circuits.js` — Circuits mode

SVG-based (works on every browser since IE9). Holds:

- `svg` — the root SVG element
- `components[]` — `{id, type, x, y, rotation, props}`
- `pins[]` — `{id, component, x, y, label}` (world coords)
- `wires[]` — `{id, from, to}` (pin IDs)
- `wireStartPin` — pending wire connection (null when not connecting)
- `wireStyle` — `'manhattan'` / `'bezier'` / `'direct'`

**Breadboard rendering** (`_drawBreadboard`): SVG grid of holes + power rails
(+/−) with colored lines.

**Component rendering** (`_renderComponent`):
- Each component is an SVG `<g>` with `transform="translate(x,y) rotate(deg)"`.
- Body shapes are simple rects/lines/text per component type.
- **Each pin has TWO elements**:
  - A 12px-radius invisible `<circle class="circuits-pin-hit">` (the click
    target)
  - A 5px-radius visible `<circle class="circuits-pin">` with
    `pointer-events: none` (clicks pass through to the hit area)
- Pin positions are tracked in the `pins[]` array for wire endpoint lookup.

**Wire rendering** (`_renderWire`):
- `manhattan`: L-shape via midpoint. `M x1 y1 L midX y1 L midX y2 L x2 y2`
- `bezier`: cubic bezier with control points extending from each pin.
  `M x1 y1 C c1x c1y c2x c2y x2 y2`
- `direct`: straight line. `M x1 y1 L x2 y2`
- Wire preview (during connection) matches the current style and has
  `pointer-events: none` (with `!important` CSS — critical to prevent the
  preview line from intercepting the second-pin click).

**Wire connection flow**:
1. Click pin → `_onPinClick(pinId)` → set `wireStartPin`, highlight pin
   (yellow, pulsing via CSS `@keyframes pin-pulse`).
2. Move cursor → `_updateWirePreview(mx, my)` draws a dashed preview line.
3. Click another pin → create wire, clear preview, unhighlight.
4. Click empty space or component → cancel wire.

**Simulation** (`runSim` / `_simulateStep` / `stopSim`):
- Runs every 100ms via `setTimeout`.
- Checks: is there a battery? Are all switches/buttons closed?
- If yes: add `.live` class to all wires (CSS turns them green), set LED body
  opacity to 1.0 and apply SVG glow filter (`feGaussianBlur` + `feMerge`).
- If no: remove `.live` class, dim LED.

### 3.9 `tutorial.js`

Interactive step-by-step tutorials. Two predefined tutorials:
- `3d-basics` — 7 steps (add, select, transform, properties, camera, export)
- `circuits-basics` — 6 steps (power, switch, LED, wire, style, simulate)

Each step has a `target` CSS selector. The tutorial:
1. Builds an overlay (semi-transparent backdrop).
2. Builds a spotlight (transparent box with `box-shadow: 0 0 0 9999px rgba(0,0,0,0.6)`
   — this creates the "dimmed everywhere except the spotlight" effect).
3. Positions the spotlight on the target element (with smooth transition).
4. Builds a popover with step title, body, and Prev/Next/Skip buttons.
5. Positions the popover near the target (below/right/left/above based on
   available space).

Keyboard: `Esc` ends, `→` next, `←` prev.

### 3.10 `main.js` — app entry

The `ForgeCAD.app` singleton coordinates everything:

- **`init()`**: theme → storage.init → mode3D.init → modeCircuits.init →
  bind top bar → bind mode switch → bind mobile trigger → bind keyboard →
  bind help hint → start autosave → setMode('3d').
- **`setMode(mode)`**: toggle body class, mode-tab buttons, canvas visibility,
  left panel content, help hint variant.
- **Autosave**: every 30 seconds + on `beforeunload`. On startup, if autosave
  exists, prompt to restore.
- **Projects modal** (`showProjectsModal`): lists projects from IndexedDB
  with thumbnails, load/rename/delete buttons, storage stats footer.
- **Export menu**: dropdown with STL/OBJ/GLTF/PNG options.
- **More menu**: clear scene, fit view, toggle grid, perf info, about.

---

## 4. Data flow

### 4.1 User adds a 3D shape

```
User clicks "Box" button in left panel
  → event delegated to left-panel-body click handler
  → calls mode3D.addShape('box')
  → creates THREE.Mesh with BoxGeometry
  → adds to _objectsGroup
  → pushes to objects[]
  → sets selected = [mesh]
  → _updateSelectionVisual() — applies emissive glow, positions bbox
  → _showProperties() — builds right panel HTML with ui.propRow3
  → _bindPropertyInputs() — attaches input/change listeners
  → status bar updates object count
  → render loop (already running) picks up the new mesh
```

### 4.2 User drags an object

```
User mousedown on canvas (over an object)
  → pointerdown event fires
  → onDown: raycast objects → hit → store _dragCandidate, _dragHitPoint,
    _dragTarget, _dragStartPos. Disable OrbitControls.
User moves mouse
  → pointermove event fires (on document, because pointer capture)
  → onMove: if moved > 4px, set _dragging = true
  → _performDrag(clientX, clientY):
      - Move tool: project ray to workplane at object's Y, compute new XZ
        with snap-to-grid
      - Rotate tool: dx → rotation.y, dy → rotation.x
      - Scale tool: dy → uniform scale factor
  → _updateSelectionVisual() — moves bbox
  → _refreshPropertyValues() — updates input fields without rebuilding panel
User mouseup
  → pointerup event fires (on document)
  → onUp: wasDragging=true → _showProperties() to rebuild panel with final
    values. Re-enable OrbitControls.
```

### 4.3 User connects two circuit pins

```
User clicks pin A
  → SVG click handler: target has data-pin-id → _onPinClick(pinIdA)
  → wireStartPin = pinIdA
  → _highlightWireStartPin(pinIdA) — sets pin A to yellow + pulsing
User moves mouse
  → SVG mousemove handler: _updateWirePreview(mx, my) draws dashed line
    from pin A to cursor
User clicks pin B
  → SVG click handler: target has data-pin-id → _onPinClick(pinIdB)
  → wireStartPin !== pinIdB → create wire {id, from: pinIdA, to: pinIdB}
  → push to wires[]
  → _renderWire(wire) — creates SVG <path> with current wireStyle routing
  → _highlightWireStartPin(null) — reset all pins
  → wireStartPin = null
  → _updateWirePreview() — removes preview line
```

### 4.4 User saves a project

```
User clicks "📁 Projects" button
  → showProjectsModal()
  → storage.listProjects() — async, returns list
  → builds modal HTML with thumbnails + actions
User clicks "Save Current Scene"
  → _saveCurrentToProjects()
  → mode3D.serialize() (or modeCircuits.serialize())
  → capture thumbnail: canvas.toDataURL('image/png') → resize to 48x48
  → storage.saveProject({name, mode, thumbnail}, data, callback)
  → IndexedDB add() with autoIncrement id
  → on success: toast, refresh modal
```

### 4.5 Auto-save flow

```
Every 30 seconds (or beforeunload):
  → _doAutoSave()
  → serialize current mode
  → storage.autoSave(data) → IndexedDB put() with slot='current'

On next page load:
  → storage.init() → callback
  → _tryAutoLoad()
  → storage.loadAutoSave() → returns data
  → if data has objects: confirm("Restore auto-saved work?")
  → if yes: deserialize into appropriate mode
```

---

## 5. Key design decisions

### 5.1 Why no framework?

The user requirement was **Safari 7 (2013) compatibility**. Safari 7 doesn't
support:
- ES6 (`let`, `const`, arrow functions, template literals, classes)
- CSS custom properties (CSS variables)
- `fetch`
- `Promise`
- Pointer events (added in Safari 13)
- Many modern Array methods

React/Vue/Svelte all require modern JS and produce bundles that assume ES6+.
Even with Babel transpilation, the runtime helpers assume `Object.defineProperty`,
`WeakMap`, etc. that aren't reliable on Safari 7.

Vanilla ES5 has zero runtime dependencies and works on every browser back
to IE9. The only "framework" we use is Three.js r128, which has an ES5-compatible
build.

### 5.2 Why both `id` and `data-prop` on inputs?

This was a real bug. Originally `ui.propRow3` only set `data-prop="px"`. The
binding code in `mode-3d.js` used `getElementById('px')`, which returned null
(because there was no `id`, only `data-prop`). So none of the property
inputs actually worked.

Fix: set both. `getElementById` works for direct lookups (fastest).
`querySelector('[data-prop="..."]')` works as a fallback if IDs collide or
are missing.

### 5.3 Why pointer events, not mouse events?

OrbitControls (Three.js r128) uses pointer events with `setPointerCapture`.
When `setPointerCapture` is called on `pointerdown`, all subsequent pointer
events for that pointer go ONLY to the captured element. If we listen for
`mousedown` on the canvas, it fires — but `mousemove` and `mouseup` may not
fire reliably if the pointer is captured.

By using pointer events ourselves, and listening for `pointermove`/`pointerup`
on `document` (not the canvas), we receive events even during pointer capture.
(The capture redirects events to the capture target, but they still bubble
through document.)

For browsers without `PointerEvent` (Safari < 13), we fall back to mouse
events on document.

### 5.4 Why two pin elements (hit area + visible pin)?

Pins were originally 4px radius — almost impossible to click reliably. We
tried making the visible pin larger (12px) but that looked chunky. Solution:
two overlapping circles:
- 12px invisible `<circle>` — the click target
- 5px visible `<circle>` with `pointer-events: none` — clicks pass through
  to the hit area below

This gives a generous click target without sacrificing visual elegance.

### 5.5 Why `pointer-events: none !important` on wire-preview?

The wire-preview line is drawn from the first pin to the cursor. When the
user moves to click the second pin, the preview line is between the cursor
and the second pin. If the preview has `pointer-events: stroke` (the default
for `.wire-line`), the click hits the preview line instead of the pin.

CSS `pointer-events: stroke` (from `.wire-line`) overrides the SVG
presentation attribute `pointer-events: none`. So we need
`pointer-events: none !important` in `.wire-line.wire-preview` to win the
cascade.

### 5.6 Why class-based theming, not CSS variables?

Safari 7 (2013) doesn't support CSS custom properties (`var(--foo)`). They
were added in Safari 9.1 (2016). Since our floor is Safari 7, we use
`.theme-dark` / `.theme-light` classes on `<body>` and write every color
twice (once per theme). This is more verbose but works everywhere.

### 5.7 Why IndexedDB + localStorage fallback?

IndexedDB:
- Asynchronous (doesn't block the UI thread)
- Large quota (typically 50%+ of free disk)
- Supports indexes for efficient queries
- Available in all modern browsers + IE10+

localStorage:
- Synchronous (can block on large writes)
- ~5MB quota per origin
- Available everywhere (even IE8)

We use IndexedDB when available, fall back to localStorage otherwise. The
storage modal shows which backend is in use.

### 5.8 Why auto-save AND manual project saves?

- **Auto-save** (single slot, every 30s) protects against browser crashes
  and accidental closes. Always overwrites itself. Prompted for restore on
  next visit.
- **Project saves** (named, indexedDB) are user-curated. The user explicitly
  saves a snapshot with a name. They can have many, delete, rename, etc.

Both are needed: auto-save is for "don't lose my work", project saves are
for "I want to keep this version".

---

## 6. Performance considerations

### 6.1 Adaptive quality

The compat tier (low/mid/high) controls:
- `maxObjects` — prevents the user from adding so many objects that the
  scene becomes unrenderable on low-end devices.
- `meshDetail` — sphere segment count, cylinder radial segments, etc.
  `low` uses ~35% of the default, `mid` ~60%, `high` 100%.
- `enableShadows` — only on `high`. Shadows are expensive.
- `enableAntialias` — only on `mid` and `high`.
- `pixelRatioCap` — limits `renderer.setPixelRatio()` to 1 / 1.5 / 2.

### 6.2 FPS-based auto-downgrade

The render loop tracks FPS over 1-second windows. If FPS drops below 20,
the tier auto-downgrades to `low` (disables shadows, antialias, drops
pixel ratio to 1, reduces max objects). This handles cases where the
device's score was optimistic but real-world performance is poor.

### 6.3 Object disposal

When objects are deleted (`deleteSelected`, `clearScene`), we call
`geometry.dispose()` and `material.dispose()` to free GPU memory. Without
this, repeatedly adding/deleting objects would leak memory.

### 6.4 Reusable temp objects

`_performDrag` uses `this._tmpVec` and `this._tmpPlane` (pre-allocated) to
avoid creating new `THREE.Vector3` and `THREE.Plane` objects on every mouse
move. This reduces GC pressure during drags.

---

## 7. Browser compatibility notes

### 7.1 Safari 7 (2013) — our floor

Works with polyfills. Known issues:
- No CSS variables → class-based theming
- No `let`/`const` → ES5 only
- No `fetch` → XHR-backed polyfill
- No `Promise` → minimal polyfill (no `Promise.all`/`race`)
- No Pointer events → mouse event fallback
- No `classList` on SVG elements → DOMTokenList shim
- WebGL 1 only (via `webkit-3d` context name)
- IndexedDB available but quirky → falls back to localStorage if init fails

### 7.2 Safari 9 (2015)

Works without most polyfills. Still no CSS variables (added in 9.1), no
Pointer events (added in 13).

### 7.3 IE 9-11

IE 9: no WebGL (3D mode won't work, but circuits SVG mode will).
IE 10-11: WebGL 1 via `ms-webgl` (spotty), IndexedDB available.
`addEventListener` polyfill needed for IE 8.

### 7.4 Modern browsers (Chrome 90+, Firefox 90+, Safari 14+)

All features work. High performance tier. Pointer events. IndexedDB with
large quota. CSS variables (though we don't use them).

---

## 8. Testing

Automated tests via Playwright (in `/scripts/`):
- `smoke-test.py` — basic load + add shapes + theme + mode switch
- `bugfix-test.py` — verifies the 3 bugs from the user are fixed
  (selection, drag, wire connection)
- `export-test.py` — verifies STL/OBJ/GLTF/PNG exports produce valid files
- `final-visual-test.py` — captures screenshots in various states
- `visual-test.py` — captures screenshots in 3D, circuits, mobile, modals

All tests pass with 0 errors.

---

## 9. Future work

- **True CSG** — integrate a boolean operations library (e.g., three-bvh-csg)
  to actually subtract holes from solids during export.
- **Offline font** — bundle the Helvetiker font JSON locally so text shapes
  work without network.
- **Kirchhoff solver** — implement proper circuit simulation with node/mesh
  analysis for accurate voltage/current calculations.
- **Collaboration** — WebSocket-based real-time multi-user editing (would
  require a backend, breaking the "no backend" principle).
- **More export formats** — 3MF (for 3D printing with color), SVG (for
  circuit schematics), PDF (for documentation).
- **Undo/redo** — command pattern with a history stack.
- **Snap settings** — configurable snap size, snap to objects, snap to grid
  in 3D mode.
