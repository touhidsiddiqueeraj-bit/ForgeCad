"""Final visual verification of bugfixes."""
import time
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(args=["--no-sandbox", "--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"])
    page = browser.new_context(viewport={"width": 1280, "height": 800}).new_page()
    page.goto("http://localhost:3000/", wait_until="networkidle", timeout=20000)
    time.sleep(2)

    # === 3D mode: add shapes, drag one ===
    for shape in ["box", "sphere", "cylinder"]:
        page.evaluate(f"window.ForgeCAD.mode3D.addShape('{shape}')")
        time.sleep(0.15)
    # Spread them
    page.evaluate("""
        (function() {
            var objs = window.ForgeCAD.mode3D.objects;
            for (var i = 0; i < objs.length; i++) {
                objs[i].position.x = (i - 1) * 35;
            }
            window.ForgeCAD.mode3D.setView('iso');
            window.ForgeCAD.mode3D._updateSelectionVisual();
        })()
    """)
    time.sleep(0.3)
    page.screenshot(path="/home/z/my-project/download/15-3d-shapes-draggable.png")
    print("Shot 15: 3D shapes (draggable)")

    # Select the middle one (cylinder)
    pos = page.evaluate("""
        (function() {
            var obj = window.ForgeCAD.mode3D.objects[1]; // sphere
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
    # Click to select
    page.mouse.click(pos['x'], pos['y'])
    time.sleep(0.3)
    page.screenshot(path="/home/z/my-project/download/16-3d-selected.png")
    print("Shot 16: 3D with selected object (visible bbox)")

    # Drag it to the right
    page.mouse.move(pos['x'], pos['y'])
    page.mouse.down()
    for i in range(15):
        page.mouse.move(pos['x'] + (i + 1) * 6, pos['y'])
        time.sleep(0.03)
    page.mouse.up()
    time.sleep(0.3)
    page.screenshot(path="/home/z/my-project/download/17-3d-after-drag.png")
    print("Shot 17: 3D after dragging object to the right")

    # === Circuits mode: add components + connect wires ===
    page.evaluate("window.ForgeCAD.app.setMode('circuits')")
    time.sleep(0.3)
    page.evaluate("window.ForgeCAD.modeCircuits.addComponent('battery')")
    time.sleep(0.2)
    page.evaluate("window.ForgeCAD.modeCircuits.addComponent('switch')")
    time.sleep(0.2)
    page.evaluate("window.ForgeCAD.modeCircuits.addComponent('led')")
    time.sleep(0.3)
    page.screenshot(path="/home/z/my-project/download/18-circuits-components.png")
    print("Shot 18: circuits with components added")

    # Connect battery + to switch a
    pins = page.evaluate("""
        (function() {
            var svg = document.getElementById('svg-circuits');
            var pins = svg.querySelectorAll('[data-pin-id]');
            var seen = {};
            var result = [];
            for (var i = 0; i < pins.length; i++) {
                var p = pins[i];
                var id = p.getAttribute('data-pin-id');
                if (seen[id]) continue;
                seen[id] = true;
                var rect = p.getBoundingClientRect();
                result.push({id: id, x: Math.round(rect.left + rect.width/2), y: Math.round(rect.top + rect.height/2)});
            }
            return result;
        })()
    """)
    print(f"Pins: {len(pins)} found")
    if len(pins) >= 4:
        # Connect: battery pin 0 -> switch pin 0
        page.mouse.click(pins[0]['x'], pins[0]['y'])
        time.sleep(0.2)
        page.mouse.click(pins[2]['x'], pins[2]['y'])
        time.sleep(0.3)
        # Connect: switch pin 1 -> led pin 0
        page.mouse.click(pins[3]['x'], pins[3]['y'])
        time.sleep(0.2)
        page.mouse.click(pins[4]['x'], pins[4]['y'])
        time.sleep(0.3)
        # Connect: led pin 1 -> battery pin 1
        page.mouse.click(pins[5]['x'], pins[5]['y'])
        time.sleep(0.2)
        page.mouse.click(pins[1]['x'], pins[1]['y'])
        time.sleep(0.3)

    wire_count = page.evaluate("window.ForgeCAD.modeCircuits.wires.length")
    print(f"Wires connected: {wire_count}")

    # Close the switch
    page.evaluate("""
        (function() {
            var comps = window.ForgeCAD.modeCircuits.components;
            for (var i = 0; i < comps.length; i++) {
                if (comps[i].type === 'switch') comps[i].props.closed = true;
            }
        })()
    """)
    # Run sim
    page.evaluate("window.ForgeCAD.modeCircuits.runSim()")
    time.sleep(0.5)
    page.screenshot(path="/home/z/my-project/download/19-circuits-wired-sim.png")
    print("Shot 19: circuits wired + sim running (LED should be lit)")
    page.evaluate("window.ForgeCAD.modeCircuits.stopSim()")

    print("\nAll screenshots saved.")
    browser.close()
