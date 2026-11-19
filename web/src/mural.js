// The corner's pirate world, like a chalk-line mural: white line drawings on black (black is no
// light, so only the drawings shine on the wall). The illustrations come from art.js. Five scenes
// are the stops of a treasure hunt, joined by dotted trails: touch the compass to start, then
// follow the trail from scene to scene to the chest. Everything is in corner space (cm).
//
// The map is uncovered as the hunt goes. Every hunt lays the mural out afresh: the compass lands
// somewhere random on either wall, the other stops are spread out from it, and the walls are cut
// into one zone per stop (each spot belongs to the stop nearest it). At first only the compass's
// zone shows, and only a small circle of it around the compass, with a few drawings floating
// around it (the rest of the compass's zone opens with the next one). Each stop found sets off a burst
// that blows the next zone open, drawing by drawing as its front passes, so the map grows zone by
// zone and there's more and more to search through.
import { defaultCorner } from "./corner.js";

const DWELL = 800;        // ms a hand has to stay on a scene to reach it
const TRAIL_MS = 1600;    // how long a trail takes to draw itself
const MOMENT_MS = 4000;   // how long a scene celebrates being reached
const FINALE_MS = 9000;   // the treasure's celebration, before the hunt starts over
const BURST = 75;         // cm a second: how fast a zone's burst front spreads
const POP_MS = 450;       // how long a drawing takes to pop in once the front reaches it
const SPACING = 15;       // cm between the scenery's drawings
const START_R = 30;       // cm: at first, only this close around the compass shows
const INK = "#f4f1ea";

// The hunt's stops, in order. size: how big it's drawn (cm); r: how close counts as touching it.
export const SCENES = [
  { id: "compass", art: "compass", name: "NORTH", size: 16 },
  { id: "ship", art: "ship", name: "SET SAIL", size: 18 },
  { id: "island", art: "island", name: "LAND HO", size: 17 },
  { id: "kraken", art: "kraken", name: "KRAKEN", size: 21 },
  { id: "chest", art: "chest", name: "TREASURE", size: 15 },
].map(s => ({ ...s, r: Math.max(11, s.size * 0.72) }));

// The scenery: small drawings scattered over the walls, like the mural's little scenes. [art, size cm]
const SCENERY_ART = [
  ["clouds", 9], ["shootingStar", 7], ["telescope", 7], ["wheel", 7], ["map", 7], ["barrel", 6], ["anchor", 7], ["swords", 7],
  ["bottle", 5], ["fish", 6], ["sun", 8], ["moon", 7], ["lighthouse", 9], ["flag", 6], ["skull", 6], ["whirlpool", 7],
  ["lifebuoy", 7], ["parrot", 8], ["mermaid", 9], ["stars", 6], ["star", 4], ["coins", 6], ["gem", 5], ["key", 6], ["waves", 9], ["waves", 9],
];
// Drawings that float around the compass before the hunt starts, then fly off with its burst.
const FLOATERS = [["star", 4], ["fish", 5], ["clouds", 6], ["star", 3]];

// ---- Laying out a hunt -----------------------------------------------------------------------
// A small seeded random generator, so a layout can be made again from its seed.
function random(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// The part of the walls nearest to scene i (a Voronoi cell): the walls' rectangle, cut by the
// halfway line to every other scene. A polygon, [{x, y}].
function zoneOf(scenes, i, W, H) {
  let poly = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }];
  const a = scenes[i];
  scenes.forEach((b, j) => {
    if (j === i) return;
    // Keep the points nearer a than b: (p - mid) · (b - a) <= 0.
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, nx = b.x - a.x, ny = b.y - a.y, side = p => (p.x - mx) * nx + (p.y - my) * ny;
    const out = [];
    poly.forEach((p, k) => {
      const q = poly[(k + 1) % poly.length], sp = side(p), sq = side(q);
      if (sp <= 0) out.push(p);
      if ((sp <= 0) !== (sq <= 0)) { const t = sp / (sp - sq); out.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t }); }
    });
    poly = out;
  });
  return poly;
}

