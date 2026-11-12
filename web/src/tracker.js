// Turns markers seen by the camera into objects on the table. The four rim markers fix where
// the table is in the picture; each object's marker then gives its position on the table (in
// centimeters) and its heading (the way its marker's top edge faces, as a compass bearing).
import { homography, apply, invert } from "./homography.js";
import { OBJECTS, RIM, rimPosition } from "./environment.js";
import { bearingOf } from "./table.js";

const KEEP_MS = 600;   // keep using a marker this long after it was last seen: hands cover them
const SMOOTH = 0.4;    // how quickly an object's pose follows its readings: marker corners jitter

const center = pts => ({ x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length });

export function createTracker() {
  const rim = {};      // code -> { at (picture pixels), seen }
  const poses = {};    // object id -> smoothed { x, y, heading, seen }
  let toTable = null;  // picture pixels -> table centimeters

  // markers: [{ id, corners }] from the reader (markers.js). Returns the objects seen, and whether
  // the table has been found.
  function update(env, markers, now) {
    for (const c of markers) {
      if (RIM.some(m => m.marker === c.id)) rim[c.id] = { at: center(c.corners), seen: now };
    }
    const found = RIM.filter(m => rim[m.marker] && now - rim[m.marker].seen < KEEP_MS * 20); // the table doesn't move much
    if (found.length === 4) toTable = homography(found.map(m => rim[m.marker].at), found.map(m => rimPosition(env, m)));
    if (!toTable) return { found: found.length, objects: [] };

    for (const c of markers) {
      const obj = OBJECTS.find(o => o.marker === c.id);
      if (!obj) continue;
      const k = c.corners.map(p => apply(toTable, p));
      const at = center(k);
      const top = center([k[0], k[1]]), bottom = center([k[3], k[2]]); // the marker's top edge is the object's front
      const heading = bearingOf(bottom, top), last = poses[obj.id];
      if (!last || now - last.seen > KEEP_MS) poses[obj.id] = { x: at.x, y: at.y, heading, seen: now };
      else {
        last.x += (at.x - last.x) * SMOOTH;
        last.y += (at.y - last.y) * SMOOTH;
        let turn = ((heading - last.heading + 540) % 360) - 180; // the short way round
        last.heading = (last.heading + turn * SMOOTH + 360) % 360;
        last.seen = now;
      }
    }
    const objects = OBJECTS.filter(o => poses[o.id] && now - poses[o.id].seen < KEEP_MS)
      .map(o => ({ ...o, x: poses[o.id].x, y: poses[o.id].y, heading: poses[o.id].heading }));
    return { found: 4, objects };
  }

  // Where a table point is in the camera picture (for drawing over the camera view).
  const toPicture = p => toTable ? apply(invert(toTable), p) : null;

  // The part of the picture the table fills, so the reader can look at it more closely.
  function tableRegion(env) {
    if (!toTable) return null;
    const R = env.table.diameter / 2, pts = [];
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; pts.push(toPicture({ x: Math.sin(a) * R, y: -Math.cos(a) * R })); }
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  }
  return { update, toPicture, tableRegion, get ready() { return !!toTable; } };
}

