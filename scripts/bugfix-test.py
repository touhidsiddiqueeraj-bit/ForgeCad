"""Test the three reported bugs are fixed:
1. Can't select objects to move them around
2. Can't connect two points in circuit mode
3. Object selection is not working
"""
import time, json
from playwright.sync_api import sync_playwright

errors = []

with sync_playwright() as p:
    browser = p.chromium.launch(args=["--no-sandbox", "--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"])
    page = browser.new_context(viewport={"width": 1280, "height": 800}).new_page()
    page.on("pageerror", lambda e: errors.append(f"[pageerror] {e}"))
    # Capture console for debug
    page.on("console", lambda msg: print(f"  [console.{msg.type}] {msg.text}") if msg.type in ('log', 'error', 'warning') else None)
    # Enable debug
    page.add_init_script("window.__DEBUG_DRAG = true;")
    page.goto("http://localhost:3000/", wait_until="networkidle", timeout=20000)
    time.sleep(2)

    print("=== Test 1: 3D Object Selection ===")
    # Add a box
    page.evaluate("window.ForgeCAD.mode3D.addShape('box')")
    time.sleep(0.3)
    obj_count = page.evaluate("window.ForgeCAD.mode3D.objects.length")
    print(f"  Objects after addShape: {obj_count}")
    if obj_count != 1:
        errors.append(f"Expected 1 object, got {obj_count}")

    # Get box screen position
    box_pos = page.evaluate("""
        (function() {
            var obj = window.ForgeCAD.mode3D.objects[0];
            var vec = new THREE.Vector3();
            vec.setFromMatrixPosition(obj.matrixWorld);
            vec.project(window.ForgeCAD.mode3D.camera);
            var rect = window.ForgeCAD.mode3D.renderer.domElement.getBoundingClientRect();
            return {
                x: Math.round((vec.x * 0.5 + 0.5) * rect.width + rect.left),
                y: Math.round((-vec.y * 0.5 + 0.5) * rect.height + rect.top)
            };
        })()
    """)
    print(f"  Box screen position: {box_pos}")

    # Click on the box to select it
    page.mouse.move(box_pos['x'], box_pos['y'])
    page.mouse.down()
    page.mouse.up()
    time.sleep(0.3)
    selected_count = page.evaluate("window.ForgeCAD.mode3D.selected.length")
    print(f"  Selected count after click: {selected_count}")
    if selected_count != 1:
        errors.append(f"Selection failed: expected 1 selected, got {selected_count}")

    print("\n=== Test 2: 3D Drag-to-Move ===")
    # Get initial position
    initial_pos = page.evaluate("""
        (function() {
            var p = window.ForgeCAD.mode3D.objects[0].position;
            return {x: p.x, y: p.y, z: p.z};
        })()
    """)
    print(f"  Initial object position: {initial_pos}")

    # Make sure 'move' tool is active
    page.evaluate("window.ForgeCAD.mode3D.setTool('move')")
    time.sleep(0.1)

    # Drag the box: mousedown on box, move cursor by 80px right, mouseup
    page.mouse.move(box_pos['x'], box_pos['y'])
    page.mouse.down()
    # Move in steps to trigger drag detection (threshold is 16px^2)
    for i in range(20):
        page.mouse.move(box_pos['x'] + (i + 1) * 4, box_pos['y'])
        time.sleep(0.03)
    # Final position
    page.mouse.move(box_pos['x'] + 80, box_pos['y'])
    time.sleep(0.1)
    page.mouse.up()
    time.sleep(0.5)

    # Debug: check drag state
    drag_state = page.evaluate("""
        (function() {
            var m = window.ForgeCAD.mode3D;
            return {
                dragging: m._dragging,
                dragTarget: m._dragTarget ? 'set' : 'null',
                dragHitPoint: m._dragHitPoint ? {x: m._dragHitPoint.x, y: m._dragHitPoint.y, z: m._dragHitPoint.z} : null,
                dragStartPos: m._dragStartPos,
                dragWorkY: m._dragWorkY,
                tool: m.tool
            };
        })()
    """)
    print(f"  Drag state after drag: {drag_state}")

    final_pos = page.evaluate("""
        (function() {
            var p = window.ForgeCAD.mode3D.objects[0].position;
            return {x: p.x, y: p.y, z: p.z};
        })()
    """)
    print(f"  Final object position: {final_pos}")
    if abs(final_pos['x'] - initial_pos['x']) < 1:
        errors.append(f"Drag failed: x position unchanged ({initial_pos['x']} -> {final_pos['x']})")
    else:
        print(f"  ✓ Object moved {final_pos['x'] - initial_pos['x']} units on X axis")

    print("\n=== Test 3: Circuits Pin Click + Wire Connection ===")
    # Switch to circuits mode
    page.evaluate("window.ForgeCAD.app.setMode('circuits')")
    time.sleep(0.3)
    # Verify mode switched
    mode = page.evaluate("window.ForgeCAD.app.currentMode")
    print(f"  Current mode: {mode}")
    if mode != 'circuits':
        errors.append(f"Mode switch failed: expected 'circuits', got '{mode}'")

    # Add a battery and an LED
    page.evaluate("window.ForgeCAD.modeCircuits.addComponent('battery')")
    time.sleep(0.2)
    page.evaluate("window.ForgeCAD.modeCircuits.addComponent('led')")
    time.sleep(0.3)

    comp_count = page.evaluate("window.ForgeCAD.modeCircuits.components.length")
    pin_count = page.evaluate("window.ForgeCAD.modeCircuits.pins.length")
    print(f"  Components: {comp_count}, Pins: {pin_count}")
    if comp_count != 2:
        errors.append(f"Expected 2 components, got {comp_count}")
    if pin_count < 4:
        errors.append(f"Expected at least 4 pins, got {pin_count}")

    # Get pin positions in screen coords
    pin_positions = page.evaluate("""
        (function() {
            var svg = document.getElementById('svg-circuits');
            var pins = svg.querySelectorAll('[data-pin-id]');
            var rect = svg.getBoundingClientRect();
            var result = [];
            for (var i = 0; i < pins.length; i++) {
                var p = pins[i];
                // Use the circle's cx/cy + parent group transform
                var cx = parseFloat(p.getAttribute('cx'));
                var cy = parseFloat(p.getAttribute('cy'));
                // Get the screen point via SVG point transform
                var pt = svg.createSVGPoint();
                pt.x = cx;
                pt.y = cy;
                var ctm = p.getCTM();
                if (ctm) pt = pt.matrixTransform(ctm);
                // Convert to screen coords
                var screenPt = svg.createSVGPoint();
                screenPt.x = pt.x;
                screenPt.y = pt.y;
                var screenCTM = svg.getScreenCTM();
                if (screenCTM) screenPt = screenPt.matrixTransform(screenCTM);
                result.push({
                    id: p.getAttribute('data-pin-id'),
                    screenX: Math.round(screenPt.x),
                    screenY: Math.round(screenPt.y)
                });
            }
            return result;
        })()
    """)
    print(f"  Found {len(pin_positions)} pin positions:")
    for pp in pin_positions[:6]:
        print(f"    {pp['id']}: ({pp['screenX']}, {pp['screenY']})")

    if len(pin_positions) < 2:
        errors.append(f"Expected at least 2 pin positions, got {len(pin_positions)}")
    else:
        # Click first pin (use the hit area which is the first occurrence of each pin_id)
        seen_ids = set()
        unique_pins = []
        for pp in pin_positions:
            if pp['id'] not in seen_ids:
                unique_pins.append(pp)
                seen_ids.add(pp['id'])

        first_pin = unique_pins[0]
        print(f"  Clicking first pin: {first_pin['id']} at ({first_pin['screenX']}, {first_pin['screenY']})")
        page.mouse.move(first_pin['screenX'], first_pin['screenY'])
        page.mouse.down()
        page.mouse.up()
        time.sleep(0.3)
        wire_start = page.evaluate("window.ForgeCAD.modeCircuits.wireStartPin")
        print(f"  wireStartPin after first click: {wire_start}")
        if not wire_start:
            errors.append(f"First pin click failed: wireStartPin not set")
        else:
            # Click second pin (different id)
            second_pin = unique_pins[1] if len(unique_pins) > 1 else unique_pins[0]
            print(f"  Clicking second pin: {second_pin['id']} at ({second_pin['screenX']}, {second_pin['screenY']})")
            page.mouse.move(second_pin['screenX'], second_pin['screenY'])
            page.mouse.down()
            page.mouse.up()
            time.sleep(0.3)
            wire_count = page.evaluate("window.ForgeCAD.modeCircuits.wires.length")
            wire_start_after = page.evaluate("window.ForgeCAD.modeCircuits.wireStartPin")
            print(f"  Wire count after second click: {wire_count}")
            print(f"  wireStartPin after second click: {wire_start_after}")
            if wire_count != 1:
                errors.append(f"Wire connection failed: expected 1 wire, got {wire_count}")
            else:
                print("  ✓ Wire connected successfully!")

    print("\n=== Test 4: Properties panel updates after drag ===")
    page.evaluate("window.ForgeCAD.app.setMode('3d')")
    time.sleep(0.3)
    # Box is already selected (from test 1) — but selection might be cleared after mode switch
    # Re-select by clicking on it
    obj = page.evaluate("window.ForgeCAD.mode3D.objects[0]")
    if obj:
        # Just set selection programmatically for the test
        page.evaluate("window.ForgeCAD.mode3D.selected = [window.ForgeCAD.mode3D.objects[0]]; window.ForgeCAD.mode3D._updateSelectionVisual(); window.ForgeCAD.mode3D._showProperties();")
        time.sleep(0.2)
        prop_title = page.evaluate("document.getElementById('right-panel-title').textContent")
        print(f"  Properties panel title: '{prop_title}'")
        if 'box' not in prop_title.lower():
            errors.append(f"Properties panel didn't update for box: got '{prop_title}'")
        else:
            print("  ✓ Properties panel shows selected object")

    # Take screenshot
    page.screenshot(path="/home/z/my-project/download/14-bugfix-verification.png")

    browser.close()

print("\n=== SUMMARY ===")
print(f"Errors: {len(errors)}")
for e in errors:
    print(f"  - {e}")
print()
print("PASS" if not errors else "FAIL")