// A fresh layout for the corner c: where each stop and each piece of scenery goes, and which zone
// each belongs to. Plain data, so it travels with the hunt to the projector window.
export function makeLayout(c, seed = Math.floor(Math.random() * 2 ** 31)) {
  const rand = random(seed), L = c.left.width, W = L + c.right.width, H = c.height;
  const offFold = (x, half) => Math.abs(x - L) > half + 2; // nothing big sits folded over the corner
  const scenes = [];
  SCENES.forEach((stop, i) => {
    const half = stop.size * 0.6, labelRoom = stop.size * 0.62 + 8; // its label hangs below it
    const fits = (x, y) => x > half + 3 && x < W - half - 3 && y > half + (i === 0 ? 9 : 3) && y < H - labelRoom && offFold(x, half);
    let best = null, bestScore = -Infinity;
    for (let k = 0; k < 600; k++) {
      const p = { x: rand() * W, y: rand() * H };
      if (!fits(p.x, p.y)) continue;
      if (i === 0) { best = p; break; } // the compass: anywhere on either wall
      // The next stop: within reach of the last one, and as far as can be from all the others,
      // so the map keeps opening into new ground.
      if (dist(p, scenes[i - 1]) > Math.max(55, Math.hypot(W, H) * 0.5)) continue;
      const score = Math.min(...scenes.map(s => dist(p, s) - (s.size + stop.size) * 0.6)) + rand() * 6;
      if (score > bestScore) { bestScore = score; best = p; }
    }
    best ||= { x: W * (i + 0.5) / SCENES.length, y: H / 2 }; // a corner too small to choose: evenly along it
    scenes.push({ ...stop, x: best.x, y: best.y });
  });
  const zones = scenes.map((_, i) => zoneOf(scenes, i, W, H));
  const nearest = p => scenes.reduce((best, s, i) => (dist(p, s) < dist(p, scenes[best]) ? i : best), 0);
  const zoneAt = p => { const i = nearest(p); return i === 0 && dist(p, scenes[0]) > START_R ? 1 : i; };
  // Scenery: thrown at random, kept where it's clear of the stops, their labels and each other.
  const scenery = [];
  for (let k = 0; k < 4000 && scenery.length < 400; k++) {
    const [art, size] = SCENERY_ART[Math.floor(rand() * SCENERY_ART.length)], p = { x: rand() * W, y: rand() * H }, half = size / 2;
    if (p.x < half + 2 || p.x > W - half - 2 || p.y < half + 2 || p.y > H - half - 2 || !offFold(p.x, half * 0.6)) continue;
    if (scenes.some(s => dist(p, s) < s.size * 0.7 + half + 3 || dist(p, { x: s.x, y: s.y + s.size * 0.62 + 4 }) < 10 + half)) continue;
    if (scenes[0] && dist(p, { x: scenes[0].x, y: scenes[0].y - scenes[0].size * 0.62 - 5 }) < 14) continue; // the compass's instructions
    if (scenery.some(o => dist(p, o) < SPACING * (0.6 + 0.4 * rand()) + (o.size + size) * 0.25)) continue;
    scenery.push({ art, x: p.x, y: p.y, size, zone: zoneAt(p) });
  }
  return { seed, corner: { left: { width: L }, right: { width: c.right.width }, height: H }, scenes, zones, start: START_R, scenery };
}

// Whether a layout was made for walls this size.
export const layoutFits = (layout, c) => !!layout && layout.corner.left.width === c.left.width && layout.corner.right.width === c.right.width && layout.corner.height === c.height;

// ---- Zones opening ---------------------------------------------------------------------------
// When zone i opened, and the point its burst spreads from: the compass's zone opens from the
// compass as the hunt begins; each zone after that, from the stop whose finding opened it.
function opening(hunt, i) {
  const scenes = hunt.layout.scenes;
  if (i === 0) return { at: hunt.started, from: scenes[0] };
  const at = hunt.reached[scenes[i - 1].id];
  return at ? { at, from: scenes[i - 1] } : null;
}
// How far a drawing at p in zone i has popped in, 0..1 (0: not yet uncovered).
function popOf(hunt, i, p, now) {
  const o = opening(hunt, i);
  if (!o) return 0;
  return Math.max(0, Math.min(1, (now - o.at - dist(o.from, p) / BURST * 1000) / POP_MS));
}
// A pop with a little overshoot, like something bursting into place.
const easePop = t => (t <= 0 ? 0 : 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2);

// ---- The hunt --------------------------------------------------------------------------------
// The state is plain data, so the corner page can send it to the projector window. Times are
// Date.now(), the same in both windows. c: the corner, for a fresh layout.
export const newHunt = (c = defaultCorner(), now = Date.now()) =>
  ({ step: 0, reached: {}, hover: null, hoverSince: 0, finished: 0, started: now, layout: makeLayout(c) });

