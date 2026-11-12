// The corner: two walls meeting at a fold, with the projector's picture landing on both. Things
// on the corner are placed in **corner space**: the two walls unfolded side by side, in
// centimeters. x runs from the left wall's outer edge (0) to the fold (left.width) and on across
// the right wall; y runs down from the top of the picture.
//
// The projector's picture is fitted to the corner by six pins (in projector space, 0..1): the
// left wall's outer top and bottom, the fold's top and bottom, the right wall's outer top and
// bottom. Six pins are just enough to work out the projector itself, as a lens looking at the real
// corner (two walls at right angles, at their measured sizes). Both walls are then seen through
// that one lens, so the picture meets itself exactly along the fold. (Fitting each wall on its
// own only agrees at the fold's two ends: it was 2% of the picture off in the middle.)
import { apply, invert, UNIT } from "./homography.js";

export const PINS = ["Left top", "Fold top", "Right top", "Right bottom", "Fold bottom", "Left bottom"];

// left, right: the projected area's width on each wall; height: how tall it is (cm).
export function defaultCorner() {
  return {
    left: { name: "North wall", width: 110 },
    right: { name: "East wall", width: 110 },
    height: 110,
    // Where each pin is in the projector's picture: a starting guess, adjusted by dragging. Seen
    // from in front, the fold is the corner's farthest part, so it looks shorter than the edges.
    pins: [{ x: 0.1, y: 0.08 }, { x: 0.5, y: 0.17 }, { x: 0.9, y: 0.08 }, { x: 0.9, y: 0.92 }, { x: 0.5, y: 0.83 }, { x: 0.1, y: 0.92 }],
  };
}

// The corner in 3D (cm): the fold runs down from (0, 0, 0); the left wall goes off to the left
// (x < 0, z = 0) and the right wall comes out toward the room (x = 0, z > 0). y runs down.
const pinPoints = c => [[-c.left.width, 0, 0], [0, 0, 0], [0, 0, c.right.width], [0, c.height, c.right.width], [0, c.height, 0], [-c.left.width, c.height, 0]];

// The projector as a lens: the 3x4 matrix taking 3D corner points to the projector's picture,
// solved from the six pins (direct linear transform, its last number fixed at 1).
export function projectorMatrix(c) {
  const A = [], b = [];
  pinPoints(c).forEach(([X, Y, Z], i) => {
    const { x, y } = c.pins[i];
    A.push([X, Y, Z, 1, 0, 0, 0, 0, -x * X, -x * Y, -x * Z]); b.push(x);
    A.push([0, 0, 0, 0, X, Y, Z, 1, -y * X, -y * Y, -y * Z]); b.push(y);
  });
  // Least squares (12 equations, 11 unknowns): solve AᵀA m = Aᵀb.
  const n = 11, M = Array.from({ length: n }, (_, r) => Array.from({ length: n + 1 }, (_, k) =>
    k < n ? A.reduce((s, row) => s + row[r] * row[k], 0) : A.reduce((s, row, i) => s + row[r] * b[i], 0)));
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    [M[col], M[piv]] = [M[piv], M[col]];
    for (let r = 0; r < n; r++) if (r !== col) { const f = M[r][col] / M[col][col]; for (let k = col; k <= n; k++) M[r][k] -= f * M[col][k]; }
  }
  return [...M.map((row, i) => row[n] / row[i]), 1];
}

// Each wall as a flat mapping from its own 0..1 square to the projector's picture (3x3), through the lens.
function wallMatrices(c) {
  const m = projectorMatrix(c), col = (k) => [m[k], m[4 + k], m[8 + k]];
  const [cx, cy, cz, ct] = [col(0), col(1), col(2), col(3)];
  const rows = (u, v, o) => [0, 1, 2].map(r => [u[r], v[r], o[r]]).flat();
  return {
    // left: (u, v) -> (-W + u W, v H, 0)
    left: rows(cx.map(a => a * c.left.width), cy.map(a => a * c.height), ct.map((a, r) => a - cx[r] * c.left.width)),
    // right: (u, v) -> (0, v H, u W)
    right: rows(cz.map(a => a * c.right.width), cy.map(a => a * c.height), ct),
  };
}

// Each wall's corners in projector space, starting top left, clockwise.
export function wallQuads(c) {
  const w = wallMatrices(c), at = (H, u, v) => apply(H, { x: u, y: v });
  return Object.fromEntries(Object.entries(w).map(([side, H]) => [side, UNIT.map(p => at(H, p.x, p.y))]));
}

// Corner space (cm) to projector space, and back.
export function cornerToProj(c, p) {
  const w = wallMatrices(c), onLeft = p.x <= c.left.width;
  const u = onLeft ? p.x / c.left.width : (p.x - c.left.width) / c.right.width, v = p.y / c.height;
  return apply(onLeft ? w.left : w.right, { x: u, y: v });
}
export function projToCorner(c, p) {
  const w = wallMatrices(c);
  for (const [side, H] of [["left", w.left], ["right", w.right]]) {
    const uv = apply(invert(H), p);
    if (uv.x >= -0.001 && uv.x <= 1.001 && uv.y >= -0.001 && uv.y <= 1.001) {
      return { x: side === "left" ? uv.x * c.left.width : c.left.width + uv.x * c.right.width, y: uv.y * c.height, wall: side };
    }
  }
  return null;
}

// What the corner shows while it's being fitted: a grid of 10 cm squares (if they measure square
// on the walls, the picture isn't stretched), the fold, and each wall's name.
export function drawAlignment(ctx, c, px) {
  const W = (c.left.width + c.right.width) * px, H = c.height * px;
  ctx.fillStyle = "#0b1220"; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = Math.max(1, px * 0.25);
  ctx.beginPath();
  for (let x = 0; x <= c.left.width + c.right.width + 0.01; x += 10) { ctx.moveTo(x * px, 0); ctx.lineTo(x * px, H); }
  for (let y = 0; y <= c.height + 0.01; y += 10) { ctx.moveTo(0, y * px); ctx.lineTo(W, y * px); }
  ctx.stroke();
  ctx.strokeStyle = "#facc15"; ctx.lineWidth = px * 1.2;
  ctx.beginPath(); ctx.moveTo(c.left.width * px, 0); ctx.lineTo(c.left.width * px, H); ctx.stroke(); // the fold
  ctx.strokeRect(px * 0.6, px * 0.6, W - px * 1.2, H - px * 1.2);
  ctx.fillStyle = "#facc15"; ctx.font = `700 ${px * 6}px system-ui`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(c.left.name, c.left.width * px / 2, H / 2);
  ctx.fillText(c.right.name, (c.left.width + c.right.width / 2) * px, H / 2);
}
