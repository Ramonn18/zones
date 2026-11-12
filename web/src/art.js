// The mural's illustrations: line-art SVGs from three libraries, drawn hand-sketched with Rough.js
// (vendor/rough, MIT), so they all share one look and gently "boil" like hand-drawn animation.
//   vendor/art/oreo:     Oreo Doodle Icons (MIT): hand-drawn doodles (skull, map, stars...)
//   vendor/art/tabler:   Tabler Icons (MIT): the ship, compass, treasure chest, anchor...
//   vendor/art/openmoji: OpenMoji, line versions (CC BY-SA 4.0): the octopus (the Kraken)
import rough from "../vendor/rough/rough.esm.js";

const BOIL = 8;       // new wobble this many times a second
const SEEDS = 6;      // wobbles to cycle through (each is worked out once, then reused)

// The art used, by name: [library, file].
export const ART = {
  compass: ["tabler", "compass"], ship: ["tabler", "ship"], sailboat: ["tabler", "sailboat"], island: ["tabler", "beach"],
  chest: ["tabler", "treasure-chest"], anchor: ["tabler", "anchor"], telescope: ["tabler", "telescope"], swords: ["tabler", "swords"],
  wheel: ["tabler", "steering-wheel"], lighthouse: ["tabler", "building-lighthouse"], barrel: ["tabler", "barrel"], bottle: ["tabler", "bottle"],
  waves: ["tabler", "ripple"], whirlpool: ["tabler", "tornado"], lifebuoy: ["tabler", "lifebuoy"], coins: ["tabler", "coins"], crown: ["tabler", "crown"],
  kraken: ["openmoji", "1F419"], parrot: ["openmoji", "1F99C"], mermaid: ["openmoji", "1F9DC-200D-2640-FE0F"],
  skull: ["oreo", "skull"], map: ["oreo", "map"], flag: ["oreo", "flag"], stars: ["oreo", "stars"], star: ["oreo", "star"], sun: ["oreo", "sun"],
  clouds: ["oreo", "clouds"], moon: ["oreo", "moon-stars"], shootingStar: ["oreo", "shooting-star"], fish: ["oreo", "fish"],
  arrow: ["oreo", "arrow-right"], arrowUp: ["oreo", "arrow-up-right"], confetti: ["oreo", "confetti"], key: ["oreo", "key"], gem: ["oreo", "diamond"],
  pin: ["oreo", "map-pin"], scroll: ["oreo", "scroll"], globe: ["oreo", "globe"],
};

// An SVG's drawable parts: its size, and each line as path data (circles, rects and lines as paths too).
function parse(text) {
  const svg = new DOMParser().parseFromString(text, "image/svg+xml").documentElement;
  const [, , w, h] = (svg.getAttribute("viewBox") || "0 0 24 24").split(/[\s,]+/).map(Number);
  const parts = [];
  for (const el of svg.querySelectorAll("path, circle, ellipse, line, rect, polyline, polygon")) {
    if (el.getAttribute("stroke") === "none" || el.closest("[stroke=none]")) continue; // invisible helpers
    const a = n => +el.getAttribute(n) || 0;
    const d = {
      path: () => el.getAttribute("d"),
      circle: () => `M${a("cx") - a("r")},${a("cy")}a${a("r")},${a("r")} 0 1,0 ${a("r") * 2},0a${a("r")},${a("r")} 0 1,0 ${-a("r") * 2},0`,
      ellipse: () => `M${a("cx") - a("rx")},${a("cy")}a${a("rx")},${a("ry")} 0 1,0 ${a("rx") * 2},0a${a("rx")},${a("ry")} 0 1,0 ${-a("rx") * 2},0`,
      line: () => `M${a("x1")},${a("y1")}L${a("x2")},${a("y2")}`,
      rect: () => `M${a("x")},${a("y")}h${a("width")}v${a("height")}h${-a("width")}z`,
      polyline: () => `M${el.getAttribute("points")}`,
      polygon: () => `M${el.getAttribute("points")}z`,
    }[el.tagName]();
    if (d) parts.push(d);
  }
  return { w, h, parts };
}

export async function loadArt() {
  const entries = await Promise.all(Object.entries(ART).map(async ([name, [lib, file]]) => {
    const text = await (await fetch(new URL(`../vendor/art/${lib}/${file}.svg`, import.meta.url))).text();
    return [name, parse(text)];
  }));
  return Object.fromEntries(entries);
}

// Draws art on a 2D context. Each piece's sketchy lines are worked out once per wobble and reused.
export function createArtist(ctx, art) {
  const rc = rough.canvas(ctx.canvas), gen = rc.generator, cache = new Map();

  // name: which art; x, y: its center; size: its width (in the context's units); line: line width
  // in the same units; rotate: radians; seed: which wobble set (so each piece wobbles differently).
  function draw(name, x, y, size, { line = 0.45, rotate = 0, seed = 0, color = "#f4f1ea", roughness = 1, now = 0 } = {}) {
    const a = art[name];
    if (!a) return;
    const k = size / a.w, frame = Math.floor(now / (1000 / BOIL)) % SEEDS, key = `${name}|${frame}|${seed}|${Math.round(line / k * 10)}|${roughness}|${color}`;
    let drawables = cache.get(key);
    if (!drawables) {
      const opts = { stroke: color, strokeWidth: line / k, roughness, bowing: 0.6, seed: 1 + frame * 101 + seed * 7, disableMultiStroke: true, preserveVertices: true };
      drawables = a.parts.map(d => gen.path(d, opts));
      cache.set(key, drawables);
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotate);
    ctx.scale(k, k);
    ctx.translate(-a.w / 2, -a.h / 2);
    for (const d of drawables) rc.draw(d);
    ctx.restore();
  }

  // Sketchy shapes for labels and trails, drawn the same way.
  const ellipse = (x, y, w, h, opts = {}) => rc.ellipse(x, y, w, h, { stroke: "#f4f1ea", strokeWidth: 0.4, roughness: 1, seed: 3, ...opts });
  return { draw, ellipse };
}