// Every drawing, with its home and how much room it takes (r, cm), for making way for people
// (people.js). A drawing's move is moves[key] = [dx, dy] (cm).
export const muralObjects = hunt => !hunt?.layout ? [] : [
  ...hunt.layout.scenes.map(s => ({ key: `scene:${s.id}`, x: s.x, y: s.y + 2, r: s.size * 0.65 })), // its label hangs below
  ...hunt.layout.scenery.map((o, i) => ({ key: `scenery:${i}`, x: o.x, y: o.y, r: o.size * 0.6 })),
];
const moved = (moves, key) => moves?.[key] || [0, 0];
// The stops where they are now (moved out of people's way). With now: only those uncovered so far.
export function placedScenes(hunt, moves, now) {
  if (!hunt?.layout) return [];
  return hunt.layout.scenes
    .map((s, i) => { const [dx, dy] = moved(moves, `scene:${s.id}`); return { ...s, x: s.x + dx, y: s.y + dy, zone: i }; })
    .filter(s => now === undefined || popOf(hunt, s.zone, hunt.layout.scenes[s.zone], now) > 0.5);
}

// pointer: where a hand (for now, the mouse) touches the corner (cm), or null. moves: where the
// drawings have moved to, making way for people.
export function updateHunt(hunt, pointer, now, moves) {
  if (hunt.finished && now - hunt.finished > FINALE_MS) Object.assign(hunt, newHunt(hunt.layout.corner, now));
  const over = pointer && placedScenes(hunt, moves, now).find(s => Math.hypot(pointer.x - s.x, pointer.y - s.y) < s.r);
  if ((over?.id || null) !== hunt.hover) { hunt.hover = over?.id || null; hunt.hoverSince = now; }
  const target = SCENES[hunt.step];
  if (target && hunt.hover === target.id && now - hunt.hoverSince > DWELL) reachNext(hunt, now);
  return hunt;
}

// The next scene is reached (by a touch, or skipped to from the corner page).
export function reachNext(hunt, now) {
  const target = SCENES[hunt.step];
  if (!target) return hunt;
  hunt.reached[target.id] = now;
  hunt.step++;
  if (hunt.step === SCENES.length) hunt.finished = now;
  return hunt;
}

// One scene back: the last one reached isn't any more (and the zone it opened closes again).
export function stepBack(hunt) {
  if (hunt.step === 0) return hunt;
  hunt.step--;
  delete hunt.reached[SCENES[hunt.step].id];
  hunt.finished = 0;
  return hunt;
}

// ---- Drawing ---------------------------------------------------------------------------------
// A word in a doubled sketchy oval, like the mural's labels. glow: 0..1, how far a touch has filled it.
function label(ctx, artist, text, x, y, size, now, glow = 0) {
  ctx.font = `800 ${size}px system-ui`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  const spaced = text.split("").join(" "), w = ctx.measureText(spaced).width + size * 2.2, h = size * 2.1;
  const seed = Math.floor(now / 125) % 6 + 1;
  // A touch fills the oval's outer ring, from thin to bold.
  artist.ellipse(x, y, w, h, { seed, roughness: 0.6 });
  artist.ellipse(x, y, w + size * 0.7, h + size * 0.6, { seed: seed + 9, roughness: 0.6, strokeWidth: 0.3 + glow * 1.1 });
  ctx.fillStyle = INK; ctx.fillText(spaced, x, y + size * 0.06);
}

// A dotted trail from one scene to the next, drawn up to `progress` (0..1).
function trail(ctx, a, b, progress) {
  const mid = { x: (a.x + b.x) / 2 + (b.y - a.y) * 0.25, y: (a.y + b.y) / 2 - (b.x - a.x) * 0.15 };
  const n = Math.round(Math.hypot(b.x - a.x, b.y - a.y) / 2.4); // a dot every 2.4 cm or so
  const at = s => ({ x: (1 - s) ** 2 * a.x + 2 * (1 - s) * s * mid.x + s * s * b.x, y: (1 - s) ** 2 * a.y + 2 * (1 - s) * s * mid.y + s * s * b.y });
  const len = Math.hypot(b.x - a.x, b.y - a.y), from = a.r / len, to = 1 - b.r / len, end = from + (to - from) * progress;
  ctx.fillStyle = INK;
  for (let i = 0; i <= n; i++) { const s = from + (to - from) * i / n; if (s > end) break; const p = at(s); ctx.beginPath(); ctx.arc(p.x, p.y, 0.5, 0, Math.PI * 2); ctx.fill(); }
}

