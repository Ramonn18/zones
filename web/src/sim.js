// The simulated table: the pirate and the two ships, which can be dragged and turned on screen,
// to work without the real setup. It can also play the camera: it draws the table with its
// markers as the camera would see it, at a slight angle, so the whole tracking path can be
// tested without hardware (open the page with ?simcam).
import { OBJECTS, RIM, rimPosition } from "./environment.js";
import { drawMarker } from "./markers.js";
import { createWarp } from "./warp.js";

export function createSim(env) {
  const R = env.table.diameter / 2;
  const objects = OBJECTS.map((o, i) => ({ ...o, ...[{ x: 0, y: R * 0.15, heading: 20 }, { x: -R * 0.5, y: -R * 0.3, heading: 110 }, { x: R * 0.45, y: R * 0.4, heading: 300 }][i] }));

  // The camera picture: the table drawn flat, then tilted as an overhead camera slightly off-center would see it.
  const W = 1920, H = 1080, flat = document.createElement("canvas"), warp = createWarp();
  const camera = Object.assign(document.createElement("canvas"), { width: W, height: H });
  // Where the table's bounding square lands in the picture.
  const VIEW = [{ x: 560, y: 70 }, { x: 1400, y: 110 }, { x: 1460, y: 1010 }, { x: 480, y: 990 }];

  function cameraFrame(env) {
    const px = 8, size = env.table.diameter * px; // pixels per centimeter on the flat drawing
    if (flat.width !== size) { flat.width = flat.height = size; }
    const c = flat.getContext("2d"), at = p => ({ x: size / 2 + p.x * px, y: size / 2 + p.y * px });
    c.clearRect(0, 0, size, size);
    c.fillStyle = "#8b5a3c"; // a wooden table
    c.beginPath(); c.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2); c.fill();
    for (const m of RIM) { const p = at(rimPosition(env, m)); drawMarker(c, m.marker, p.x, p.y, env.markers.rim * px, m.bearing); }
    for (const o of objects) { const p = at(o); drawMarker(c, o.marker, p.x, p.y, env.markers.objects * px, o.heading); }
    const g = camera.getContext("2d");
    g.fillStyle = "#2b2b2b"; g.fillRect(0, 0, W, H); // the floor
    g.drawImage(warp.render(flat, VIEW, W, H), 0, 0);
    return camera;
  }

  return { objects, cameraFrame };
}
