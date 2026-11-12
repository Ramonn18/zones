// The corner, simulated: Room 1 in 3D, with the projector on its box shining the real projector
// picture into the corner, the iPhone on top of it, and a player's view. For working on the
// experience without the projector: what lands on the walls, what the camera sees, and touching
// the walls (a click in the player's view stands in for a hand).
import * as THREE from "three";
import { buildRoom, v3 } from "./room3d.js";
import { LENSES, cornerFrame } from "./room1.js";
import { cornerToProj } from "./corner.js";

const W = 1280, H = 720;

export function createCornerSim(model) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(W, H, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#1d1d1d");
  buildRoom(scene, model);

  // The projector: a spotlight that casts the projector's picture (its canvas, padded to a square,
  // since a spotlight's picture is square), from the box in the corner.
  const P = model.projector, hfov = 2 * Math.atan(1 / (2 * P.throw));
  const square = Object.assign(document.createElement("canvas"), { width: 1024, height: 1024 });
  const texture = new THREE.CanvasTexture(square);
  texture.colorSpace = THREE.SRGBColorSpace;
  const light = new THREE.SpotLight("#ffffff", 9, 0, hfov / 2, 0, 0);
  light.map = texture;
  light.castShadow = true; // the picture only lands where the light reaches, so a person in the way would cast a shadow
  light.shadow.mapSize.set(1024, 1024);
  light.shadow.camera.near = 20;
  light.shadow.camera.far = 1200;
  light.position.copy(v3(P.at.x, P.at.y, P.at.z));
  light.target.position.copy(v3(P.aim.x, P.aim.y, P.aim.z));
  scene.add(light, light.target);
  // The projector's body and the box it sits on, so they show in the player's view.
  const body = new THREE.Mesh(new THREE.BoxGeometry(14, 10, 18), new THREE.MeshStandardMaterial({ color: "#111111", roughness: 0.5 }));
  body.position.copy(v3(P.at.x, P.at.y, P.at.z - 2));
  body.lookAt(v3(P.aim.x, P.aim.y, P.at.z - 2));
  const crate = new THREE.Mesh(new THREE.BoxGeometry(40, 40, 40), new THREE.MeshStandardMaterial({ color: "#c79a62", roughness: 0.8 }));
  crate.position.copy(v3(P.at.x - 4, P.at.y + 4, P.at.z - 26));
  const ottoman = new THREE.Mesh(new THREE.BoxGeometry(45, 78, 45), new THREE.MeshStandardMaterial({ color: "#a59e94", roughness: 1 }));
  ottoman.position.copy(v3(P.at.x - 4, P.at.y + 4, 39));
  scene.add(body, crate, ottoman);

  // The iPhone on top of the projector, looking where it projects.
  const phone = new THREE.PerspectiveCamera(LENSES.wide.vertical, W / H, 5, 2000);
  phone.position.copy(v3(P.at.x, P.at.y, P.at.z + model.phone.above));
  phone.lookAt(v3(P.aim.x, P.aim.y, P.aim.z));
  // A player standing in the room, looking at the corner.
  const eyes = new THREE.PerspectiveCamera(60, W / H, 5, 2000);
  eyes.position.copy(v3(model.player.at.x, model.player.at.y, model.player.at.z));
  eyes.lookAt(v3(P.aim.x, P.aim.y, P.aim.z - 10));

  // A person who can walk into the room: a simple figure (about 176 cm) that blocks the projector's
  // light like a body does. A copy of them in plain white, in a scene of their own, is what the
  // iPhone's person detection would find: their outline in its picture.
  const fold = cornerFrame(model, { left: { width: 0 } }).fold;
  const figure = (material) => {
    const g = new THREE.Group(), part = (geo, x, y, z, sx = 1, sz = 1) => {
      const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); m.scale.set(sx, 1, sz); m.castShadow = m.receiveShadow = true; g.add(m);
    };
    part(new THREE.CapsuleGeometry(7, 70, 4, 12), -9, 42, 0);           // legs
    part(new THREE.CapsuleGeometry(7, 70, 4, 12), 9, 42, 0);
    part(new THREE.CapsuleGeometry(17, 40, 4, 16), 0, 112, 0, 1, 0.6);  // body
    part(new THREE.CapsuleGeometry(5, 52, 4, 10), -24, 108, 0);         // arms
    part(new THREE.CapsuleGeometry(5, 52, 4, 10), 24, 108, 0);
    part(new THREE.SphereGeometry(11, 20, 16), 0, 160, 0);              // head
    g.visible = false;
    return g;
  };
  const person = figure(new THREE.MeshStandardMaterial({ color: "#3b4a6b", roughness: 0.8 }));
  const outline = figure(new THREE.MeshBasicMaterial({ color: "#ffffff" }));
  const maskScene = new THREE.Scene();
  maskScene.background = new THREE.Color("#000000");
  scene.add(person);
  maskScene.add(outline);
  // where: a spot on the floor (room space, cm), or null for no one. They face the corner.
  function setPerson(where) {
    for (const g of [person, outline]) {
      g.visible = !!where;
      if (!where) continue;
      g.position.copy(v3(where.x, where.y, 0));
      g.rotation.y = Math.atan2(fold.x - where.x, fold.y - where.y);
    }
  }
  const MW = 160, MH = 90, target = new THREE.WebGLRenderTarget(MW, MH), rgba = new Uint8Array(MW * MH * 4), mask = { w: MW, h: MH, data: new Uint8Array(MW * MH) };
  // The person's outline in the iPhone's picture, as Apple Vision would give it (0..255 over a small grid).
  function personMask() {
    if (!person.visible) { mask.data.fill(0); return mask; }
    renderer.setRenderTarget(target);
    renderer.render(maskScene, phone);
    renderer.readRenderTargetPixels(target, 0, 0, MW, MH, rgba);
    renderer.setRenderTarget(null);
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) mask.data[y * MW + x] = rgba[((MH - 1 - y) * MW + x) * 4]; // rows come bottom up
    return mask;
  }
  // Where a corner point (cm) appears in the iPhone's picture (0..1): for checking the camera's fit.
  function cameraPoint(corner, p) {
    const q = cornerFrame(model, corner).toRoom(p), s = v3(q.x, q.y, q.z).project(phone);
    return { x: (s.x + 1) / 2, y: (1 - s.y) / 2 };
  }

  // Puts the projector's picture (a canvas, any shape) into the spotlight's square, centered.
  function project(picture) {
    const g = square.getContext("2d"), s = square.width, h = s * picture.height / picture.width;
    g.fillStyle = "#000"; g.fillRect(0, 0, s, s);
    g.drawImage(picture, 0, (s - h) / 2, s, h);
    texture.needsUpdate = true;
  }

  // Where 3D room points land in the projector's picture (0..1): through the spotlight's own camera.
  function toPicture(room, aspect) {
    light.shadow.updateMatrices(light);
    const p = v3(room.x, room.y, room.z).project(light.shadow.camera);
    const sx = (p.x + 1) / 2, sy = (1 - p.y) / 2;           // in the square
    return { x: sx, y: (sy - 0.5) * aspect + 0.5 };         // in the picture, which fills its middle
  }

  // The six pins that fit the picture exactly onto the simulated corner. aspect: the picture's width / height.
  function exactPins(corner, aspect) {
    const f = cornerFrame(model, corner), L = corner.left.width, R = corner.right.width, Hh = corner.height;
    return [{ x: 0, y: 0 }, { x: L, y: 0 }, { x: L + R, y: 0 }, { x: L + R, y: Hh }, { x: L, y: Hh }, { x: 0, y: Hh }]
      .map(p => toPicture(f.toRoom(p), aspect));
  }

  // A point in the player's view (0..1) to where it touches the corner (cm), or null if not on the corner.
  const raycaster = new THREE.Raycaster();
  function touch(corner, viewPoint) {
    raycaster.setFromCamera(new THREE.Vector2(viewPoint.x * 2 - 1, 1 - viewPoint.y * 2), eyes);
    const hit = raycaster.intersectObjects(scene.children, false).find(h => h.object !== body && h.object !== person);
    if (!hit) return null;
    const q = { x: hit.point.x, y: hit.point.z, z: hit.point.y }; // back to room space
    const c = cornerFrame(model, corner).fromRoom(q);
    return c && c.x >= 0 && c.x <= corner.left.width + corner.right.width && c.y >= 0 && c.y <= corner.height ? c : null;
  }

  // How far, in projector-picture terms, the current pins are from the exact fit (the worst corner).
  const fitError = (corner, aspect) => Math.max(...exactPins(corner, aspect).map((q, i) => Math.hypot(q.x - corner.pins[i].x, q.y - corner.pins[i].y)));

  return {
    project,
    playerView() { renderer.render(scene, eyes); return renderer.domElement; },
    cameraView() { renderer.render(scene, phone); return renderer.domElement; },
    exactPins, touch, fitError, setPerson, personMask, cameraPoint,
    // Where a corner point should land in the picture, for checking the fit.
    check: (corner, p, aspect) => ({ exact: toPicture(cornerFrame(model, corner).toRoom(p), aspect), pinned: cornerToProj(corner, p) }),
  };
}
