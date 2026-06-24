"""Visual test: capture screenshots of ForgeCAD in multiple states."""
import os
import time
import json
from playwright.sync_api import sync_playwright

URL = "http://localhost:8000/index.html"
OUT_DIR = "/home/z/my-project/download"
os.makedirs(OUT_DIR, exist_ok=True)

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--no-sandbox", "--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"])
        # Desktop viewport
        ctx = browser.new_context(viewport={"width": 1280, "height": 800}, device_scale_factor=1)
        page = ctx.new_page()
        page.on("pageerror", lambda e: print(f"[pageerror] {e}"))
        page.goto(URL, wait_until="networkidle", timeout=15000)
        time.sleep(2)

        # === Shot 1: empty 3D mode (dark) ===
        page.screenshot(path=f"{OUT_DIR}/01-3d-empty-dark.png")
        print("Shot 1: empty 3D mode (dark)")

        # === Shot 2: 3D mode with several shapes ===
        # Clear default scene first (it's already empty)
        for shape in ["box", "sphere", "cylinder", "cone", "torus"]:
            page.evaluate(f"window.ForgeCAD.mode3D.addShape('{shape}')")
            time.sleep(0.15)
        # Spread them out
        page.evaluate("""
            (function() {
                var objs = window.ForgeCAD.mode3D.objects;
                for (var i = 0; i < objs.length; i++) {
                    objs[i].position.x = (i - 2) * 30;
                }
                window.ForgeCAD.mode3D.setView('iso');
            })()
        """)
        time.sleep(0.5)
        page.screenshot(path=f"{OUT_DIR}/02-3d-shapes-dark.png")
        print("Shot 2: 3D shapes (dark)")

        # === Shot 3: with selected shape (properties panel visible) ===
        page.evaluate("window.ForgeCAD.mode3D.selected = [window.ForgeCAD.mode3D.objects[2]]; window.ForgeCAD.mode3D._updateSelectionVisual(); window.ForgeCAD.mode3D._showProperties();")
        time.sleep(0.3)
        page.screenshot(path=f"{OUT_DIR}/03-3d-selected.png")
        print("Shot 3: 3D with selection + properties")

        # === Shot 4: light mode ===
        page.evaluate("window.ForgeCAD.theme.current = 'dark'; window.ForgeCAD.theme.toggle();")
        time.sleep(0.3)
        page.screenshot(path=f"{OUT_DIR}/04-3d-light-mode.png")
        print("Shot 4: 3D light mode")
        # Toggle back to dark
        page.evaluate("window.ForgeCAD.theme.toggle();")
        time.sleep(0.2)

        # === Shot 5: Circuits mode ===
        page.evaluate("window.ForgeCAD.app.setMode('circuits')")
        time.sleep(0.3)
        page.screenshot(path=f"{OUT_DIR}/05-circuits-empty.png")
        print("Shot 5: circuits empty")

        # Add components and wire them
        page.evaluate("window.ForgeCAD.modeCircuits.addComponent('battery')")
        page.evaluate("window.ForgeCAD.modeCircuits.addComponent('switch')")
        page.evaluate("window.ForgeCAD.modeCircuits.addComponent('led')")
        page.evaluate("window.ForgeCAD.modeCircuits.addComponent('resistor')")
        time.sleep(0.3)
        # Move components into a line
        page.evaluate("""
            (function() {
                var comps = window.ForgeCAD.modeCircuits.components;
                var positions = [
                    {x: 120, y: 200}, {x: 260, y: 200}, {x: 400, y: 200}, {x: 540, y: 200}
                ];
                for (var i = 0; i < comps.length; i++) {
                    comps[i].x = positions[i].x;
                    comps[i].y = positions[i].y;
                    window.ForgeCAD.modeCircuits._renderComponent(comps[i]);
                }
            })()
        """)
        time.sleep(0.3)
        # Manually connect first pin of battery to first pin of switch, etc
        page.evaluate("""
            (function() {
                var mc = window.ForgeCAD.modeCircuits;
                var c = mc.components;
                // connect each component's first pin to next component's first pin,
                // and last to last, in a loop
                if (c.length >= 2) {
                    for (var i = 0; i < c.length - 1; i++) {
                        mc.wires.push({id: 'w'+i+'_a', from: c[i].id+'_pin_0', to: c[i+1].id+'_pin_0'});
                        mc.wires.push({id: 'w'+i+'_b', from: c[i].id+'_pin_1', to: c[i+1].id+'_pin_1'});
                        mc._renderWire({id: 'w'+i+'_a', from: c[i].id+'_pin_0', to: c[i+1].id+'_pin_0'});
                        mc._renderWire({id: 'w'+i+'_b', from: c[i].id+'_pin_1', to: c[i+1].id+'_pin_1'});
                    }
                }
            })()
        """)
        time.sleep(0.3)
        # Run sim with switch closed
        page.evaluate("""
            (function() {
                var comps = window.ForgeCAD.modeCircuits.components;
                for (var i = 0; i < comps.length; i++) {
                    if (comps[i].type === 'switch') comps[i].props.closed = true;
                }
            })()
        """)
        page.evaluate("window.ForgeCAD.modeCircuits.runSim()")
        time.sleep(0.5)
        page.screenshot(path=f"{OUT_DIR}/06-circuits-wired.png")
        print("Shot 6: circuits with components + wires")
        page.evaluate("window.ForgeCAD.modeCircuits.stopSim()")

        # === Shot 7: Mobile viewport (3D) ===
        page.set_viewport_size({"width": 375, "height": 812})
        page.evaluate("window.ForgeCAD.app.setMode('3d')")
        time.sleep(0.3)
        page.screenshot(path=f"{OUT_DIR}/07-mobile-3d.png")
        print("Shot 7: mobile 3D")

        # Open mobile panel
        page.evaluate("document.getElementById('mobile-panel-toggle').click()")
        time.sleep(0.3)
        page.screenshot(path=f"{OUT_DIR}/08-mobile-panel-open.png")
        print("Shot 8: mobile panel open")
        page.evaluate("document.getElementById('mobile-panel-toggle').click()")
        time.sleep(0.2)

        # === Shot 9: Mobile circuits ===
        page.evaluate("window.ForgeCAD.app.setMode('circuits')")
        time.sleep(0.3)
        page.screenshot(path=f"{OUT_DIR}/09-mobile-circuits.png")
        print("Shot 9: mobile circuits")

        # === Shot 10: Performance info modal ===
        page.set_viewport_size({"width": 1280, "height": 800})
        time.sleep(0.3)
        page.evaluate("window.ForgeCAD.app.handleMenuAction('perf')")
        time.sleep(0.3)
        page.screenshot(path=f"{OUT_DIR}/10-perf-modal.png")
        print("Shot 10: perf modal")
        page.evaluate("window.ForgeCAD.ui.modalClose()")

        # === Shot 11: About modal ===
        page.evaluate("window.ForgeCAD.app.handleMenuAction('about')")
        time.sleep(0.3)
        page.screenshot(path=f"{OUT_DIR}/11-about-modal.png")
        print("Shot 11: about modal")

        print("\nAll screenshots saved to:", OUT_DIR)
        browser.close()

if __name__ == "__main__":
    main()
