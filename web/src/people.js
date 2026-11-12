// People in front of the corner. The iPhone sits on the projector, so it sees the corner from
// almost where the light comes from: where a person covers the wall in the camera's picture is
// where the projector's light would land on them. So, with the camera fitted to the walls:
//   - that area is kept dark (no mural on the person), and
//   - the mural's drawings move out of it, gathering around the person's outline, and drift back
//     home when they leave.
// The person's outline (a mask over the camera's picture) comes from Apple Vision in Zones.app,
// or from the simulated room.
import { apply, invert, solve } from "./homography.js";

const CELL = 2;          // cm: the size of a square in the grid that says where people are
const DARK = [5, 10];    // cm outside the outline: fully dark up to the first, fading out by the second
const CLEAR = DARK[1] + 1; // cm: how far the drawings keep from a person's outline (clear of the dark edge)
const FADE_S = 0.4;      // seconds a spot stays "occupied" after a person leaves it (covers the camera's lag)
const GLIDE_S = 0.25;    // how quickly drawings glide to where they're going (seconds, roughly)

// ---- Fitting the camera to the walls ---------------------------------------------------------
// The dots the projector shows, one at a time, for the camera to find: six on each wall.
export function calibrationDots(c) {
  const dots = [];
  for (const [wall, x0, w] of [["left", 0, c.left.width], ["right", c.left.width, c.right.width]]) {
    for (const v of [0.22, 0.78]) for (const u of [0.15, 0.5, 0.85]) dots.push({ wall, x: x0 + u * w, y: v * c.height });
  }
  return dots;
}

// A picture's brightness, pixel by pixel (ImageData in, Float32Array out).
export function brightness(img) {
  const out = new Float32Array(img.width * img.height), d = img.data;
  for (let i = 0; i < out.length; i++) out[i] = 0.3 * d[i * 4] + 0.59 * d[i * 4 + 1] + 0.11 * d[i * 4 + 2];
  return { w: img.width, h: img.height, data: out };
}

// Where a dot appeared: compares the camera's picture with the dot on (lit) and off (dark).
// Returns its center in the picture (0..1), or null if nothing clearly lit up.
export function findDot(dark, lit) {
  const { w, h } = lit;
  let best = 0, at = -1;
  for (let i = 0; i < w * h; i++) { const d = lit.data[i] - dark.data[i]; if (d > best) { best = d; at = i; } }
  if (best < 25) return null;
  const bx = at % w, by = Math.floor(at / w), R = Math.round(w * 0.05);
  let sx = 0, sy = 0, s = 0;
  for (let y = Math.max(0, by - R); y <= Math.min(h - 1, by + R); y++) {
    for (let x = Math.max(0, bx - R); x <= Math.min(w - 1, bx + R); x++) {
      const v = lit.data[y * w + x] - dark.data[y * w + x] - best * 0.4;
      if (v > 0) { sx += v * x; sy += v * y; s += v; }
    }
  }
  return { x: (sx / s + 0.5) / w, y: (sy / s + 0.5) / h, strength: Math.round(best) };
}

// The best flat mapping taking each src point to its dst point (4 or more pairs, least squares).
export function fitHomography(src, dst) {
  const S = 100; // corner space is in cm: scaled down while solving, to keep the numbers even
  const A = [], b = [];
  src.forEach(({ x, y }, i) => {
    const u = dst[i].x / S, v = dst[i].y / S;
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  });
  const At = A[0].map((_, c) => A.map(r => r[c]));
  const h = solve(At.map(r => At.map(c => r.reduce((s, v, k) => s + v * c[k], 0))), At.map(r => r.reduce((s, v, k) => s + v * b[k], 0)));
  return [h[0] * S, h[1] * S, h[2] * S, h[3] * S, h[4] * S, h[5] * S, h[6], h[7], 1];
}

