---
Task ID: bugfix-1
Agent: main
Task: Fix three reported bugs: (1) can't select objects to move them, (2) can't connect two pins in circuit mode, (3) object selection not working

Work Log:
- Investigated mode-3d.js: found that setTool('move') only updated button state — no drag handler existed. Implemented full drag-to-move/rotate/scale via pointer events with workplane projection.
- Found duplicate id="canvas-3d" bug: after WebGL renderer swap, both old and new canvases had the same ID. Removed the original canvas properly.
- Discovered OrbitControls uses pointer events (pointerdown/pointermove/pointerup) with setPointerCapture, which was preventing my mousedown/mouseup listeners from firing in some browsers. Switched to pointer events with document-level move/up listeners.
- Improved selection visual: thicker yellow wireframe bbox (depthTest=false so always visible), stronger emissive on selected material, bbox now shows for multi-selection too.
- Fixed recursive raycast for grouped objects: changed intersectObjects(..., false) to true, and walked parent chain to find tracked root object.
- In mode-circuits.js: pins were r=4 (too small). Added r=12 invisible hit area + r=5 visible pin with pointer-events: none on visible pin.
- Fixed wire-preview line intercepting clicks: .wire-line CSS had pointer-events: stroke which overrode inline pointer-events: none. Added .wire-line.wire-preview { pointer-events: none !important; }.
- Added visual feedback for wire-start pin (yellow, pulsing via CSS animation).
- Added help hint overlay in viewport explaining how to use each mode.
- Made LED lit state more visible: added SVG glow filter, opacity 1.0 vs 0.35 unlit.
- Components now placed in a grid pattern (was random) for easier discovery.
- Wrote bugfix-test.py that verifies all 3 bugs are fixed: 0 errors.

Stage Summary:
- All 3 reported bugs fixed and verified via automated Playwright tests.
- 3D: click selects, drag moves (with snap-to-grid), W/E/R tools work.
- Circuits: pins clickable, wires connect properly, LED lights up when sim runs.
- Selection visual is now obvious (yellow bbox + blue emissive tint).
- No regressions: smoke test passes with 0 errors, all exports still work.

---
Task ID: features-2
Agent: main
Task: Add tutorials, fix object properties, add wire routing styles, add IndexedDB storage, write README.md and architecture.md

Work Log:
- Fixed properties panel: ui.js propRow3 was setting data-prop only, not id. Added id attribute. _bindPropertyInputs now uses both input+change events for live updates. _applyProp now correctly handles dimensions (was setting userData.w instead of userData.dimensions.w).
- Added _refreshPropertyValues to update inputs during drag without rebuilding panel (preserves focus).
- Added wire routing styles: manhattan (L-shape, default), bezier (cubic curve), direct (straight line). New wireStyle state, dropdown in left panel, _renderWire supports all 3 styles, preview matches style. Style is saved in serialized data.
- Created storage.js: IndexedDB-based project persistence with autoSave slot, listProjects, loadProject, deleteProject, renameProject, stats. Falls back to localStorage if IndexedDB unavailable.
- Added 📁 Projects button to topbar. Built projects modal with thumbnails (48x48 PNG captured from canvas), load/rename/delete actions, storage stats footer showing backend + quota.
- Added auto-save: every 30 seconds + beforeunload. On startup, prompts to restore previous session.
- Created tutorial.js with two interactive tutorials: 3d-basics (7 steps) and circuits-basics (6 steps). Each step spotlights target element with yellow border + dimmed backdrop + popover with Prev/Next/Skip buttons. Keyboard: Esc/Arrow keys.
- Added ? tutorial button to topbar.
- Updated README.md with all new features, quick start, keyboard shortcuts, known limitations.
- Wrote architecture.md covering: high-level overview, module layout, module responsibilities, data flow diagrams, key design decisions (why no framework, why pointer events, why two pin elements, why pointer-events:none !important on wire-preview, why class-based theming, why IndexedDB+localStorage), performance considerations, browser compatibility notes, testing approach, future work.

Stage Summary:
- All 5 user requests completed: tutorials, properties fix, wire routing styles, IndexedDB storage, README+architecture docs.
- All tests pass: smoke test 0 errors, bugfix test 0 errors.
- New screenshots: 21-new-features, 22-tutorial-step1, 23-tutorial-step2, 24-tutorial-circuits, 25-projects-modal.
- Files created: js/storage.js, js/tutorial.js, architecture.md.
- Files modified: index.html (added Projects + Tutorial buttons, added script tags), css/styles.css (wire-preview !important), js/ui.js (propRow3 adds id), js/mode-3d.js (input events, _refreshPropertyValues, _applyProp fix), js/mode-circuits.js (wireStyle, wire style selector, input events), js/main.js (projects modal, autosave, tutorial button binding), README.md.
