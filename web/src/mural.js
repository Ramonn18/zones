// The corner's pirate world, like a chalk-line mural: white line drawings on black (black is no
// light, so only the drawings shine on the wall). The illustrations come from art.js. Five stops
// make a treasure hunt: compass, ship, island, Kraken, chest. Everything is in corner space (cm).
//
// The map is uncovered as the hunt goes. Every hunt lays the mural out afresh: the compass lands
// somewhere random on either wall, the other stops are spread out from it, and the walls are cut
// into one zone per stop (each spot belongs to the stop nearest it). At first only a small circle
// around the compass shows, with a few drawings floating around it.
//
// It plays like Where's Waldo. Pointing at the compass blows the first zone open, and a poster
// beside it says who to find: one little character with something subtly odd about it (a mermaid
// in a pirate hat). Hidden in the zone are look-alikes: plain mermaids, and other characters in
// the same hat. Pointing at a look-alike only makes it shake. Pointing at the right one turns it
// into the stop it was hiding (the ship), draws a dotted trail from the stop before it, the way
// you came, and then a burst blows the next zone open, with the next poster. The last one hides
// the treasure.
import { defaultCorner } from "./corner.js";

const DWELL = 800;        // ms a hand has to stay on a scene to reach it
const TRAIL_MS = 1600;    // how long a trail takes to draw itself
const MOMENT_MS = 4000;   // how long a scene celebrates being reached
const FINALE_MS = 9000;   // the treasure's celebration, before the hunt starts over
const BURST = 75;         // cm a second: how fast a zone's burst front spreads
const POP_MS = 450;       // how long a drawing takes to pop in once the front reaches it
const SPACING = 15;       // cm between the scenery's drawings
const START_R = 30;       // cm: at first, only this close around the compass shows
const PICK_R = 6;         // cm: how close counts as touching a hidden character, at least
const NOPE_MS = 700;      // how long a look-alike shakes when it's picked
const CLUE = { w: 34, h: 21 }; // the "find" poster's size (cm)
const CLUE_WAIT = 900;    // ms after its zone starts opening that the poster shows
const DECOYS = { same: 4, elsewhere: 2, sameAccessory: 2 }; // look-alikes per hidden character
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
// The characters that can hide a stop, and where on each an accessory goes, as fractions of its
// size from its center: top (where a hat sits) and face (for a moustache). Measured on the art.
export const CHARACTERS = {
  mermaid: { name: "mermaid", size: 9, top: [-0.05, -0.39], face: [-0.05, -0.27] },
  parrot: { name: "parrot", size: 8, top: [-0.04, -0.41] },
  fish: { name: "fish", size: 7, top: [0.22, -0.28] },
  skull: { name: "skull", size: 7, top: [0, -0.31], face: [0, 0.21] },
  barrel: { name: "barrel", size: 7, top: [0, -0.33] },
  sun: { name: "sun", size: 8, top: [0, -0.16], face: [0, 0.07] },
  lighthouse: { name: "lighthouse", size: 9, top: [0, -0.37] },
  anchor: { name: "anchor", size: 7, top: [0, -0.35] },
};
// What makes the hidden one different. scale: its size against the character's; lift: how far
// above its spot it sits (fraction of the character's size).
export const ACCESSORIES = {
  pirateHat: { art: "pirateHat", words: "in a pirate hat", spot: "top", scale: 0.55, lift: 0.1 },
  crown: { art: "crown", words: "with a crown", spot: "top", scale: 0.4, lift: 0.1 },
  moustache: { art: "moustache", words: "with a moustache", spot: "face", scale: 0.32, lift: 0 },
};

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
  const pick = list => list[Math.floor(rand() * list.length)];

  // Who hides each stop after the compass: a different character each time, with an accessory it can wear.
  const bases = Object.keys(CHARACTERS).sort(() => rand() - 0.5);
  const hidden = scenes.map((_, i) => {
    if (i === 0) return null;
    const base = bases[(i - 1) % bases.length], acc = pick(Object.keys(ACCESSORIES).filter(a => CHARACTERS[base][ACCESSORIES[a].spot]));
    return { base, acc };
  });

  // Each hidden character's poster, beside the stop before it (where the players are looking):
  // to its right, left, below its label or above it, wherever it fits on one wall, clear of the stops.
  const clear = (i, p, room) => i === 0 ? dist(p, scenes[0]) > scenes[0].size * 0.7 + room : dist(p, scenes[i]) > CHARACTERS[hidden[i].base].size * 0.6 + room;
  const inRect = (p, r, pad = 0) => Math.abs(p.x - r.x) < r.w / 2 + pad && Math.abs(p.y - r.y) < r.h / 2 + pad;
  const clues = scenes.map((_, i) => {
    if (i === 0) return null;
    const prev = scenes[i - 1], reach = prev.size * 0.6 + 3; // the stop as it shows once found
    const spots = [[reach + CLUE.w / 2, 0], [-reach - CLUE.w / 2, 0], [0, reach + 6 + CLUE.h / 2], [0, -reach - CLUE.h / 2]]
      .map(([dx, dy]) => ({ x: prev.x + dx, y: prev.y + dy, ...CLUE }));
    const inside = r => r.x - r.w / 2 > 1 && r.x + r.w / 2 < W - 1 && r.y - r.h / 2 > 1 && r.y + r.h / 2 < H - 1;
    const good = r => inside(r) && (r.x + r.w / 2 < L - 1 || r.x - r.w / 2 > L + 1) && scenes.every((s, j) => j === i - 1 || !inRect(s, r, 8));
    const r = spots.find(good) || spots.find(inside) || spots[0];
    r.x = Math.min(W - r.w / 2 - 1, Math.max(r.w / 2 + 1, r.x)); r.y = Math.min(H - r.h / 2 - 1, Math.max(r.h / 2 + 1, r.y));
    return r;
  });

  // Everything else on the walls, thrown at random where it fits: clear of the stops, the posters
  // and each other. kind: what it is; returns whether it found a place.
  const scenery = [];
  const fits = (p, size) => {
    const half = size / 2;
    if (p.x < half + 2 || p.x > W - half - 2 || p.y < half + 2 || p.y > H - half - 2 || !offFold(p.x, half * 0.6)) return false;
    if (dist(p, scenes[0]) < scenes[0].size * 0.7 + half + 3 || dist(p, { x: scenes[0].x, y: scenes[0].y + scenes[0].size * 0.62 + 4 }) < 10 + half) return false;
    if (dist(p, { x: scenes[0].x, y: scenes[0].y - scenes[0].size * 0.62 - 5 }) < 14) return false; // the compass's instructions
    if (clues.some(r => r && inRect(p, r, half + 1.5))) return false;
    return !scenery.some(o => dist(p, o) < SPACING * (0.6 + 0.4 * rand()) + (o.size + size) * 0.25);
  };
  const place = (item, where, tries = 300) => {
    for (let k = 0; k < tries; k++) {
      const p = where();
      if (p && fits(p, item.size)) { scenery.push({ ...item, x: p.x, y: p.y, zone: zoneAt(p) }); return true; }
    }
    return false;
  };
  const anywhere = () => ({ x: rand() * W, y: rand() * H });
  const inZone = i => () => { const p = anywhere(); return zoneAt(p) === i ? p : null; };
  // The hidden ones first, right where their stops are, then their look-alikes.
  hidden.forEach((h, i) => { if (h) scenery.push({ art: h.base, acc: h.acc, size: CHARACTERS[h.base].size, x: scenes[i].x, y: scenes[i].y, zone: i, role: "target", stop: i }); });
  hidden.forEach((h, i) => {
    if (!h) return;
    const plain = { art: h.base, size: CHARACTERS[h.base].size, role: "decoy", stop: i };
    for (let k = 0; k < DECOYS.same; k++) place(plain, inZone(i));
    for (let k = 0; k < DECOYS.elsewhere; k++) place(plain, () => { const p = anywhere(); return zoneAt(p) <= i ? p : null; });
    const others = Object.keys(CHARACTERS).filter(b => b !== h.base && CHARACTERS[b][ACCESSORIES[h.acc].spot]);
    for (let k = 0; k < DECOYS.sameAccessory; k++) { const b = pick(others); place({ art: b, acc: h.acc, size: CHARACTERS[b].size, role: "decoy", stop: i }, inZone(i)); }
  });
  // Then the scenery, filling the rest.
  for (let k = 0; k < 4000 && scenery.length < 400; k++) {
    const [art, size] = pick(SCENERY_ART);
    place({ art, size }, anywhere, 1);
  }
  return { seed, corner: { left: { width: L }, right: { width: c.right.width }, height: H }, scenes, zones, start: START_R, hidden, clues, scenery };
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
  // After the compass, a find first draws its trail back to where you came from, then bursts.
  return at ? { at: at + (i > 1 ? TRAIL_MS : 0), from: scenes[i - 1] } : null;
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
// The stops where they are now (moved out of people's way).
function placedScenes(hunt, moves) {
  return hunt.layout.scenes.map(s => { const [dx, dy] = moved(moves, `scene:${s.id}`); return { ...s, x: s.x + dx, y: s.y + dy }; });
}

