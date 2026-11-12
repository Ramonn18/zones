// A 3D twin of a room (three.js, MIT, in vendor/three): its walls and landmarks, the table and
// chairs, the markers, and the pirate and ships standing on the table. It renders two pictures:
// what the iPhone on the ceiling sees, which the tracker reads like a real camera, and a view of
// the whole room, to see the setup from outside.
import * as THREE from "three";
import { OBJECTS, RIM, rimPosition } from "./environment.js";
import { LENSES } from "./room1.js";
import { drawMarker } from "./markers.js";

const W = 1920, H = 1080; // the iPhone's picture through Continuity Camera

// Room space (cm: x east, y south, z up) to three.js (x right, y up, z toward the viewer).
const v3 = (x, y, z) => new THREE.Vector3(x, z, y);

function markerTexture(id) {
  const c = Object.assign(document.createElement("canvas"), { width: 256, height: 256 });
  drawMarker(c.getContext("2d"), id, 128, 128, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function createRoom3D(model, env) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(W, H, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#1d1d1d");

  // Lights: the ceiling's downlights, which also shine on the glossy table.
  scene.add(new THREE.HemisphereLight("#ffffff", "#8a6a4a", 1.4));
  for (const [x, y] of [[-70, -60], [70, -60], [-70, 70], [70, 70]]) {
    const light = new THREE.PointLight("#fff4e6", 18000, 0, 2);
    light.position.copy(v3(x, y, model.size.z - 5));
    scene.add(light);
  }

  const { x: sx, y: sy, z: sz } = model.size, ox = model.center.x, oy = model.center.y;
  const box = (w, d, h, color, x, y, z, rough = 0.9) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: rough }));
    m.position.copy(v3(x, y, z));
    scene.add(m);
    return m;
  };
  // Floor, ceiling and walls.
  box(sx, sy, 1, "#b88a5a", ox, oy, -0.5);
  box(sx, sy, 1, "#efece6", ox, oy, sz + 0.5);
  box(sx, 2, sz, model.walls.north.color, ox, oy - sy / 2 - 1, sz / 2);
  box(sx, 2, sz, model.walls.south.color, ox, oy + sy / 2 + 1, sz / 2);
  box(2, sy, sz, model.walls.east.color, ox + sx / 2 + 1, oy, sz / 2);
  box(2, sy, sz, model.walls.west.color, ox - sx / 2 - 1, oy, sz / 2);
  for (const f of model.features) box(f.size.x, f.size.y, f.size.z, f.color, f.at.x, f.at.y, f.at.z, 0.6);

  // The table: a glossy black top on a leg, and chairs around it.
  const T = model.table, R = T.diameter / 2;
  const top = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 3, 96), new THREE.MeshStandardMaterial({ color: T.color, roughness: 0.25, metalness: 0.1 }));
  top.position.copy(v3(0, 0, T.height - 1.5));
  scene.add(top);
  box(6, 6, T.height - 3, "#c69c6d", 0, 0, (T.height - 3) / 2);
  for (const c of model.chairs) {
    const a = c.bearing * Math.PI / 180, d = R + 25;
    box(42, 42, 4, c.color, Math.sin(a) * d, -Math.cos(a) * d, 45);
  }

  // Markers flat on the table, slightly above it so they don't flicker into it.
  const flat = (id, size, x, y, z, heading) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ map: markerTexture(id), roughness: 1 }));
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = -heading * Math.PI / 180;
    m.position.copy(v3(x, y, z));
    scene.add(m);
    return m;
  };
  for (const m of RIM) { const p = rimPosition(env, m); flat(m.marker, env.markers.rim, p.x, p.y, T.height + 0.05, m.bearing); }

  // The pirate (a figure) and the ships (hulls with masts), each with its marker on top.
  const pieces = {};
  for (const o of OBJECTS) {
    const group = new THREE.Group(), color = new THREE.Color(o.color), h = o.id === "pirate" ? 8 : 5;
    if (o.id === "pirate") {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.6, h, 24), new THREE.MeshStandardMaterial({ color, roughness: 0.7 }));
      body.position.y = h / 2;
      group.add(body);
    } else {
      const hull = new THREE.Mesh(new THREE.BoxGeometry(5, h, 12), new THREE.MeshStandardMaterial({ color, roughness: 0.7 }));
      hull.position.y = h / 2;
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 9, 8), new THREE.MeshStandardMaterial({ color: "#5b3a1e" }));
      mast.position.set(0, h + 4.5, 4); // toward the stern, beside the marker, so it hides less of it from above
      group.add(hull, mast);
    }
    const marker = new THREE.Mesh(new THREE.PlaneGeometry(env.markers.objects, env.markers.objects), new THREE.MeshStandardMaterial({ map: markerTexture(o.marker), roughness: 1 }));
    marker.rotation.x = -Math.PI / 2;
    marker.position.y = h + 0.05;
    group.add(marker);
    scene.add(group);
    pieces[o.id] = { group, height: h };
  }

  // The iPhone's view, straight down from the ceiling, its top toward north.
  const lens = LENSES[model.camera.lens];
  const phone = new THREE.PerspectiveCamera(lens.vertical, W / H, 1, 2000);
  phone.position.copy(v3(model.camera.at.x, model.camera.at.y, model.camera.at.z));
  phone.up.copy(v3(0, -1, 0));
  phone.lookAt(v3(model.camera.at.x, model.camera.at.y, 0));
  // The room from a high corner, to see the whole setup.
  const outside = new THREE.PerspectiveCamera(70, W / H, 1, 3000);
  outside.position.copy(v3(ox + sx * 0.42, oy + sy * 0.45, sz * 0.92));
  outside.lookAt(v3(0, 0, T.height));

  // Places the pieces where the simulation has them (table space = room space here).
  function pose(objects) {
    for (const o of objects) {
      const p = pieces[o.id];
      p.group.position.copy(v3(o.x, o.y, T.height));
      p.group.rotation.y = -o.heading * Math.PI / 180; // its marker's top edge, and its bow, face its heading
    }
  }

  return {
    // What the iPhone sees, as a canvas the tracker can read.
    cameraFrame(objects) { pose(objects); renderer.render(scene, phone); return renderer.domElement; },
    // The whole room, from a high corner.
    overview(objects) { pose(objects); renderer.render(scene, outside); return renderer.domElement; },
  };
}
