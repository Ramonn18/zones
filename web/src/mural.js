// The corner's pirate world, like a chalk-line mural: white line drawings on black (black is no
// light, so only the drawings shine on the wall). The illustrations come from art.js. Five scenes
// are the zones, joined by dotted trails into a treasure hunt: touch the compass to start, then
// follow the trail from scene to scene to the chest. Everything is in corner space (cm).
const DWELL = 800;        // ms a hand has to stay on a scene to reach it
const TRAIL_MS = 1600;    // how long a trail takes to draw itself
const MOMENT_MS = 4000;   // how long a scene celebrates being reached
const FINALE_MS = 9000;   // the treasure's celebration, before the hunt starts over
const INK = "#f4f1ea";

// The hunt's scenes, in order. x, y: center (cm); size: how big it's drawn; r: how close counts as touching it.
export const SCENES = [
  { id: "compass", art: "compass", name: "NORTH", x: 30, y: 34, size: 22, r: 15 },
  { id: "ship", art: "ship", name: "SET SAIL", x: 70, y: 76, size: 26, r: 16 },
  { id: "island", art: "island", name: "LAND HO", x: 142, y: 34, size: 24, r: 15 },
  { id: "kraken", art: "kraken", name: "KRAKEN", x: 186, y: 66, size: 30, r: 17 },
  { id: "chest", art: "chest", name: "TREASURE", x: 142, y: 84, size: 20, r: 13 },
];

// The rest of the mural: small drawings scattered around, like the wall's little scenes.
const SCENERY = [
  ["clouds", 22, 9, 12], ["shootingStar", 62, 10, 9], ["telescope", 92, 22, 10], ["wheel", 98, 50, 9], ["map", 50, 50, 9],
  ["barrel", 12, 66, 8], ["anchor", 12, 94, 10], ["swords", 104, 92, 9], ["bottle", 118, 60, 7], ["fish", 96, 72, 8],
  ["sun", 168, 12, 11], ["moon", 210, 10, 9], ["lighthouse", 208, 32, 12], ["flag", 168, 36, 8], ["skull", 120, 14, 8],
  ["whirlpool", 168, 98, 9], ["lifebuoy", 208, 98, 9], ["parrot", 4 + 6, 40, 10], ["mermaid", 206, 56, 12], ["fish", 162, 52, 7],
  ["stars", 80, 40, 7], ["star", 188, 28, 5], ["coins", 120, 98, 7], ["gem", 158, 76, 6], ["key", 36, 58, 7],
];
const WAVES = [[34, 102], [52, 98], [86, 104], [196, 82], [180, 104], [128, 72]];

// ---- The hunt --------------------------------------------------------------------------------
// The state is plain data, so the corner page can send it to the projector window. Times are
// Date.now(), the same in both windows.
export const newHunt = () => ({ step: 0, reached: {}, hover: null, hoverSince: 0, finished: 0 });

// pointer: where a hand (for now, the mouse) touches the corner (cm), or null.
export function updateHunt(hunt, pointer, now) {
  if (hunt.finished && now - hunt.finished > FINALE_MS) Object.assign(hunt, newHunt());
  const over = pointer && SCENES.find(s => Math.hypot(pointer.x - s.x, pointer.y - s.y) < s.r);
  if ((over?.id || null) !== hunt.hover) { hunt.hover = over?.id || null; hunt.hoverSince = now; }
  const target = SCENES[hunt.step];
  if (target && hunt.hover === target.id && now - hunt.hoverSince > DWELL) {
    hunt.reached[target.id] = now;
    hunt.step++;
    if (hunt.step === SCENES.length) hunt.finished = now;
  }
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

// Draws the mural. c: the corner; px: pixels per cm on the content canvas; hunt: its state.
export function drawMural(ctx, artist, c, px, hunt, now) {
  const W = c.left.width + c.right.width;
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W * px, c.height * px);
  ctx.save(); ctx.scale(px, px);
  ctx.lineCap = ctx.lineJoin = "round";

  SCENERY.forEach(([name, x, y, size], i) => artist.draw(name, x, y + Math.sin(now / 1400 + i) * 0.4, size, { seed: i, now, line: 0.4 }));
  WAVES.forEach(([x, y], i) => artist.draw("waves", x + Math.sin(now / 1800 + i) * 1.5, y, 12, { seed: 30 + i, now, line: 0.4 }));

  for (let i = 1; i < SCENES.length; i++) {
    const since = hunt.reached[SCENES[i - 1].id];
    if (since) trail(ctx, SCENES[i - 1], SCENES[i], Math.min(1, (now - since) / TRAIL_MS));
  }
  const next = SCENES[hunt.step];
  SCENES.forEach((s, i) => {
    const reachedAt = hunt.reached[s.id], moment = reachedAt ? Math.max(0, 1 - (now - reachedAt) / MOMENT_MS) : 0;
    const isNext = s === next, touching = hunt.hover === s.id, fill = isNext && touching ? Math.min(1, (now - hunt.hoverSince) / DWELL) : 0;
    const bounce = 1 + moment * 0.25 * Math.abs(Math.sin(now / 160)) + (isNext ? Math.sin(now / 320) * 0.04 : 0);
    const turn = (s.id === "compass" && hunt.step > 0 && next) ? 0 : Math.sin(now / 900 + i) * 0.05 + moment * Math.sin(now / 120) * 0.15;
    artist.draw(s.art, s.x, s.y, s.size * bounce, { seed: 50 + i, now, line: 0.55, rotate: turn, roughness: 1 + moment * 1.5 });
    if (moment) for (let k = 0; k < 6; k++) { // a burst of stars around a scene that's just been reached
      const a = k / 6 * Math.PI * 2 + now / 600, d = s.size * (0.6 + (1 - moment) * 0.5);
      artist.draw("star", s.x + Math.cos(a) * d, s.y + Math.sin(a) * d, 4 * moment + 1, { seed: k, now, line: 0.35 });
    }
    if (isNext || reachedAt) label(ctx, artist, s.name, s.x, s.y + s.size * 0.62 + 4, 2.4, now, fill);
  });
  if (hunt.step === 0) {
    ctx.font = "700 2.4px system-ui"; ctx.textAlign = "center"; ctx.fillStyle = INK;
    ctx.fillText("TOUCH THE COMPASS TO START THE HUNT", SCENES[0].x + 4, SCENES[0].y - SCENES[0].size * 0.62 - 2);
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
