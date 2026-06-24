# ForgeCAD — Low-End Tinkercad Clone

A 3D modeling + circuits web app inspired by Tinkercad, engineered to run on
**extremely low-end devices (under 1GB RAM)** and **ancient browsers (Safari 7 / 2013+)**.

## Why this exists

Most browser-based 3D modeling tools (Tinkercad, Onshape, etc.) require modern
browsers and 2GB+ RAM. ForgeCAD targets the opposite end: old phones, low-end
Chromebooks, school lab machines, developing-world hardware. It still delivers
core CAD functionality and a basic circuit simulator.

## Architecture

- **Vanilla JS + Three.js r128** — no React, no Next.js, no bundler. Static
  files only. This is the only way to hit Safari 7 (2013) compatibility.
- **ES5 syntax** throughout (no `let`/`const`/arrow functions) so it parses on
  old engines without transpiling.
- **No CSS variables** — theming uses `.theme-dark` / `.theme-light` classes
  on `<body>` (CSS variables didn't ship in Safari until 9.1).
- **Polyfills loaded first** (`js/polyfills.js`) for: Promise, fetch (XHR-backed),
  classList, requestAnimationFrame, JSON, Array methods, etc.
- **Three.js r128** (WebGL 1, ES5-compatible build) for 3D Design mode.
- **SVG** for Circuits mode (works on every browser since IE9).
- **Adaptive performance**: detects `navigator.deviceMemory`, CPU cores,
  WebGL version, browser age, and sustained FPS, then picks a tier
  (`low` / `mid` / `high`) that controls max objects, mesh segment count,
  shadows, antialiasing, and pixel ratio. If FPS drops below 20, it auto-downgrades.

## File layout

```
public/
├── index.html                  # App shell
├── css/styles.css              # All styles, theme classes, responsive
├── js/
│   ├── polyfills.js            # Safari 7 / IE9 polyfills
│   ├── compat.js               # Browser + device detection, perf tier
│   ├── theme.js                # Dark/light toggle (persisted)
│   ├── ui.js                   # Toast, modal, dropdown, properties builder
│   ├── exporters.js            # STL (binary), OBJ, GLTF, PNG, JSON project
│   ├── mode-3d.js              # 3D Design mode (Three.js)
│   ├── mode-circuits.js        # Circuits mode (SVG)
│   └── main.js                 # App entry, mode switching, top bar wiring
└── vendor/                     # Three.js r128 + OrbitControls + exporters
    ├── three.min.js
    ├── OrbitControls.js
    ├── STLExporter.js
    ├── OBJExporter.js
    └── GLTFExporter.js
```

## Features

### 3D Design mode
- **11 primitives**: box, sphere, cylinder, cone, torus, wedge, roof, text,
  polygon, tube, heart.
- **Transform tools**: move / rotate / scale (keyboard: W / E / R).
- **Boolean operations**: solid/hole toggle, visual grouping.
- **Properties panel**: position, rotation, scale, dimensions, color (with
  palette), hole flag.
- **Camera presets**: front, top, right, iso, fit.
- **Selection**: click to select, shift-click for multi-select. Wireframe
  bounding box on selection.
- **Keyboard shortcuts**: W/E/R (tools), G (group), H (hole), D (duplicate),
  Delete (remove), Esc (close dialogs).

### Circuits mode
- **10 components**: battery, button, switch, LED, buzzer, resistor,
  potentiometer, capacitor, Arduino (visual), wire.
- **Breadboard grid** with power rails (+ and −).
- **Wire routing**: click pin → click pin. Manhattan-style routing.
- **Live simulation**: battery voltage, closed-switch detection, LED
  lights up if voltage > forward voltage threshold. Wires turn green when
  current flows.
- **Component properties**: value, color (LED), state (switch), etc.

### Both modes
- **Save / Load**: export current scene as `.json` file, re-import to continue.
- **Theme**: Pro CAD dark (default) + light mode. Choice persisted in
  localStorage. Theme-color meta tag updates for mobile browser chrome.
- **Responsive**: desktop (3-panel), tablet (narrower panels), mobile (single
  viewport + bottom sheet for tools). Touch gestures: 1-finger orbit, 2-finger
  pan, pinch zoom.
- **Performance info modal** (menu → Performance info): shows detected
  browser, WebGL version, RAM estimate, CPU cores, tier, current caps.

## Exports

3D Design mode supports:
- **STL** (binary) — for 3D printing slicers.
- **OBJ** — for Blender, Maya, etc.
- **GLTF** (JSON) — modern web 3D format.
- **PNG** — viewport snapshot.

Circuits mode supports:
- **PNG** — snapshot of the breadboard.

## Browser support

Tested browsers (via Playwright + BrowserStack-style emulation):
- Chrome 90+ (full features, high tier).
- Firefox 90+ (full features, high tier).
- Safari 14+ (full features, high tier).
- Safari 9 (2015) — works, mid tier, no shadows, simplified meshes.
- Safari 7 (2013) — works with polyfills, low tier. Some features may degrade
  (e.g., text shapes require font loader, which may not load on very old iOS).
- Mobile Chrome / Safari — touch gestures, bottom sheet UI.

## Running locally

```bash
cd public
python3 -m http.server 8000
# Open http://localhost:8000 in any browser
```

No build step. No dependencies to install. Just static files.

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
| < 4         | low  | 100         | low         | no      | no        |

If sustained FPS drops below 20, the tier auto-downgrades to `low`.

## Known limitations

- **Boolean operations are visual only** — holes render as transparent red
  shapes and are flagged in the saved JSON, but they do not actually subtract
  from solids during export. For true CSG, import the STL into Blender and
  apply the boolean modifier there.
- **Text shapes require network access** — Three.js's FontLoader fetches a
  font JSON from a CDN. On offline / very old browsers, text shapes will fail
  silently.
- **Circuit simulation is intentionally simplified** — it does not solve real
  Kirchhoff equations. It checks for: battery present, all switches/buttons
  closed, then lights LEDs whose forward-voltage threshold is met.

## License

MIT.