// Where a pointing finger aims: a dotted chalk line along it, and a ring on the scene it reaches.
function aimLine(ctx, artist, aim, scenes, now) {
  const n = Math.max(1, Math.round(Math.hypot(aim.to.x - aim.from.x, aim.to.y - aim.from.y) / 2.4)), crawl = (now / 400) % 1;
  ctx.fillStyle = INK;
  for (let i = 0; i < n; i++) {
    const s = (i + crawl) / n;
    ctx.beginPath(); ctx.arc(aim.from.x + (aim.to.x - aim.from.x) * s, aim.from.y + (aim.to.y - aim.from.y) * s, 0.45, 0, Math.PI * 2); ctx.fill();
  }
  const hit = aim.scene && scenes.find(s => s.id === aim.scene);
  if (hit) artist.ellipse(hit.x, hit.y, hit.size * 1.5, hit.size * 1.5, { seed: Math.floor(now / 125) % 6 + 20, roughness: 1.2, strokeWidth: 0.5 });
}

// A zone's burst: a sketchy ring (and a lagging second one) spreading from where it opened, with
// sparks flying ahead of it, all kept inside the zone it's uncovering.
function burst(ctx, artist, hunt, i, now) {
  const o = opening(hunt, i), { zones, scenes, start } = hunt.layout;
  if (!o) return;
  // The ground it uncovers: its own part of the walls. The first zone is only the circle around
  // the compass; the second also gets the rest of the compass's part.
  const cells = i === 1 ? [zones[1], zones[0]] : [zones[i]];
  const far = i === 0 ? start : Math.max(...cells.flat().map(p => dist(p, o.from))), r = (now - o.at) / 1000 * BURST;
  if (r <= 0 || r > far + 12) return;
  const fade = 1 - Math.max(0, r - far * 0.6) / (far * 0.4 + 12);
  ctx.save();
  ctx.beginPath();
  for (const cell of cells) { cell.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); }
  if (i === 1) { ctx.moveTo(scenes[0].x + start, scenes[0].y); ctx.arc(scenes[0].x, scenes[0].y, start, 0, Math.PI * 2); }
  if (i === 0) { ctx.clip(); ctx.beginPath(); ctx.arc(scenes[0].x, scenes[0].y, start, 0, Math.PI * 2); ctx.clip(); }
  else ctx.clip(i === 1 ? "evenodd" : "nonzero");
  const seed = Math.floor(now / 125) % 6 + 40 + i;
  artist.ellipse(o.from.x, o.from.y, r * 2, r * 2, { seed, roughness: 1.6, strokeWidth: 0.25 + 0.9 * fade });
  if (r > 9) artist.ellipse(o.from.x, o.from.y, (r - 8) * 2, (r - 8) * 2, { seed: seed + 7, roughness: 2, strokeWidth: 0.2 + 0.3 * fade });
  ctx.strokeStyle = INK; ctx.lineWidth = 0.35 * fade + 0.1;
  for (let k = 0; k < 18; k++) { // sparks: short dashes thrown out ahead of the ring
    const a = k / 18 * Math.PI * 2 + i * 1.3 + Math.sin(k * 7.1) * 0.2, d = r + 2 + (k % 3) * 1.5, len = 2 + (k % 4);
    ctx.beginPath(); ctx.moveTo(o.from.x + Math.cos(a) * d, o.from.y + Math.sin(a) * d);
    ctx.lineTo(o.from.x + Math.cos(a) * (d + len), o.from.y + Math.sin(a) * (d + len)); ctx.stroke();
  }
  ctx.restore();
}

