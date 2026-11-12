// The round table: its zones, and how things on it relate to the zones and to each other.
// Table space is in centimeters, seen from above: the center is (0, 0), x runs east (right)
// and y runs south (down), so north is up. Bearings are compass degrees: 0 north, 90 east.

export const WINDS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const WIND_NAMES = { N: "north", NE: "northeast", E: "east", SE: "southeast", S: "south", SW: "southwest", W: "west", NW: "northwest" };

export const bearingOf = (from, to) => (Math.atan2(to.x - from.x, -(to.y - from.y)) * 180 / Math.PI + 360) % 360;
export const wind = deg => WINDS[Math.round(deg / 45) % 8];
export const windName = deg => WIND_NAMES[wind(deg)];
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const angleBetween = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

// Which zone a point is in, or null off the table. env: the environment (see environment.js).
export function zoneAt(env, p) {
  const R = env.table.diameter / 2, r = Math.hypot(p.x, p.y);
  if (r > R) return null;
  if (r <= R * env.zones.center.radius) return env.zones.center;
  const b = bearingOf({ x: 0, y: 0 }, p);
  return env.zones.sectors.find(s => angleBetween(b, s.bearing) <= s.width / 2) || null;
}

// What an object faces, and what lies that way: the other objects in a narrow cone ahead
// (nearest first), and the zones its line of sight crosses on the way to the table's edge.
export const CONE = 20; // degrees either side of straight ahead

export function lookout(env, obj, others) {
  const ahead = others
    .filter(o => o.id !== obj.id && angleBetween(bearingOf(obj, o), obj.heading) <= CONE)
    .map(o => ({ object: o, distance: distance(obj, o) }))
    .sort((a, b) => a.distance - b.distance);
  const R = env.table.diameter / 2, zones = [], rad = obj.heading * Math.PI / 180;
  const dir = { x: Math.sin(rad), y: -Math.cos(rad) };
  for (let d = 0; d <= R * 2; d += 1) {
    const z = zoneAt(env, { x: obj.x + dir.x * d, y: obj.y + dir.y * d });
    if (!z) break;
    if (zones.at(-1) !== z) zones.push(z);
  }
  return { ahead, zones };
}

// How one object sits relative to another, in words: "40 cm northeast".
export const relation = (from, to) => `${Math.round(distance(from, to))} cm ${windName(bearingOf(from, to))}`;
