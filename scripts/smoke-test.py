"""Quick smoke test for ForgeCAD via Playwright."""
import sys, json, time
from playwright.sync_api import sync_playwright

URL = "http://localhost:8000/index.html"
errors = []
warnings = []

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--no-sandbox", "--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"])
        ctx = browser.new_context(viewport={"width": 1280, "height": 800}, device_scale_factor=1)
        page = ctx.new_page()
        # Capture console
        page.on("console", lambda msg: (
            errors.append(f"[{msg.type}] {msg.text}") if msg.type in ("error",) else
            warnings.append(f"[{msg.type}] {msg.text}") if msg.type in ("warning",) else None
        ))
        page.on("pageerror", lambda e: errors.append(f"[pageerror] {e}"))
        try:
            page.goto(URL, wait_until="networkidle", timeout=15000)
        except Exception as e:
            print(f"Navigation failed: {e}")
            return 1
        time.sleep(2)  # let scripts run

        # Check ForgeCAD global exists
        fc = page.evaluate("typeof window.ForgeCAD")
        print(f"window.ForgeCAD type: {fc}")
        if fc != "object":
            errors.append("window.ForgeCAD is not an object")

        # Check compat tier
        tier = page.evaluate("window.ForgeCAD && window.ForgeCAD.compat ? window.ForgeCAD.compat.tier : 'unknown'")
        print(f"Performance tier: {tier}")

        browser_id = page.evaluate("window.ForgeCAD && window.ForgeCAD.compat ? window.ForgeCAD.compat.browser + ' ' + window.ForgeCAD.compat.browserVersion : 'unknown'")
        print(f"Detected: {browser_id}")

        webgl = page.evaluate("window.ForgeCAD && window.ForgeCAD.compat ? window.ForgeCAD.compat.hasWebGL : 'unknown'")
        print(f"WebGL: {webgl}")

        # Try adding a box
        try:
            page.evaluate("window.ForgeCAD.mode3D.addShape('box')")
            time.sleep(0.3)
            count = page.evaluate("window.ForgeCAD.mode3D.objects.length")
            print(f"Object count after addShape('box'): {count}")
            if count != 1:
                errors.append(f"Expected 1 object, got {count}")
        except Exception as e:
            errors.append(f"addShape failed: {e}")

        # Try sphere, cylinder
        for shape in ["sphere", "cylinder", "cone", "torus", "wedge", "roof", "polygon", "tube", "heart"]:
            try:
                page.evaluate(f"window.ForgeCAD.mode3D.addShape('{shape}')")
                time.sleep(0.1)
            except Exception as e:
                errors.append(f"addShape('{shape}') failed: {e}")
        count = page.evaluate("window.ForgeCAD.mode3D.objects.length")
        print(f"Object count after adding all primitives: {count}")

        # Test view presets
        for view in ["front", "top", "right", "iso", "fit"]:
            try:
                page.evaluate(f"window.ForgeCAD.mode3D.setView('{view}')")
                time.sleep(0.1)
            except Exception as e:
                errors.append(f"setView('{view}') failed: {e}")

        # Test theme toggle
        try:
            before = page.evaluate("window.ForgeCAD.theme.current")
            page.evaluate("window.ForgeCAD.theme.toggle()")
            after = page.evaluate("window.ForgeCAD.theme.current")
            print(f"Theme: {before} -> {after}")
            if before == after:
                errors.append("Theme did not toggle")
            # Toggle back
            page.evaluate("window.ForgeCAD.theme.toggle()")
        except Exception as e:
            errors.append(f"theme.toggle failed: {e}")

        # Test serialization
        try:
            data = page.evaluate("JSON.stringify(window.ForgeCAD.mode3D.serialize())")
            obj = json.loads(data)
            print(f"Serialized: version={obj.get('version')}, mode={obj.get('mode')}, objects={len(obj.get('objects', []))}")
        except Exception as e:
            errors.append(f"serialize failed: {e}")

        # Test mode switch to circuits
        try:
            page.evaluate("window.ForgeCAD.app.setMode('circuits')")
            time.sleep(0.3)
            current_mode = page.evaluate("window.ForgeCAD.app.currentMode")
            print(f"Current mode: {current_mode}")
            if current_mode != "circuits":
                errors.append(f"Mode switch failed, got {current_mode}")
            # Add a component
            page.evaluate("window.ForgeCAD.modeCircuits.addComponent('battery')")
            time.sleep(0.1)
            page.evaluate("window.ForgeCAD.modeCircuits.addComponent('led')")
            time.sleep(0.1)
            page.evaluate("window.ForgeCAD.modeCircuits.addComponent('resistor')")
            time.sleep(0.1)
            comp_count = page.evaluate("window.ForgeCAD.modeCircuits.components.length")
            print(f"Circuit component count: {comp_count}")
        except Exception as e:
            errors.append(f"circuits mode failed: {e}")

        # Switch back to 3D
        try:
            page.evaluate("window.ForgeCAD.app.setMode('3d')")
            time.sleep(0.3)
        except Exception as e:
            errors.append(f"setMode('3d') failed: {e}")

        # Test PNG export
        try:
            png_len = page.evaluate("""
                (function() {
                    var canvas = document.getElementById('canvas-3d');
                    return canvas.toDataURL('image/png').length;
                })()
            """)
            print(f"PNG snapshot data URL length: {png_len}")
        except Exception as e:
            errors.append(f"PNG snapshot failed: {e}")

        # Test mobile viewport
        try:
            page.set_viewport_size({"width": 375, "height": 812})
            time.sleep(0.5)
            toggle_visible = page.evaluate("""
                (function() {
                    var el = document.getElementById('mobile-panel-toggle');
                    if (!el) return 'missing';
                    var cs = window.getComputedStyle(el);
                    return cs.display;
                })()
            """)
            print(f"Mobile viewport (375x812) - toggle display: {toggle_visible}")
            page.set_viewport_size({"width": 1280, "height": 800})
        except Exception as e:
            errors.append(f"mobile viewport test failed: {e}")

        # Take a screenshot
        try:
            page.screenshot(path="/home/z/my-project/download/forgecad-3d-mode.png")
            print("Screenshot saved: /home/z/my-project/download/forgecad-3d-mode.png")
        except Exception as e:
            warnings.append(f"screenshot failed: {e}")

        # === Report ===
        print()
        print("=== TEST SUMMARY ===")
        print(f"Errors: {len(errors)}")
        for e in errors[:20]:
            print(f"  - {e}")
        print(f"Warnings: {len(warnings)}")
        for w in warnings[:10]:
            print(f"  - {w}")
        print()
        return 0 if not errors else 2

if __name__ == "__main__":
    sys.exit(main())
