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
const MIN_DOTS = 5;      // dots a wall needs found, to fit the camera to it
// The dots the projector shows, one at a time, for the camera to find: nine on each wall.
export function calibrationDots(c) {
  const dots = [];
  for (const [wall, x0, w] of [["left", 0, c.left.width], ["right", c.left.width, c.right.width]]) {
    for (const v of [0.18, 0.5, 0.82]) for (const u of [0.15, 0.5, 0.85]) dots.push({ wall, x: x0 + u * w, y: v * c.height });
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
// people (optional): the person mask, whose pixels are ignored (someone moving isn't a dot).
// Returns its center in the picture (0..1), or { miss } saying why nothing lit up as one small, clear spot.
// area (optional): where the projector's picture is in the camera's picture (findArea); only
// there can a dot be.
export function findDot(dark, lit, { people, area } = {}) {
  const { w, h } = lit, d = new Float32Array(w * h);
  // A person, and a margin around them (Vision's outline lags and misses hair and edges).
  const person = people ? (x, y) => {
    const mx = Math.floor(x * people.w / w), my = Math.floor(y * people.h / h);
    for (const [j, k] of [[0, 0], [-3, 0], [3, 0], [0, -3], [0, 3]]) {
      const qx = mx + j, qy = my + k;
      if (qx >= 0 && qy >= 0 && qx < people.w && qy < people.h && people.data[qy * people.w + qx] > 60) return true;
    }
    return false;
  } : () => false;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { // a little blur, against single noisy pixels
    if (person(x, y) || (area && !area[y * w + x])) continue;
    let s = 0;
    for (let k = -1; k <= 1; k++) for (let j = -1; j <= 1; j++) { const i = (y + k) * w + x + j; s += lit.data[i] - dark.data[i]; }
    d[y * w + x] = s / 9;
  }
  let best = 0, at = -1;
  for (let i = 0; i < d.length; i++) if (d[i] > best) { best = d[i]; at = i; }
  if (best < 20) return { miss: "too faint", strength: Math.round(best) };
  const bx = at % w, by = Math.floor(at / w), R = Math.round(w * 0.05);
  let sx = 0, sy = 0, s = 0, near = 0, all = 0;
  for (let i = 0; i < d.length; i++) {
    if (d[i] < best * 0.5) continue;
    const x = i % w, y = Math.floor(i / w);
    all++;
    if (Math.abs(x - bx) <= R && Math.abs(y - by) <= R) near++;
  }
  if (near / all < 0.8) return { miss: "light changed in more than one place", strength: Math.round(best), clean: +(near / all).toFixed(2) };
  for (let y = Math.max(0, by - R); y <= Math.min(h - 1, by + R); y++) {
    for (let x = Math.max(0, bx - R); x <= Math.min(w - 1, bx + R); x++) {
      const v = d[y * w + x] - best * 0.4;
      if (v > 0) { sx += v * x; sy += v * y; s += v; }
    }
  }
  return { x: (sx / s + 0.5) / w, y: (sy / s + 0.5) / h, strength: Math.round(best) };
}

// Where the projector's picture lands in the camera's picture: what lit up when the whole corner
// went from black to white (with a margin). Returns a 0/1 map over the picture (its .strength:
// how much brighter the picture got), or null.
export function findArea(dark, lit) {
  const { w, h } = lit, d = new Float32Array(w * h);
  let best = 0;
  for (let i = 0; i < d.length; i++) { d[i] = lit.data[i] - dark.data[i]; if (d[i] > best) best = d[i]; }
  if (best < 20) return null;
  const on = new Uint8Array(w * h), R = Math.round(w * 0.01);
  let count = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (d[y * w + x] < best * 0.3) continue;
    count++;
    for (let k = -R; k <= R; k++) for (let j = -R; j <= R; j++) { const qx = x + j, qy = y + k; if (qx >= 0 && qy >= 0 && qx < w && qy < h) on[qy * w + qx] = 1; }
  }
  on.strength = Math.round(best); // how much brighter it got, at most
  return count > w * h * 0.01 ? on : null;
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
  const off = (H, p) => { const q = apply(H, p.cam); return Math.hypot(q.x - p.dot.x, q.y - p.dot.y); };
  for (const wall of ["left", "right"]) {
    let pts = found.filter(f => f.dot.wall === wall);
    const shown = calibrationDots(c).filter(d => d.wall === wall).length;
    // Four dots always fit exactly, even wrong ones (three in a line): it takes five to be sure.
    if (pts.length < MIN_DOTS) return { failed: `the camera saw only ${pts.length} of the ${shown} dots on the ${c[wall].name.toLowerCase()}` };
    fit[wall] = fitHomography(pts.map(p => p.cam), pts.map(p => p.dot));
    // A dot found in the wrong place (a reflection, someone moving) pulls the fit: drop the worst while it's far off.
    while (pts.length > MIN_DOTS) {
      const worst = pts.reduce((a, p) => (off(fit[wall], p) > off(fit[wall], a) ? p : a));
      if (off(fit[wall], worst) < 4) break;
      pts = pts.filter(p => p !== worst);
      fit[wall] = fitHomography(pts.map(p => p.cam), pts.map(p => p.dot));
    }
    for (const p of pts) { sum += off(fit[wall], p) ** 2; n++; }
  }
  if (Math.sqrt(sum / n) > 6) return { failed: `the dots the camera found don't line up (off by ${Math.sqrt(sum / n).toFixed(0)} cm)` };
  fit.error = Math.sqrt(sum / n);
  const wrong = implausible(fit, c);
  return wrong ? { failed: wrong } : fit;
}

// A fit can match its dots and still be nonsense. In the camera's picture, each wall should be a
// sensible four-sided shape of a reasonable size, and the two walls should meet along the fold.
export function implausible(fit, c) {
  const L = c.left.width, R = c.right.width, H = c.height, cam = p => cornerToCamera(fit, c, p);
  const walls = { left: [[0, 0], [L - 0.01, 0], [L - 0.01, H], [0, H]], right: [[L + 0.01, 0], [L + R, 0], [L + R, H], [L + 0.01, H]] };
  for (const [wall, corners] of Object.entries(walls)) {
    const q = corners.map(([x, y]) => cam({ x, y }));
    let area = 0, turns = 0;
    for (let i = 0; i < 4; i++) {
      const a = q[i], b = q[(i + 1) % 4], d = q[(i + 2) % 4];
      area += a.x * b.y - b.x * a.y;
      turns += Math.sign((b.x - a.x) * (d.y - b.y) - (b.y - a.y) * (d.x - b.x));
    }
    if (Math.abs(turns) !== 4) return `the ${c[wall].name.toLowerCase()} came out twisted`;
    if (Math.abs(area / 2) < 0.01) return `the ${c[wall].name.toLowerCase()} came out too small to be right`;
    if (q.some(p => p.x < -0.5 || p.x > 1.5 || p.y < -0.5 || p.y > 1.5)) return `the ${c[wall].name.toLowerCase()} came out far outside the picture`;
  }
  const gap = Math.max(...[0, H].map(y => Math.hypot(cam({ x: L - 0.01, y }).x - cam({ x: L + 0.01, y }).x, cam({ x: L - 0.01, y }).y - cam({ x: L + 0.01, y }).y)));
  return gap > 0.03 ? "the two walls don't meet at the fold" : null;
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

// ---- Pointing with the index finger ---------------------------------------------------------
// hands: from Apple Vision, each { wrist, indexMCP, indexPIP, indexTip, middleTip, ... : [x, y] }
// in the camera's picture (0..1). A hand points when its index finger is straight and the other
// fingers are folded in.
const pt = (h, k) => h[k] && { x: h[k][0], y: h[k][1] };
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export function isPointing(h) {
  const wrist = pt(h, "wrist"), mcp = pt(h, "indexMCP"), pip = pt(h, "indexPIP"), tip = pt(h, "indexTip");
  if (!mcp || !tip || dist(mcp, tip) < 0.01) return false;
  if (pip) { // the index finger is straight
    const a = { x: pip.x - mcp.x, y: pip.y - mcp.y }, b = { x: tip.x - pip.x, y: tip.y - pip.y };
    if ((a.x * b.x + a.y * b.y) / (Math.hypot(a.x, a.y) * Math.hypot(b.x, b.y) || 1) < 0.7) return false;
  }
  if (wrist) { // and reaches well past the other fingers, which are folded
    const reach = dist(wrist, tip);
    for (const k of ["middleTip", "ringTip", "littleTip"]) { const f = pt(h, k); if (f && dist(wrist, f) > reach * 0.8) return false; }
  }
  return true;
}

// A point in the camera's picture (0..1) to where it lies on the walls (cm), or null.
export function cameraToCorner(fit, c, q) {
  const L = c.left.width, R = c.right.width, H = c.height;
  const a = apply(fit.left, q);
  if (a.x >= 0 && a.x <= L && a.y >= -10 && a.y <= H + 10) return a;
  const b = apply(fit.right, q);
  if (b.x >= L && b.x <= L + R && b.y >= -10 && b.y <= H + 10) return b;
  return null;
}

// Where a pointing hand aims: along its index finger (knuckle to tip, carried on past the tip),
// the first scene the line meets on the walls. Seen from the camera, that line runs through the
// spot the finger points at (how far along it, one camera can't tell; the scenes decide).
// Returns { from, to, scene }: the line on the walls (corner cm), ending at the scene it meets
// (scene: its id) or where it leaves the walls (scene: null); null if it never meets a wall.
export function aimOf(hand, fit, c, scenes) {
  const mcp = pt(hand, "indexMCP"), tip = pt(hand, "indexTip"), len = dist(mcp, tip);
  const dx = (tip.x - mcp.x) / len, dy = (tip.y - mcp.y) / len;
  let from = null, to = null;
  for (let s = 0; s < 1.5; s += 0.005) {
    const q = { x: tip.x + dx * s, y: tip.y + dy * s };
    if (q.x < 0 || q.x > 1 || q.y < 0 || q.y > 1) break;
    const p = cameraToCorner(fit, c, q);
    if (!p) { if (from) break; continue; }
    from ||= p;
    to = p;
    const hit = scenes.find(sc => dist(sc, p) < sc.r);
    if (hit) return { from, to: { x: hit.x, y: hit.y }, scene: hit.id };
  }
  return from && { from, to, scene: null };
}
