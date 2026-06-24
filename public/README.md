# ForgeCAD

A browser-based 3D modeler and circuit simulator. Built with vanilla JavaScript,
Three.js, and SVG — no framework, no build step, no backend.

![ForgeCAD](public/logo.svg)

---

## Features

### 3D Design Mode

- **11 primitive shapes**: box, sphere, cylinder, cone, torus, wedge, roof,
  text, polygon, tube, heart
- **XYZ axis gizmo**: click and drag the colored arrows (red=X, green=Y,
  blue=Z) to move objects along a single axis. Gizmo scales to match the
  selected object
- **Transform tools**: move (W), rotate (E), scale (R). Drag objects directly
  in the viewport — orbit controls pause during drag
- **Boolean operations**: solid/hole toggle, grouping, ungrouping
- **Multi-select**: toggle the ⊕ button or hold Shift to select multiple
  objects, then group (G) or delete
- **Properties panel**: position, rotation, scale, dimensions, color — all
  update live as you type
- **Camera presets**: front, top, right, iso, fit
- **Keyboard shortcuts**: W/E/R (tools), G (group), H (hole), D (duplicate),
  Del (delete), Esc (deselect)

### Circuits Mode

- **20 components**: battery, button, switch, LED, RGB LED, buzzer, resistor,
  potentiometer, capacitor, inductor, diode, transistor (NPN), LDR, motor,
  lamp, 7-segment display, IC chip, multimeter, Arduino, solar cell
- **Custom element maker**: define your own components with custom pins,
  body shape, colors, and labels
- **Drag-to-move**: click and drag any component to reposition it. Snaps to
  grid (toggleable)
- **Component values displayed on body**: resistors show "220Ω", batteries
  show "5V", capacitors show "100μF"
- **4 wire routing styles**:
  - **Manhattan** — L-shape orthogonal routing
  - **Curved** — smooth cubic bezier
  - **Direct** — straight line
  - **Custom** — click a wire to add bend points, drag them to route around
    obstacles, right-click a bend to delete it
- **Wire editing**: click a wire to select it (yellow highlight), press Delete
  to remove, or use the Delete Wire button in the properties panel
- **Zoom & pan**: mouse wheel to zoom, drag empty space or middle-click to pan,
  pinch on touch devices. Toolbar buttons for zoom in/out/fit
- **Live simulation**: LEDs glow, buzzers pulse, motors spin, 7-segment displays
  show digits. Wires turn green when current flows
