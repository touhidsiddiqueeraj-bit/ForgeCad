# ForgeCAD — Low-End Tinkercad Clone

A 3D modeling + circuits web app inspired by Tinkercad, engineered to run on
**extremely low-end devices (under 1GB RAM)** and **ancient browsers (Safari 7 / 2013+)**.

**Live preview**: served by the Next.js dev server at `/` (redirects to `/index.html`).

---

## Why this exists

Most browser-based 3D modeling tools (Tinkercad, Onshape, Womp, etc.) require
modern browsers and 2GB+ RAM. ForgeCAD targets the opposite end: old phones,
low-end Chromebooks, school lab machines, developing-world hardware. It still
delivers core CAD functionality, a basic circuit simulator, persistent project
storage, and interactive tutorials.

---

## Features at a glance

### 3D Design mode
- **11 primitives**: box, sphere, cylinder, cone, torus, wedge, roof, text,
  polygon, tube, heart.
- **Transform tools**: move / rotate / scale (keyboard: W / E / R). Drag any
  object directly in the viewport — orbit controls automatically pause during
  drag so you don't accidentally rotate the camera.
- **Boolean operations**: solid/hole toggle, visual grouping.
- **Properties panel**: position, rotation, scale, dimensions, color (with
  palette), hole flag. All inputs update the object live as you type.
- **Camera presets**: front, top, right, iso, fit.
- **Selection**: click to select, shift-click for multi-select. Yellow
  wireframe bounding box (always rendered on top) + blue emissive glow on
  selected material.
- **Keyboard shortcuts**: W/E/R (tools), G (group), H (hole), D (duplicate),
  Delete (remove), Esc (deselect / close dialogs), Arrow keys (navigate
  tutorial).

### Circuits mode
- **10 components**: battery, button, switch, LED, buzzer, resistor,
  potentiometer, capacitor, Arduino (visual), wire.
- **Breadboard grid** with power rails (+ and −).
- **3 wire routing styles**: Manhattan (L-shape, default), Curved (cubic
  bezier), Direct (straight line). Switch via the dropdown in the left panel.
- **Wire connection**: click a pin (it pulses yellow) → click another pin to
  connect. Click empty space to cancel. Pin hit area is 12px (much larger
  than the 5px visible pin) for easy clicking.
- **Live simulation**: battery voltage, closed-switch detection, LED lights
  up with a glow filter when current flows. Wires turn green when current
  flows.
- **Component properties**: value, color (LED), state (switch closed), etc.

### Both modes
- **📁 Projects library** (IndexedDB): save unlimited named projects with
  thumbnails, list/load/rename/delete them through a modal. Falls back to
  localStorage (5MB limit) on browsers without IndexedDB.
- **Auto-save**: every 30 seconds to a special slot. On next visit, you're
  prompted to restore your previous session. Also saves on `beforeunload`.
- **File export/import**: export project as `.json` file, re-import to
  continue. Independent of the IndexedDB library.
- **Tutorials**: click the **?** button in the top bar to start an
  interactive step-by-step walkthrough. Each step spotlights the relevant UI
  element with a yellow border and shows a popover with instructions.
  - "3D Design Basics" — 7 steps covering add, select, transform, properties,
    camera, export.
  - "Circuits Basics" — 6 steps covering power, switch, LED, wiring, wire
    style, simulation.
- **Theme**: Pro CAD dark (default) + light mode. Choice persisted in
  localStorage. Theme-color meta tag updates for mobile browser chrome.
- **Responsive**: desktop (3-panel), tablet (narrower panels), mobile (single
  viewport + bottom sheet for tools). Touch gestures: 1-finger orbit, 2-finger
  pan, pinch zoom.
- **Performance info modal** (menu → Performance info): shows detected
  browser, WebGL version, RAM estimate, CPU cores, tier, current caps, and
  storage usage.

### Exports
3D Design mode supports:
- **STL** (binary) — for 3D printing slicers.
- **OBJ** — for Blender, Maya, etc.
- **GLTF** (JSON) — modern web 3D format.
- **PNG** — viewport snapshot (with `preserveDrawingBuffer: true`).

Circuits mode supports:
- **PNG** — snapshot of the breadboard (via SVG-to-canvas conversion).

---

## Quick start

### As a user

1. Open the preview URL in any browser.
2. Click the **?** button in the top-right for a guided tutorial.
3. Add shapes/components from the left panel.
4. Click to select, drag to move (3D mode).
5. Edit properties in the right panel — changes apply live.
6. Click **📁 Projects** to save your work to the browser's IndexedDB.
7. Click **Export** to download as STL/OBJ/GLTF/PNG.

