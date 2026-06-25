/* ============================================================
   ForgeCAD — three-csg-bridge.js
   Bridge between Three.js BufferGeometry and Evan Wallace's CSG.
   Converts Three.js meshes to CSG solids, performs boolean
   operations, and converts back to BufferGeometry for export.
   ============================================================ */
(function (global) {
  'use strict';

  var CSGBridge = {

    /* Convert a Three.js BufferGeometry (or Mesh) to a CSG solid.
       Applies world matrix so the result is in world space. */
    fromGeometry: function (geometry, matrix) {
      if (!global.CSG) {
        console.error('CSG library not loaded');
        return null;
      }
      // If given a Mesh, extract geometry + matrix
      if (geometry.isMesh) {
        matrix = geometry.matrixWorld;
        geometry = geometry.geometry;
      }
      // Ensure we have indexed or non-indexed position data
      var pos = geometry.attributes.position;
      var norm = geometry.attributes.normal;
      var index = geometry.index;
      var polygons = [];
      var v0 = new THREE.Vector3();
      var v1 = new THREE.Vector3();
      var v2 = new THREE.Vector3();
      var n0 = new THREE.Vector3();
      var n1 = new THREE.Vector3();
      var n2 = new THREE.Vector3();
      var m = matrix || new THREE.Matrix4();

      var getVertex = function (i) {
        v0.fromBufferAttribute(pos, i);
        v0.applyMatrix4(m);
        if (norm) {
          n0.fromBufferAttribute(norm, i);
          // Transform normal by normal matrix (inverse transpose)
          // For uniform scale, this is the same matrix
          n0.transformDirection(m);
        }
        return new CSG.Vertex(
          new CSG.Vector([v0.x, v0.y, v0.z]),
          new CSG.Vector([n0.x, n0.y, n0.z])
        );
      };

      if (index) {
        // Indexed geometry
        for (var i = 0; i < index.count; i += 3) {
          var a = index.getX(i);
          var b = index.getX(i + 1);
          var c = index.getX(i + 2);
          var verts = [getVertex(a), getVertex(b), getVertex(c)];
          try {
            polygons.push(new CSG.Polygon(verts));
          } catch (e) {
            // Degenerate triangle — skip
          }
        }
      } else {
        // Non-indexed
        for (var j = 0; j < pos.count; j += 3) {
          var verts2 = [getVertex(j), getVertex(j + 1), getVertex(j + 2)];
          try {
            polygons.push(new CSG.Polygon(verts2));
          } catch (e) {
            // Degenerate — skip
          }
        }
      }
      return CSG.fromPolygons(polygons);
    },

    /* Convert a CSG solid back to Three.js BufferGeometry */
    toGeometry: function (csg) {
      var polys = csg.toPolygons();
      var positions = [];
      var normals = [];
      for (var i = 0; i < polys.length; i++) {
        var poly = polys[i];
        var verts = poly.vertices;
        // Triangulate fan (polygons from CSG can have >3 vertices)
        for (var j = 2; j < verts.length; j++) {
          // Vertex 0
          positions.push(verts[0].pos.x, verts[0].pos.y, verts[0].pos.z);
          normals.push(verts[0].normal.x, verts[0].normal.y, verts[0].normal.z);
          // Vertex j-1
          positions.push(verts[j - 1].pos.x, verts[j - 1].pos.y, verts[j - 1].pos.z);
          normals.push(verts[j - 1].normal.x, verts[j - 1].normal.y, verts[j - 1].normal.z);
          // Vertex j
          positions.push(verts[j].pos.x, verts[j].pos.y, verts[j].pos.z);
          normals.push(verts[j].normal.x, verts[j].normal.y, verts[j].normal.z);
        }
      }
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
      return geo;
    },

    /* Subtract all hole meshes from solid meshes.
       Returns a single merged BufferGeometry with holes cut out. */
    subtractHoles: function (solids, holes) {
      if (!global.CSG || holes.length === 0) {
        // No CSG or no holes — just merge solids
        return this._mergeGeometries(solids);
      }

      // Convert each solid to CSG and union them together
      var resultCSG = null;
      for (var i = 0; i < solids.length; i++) {
        var solidCSG = this.fromGeometry(solids[i].geometry, solids[i].matrixWorld);
        if (solidCSG) {
          if (!resultCSG) resultCSG = solidCSG;
          else resultCSG = resultCSG.union(solidCSG);
        }
      }
      if (!resultCSG) return null;

      // Subtract each hole
      for (var j = 0; j < holes.length; j++) {
        var holeCSG = this.fromGeometry(holes[j].geometry, holes[j].matrixWorld);
        if (holeCSG) {
          try {
            resultCSG = resultCSG.subtract(holeCSG);
          } catch (e) {
            console.warn('CSG subtract failed for hole ' + j + ':', e.message);
          }
        }
      }

      // Convert back to geometry
      return this.toGeometry(resultCSG);
    },

    /* Simple merge of multiple geometries (no boolean, just combine) */
    _mergeGeometries: function (meshes) {
      var positions = [];
      var normals = [];
      var m = new THREE.Matrix4();
      var v = new THREE.Vector3();
      var n = new THREE.Vector3();
      for (var i = 0; i < meshes.length; i++) {
        var mesh = meshes[i];
        var geo = mesh.geometry;
        var pos = geo.attributes.position;
        var norm = geo.attributes.normal;
        var index = geo.index;
        m.copy(mesh.matrixWorld);
        var getV = function (idx) {
          v.fromBufferAttribute(pos, idx);
          v.applyMatrix4(m);
          positions.push(v.x, v.y, v.z);
          if (norm) {
            n.fromBufferAttribute(norm, idx);
            n.transformDirection(m);
            normals.push(n.x, n.y, n.z);
          } else {
            normals.push(0, 1, 0);
          }
        };
        if (index) {
          for (var j = 0; j < index.count; j++) getV(index.getX(j));
        } else {
          for (var k = 0; k < pos.count; k++) getV(k);
        }
      }
      var result = new THREE.BufferGeometry();
      result.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      result.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
      return result;
    }
  };

  global.ForgeCAD = global.ForgeCAD || {};
  global.ForgeCAD.CSGBridge = CSGBridge;

})(typeof window !== 'undefined' ? window : this);
