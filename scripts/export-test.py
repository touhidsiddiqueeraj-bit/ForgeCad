"""Functional test: verify STL/OBJ/GLTF exports + save/load round-trip.
Calls exporter.parse() directly to avoid download event timing issues."""
import os, json, time
from playwright.sync_api import sync_playwright

URL = "http://localhost:3000/"
OUT_DIR = "/home/z/my-project/download"
os.makedirs(OUT_DIR, exist_ok=True)
errors = []

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--no-sandbox", "--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"])
        page = browser.new_context(viewport={"width": 1280, "height": 800}).new_page()
        page.on("pageerror", lambda e: errors.append(f"[pageerror] {e}"))
        page.goto(URL, wait_until="networkidle", timeout=15000)
        time.sleep(2)

        # Add a few shapes
        for s in ["box", "sphere", "cylinder"]:
            page.evaluate(f"window.ForgeCAD.mode3D.addShape('{s}')")
            time.sleep(0.1)

        # === Test STL export (binary) ===
        print("=== STL Export (binary) ===")
        stl_b64 = page.evaluate("""
            (function() {
                try {
                    var ex = new THREE.STLExporter();
                    var data = ex.parse(window.ForgeCAD.mode3D.scene, { binary: true });
                    // data is a DataView
                    var bytes = new Uint8Array(data.buffer || data);
                    var binary = '';
                    for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
                    return btoa(binary);
                } catch (e) { return 'ERROR:' + e.message; }
            })()
        """)
        if stl_b64.startswith('ERROR:'):
            errors.append(f"STL export failed: {stl_b64[6:]}")
        else:
            stl_bytes = base64decode(stl_b64)
            with open(f"{OUT_DIR}/test.stl", 'wb') as f:
                f.write(stl_bytes)
            print(f"  STL saved: {len(stl_bytes)} bytes")
            # Parse: tri count at offset 80
            tri_count = int.from_bytes(stl_bytes[80:84], 'little')
            print(f"  STL triangle count: {tri_count}")
            if tri_count == 0:
                errors.append("STL has 0 triangles")

        # === Test OBJ export (ASCII) ===
        print("=== OBJ Export (ASCII) ===")
        obj_text = page.evaluate("""
            (function() {
                try {
                    var ex = new THREE.OBJExporter();
                    return ex.parse(window.ForgeCAD.mode3D.scene);
                } catch (e) { return 'ERROR:' + e.message; }
            })()
        """)
        if obj_text.startswith('ERROR:'):
            errors.append(f"OBJ export failed: {obj_text[6:]}")
        else:
            with open(f"{OUT_DIR}/test.obj", 'w') as f:
                f.write(obj_text)
            v_count = obj_text.count('\nv ') + (1 if obj_text.startswith('v ') else 0)
            f_count = obj_text.count('\nf ') + (1 if obj_text.startswith('f ') else 0)
            print(f"  OBJ saved: {len(obj_text)} chars, {v_count} vertices, {f_count} faces")
            if v_count == 0:
                errors.append("OBJ has 0 vertices")

        # === Test GLTF export ===
        print("=== GLTF Export ===")
        gltf_text = page.evaluate("""
            (function() {
                return new Promise(function(resolve) {
                    try {
                        var ex = new THREE.GLTFExporter();
                        ex.parse(window.ForgeCAD.mode3D.scene,
                            function(result) { resolve(JSON.stringify(result)); },
                            function(err) { resolve('ERROR:' + (err && err.message || 'unknown')); },
                            { binary: false }
                        );
                    } catch (e) { resolve('ERROR:' + e.message); }
                });
            })()
        """)
        # Wait for promise
        time.sleep(3)
        # Need to re-evaluate to get the resolved value
        gltf_text = page.evaluate("""
            (function() {
                return new Promise(function(resolve) {
                    var ex = new THREE.GLTFExporter();
                    ex.parse(window.ForgeCAD.mode3D.scene,
                        function(result) { resolve(JSON.stringify(result)); },
                        function(err) { resolve('ERROR:' + (err && err.message || 'unknown')); },
                        { binary: false }
                    );
                });
            })()
        """)
        if gltf_text.startswith('ERROR:'):
            errors.append(f"GLTF export failed: {gltf_text[6:]}")
        else:
            with open(f"{OUT_DIR}/test.gltf", 'w') as f:
                f.write(gltf_text)
            try:
                obj = json.loads(gltf_text)
                print(f"  GLTF saved: {len(gltf_text)} chars, version={obj.get('asset', {}).get('version')}")
                if 'meshes' in obj:
                    print(f"  GLTF meshes: {len(obj['meshes'])}")
                if 'meshes' not in obj or len(obj['meshes']) == 0:
                    errors.append("GLTF has no meshes")
            except Exception as e:
                errors.append(f"GLTF JSON parse error: {e}")

        # === Test PNG export ===
        print("=== PNG Export ===")
        png_b64 = page.evaluate("""
            (function() {
                try {
                    window.ForgeCAD.mode3D.render();
                    var canvas = document.getElementById('canvas-3d');
                    var url = canvas.toDataURL('image/png');
                    return url.split(',')[1];
                } catch (e) { return 'ERROR:' + e.message; }
            })()
        """)
        if png_b64.startswith('ERROR:'):
            errors.append(f"PNG export failed: {png_b64[6:]}")
        else:
            png_bytes = base64decode(png_b64)
            with open(f"{OUT_DIR}/test.png", 'wb') as f:
                f.write(png_bytes)
            print(f"  PNG saved: {len(png_bytes)} bytes")
            if len(png_bytes) < 1000:
                errors.append(f"PNG too small: {len(png_bytes)} bytes")
            # Verify PNG header
            if png_bytes[:8] != b'\\x89PNG\\r\\n\\x1a\\n':
                errors.append("PNG header is invalid")

        # === Test save/load round-trip ===
        print("=== Save/Load Round-Trip ===")
        save_data = page.evaluate("""
            (function() {
                var data = window.ForgeCAD.mode3D.serialize();
                data.name = 'TestProject';
                data.timestamp = Date.now();
                return JSON.stringify(data);
            })()
        """)
        proj = json.loads(save_data)
        print(f"  Serialized: {len(proj['objects'])} objects")
        if len(proj['objects']) != 3:
            errors.append(f"Expected 3 objects in saved project, got {len(proj['objects'])}")

        # Clear scene (skip confirm)
        page.evaluate("""
            (function() {
                var m = window.ForgeCAD.mode3D;
                for (var i = 0; i < m.objects.length; i++) {
                    if (m.objects[i].geometry) m.objects[i].geometry.dispose();
                    if (m.objects[i].material) m.objects[i].material.dispose();
                    if (m.objects[i].parent) m.objects[i].parent.remove(m.objects[i]);
                }
                m.objects = [];
                m.selected = [];
                m._updateSelectionVisual();
                window.ForgeCAD.ui.clearProperties();
                window.ForgeCAD.ui.setObjects(0);
            })()
        """)
        time.sleep(0.3)
        after_clear = page.evaluate("window.ForgeCAD.mode3D.objects.length")
        print(f"  After clear: {after_clear} objects")
        if after_clear != 0:
            errors.append(f"Scene not cleared: {after_clear} objects remain")

        # Load
        page.evaluate(f"""
            (function() {{
                var data = {save_data};
                window.ForgeCAD.mode3D.deserialize(data);
            }})()
        """)
        time.sleep(1)
        after_load = page.evaluate("window.ForgeCAD.mode3D.objects.length")
        print(f"  After load: {after_load} objects")
        if after_load != 3:
            errors.append(f"Round-trip failed: expected 3 objects, got {after_load}")

        # === Summary ===
        print("\n=== Summary ===")
        print(f"Errors: {len(errors)}")
        for e in errors:
            print(f"  - {e}")
        browser.close()
        return 0 if not errors else 1

def base64decode(b64):
    import base64
    return base64.b64decode(b64)

if __name__ == "__main__":
    import sys
    sys.exit(main())