- **Multimeter**: measures voltage (V), resistance (Ω), and current (A) using
  proper nodal analysis. Resistance mode works without a battery (uses the
  meter's internal source). Handles series, parallel, and voltage divider
  circuits correctly

### Cross-cutting

- **📁 Projects library** (IndexedDB): save unlimited named projects with
  thumbnails. Falls back to localStorage on browsers without IndexedDB
- **Auto-save**: every 30 seconds + on page unload. Prompts to restore on
  next visit
- **File import/export**: save/load projects as `.json` files
- **Export 3D models**: STL (binary, for 3D printing), OBJ, GLTF, PNG snapshot
- **Interactive tutorials**: 4 built-in tutorials including two guided projects
  (build an LED circuit, build a 3D house) that auto-construct the project
  step-by-step
- **Dark & light themes**: persisted in localStorage
- **Responsive**: desktop (3-panel), tablet, mobile (bottom sheet for tools).
  Touch gestures: 1-finger orbit, 2-finger pan, pinch zoom
- **Adaptive performance**: detects device RAM, CPU cores, WebGL version, and
  sustained FPS to pick a quality tier (low/mid/high) that controls max
  objects, mesh detail, shadows, and antialiasing

---

## Quick Start

### Run locally

```bash
git clone https://github.com/yourusername/forgecad.git
cd forgecad/public
python3 -m http.server 8000
# Open http://localhost:8000 in any browser
```

No build step. No dependencies to install. Just static files.

### Deploy

ForgeCAD is 100% static — deploy the `public/` directory to any static host:

- **GitHub Pages**: push `public/` to a `gh-pages` branch
- **Netlify**: drag the `public/` folder onto the Netlify dashboard
- **Vercel**: `vercel deploy public/`
- **Any web server**: copy `public/` to your web root

---

## Browser Support

| Browser | Version | Tier | Notes |
|---------|---------|------|-------|
| Chrome | 90+ | high | Full features |
| Firefox | 90+ | high | Full features |
| Safari | 14+ | high | Full features |
| Safari | 9 (2015) | mid | No shadows, simplified meshes |
| Safari | 7 (2013) | low | Polyfills required, some features degrade |
| Mobile Chrome/Safari | — | mid | Touch gestures, bottom sheet UI |
| IE 9-11 | — | low | No WebGL (3D mode unavailable), SVG circuits still work |

---

## Performance Tiers

The app detects device capability at load time and picks a tier:

| Factor | Points |
|--------|--------|
| RAM ≥ 4GB | +3 |
| RAM ≥ 2GB | +2 |
| CPU cores ≥ 8 | +3 |
| CPU cores ≥ 4 | +2 |
| CPU cores ≥ 2 | +1 |
| WebGL 2 | +2 |
| WebGL 1 | +1 |
| Mobile | −1 |
| Safari < 11 / IE | −1 to −2 |

| Score | Tier | Max objects | Mesh detail | Shadows | Antialias |
|-------|------|-------------|-------------|---------|-----------|
| ≥ 7 | high | 500 | high | yes | yes |
| 4–6 | mid | 250 | mid | no | yes |
| < 4 | low | 100 | low | no | no |

Auto-downgrade: if FPS stays below 15 for 3 consecutive seconds (6 seconds on
high-tier hardware), the tier drops to low. This prevents one bad frame from
crippling a capable machine.

---

## File Layout

```
public/
├── index.html              # App shell
├── logo.svg                # ForgeCAD logo
├── css/
│   └── styles.css          # All styles, themes, responsive
├── js/
│   ├── polyfills.js        # Safari 7 / IE9 shims
│   ├── compat.js           # Browser detection, perf tier
│   ├── theme.js            # Dark/light toggle
│   ├── ui.js               # Toast, modal, properties builder
│   ├── storage.js          # IndexedDB persistence
│   ├── exporters.js        # STL/OBJ/GLTF/PNG exporters
│   ├── mode-3d.js          # 3D Design mode (Three.js)
│   ├── mode-circuits.js    # Circuits mode (SVG)
│   ├── tutorial.js         # Interactive tutorials
│   └── main.js             # App entry, mode switching
├── vendor/
│   ├── three.min.js        # Three.js r128
│   ├── OrbitControls.js
│   ├── STLExporter.js
│   ├── OBJExporter.js
│   └── GLTFExporter.js
├── README.md
└── architecture.md         # Detailed architecture docs
```

---

## Keyboard Shortcuts

### 3D Design

| Key | Action |
|-----|--------|
| W | Move tool |
| E | Rotate tool |
| R | Scale tool |
| G | Group selected |
| H | Toggle hole |
| D | Duplicate |
| Del | Delete selected |
| Esc | Deselect / close dialog |
| Shift+Click | Add to selection |
| ⊕ (toolbar) | Toggle multi-select mode |

### Circuits

| Key | Action |
|-----|--------|
| Del | Delete selected wire or component |
| Esc | Cancel wire / close dialog |
| → / ← | Next / previous tutorial step |

### Tutorials

| Key | Action |
|-----|--------|
| → | Next step |
| ← | Previous step |
| Esc | End tutorial |

---

## Tutorials

Click the **?** button in the top bar to open the tutorial picker:

1. **3D Design Basics** (7 steps) — shapes, selection, transform, properties,
   camera, export
2. **Circuits Basics** (6 steps) — components, wiring, wire styles, simulation
3. **Build an LED Circuit** (10 steps) — guided project: battery → switch →
   LED, wired and simulated. Each step auto-performs the action
4. **Build a Simple House** (6 steps) — guided 3D project: walls, roof, door,
   windows. Each step auto-adds and positions shapes

---

## Known Limitations

- **Boolean operations are visual only** — holes render as transparent red
  shapes and are flagged in the saved JSON, but STL export doesn't perform
  actual CSG subtraction. Use Blender's boolean modifier for real subtraction
- **Text shapes require network access** — Three.js FontLoader fetches a font
  JSON from a CDN. On offline browsers, text shapes fail silently
- **Circuit simulation uses nodal analysis** with a single battery source.
  Multiple batteries, AC sources, and nonlinear components (diodes, transistors)
  are not fully modeled — they use approximated linear resistance
- **`navigator.deviceMemory` is capped at 8GB** by Chrome for privacy. A 16GB
  machine reports 8192MB, which is still high-tier eligible

---

## Technology

- **Three.js r128** — WebGL 1 renderer with ES5-compatible build
- **Vanilla JS (ES5)** — no transpiler, no framework, runs on Safari 7+
- **SVG** — circuits mode (works on every browser since IE9)
- **IndexedDB** — project persistence with localStorage fallback
- **Custom polyfills** — Promise, fetch, classList, requestAnimationFrame, etc.

---

## License

MIT. See [LICENSE](./LICENSE).

---

## Contributing

Pull requests welcome. The codebase is vanilla JS with no build step — just
edit files in `public/js/` and refresh your browser.

See [architecture.md](./architecture.md) for the full technical documentation.