// The camera's fit from the dots it found: for each wall, camera picture (0..1) to corner space (cm).
export function fitCamera(found, c) {
  const fit = { size: { left: c.left.width, right: c.right.width, height: c.height } };
  let sum = 0, n = 0;
  for (const wall of ["left", "right"]) {
    const pts = found.filter(f => f.dot.wall === wall);
    if (pts.length < 4) return { failed: `the camera saw only ${pts.length} of the 6 dots on the ${c[wall].name.toLowerCase()}` };
    fit[wall] = fitHomography(pts.map(p => p.cam), pts.map(p => p.dot));
    for (const p of pts) { const q = apply(fit[wall], p.cam); sum += (q.x - p.dot.x) ** 2 + (q.y - p.dot.y) ** 2; n++; }
  }
  fit.error = Math.sqrt(sum / n);
  return fit;
}

// Corner space (cm) to the camera's picture (0..1), through a fit.
export function cornerToCamera(fit, c, p) {
  return apply(invert(p.x <= c.left.width ? fit.left : fit.right), p);
}

// ---- Where people are, on the corner ---------------------------------------------------------
// Each update takes the person mask (over the camera picture: { w, h, data: 0..255 }) and gives:
//   cols, rows, cell: the grid over corner space;
//   sdf: each square's distance (cm) to the nearest person's outline, negative inside a person;
//   shield: how dark to keep each square (0..255), for the projector;
//   area: how much of the corner people cover (0..1).
export function createPresence() {
  let key = "", lookup = null, cols = 0, rows = 0, presence = null;

  function prepare(mask, fit, c) {
    const k = JSON.stringify([mask.w, mask.h, fit.left, fit.right, c.left.width, c.right.width, c.height]);
    if (k === key) return;
    key = k;
    cols = Math.ceil((c.left.width + c.right.width) / CELL); rows = Math.ceil(c.height / CELL);
    lookup = new Int32Array(cols * rows).fill(-1);
    presence = new Float32Array(cols * rows);
    const inv = { left: invert(fit.left), right: invert(fit.right) };
    for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) {
      const x = (q + 0.5) * CELL, y = (r + 0.5) * CELL, cam = apply(x <= c.left.width ? inv.left : inv.right, { x, y });
      if (cam.x >= 0 && cam.x < 1 && cam.y >= 0 && cam.y < 1) lookup[r * cols + q] = Math.floor(cam.y * mask.h) * mask.w + Math.floor(cam.x * mask.w);
    }
  }

  function update(mask, fit, c, dt) {
    prepare(mask, fit, c);
    const fall = dt / FADE_S, inside = new Uint8Array(cols * rows);
    let covered = 0;
    for (let i = 0; i < presence.length; i++) {
      const seen = lookup[i] >= 0 ? mask.data[lookup[i]] / 255 : 0;
      presence[i] = Math.max(seen, presence[i] - fall); // appears at once, lingers a moment
      if (presence[i] > 0.5) { inside[i] = 1; covered++; }
    }
    const sdf = signedDistance(inside, cols, rows), shield = new Uint8Array(cols * rows);
    for (let i = 0; i < sdf.length; i++) shield[i] = 255 * Math.min(1, Math.max(0, (DARK[1] - sdf[i]) / (DARK[1] - DARK[0])));
    return { cols, rows, cell: CELL, sdf, shield, area: covered / (cols * rows) };
  }
  return { update };
}

// Distance (cm) from each square to the nearest outline: positive outside people, negative inside.
function signedDistance(inside, cols, rows) {
  const out = chamfer(inside, cols, rows, 1), into = chamfer(inside, cols, rows, 0), sdf = new Float32Array(cols * rows);
  for (let i = 0; i < sdf.length; i++) sdf[i] = (inside[i] ? -into[i] + 0.5 : out[i] - 0.5) * CELL;
  return sdf;
}
// Distance (in squares) to the nearest square whose `inside` equals `target` (two-pass chamfer).
function chamfer(inside, cols, rows, target) {
  const BIG = 1e6, d = new Float32Array(cols * rows), D = Math.SQRT2;
  for (let i = 0; i < d.length; i++) d[i] = inside[i] === target ? 0 : BIG;
  const relax = (i, j, cost) => { if (d[j] + cost < d[i]) d[i] = d[j] + cost; };
  for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) {
    const i = r * cols + q;
    if (q > 0) relax(i, i - 1, 1);
    if (r > 0) { relax(i, i - cols, 1); if (q > 0) relax(i, i - cols - 1, D); if (q < cols - 1) relax(i, i - cols + 1, D); }
  }
  for (let r = rows - 1; r >= 0; r--) for (let q = cols - 1; q >= 0; q--) {
    const i = r * cols + q;
    if (q < cols - 1) relax(i, i + 1, 1);
    if (r < rows - 1) { relax(i, i + cols, 1); if (q < cols - 1) relax(i, i + cols + 1, D); if (q > 0) relax(i, i + cols - 1, D); }
  }
  return d;
}

