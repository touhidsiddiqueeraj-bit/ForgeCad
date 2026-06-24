# ForgeCAD

A browser-based 3D modeler and circuit simulator. Built with vanilla JavaScript,
Three.js, and SVG — no framework, no build step, no backend.

![ForgeCAD](public/logo.svg)

## Features

- **3D Design mode**: 11 primitive shapes, XYZ axis gizmos, transform tools
  (move/rotate/scale), boolean operations, grouping, multi-select, camera
  presets, live properties panel
- **Circuits mode**: 19 components (including multimeter with proper nodal
  analysis), custom element maker, drag-to-move, 4 wire routing styles,
  zoom/pan, live simulation with animated components
- **Persistence**: IndexedDB project library with thumbnails, auto-save every
  30 seconds, JSON file import/export
- **Export**: STL (binary), OBJ, GLTF, PNG
- **Tutorials**: 4 interactive tutorials including 2 guided projects
- **Adaptive performance**: auto-detects device capability and scales quality
- **Cross-browser**: works on Chrome, Firefox, Safari 7+, IE9+ (circuits only)
- **Responsive**: desktop, tablet, mobile with touch gestures
- **Dark & light themes**

## Quick Start

```bash
git clone https://github.com/yourusername/forgecad.git
cd forgecad/public
python3 -m http.server 8000
# Open http://localhost:8000
```

No build step. No dependencies. Just static files.

## Deploy

The app is 100% static — deploy the `public/` directory to any static host:
GitHub Pages, Netlify, Vercel, or any web server.

## Documentation

- [README](public/README.md) — features, quick start, keyboard shortcuts
- [Architecture](public/architecture.md) — module layout, data flow, design decisions

## License

MIT. See [LICENSE](LICENSE).