### As a developer

```bash
# The Next.js dev server is already running on port 3000.
# To run the static files standalone (without Next.js):
cd public
python3 -m http.server 8000
# Open http://localhost:8000 in any browser
```

No build step. No dependencies to install for the app itself.
Next.js is only used as a dev/preview server — the actual app is 100% static.

---

## Browser support

Tested browsers (via Playwright + BrowserStack-style emulation):
- Chrome 90+ (full features, high tier).
- Firefox 90+ (full features, high tier).
- Safari 14+ (full features, high tier).
- Safari 9 (2015) — works, mid tier, no shadows, simplified meshes.
- Safari 7 (2013) — works with polyfills, low tier. Some features may degrade
  (e.g., text shapes require font loader, which may not load on very old iOS;
  IndexedDB falls back to localStorage).
- Mobile Chrome / Safari — touch gestures, bottom sheet UI.

For the full compatibility matrix and detection logic, see
[architecture.md](./architecture.md).

---

## Performance tier logic

| Score factor        | Points                              |
|---------------------|-------------------------------------|
| RAM ≥ 4GB           | +3                                  |
| RAM ≥ 2GB           | +2                                  |
| RAM ≥ 1GB           | +1                                  |
| CPU cores ≥ 8       | +3                                  |
| CPU cores ≥ 4       | +2                                  |
| CPU cores ≥ 2       | +1                                  |
| WebGL 2             | +2                                  |
| WebGL 1             | +1                                  |
| Mobile              | −1                                  |
| Safari < 11 / IE    | −1 to −2                            |

| Total score | Tier | Max objects | Mesh detail | Shadows | Antialias |
|-------------|------|-------------|-------------|---------|-----------|
| ≥ 7         | high | 500         | high        | yes     | yes       |
| 4-6         | mid  | 250         | mid         | no      | yes       |
| < 4         | low  | 100         | low         | no      | no         |

If sustained FPS drops below 20, the tier auto-downgrades to `low`.

---

## File layout

```
public/                          # Static app (served as-is by Next.js)
├── index.html                   # App shell
├── css/
│   └── styles.css               # All styles, theme classes, responsive
├── js/
│   ├── polyfills.js             # Safari 7 / IE9 polyfills
│   ├── compat.js                # Browser + device detection, perf tier
│   ├── theme.js                 # Dark/light toggle (persisted)
│   ├── ui.js                    # Toast, modal, dropdown, properties builder
│   ├── storage.js               # IndexedDB project persistence (with localStorage fallback)
│   ├── exporters.js             # STL/OBJ/GLTF/PNG/JSON project exporters + importers
│   ├── mode-3d.js               # 3D Design mode (Three.js)
│   ├── mode-circuits.js         # Circuits mode (SVG)
│   ├── tutorial.js              # Interactive step-by-step tutorials
│   └── main.js                  # App entry, mode switching, top bar wiring, projects modal
└── vendor/                      # Three.js r128 + OrbitControls + exporters
    ├── three.min.js
    ├── OrbitControls.js
    ├── STLExporter.js
    ├── OBJExporter.js
    └── GLTFExporter.js

src/app/page.tsx                 # Next.js entry — redirects / to /index.html
```

---

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| W | Move tool |
| E | Rotate tool |
| R | Scale tool |
| G | Group selected |
| H | Toggle hole on selected |
| D | Duplicate selected |
| Delete / Backspace | Delete selected |
| Esc | Deselect / close dialog / cancel wire |
| Shift+Click | Add to selection (3D) |
| → / ← | Next / previous tutorial step (during tutorial) |

---

## Known limitations

- **Boolean operations are visual only** — holes render as transparent red
  shapes and are flagged in the saved JSON, but they do not actually subtract
  from solids during STL export. For true CSG, import the STL into Blender
  and apply the boolean modifier there.
- **Text shapes require network access** — Three.js's FontLoader fetches a
  font JSON from a CDN. On offline / very old browsers, text shapes will fail
  silently.
- **Circuit simulation is intentionally simplified** — it does not solve real
  Kirchhoff equations. It checks for: battery present, all switches/buttons
  closed, then lights LEDs whose forward-voltage threshold is met.
- **IndexedDB quota** — browsers typically allow 50%+ of free disk space, but
  very low-end devices may have stricter limits. The storage modal shows
  current usage and quota.

---

## License

MIT.