// What can be pointed at right now, where it is: the compass before the start; after that, the
// hidden character of the stop being looked for (id: the stop's id) and its look-alikes
// (id: "decoy:<index>"). Only what's been uncovered. [{ id, x, y, r, size }]
export function pickables(hunt, moves, now) {
  if (!hunt?.layout || hunt.finished) return [];
  if (hunt.step === 0) {
    const s = placedScenes(hunt, moves)[0];
    return popOf(hunt, 0, hunt.layout.scenes[0], now) > 0.5 ? [s] : [];
  }
  return hunt.layout.scenery.flatMap((o, k) => {
    if (o.stop !== hunt.step || popOf(hunt, o.zone, o, now) < 0.5) return [];
    const [dx, dy] = moved(moves, `scenery:${k}`);
    return [{ id: o.role === "target" ? SCENES[o.stop].id : `decoy:${k}`, x: o.x + dx, y: o.y + dy, r: Math.max(PICK_R, o.size * 0.75), size: o.size }];
  });
}

// Who to find now, in words ("the mermaid in a pirate hat"), or null.
export function clueOf(hunt) {
  const h = hunt?.layout?.hidden[hunt.step];
  return h && !hunt.finished ? `the ${CHARACTERS[h.base].name} ${ACCESSORIES[h.acc].words}` : null;
}

