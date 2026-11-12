# Zones

A spatial computing project for SVA's Spatial Computing course (fall 2026). People move through a real space divided into zones, and the space reacts to them. The space doesn't depend on a projected map to be played: projection, sound or light are ways for it to respond, not something players have to read to interact.

This is a fresh start. The first version, a projection-mapped pirate game, is archived on the [`v1` branch](../../tree/v1).

## What v1 taught us

- **Projected light and printed markers don't mix.** The projector washed out the QR codes, and the camera couldn't read them reliably.
- **A projected map made the screen the subject, not the space.** Players were reading a picture instead of moving through a room.
- **A phone used only as a webcam is a waste.** Continuity Camera hands the Mac plain video, so none of the iPhone's other sensors reach it.

## The baseline: a round pirate table

A **round table** with three objects on it, **a pirate figure and two ships**, each carrying a small marker. An iPhone looks down at the table through **Continuity Camera** (nothing to install on the phone) and the Mac works out:

- **Zones:** the table is divided into a center, *The Calm Eye*, and four seas around it, one per compass direction.
- **Object and zone:** which zone each object is in.
- **Directionality:** which way each object faces (a compass bearing), the zones its line of sight crosses, and the object it's facing.
- **Objects and each other:** how far apart they are and in which direction ("Ship 2, 31 cm southeast").

Nothing is projected onto the table, so the markers stay readable.

### Run it

```sh
cd web && python3 -m http.server 8010
```

Then open http://localhost:8010 in **Safari** (it can use the iPhone as a camera; Chrome can't).

- **Simulation** (the default): drag an object to move it, and drag the dot at its arrow's tip to turn it.
- **Camera:** pick the iPhone. Without its Desk View, which bends the picture.
- `?simcam` at the end of the address: the simulation plays the camera, to test the whole tracking path without hardware.

### Set up the table

1. **Print markers** (from the page), at 100% scale, and check one with a ruler.
2. Cut them out with their white border; it's part of the marker.
3. Tape the four rim markers at north, east, south and west, 6 cm in from the edge.
4. Put a marker flat on top of each object, with the arrow toward its front.
5. Mount the iPhone above the table so it sees all of it. For a 120 cm table, that's about 1.6 m up.

### Rooms

Each place the game runs is an **environment**: its table size, camera height and zones. **New room** makes one, and **Export** and **Import** move it between computers as a file.

### Markers

The markers are **ArUco** markers (4×4), read with [js-aruco2](https://github.com/damianofalcioni/js-aruco2) (MIT). They're far easier to read than QR codes at small sizes: a QR code is at least 21 squares across, while these are 6. The reader first finds the rim markers in the whole picture, then enlarges just the table 2× to read the objects' markers. That way objects' markers read down to about 3.5 cm, with the camera seeing the whole table. A simulated camera tracks positions to within 0.1 cm and headings to within 1°.

### Code

| File | What it does |
|---|---|
| `web/index.html` | The page: the source (simulation or camera), the view, and what each object relates to |
| `web/src/table.js` | Zones, compass bearings, what lies ahead of an object, how objects relate |
| `web/src/environment.js` | The objects, the rim markers, and the saved rooms |
| `web/src/tracker.js` | Markers in the picture to positions and headings on the table |
| `web/src/markers.js` | Drawing and reading ArUco markers |
| `web/src/view.js` | The top-down view |
| `web/src/sim.js` | The simulated table and camera |
| `web/print.html` | The markers, to print at true size |

## Sensing: the iPhone 15 Pro

The baseline uses the iPhone as a camera only, with nothing installed on it. These are the iPhone 15 Pro's other sensors, in case a later version needs them (each would need an app on the phone):

| Sensor | What it gives us |
|---|---|
| LiDAR scanner | Depth of the room, out to about 5 m: where people and things are in 3D, not just in a picture |
| ARKit world tracking and scene reconstruction | A map of the room's surfaces, and fixed positions for zones in real space |
| ARKit body tracking | A person's 3D skeleton (one person, rear camera) |
| Vision | 2D poses of several people, hand poses, 3D body pose with depth |
| Ultra-wide camera | A wide view, to cover more of the room from one spot |
| Ultra Wideband chip | Distance and direction to other UWB devices (iPhones, Apple Watch) |
| Microphones, motion sensors | Sound events, and the phone's own movement |

What each one can actually do in our room will be tested as we go.

## Open questions

- What does each zone do, and what happens between objects (a ship facing another, the pirate facing a zone)?
- How does the space respond: sound, light, a screen?
