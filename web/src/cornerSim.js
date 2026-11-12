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
    const hit = raycaster.intersectObjects(scene.children, false).find(h => h.object !== body);
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
    exactPins, touch, fitError,
    // Where a corner point should land in the picture, for checking the fit.
    check: (corner, p, aspect) => ({ exact: toPicture(cornerFrame(model, corner).toRoom(p), aspect), pinned: cornerToProj(corner, p) }),
  };
}
