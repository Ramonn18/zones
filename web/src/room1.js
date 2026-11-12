// Room 1: the small meeting room in rooms/room 1 (photos IMG_2407-2414). Sizes are estimates
// from the photos until they're measured. Room space is in centimeters with the table's center
// at (0, 0): x toward the rim's E marker, y toward its S marker, z up from the floor.
//
// For now the compass is mimicked: the cork wall with the TV is taken as south, and the rim's N
// marker faces the opposite way, toward the north whiteboard. Facing the TV, the door wall is on
// the right (west), and the other whiteboard is east.
import { defaultEnvironment } from "./environment.js";
import { bearingOf } from "./table.js";

export const ROOM1 = {
  id: "room1",
  name: "Room 1",
  size: { x: 330, y: 300, z: 270 },     // the room: east-west, north-south, floor to ceiling
  center: { x: 0, y: -10 },              // where the table sits in the room, from the room's middle
  table: { diameter: 90, height: 74, color: "#151515" }, // a black, glossy round table
  walls: {
    north: { name: "Whiteboard", color: "#f4f4f2" },
    east: { name: "Whiteboard", color: "#f4f4f2" },
    south: { name: "Cork wall", color: "#b9844f" },
    west: { name: "Door wall", color: "#ece9e4" },
  },
  // Things in the room, as landmarks: where they are (room space, on the walls: the room is 330 x 300
  // around its middle, which is 10 cm north of the table) and how big (width, depth, height).
  features: [
    { name: "TV", at: { x: 10, y: 138, z: 150 }, size: { x: 110, y: 4, z: 63 }, color: "#111111" },
    { name: "Door", at: { x: -163, y: 60, z: 105 }, size: { x: 4, y: 95, z: 210 }, color: "#2f3540" },
    { name: "Whiteboard", at: { x: 0, y: -158, z: 140 }, size: { x: 260, y: 2, z: 120 }, color: "#ffffff" },
    { name: "East whiteboard", at: { x: 163, y: -10, z: 140 }, size: { x: 2, y: 240, z: 120 }, color: "#ffffff" },
  ],
  chairs: [{ bearing: 200, color: "#e53935" }, { bearing: 290, color: "#1f1f1f" }, { bearing: 20, color: "#1f1f1f" }, { bearing: 110, color: "#1f1f1f" }],
  // The iPhone, on the ceiling grid straight above the table, in landscape, its top toward north.
  camera: { at: { x: 0, y: 0, z: 268 }, lens: "wide" }, // wide = the 1x camera (24 mm), as in the photos
};

// The lenses Continuity Camera can use, as fields of view for its 16:9 picture (degrees).
export const LENSES = {
  wide: { name: "1x (24 mm)", vertical: 45.7 },
  ultraWide: { name: "0.5x (13 mm)", vertical: 76.5 },
};

// The room's landmarks as real bearings from the table's center (north: the room's real north).
// (Only one whiteboard counts as a landmark: two would just be "a whiteboard" twice.)
export const landmarksOf = (model, north = 0) => model.features
  .filter(f => f.name !== "East whiteboard")
  .map(f => ({ name: f.name, bearing: Math.round((bearingOf({ x: 0, y: 0 }, f.at) + north) % 360) }));

// An environment set up for Room 1.
export function room1Environment() {
  const env = defaultEnvironment(ROOM1.name);
  env.model = ROOM1.id;
  env.table.diameter = ROOM1.table.diameter;
  env.camera.height = ROOM1.camera.at.z - ROOM1.table.height;
  env.room.landmarks = landmarksOf(ROOM1, env.room.north);
  return env;
}