// ---- Making way ------------------------------------------------------------------------------
// objects: [{ key, x, y, r }] (home and size, cm). moves: { key: [dx, dy] }, carried from one
// frame to the next and returned. field: the latest presence, or null when no one is tracked
// (then everything drifts home).
export function makeWay(objects, field, c, moves, dt) {
  const W = c.left.width + c.right.width, H = c.height;
  const sdfAt = (x, y) => {
    const gx = Math.min(field.cols - 1.001, Math.max(0, x / field.cell - 0.5)), gy = Math.min(field.rows - 1.001, Math.max(0, y / field.cell - 0.5));
    const q = Math.floor(gx), r = Math.floor(gy), fx = gx - q, fy = gy - r, s = field.sdf, i = r * field.cols + q;
    return (s[i] * (1 - fx) + s[i + 1] * fx) * (1 - fy) + (s[i + field.cols] * (1 - fx) + s[i + field.cols + 1] * fx) * fy;
  };
  const clamp = (p, o) => ({ x: Math.min(W - o.r * 0.5, Math.max(o.r * 0.5, p.x)), y: Math.min(H - o.r * 0.5, Math.max(o.r * 0.5, p.y)) });
  // Out of a person: step along the distance's slope until far enough from their outline.
  const pushOut = (p, o) => {
    const need = o.r + CLEAR;
    for (let k = 0; k < 40; k++) {
      const d = sdfAt(p.x, p.y);
      if (d >= need) break;
      const gx = sdfAt(p.x + 1, p.y) - sdfAt(p.x - 1, p.y), gy = sdfAt(p.x, p.y + 1) - sdfAt(p.x, p.y - 1), n = Math.hypot(gx, gy);
      if (n < 1e-6) break;
      p = clamp({ x: p.x + gx / n * (need - d + 0.5), y: p.y + gy / n * (need - d + 0.5) }, o);
    }
    return p;
  };
  const targets = objects.map(o => (field ? pushOut({ x: o.x, y: o.y }, o) : { x: o.x, y: o.y }));
  // Drawings that had to move shouldn't pile up on each other: nudge them apart, then out of people again.
  if (field) for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < objects.length; i++) for (let j = i + 1; j < objects.length; j++) {
      const a = targets[i], b = targets[j], mi = a.x !== objects[i].x || a.y !== objects[i].y, mj = b.x !== objects[j].x || b.y !== objects[j].y;
      if (!mi && !mj) continue;
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.01, want = (objects[i].r + objects[j].r) * 0.8;
      if (d >= want) continue;
      const push = (want - d) / (mi && mj ? 2 : 1), ux = dx / d, uy = dy / d;
      if (mi) targets[i] = clamp({ x: a.x - ux * push, y: a.y - uy * push }, objects[i]);
      if (mj) targets[j] = clamp({ x: b.x + ux * push, y: b.y + uy * push }, objects[j]);
    }
    targets.forEach((t, i) => { if (t.x !== objects[i].x || t.y !== objects[i].y) targets[i] = pushOut(t, objects[i]); });
  }
  const k = 1 - Math.exp(-dt / GLIDE_S), next = {};
  objects.forEach((o, i) => {
    const [mx, my] = moves[o.key] || [0, 0], tx = targets[i].x - o.x, ty = targets[i].y - o.y;
    const nx = mx + (tx - mx) * k, ny = my + (ty - my) * k;
    if (Math.abs(nx) > 0.05 || Math.abs(ny) > 0.05 || tx || ty) next[o.key] = [nx, ny];
  });
  return next;
}