// pointer: where a hand (for now, the mouse) touches the corner (cm), or null. moves: where the
// drawings have moved to, making way for people. Holding on the right one reaches the next stop;
// holding on a look-alike makes it shake (hunt.nope).
export function updateHunt(hunt, pointer, now, moves) {
  if (hunt.finished && now - hunt.finished > FINALE_MS) Object.assign(hunt, newHunt(hunt.layout.corner, now));
  const over = pointer && pickables(hunt, moves, now)
    .filter(s => Math.hypot(pointer.x - s.x, pointer.y - s.y) < s.r)
    .sort((a, b) => Math.hypot(pointer.x - a.x, pointer.y - a.y) - Math.hypot(pointer.x - b.x, pointer.y - b.y))[0];
  if ((over?.id || null) !== hunt.hover) { hunt.hover = over?.id || null; hunt.hoverSince = now; }
  const target = SCENES[hunt.step];
  if (hunt.hover && now - hunt.hoverSince > DWELL) {
    if (target && hunt.hover === target.id) reachNext(hunt, now);
    else if (hunt.hover.startsWith("decoy:")) { hunt.nope = { id: hunt.hover, at: now }; hunt.hoverSince = now + NOPE_MS; } // wait before it can shake again
  }
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

// A character, and the accessory it wears if any. opts as for artist.draw.
export function drawCharacter(artist, base, acc, x, y, size, opts = {}) {
  artist.draw(base, x, y, size, opts);
  const a = ACCESSORIES[acc], spot = a && CHARACTERS[base]?.[a.spot];
  if (!spot) return;
  const rot = opts.rotate || 0, ox = spot[0] * size, oy = (spot[1] - a.lift) * size;
  artist.draw(a.art, x + ox * Math.cos(rot) - oy * Math.sin(rot), y + ox * Math.sin(rot) + oy * Math.cos(rot), size * a.scale,
    { ...opts, line: (opts.line || 0.45) * 0.85, seed: (opts.seed || 0) + 5 });
}

// The "find" poster: a sketchy frame with the hidden character drawn big and its description.
function poster(ctx, artist, r, h, now, show) {
  const ch = CHARACTERS[h.base], k = easePop(show);
  if (!k) return;
  ctx.save();
  ctx.translate(r.x, r.y); ctx.scale(k, k);
  ctx.fillStyle = "#000"; ctx.fillRect(-r.w / 2, -r.h / 2, r.w, r.h);
  const seed = Math.floor(now / 125) % 6 + 60;
  artist.rect(-r.w / 2 + 0.5, -r.h / 2 + 0.5, r.w - 1, r.h - 1, { seed, roughness: 1.2, strokeWidth: 0.4 });
  ctx.font = "800 2.6px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = INK;
  ctx.fillText("F I N D", 0, -r.h / 2 + 3);
  drawCharacter(artist, h.base, h.acc, 0, -0.5, Math.min(11, r.h * 0.5), { seed: 80, now, line: 0.45 });
  ctx.font = "700 1.9px system-ui";
  ctx.fillText(`THE ${ch.name.toUpperCase()}`, 0, r.h / 2 - 5);
  ctx.fillText(ACCESSORIES[h.acc].words.toUpperCase(), 0, r.h / 2 - 2.6);
  ctx.restore();
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

  // A stop that's been found clears the drawings off its patch, so it and its label have room.
  const found = layout.scenes.filter((s, i) => i > 0 && hunt.reached[s.id]);
  layout.scenery.forEach((o, i) => {
    if (o.role === "target" && hunt.reached[SCENES[o.stop].id]) return; // it's turned into its stop
    let pop = easePop(popOf(hunt, o.zone, o, now));
    for (const s of found) {
      const near = dist(o, s) < s.size * 0.7 + o.size / 2 + 1 || dist(o, { x: s.x, y: s.y + s.size * 0.62 + 3.5 }) < 9 + o.size / 2;
      if (near) pop *= Math.max(0, 1 - (now - hunt.reached[s.id]) / 400);
    }
    if (!pop) return;
    const nope = hunt.nope?.id === `decoy:${i}` ? Math.max(0, 1 - (now - hunt.nope.at) / NOPE_MS) : 0;
    const [dx, dy] = moved(moves, `scenery:${i}`), drift = o.art === "waves" ? 1.5 : 0.7; // everything floats a little
    drawCharacter(artist, o.art, o.acc, o.x + dx + Math.sin(now / 2100 + i) * drift, o.y + dy + Math.sin(now / 1500 + i * 1.7) * 0.6, o.size * pop,
      { seed: i % 12, now, line: 0.35, rotate: nope * Math.sin(now / 35) * 0.35 });
  });
  layout.scenes.forEach((_, i) => burst(ctx, artist, hunt, i, now));

  // Trails: drawn once a stop is found, from the stop before it to it (the way you came).
  for (let i = 1; i < scenes.length; i++) {
    const since = hunt.reached[scenes[i].id];
    if (since) trail(ctx, scenes[i - 1], scenes[i], Math.min(1, (now - since) / TRAIL_MS));
  }
  const next = scenes[hunt.step];
  scenes.forEach((s, i) => {
    // The compass shows from the start; the others once found, popping out of their hidden character.
    const pop = i === 0 ? popOf(hunt, 0, layout.scenes[0], now) : hunt.reached[s.id] ? Math.min(1, (now - hunt.reached[s.id]) / POP_MS) : 0;
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
  // Who to find: the poster beside the last stop, once the zone it's hidden in starts opening.
  const h = layout.hidden[hunt.step], o = h && !hunt.finished && opening(hunt, hunt.step);
  if (o) poster(ctx, artist, layout.clues[hunt.step], h, now, Math.min(1, Math.max(0, now - o.at - CLUE_WAIT) / POP_MS));
  if (aim) aimLine(ctx, artist, aim, pickables(hunt, moves, now), now);
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
