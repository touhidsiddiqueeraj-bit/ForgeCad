/* ============================================================
   ForgeCAD — exporters.js
   Export 3D scene to: STL (binary), OBJ, GLTF, PNG snapshot.
   Export project to JSON.
   All file downloads work via Blob + URL.createObjectURL.
   ============================================================ */
(function (global) {
  'use strict';

  var exporters = {

    /* ---------- Generic file download ---------- */
    download: function (filename, content, mimeType) {
      var blob;
      try {
        if (content instanceof Blob) {
          blob = content;
        } else if (typeof content === 'string') {
          blob = new Blob([content], { type: mimeType || 'application/octet-stream' });
        } else if (content && content.buffer instanceof ArrayBuffer) {
          blob = new Blob([content], { type: mimeType || 'application/octet-stream' });
        } else {
          blob = new Blob([content], { type: mimeType || 'application/octet-stream' });
        }
      } catch (e) {
        global.ForgeCAD.ui.toast('Export failed: ' + e.message);
        return;
      }

      var url = null;
      try { url = URL.createObjectURL(blob); } catch (e) { url = null; }

      if (!url) {
        // Fallback for ancient browsers: data URI
        // Only works for text data; binary will likely fail.
        try {
          url = 'data:' + (mimeType || 'application/octet-stream') + ';base64,' + btoa(content);
        } catch (e2) {
          global.ForgeCAD.ui.toast('Download not supported in this browser');
          return;
        }
      }

      var a = document.createElement('a');
      a.href = url;
      a.download = filename;
      // For browsers that don't support download attr
      a.style.display = 'none';
      document.body.appendChild(a);
      try {
        a.click();
      } catch (e) {}
      setTimeout(function () {
        document.body.removeChild(a);
        try { URL.revokeObjectURL(url); } catch (e) {}
      }, 1000);
    },

    /* ---------- Export scene to STL (binary) ---------- */
    exportSTL: function (scene, filename) {
      if (!global.THREE || !global.THREE.STLExporter) {
        global.ForgeCAD.ui.toast('STL exporter not loaded');
        return;
      }
      try {
        var ex = new THREE.STLExporter();
        // Binary: returns DataView
        var data = ex.parse(scene, { binary: true });
        // Convert to Uint8Array for Blob
        var bytes;
        if (data instanceof DataView) {
          bytes = new Uint8Array(data.buffer);
        } else if (data.buffer instanceof ArrayBuffer) {
          bytes = new Uint8Array(data.buffer);
        } else if (data instanceof ArrayBuffer) {
          bytes = new Uint8Array(data);
        } else {
          bytes = data;
        }
        this.download(filename || 'model.stl', bytes, 'application/octet-stream');
        global.ForgeCAD.ui.toast('Exported STL');
      } catch (e) {
        global.ForgeCAD.ui.toast('STL export error: ' + e.message);
      }
    },

    /* ---------- Export scene to OBJ (ASCII) ---------- */
    exportOBJ: function (scene, filename) {
      if (!global.THREE || !global.THREE.OBJExporter) {
        global.ForgeCAD.ui.toast('OBJ exporter not loaded');
        return;
      }
      try {
        var ex = new THREE.OBJExporter();
        var text = ex.parse(scene);
        this.download(filename || 'model.obj', text, 'text/plain');
        global.ForgeCAD.ui.toast('Exported OBJ');
      } catch (e) {
        global.ForgeCAD.ui.toast('OBJ export error: ' + e.message);
      }
    },

    /* ---------- Export scene to GLTF ---------- */
    exportGLTF: function (scene, filename) {
      if (!global.THREE || !global.THREE.GLTFExporter) {
        global.ForgeCAD.ui.toast('GLTF exporter not loaded');
        return;
      }
      try {
        var ex = new THREE.GLTFExporter();
        var self = this;
        ex.parse(scene, function (result) {
          // result is an object for GLTF (.gltf) or ArrayBuffer for GLB
          if (result instanceof ArrayBuffer) {
            var bytes = new Uint8Array(result);
            self.download(filename || 'model.glb', bytes, 'model/gltf-binary');
          } else {
            var text = JSON.stringify(result, null, 2);
            self.download(filename || 'model.gltf', text, 'model/gltf+json');
          }
          global.ForgeCAD.ui.toast('Exported GLTF');
        }, function (err) {
          global.ForgeCAD.ui.toast('GLTF export error: ' + (err && err.message ? err.message : 'unknown'));
        }, { binary: false });
      } catch (e) {
        global.ForgeCAD.ui.toast('GLTF export error: ' + e.message);
      }
    },

    /* ---------- Export viewport to PNG ---------- */
    exportPNG: function (canvas, filename) {
      if (!canvas) {
        global.ForgeCAD.ui.toast('No canvas to snapshot');
        return;
      }
      try {
        // Force a render first if possible
        if (global.ForgeCAD && global.ForgeCAD.mode3D && global.ForgeCAD.mode3D.render) {
          global.ForgeCAD.mode3D.render();
        }
        // For SVG (circuits mode), we'd need different handling
        var dataURL;
        try {
          dataURL = canvas.toDataURL('image/png');
        } catch (e) {
          global.ForgeCAD.ui.toast('PNG export blocked (cross-origin or old browser)');
          return;
        }
        // Convert dataURL to blob
        var byteString = atob(dataURL.split(',')[1]);
        var bytes = new Uint8Array(byteString.length);
        for (var i = 0; i < byteString.length; i++) bytes[i] = byteString.charCodeAt(i);
        this.download(filename || 'snapshot.png', bytes, 'image/png');
        global.ForgeCAD.ui.toast('Exported PNG');
      } catch (e) {
        global.ForgeCAD.ui.toast('PNG export error: ' + e.message);
      }
    },

    /* ---------- Export project as JSON ---------- */
    exportProject: function (projectData, filename) {
      try {
        var text = JSON.stringify(projectData, null, 2);
        this.download(filename || 'project.json', text, 'application/json');
        global.ForgeCAD.ui.toast('Project saved');
      } catch (e) {
        global.ForgeCAD.ui.toast('Project save error: ' + e.message);
      }
    },

    /* ---------- Import project from JSON file ---------- */
    importProject: function (file, callback) {
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function (e) {
        try {
          var data = JSON.parse(e.target.result);
          if (callback) callback(null, data);
        } catch (err) {
          if (callback) callback(err);
        }
      };
      reader.onerror = function () {
        if (callback) callback(new Error('File read error'));
      };
      reader.readAsText(file);
    },

    /* ---------- Import STL/OBJ mesh into scene ---------- */
    importMesh: function (file, callback) {
      if (!file) return;
      var ext = (file.name.split('.').pop() || '').toLowerCase();
      var reader = new FileReader();
      reader.onload = function (e) {
        try {
          var geometry = null;
          if (ext === 'stl') {
            // Parse STL — Three.js doesn't ship a standalone parser in r128,
            // but we can use STLLoader if available. For simplicity, parse manually.
            geometry = exporters._parseSTL(e.target.result);
          } else if (ext === 'obj') {
            geometry = exporters._parseOBJ(e.target.result);
          }
          if (callback) callback(null, geometry);
        } catch (err) {
          if (callback) callback(err);
        }
      };
      reader.onerror = function () { if (callback) callback(new Error('File read error')); };
      if (ext === 'stl') reader.readAsArrayBuffer(file);
      else reader.readAsText(file);
    },

    /* ---------- Minimal STL parser (binary or ASCII) ---------- */
    _parseSTL: function (buffer) {
      if (!global.THREE) return null;
      var geometry = new THREE.BufferGeometry();
      var isBinary = function (buf) {
        var expectedSize = 84 + (50 * 0xffffffff);
        if (buf.byteLength < 84) return false;
        var dv = new DataView(buf);
        var numFaces = dv.getUint32(80, true);
        var expected = 84 + numFaces * 50;
        return buf.byteLength === expected;
      };
      var ab = (buffer instanceof ArrayBuffer) ? buffer : buffer.buffer;
      if (isBinary(ab)) {
        var dv = new DataView(ab);
        var numFaces = dv.getUint32(80, true);
        var positions = new Float32Array(numFaces * 9);
        var normals = new Float32Array(numFaces * 9);
        var offset = 84;
        for (var i = 0; i < numFaces; i++) {
          var nx = dv.getFloat32(offset, true);
          var ny = dv.getFloat32(offset + 4, true);
          var nz = dv.getFloat32(offset + 8, true);
          offset += 12;
          for (var j = 0; j < 3; j++) {
            var vx = dv.getFloat32(offset, true);
            var vy = dv.getFloat32(offset + 4, true);
            var vz = dv.getFloat32(offset + 8, true);
            offset += 12;
            positions[i * 9 + j * 3] = vx;
            positions[i * 9 + j * 3 + 1] = vy;
            positions[i * 9 + j * 3 + 2] = vz;
            normals[i * 9 + j * 3] = nx;
            normals[i * 9 + j * 3 + 1] = ny;
            normals[i * 9 + j * 3 + 2] = nz;
          }
          offset += 2; // attribute byte count
        }
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
      } else {
        // ASCII STL — naive parse
        var text = new TextDecoder ? new TextDecoder().decode(ab) : String.fromCharCode.apply(null, new Uint8Array(ab));
        var verts = [];
        var lines = text.split('\n');
        for (var k = 0; k < lines.length; k++) {
          var m = lines[k].match(/vertex\s+(-?[\d.eE+]+)\s+(-?[\d.eE+]+)\s+(-?[\d.eE+]+)/);
          if (m) {
            verts.push(parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]));
          }
        }
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
        geometry.computeVertexNormals();
      }
      return geometry;
    },

    /* ---------- Minimal OBJ parser ---------- */
    _parseOBJ: function (text) {
      if (!global.THREE) return null;
      var verts = [];
      var faces = [];
      var lines = text.split('\n');
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (line.indexOf('v ') === 0) {
          var p = line.substring(2).split(/\s+/);
          verts.push([parseFloat(p[0]), parseFloat(p[1]), parseFloat(p[2])]);
        } else if (line.indexOf('f ') === 0) {
          var f = line.substring(2).split(/\s+/);
          var face = [];
          for (var j = 0; j < f.length; j++) {
            var idx = parseInt(f[j].split('/')[0], 10);
            if (idx < 0) idx = verts.length + idx + 1;
            face.push(idx - 1);
          }
          faces.push(face);
        }
      }
      var positions = [];
      for (var fi = 0; fi < faces.length; fi++) {
        var faceVerts = faces[fi];
        // Triangulate fan
        for (var t = 1; t < faceVerts.length - 1; t++) {
          var a = verts[faceVerts[0]];
          var b = verts[faceVerts[t]];
          var c = verts[faceVerts[t + 1]];
          positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
        }
      }
      var geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.computeVertexNormals();
      return geometry;
    }
  };

  global.ForgeCAD = global.ForgeCAD || {};
  global.ForgeCAD.exporters = exporters;

})(typeof window !== 'undefined' ? window : this);