// Draws the mural. c: the corner; px: pixels per cm on the content canvas; hunt: its state (with
// its layout); moves: where drawings have moved to, making way for people; aim: where a finger
// points, or null. Only the zones opened so far are drawn; the rest of the walls stay dark.
export function drawMural(ctx, artist, c, px, hunt, now, moves, aim) {
  const W = c.left.width + c.right.width, layout = hunt.layout, scenes = placedScenes(hunt, moves);
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W * px, c.height * px);
  if (!layout) return;
  ctx.save(); ctx.scale(px, px);
  ctx.lineCap = ctx.lineJoin = "round";

  layout.scenery.forEach((o, i) => {
    const pop = easePop(popOf(hunt, o.zone, o, now));
    if (!pop) return;
    const [dx, dy] = moved(moves, `scenery:${i}`), drift = o.art === "waves" ? 1.5 : 0.7; // everything floats a little
    artist.draw(o.art, o.x + dx + Math.sin(now / 2100 + i) * drift, o.y + dy + Math.sin(now / 1500 + i * 1.7) * 0.6, o.size * pop,
      { seed: i % 12, now, line: 0.35 });
  });
  layout.scenes.forEach((_, i) => burst(ctx, artist, hunt, i, now));

  // Trails: each starts once the stop it leads to has been uncovered.
  for (let i = 1; i < scenes.length; i++) {
    const since = hunt.reached[scenes[i - 1].id];
    if (since) trail(ctx, scenes[i - 1], scenes[i], Math.min(1, Math.max(0, now - since - dist(scenes[i - 1], scenes[i]) / BURST * 1000) / TRAIL_MS));
  }
  const next = scenes[hunt.step];
  scenes.forEach((s, i) => {
    const pop = popOf(hunt, i, layout.scenes[i], now);
    if (!pop) return;
    const reachedAt = hunt.reached[s.id], moment = reachedAt ? Math.max(0, 1 - (now - reachedAt) / MOMENT_MS) : 0;
    const isNext = s === next, touching = hunt.hover === s.id, fill = isNext && touching ? Math.min(1, (now - hunt.hoverSince) / DWELL) : 0;
    const bounce = easePop(pop) * (1 + moment * 0.25 * Math.abs(Math.sin(now / 160)) + (isNext ? Math.sin(now / 320) * 0.04 : 0));
    const turn = (s.id === "compass" && hunt.step > 0 && next) ? 0 : Math.sin(now / 900 + i) * 0.05 + moment * Math.sin(now / 120) * 0.15;
    artist.draw(s.art, s.x, s.y, s.size * bounce, { seed: 50 + i, now, line: 0.5, rotate: turn, roughness: 1 + moment * 1.5 });
    if (moment) for (let k = 0; k < 6; k++) { // a burst of stars around a scene that's just been reached
      const a = k / 6 * Math.PI * 2 + now / 600, d = s.size * (0.6 + (1 - moment) * 0.5);
      artist.draw("star", s.x + Math.cos(a) * d, s.y + Math.sin(a) * d, 3.5 * moment + 1, { seed: k, now, line: 0.3 });
    }
    if ((isNext || reachedAt) && pop >= 1) label(ctx, artist, s.name, s.x, s.y + s.size * 0.62 + 3.5, 2, now, fill);
  });

  // Before the start, a few drawings float around the compass; its burst throws them out and away.
  const compass = scenes[0], thrown = hunt.reached.compass ? (now - hunt.reached.compass) / 1000 : 0;
  if (compass && thrown < 1.2) FLOATERS.forEach(([art, size], k) => {
    const a = now / 2600 * (k % 2 ? -1 : 1) + k / FLOATERS.length * Math.PI * 2, d = compass.size * (0.95 + k * 0.12) + thrown * BURST * 0.8;
    const pop = easePop(popOf(hunt, 0, compass, now - 250 * (k + 1))) * (1 - thrown / 1.2);
    if (pop > 0) artist.draw(art, compass.x + Math.cos(a) * d, compass.y + Math.sin(a) * d * 0.8 + Math.sin(now / 700 + k) * 1, size * pop, { seed: 70 + k, now, line: 0.3 });
  });
  if (aim) aimLine(ctx, artist, aim, scenes, now);
  if (hunt.step === 0 && compass && popOf(hunt, 0, compass, now) >= 1) {
    ctx.font = "700 2px system-ui"; ctx.textAlign = "center"; ctx.fillStyle = INK;
    const x = Math.min(W - 16, Math.max(16, compass.x)), y = compass.y - compass.size * 0.62 - 5;
    ctx.fillText("POINT AT THE COMPASS", x, y - 1.3); ctx.fillText("TO START THE HUNT", x, y + 1.3);
  }
  if (hunt.finished) {
    const f = (now - hunt.finished) / 1000;
    for (let k = 0; k < 14; k++) {
      const a = k / 14 * Math.PI * 2 + f * 0.4, d = 14 + f * 5;
      artist.draw(k % 2 ? "star" : "coins", W / 2 + Math.cos(a) * d * 1.6, c.height / 2 + Math.sin(a) * d * 0.8, 5, { seed: k, now, line: 0.35 });
    }
    artist.draw("crown", W / 2, c.height / 2 - 12, 14, { seed: 9, now, line: 0.5 });
    ctx.fillStyle = "#000"; ctx.fillRect(W / 2 - 34, c.height / 2 - 2, 68, 12); // keep the words clear of the trails
    label(ctx, artist, "YOU FOUND THE TREASURE", W / 2, c.height / 2 + 4, 3.2, now, 1);
  }
  ctx.restore();
}
