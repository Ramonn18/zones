// An environment is one place the game runs: a room's table, its zones, and where the
// markers go. Each is saved in the browser and can be exported to a file and loaded
// elsewhere, so the same project runs in any room.

// marker: the ArUco marker (4x4) on top of each object, and on the table's rim.
export const OBJECTS = [
  { id: "pirate", name: "Pirate", marker: 10, color: "#facc15" },
  { id: "ship-1", name: "Ship 1", marker: 11, color: "#ef4444" },
  { id: "ship-2", name: "Ship 2", marker: 12, color: "#3b82f6" },
];

// The four markers on the table's rim tell the camera where the table is and which way is north.
export const RIM = [
  { name: "N", marker: 0, bearing: 0 }, { name: "E", marker: 1, bearing: 90 },
  { name: "S", marker: 2, bearing: 180 }, { name: "W", marker: 3, bearing: 270 },
];

const KEY = "zones-environments", CURRENT = "zones-environment";

// sizes in centimeters. zones.center.radius: a fraction of the table's radius.
// sectors: the zones around it, each centered on a real compass bearing (they turn with the room's north).
export function defaultEnvironment(name = "Studio") {
  return {
    name,
    table: { diameter: 120 },
    camera: { height: 100 },
    // The room around the table. north: the real compass bearing the rim's N marker points to (read
    // it with the iPhone's Compass app). landmarks: things in the room and their real bearings.
    room: { north: 0, landmarks: [{ name: "Door", bearing: 135 }, { name: "Window", bearing: 270 }] },
    rim: 0.16, // the compass band around the edge, as a fraction of the table's radius: the rest is the play zone
    markers: { rim: 8, objects: 4, inset: 6 }, // marker sizes (rim, objects) and how far the rim markers sit in from the edge. Objects' markers read down to about 3.5 cm with the camera seeing the whole table
    zones: {
      center: { id: "eye", name: "The Calm Eye", color: "#7dd3fc", radius: 0.32 },
      sectors: [
        { id: "north", name: "Frostwall Strait", color: "#c4b5fd", bearing: 0, width: 90 },
        { id: "east", name: "Siren's Sound", color: "#f9a8d4", bearing: 90, width: 90 },
        { id: "south", name: "Widow's Shoals", color: "#fdba74", bearing: 180, width: 90 },
        { id: "west", name: "The Kraken Deep", color: "#86efac", bearing: 270, width: 90 },
      ],
    },
  };
}

const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const write = all => { try { localStorage.setItem(KEY, JSON.stringify(all)); } catch {} };

export function listEnvironments() {
  const all = read();
  if (!Object.keys(all).length) { const env = defaultEnvironment(); all[env.name] = env; write(all); }
  return all;
}

// Fills in anything an environment saved by an older version doesn't have yet.
export function complete(env) {
  const base = defaultEnvironment(env.name);
  return { ...base, ...env, room: { ...base.room, ...env.room }, markers: { ...base.markers, ...env.markers } };
}

export function currentEnvironment() {
  const all = listEnvironments();
  let name = null;
  try { name = localStorage.getItem(CURRENT); } catch {}
  return complete(all[name] || Object.values(all)[0]);
}

export function saveEnvironment(env) {
  const all = read();
  all[env.name] = env;
  write(all);
  try { localStorage.setItem(CURRENT, env.name); } catch {}
}

export function useEnvironment(name) { try { localStorage.setItem(CURRENT, name); } catch {} }

// Where each rim marker's center sits on the table, in table space.
export function rimPosition(env, marker) {
  const r = env.table.diameter / 2 - env.markers.inset, a = marker.bearing * Math.PI / 180;
  return { x: Math.sin(a) * r, y: -Math.cos(a) * r };
}
