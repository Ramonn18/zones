# Zones

A spatial computing project for SVA's Spatial Computing course (fall 2026). People move through a real space divided into zones, and the space reacts to them. The space doesn't depend on a projected map to be played: projection, sound or light are ways for it to respond, not something players have to read to interact.

This is a fresh start. The first version, a projection-mapped pirate game, is archived on the [`v1` branch](../../tree/v1).

## What v1 taught us

- **Projected light and printed markers don't mix.** The projector washed out the QR codes, and the camera couldn't read them reliably.
- **A projected map made the screen the subject, not the space.** Players were reading a picture instead of moving through a room.
- **A phone used only as a webcam is a waste.** Continuity Camera hands the Mac plain video, so none of the iPhone's other sensors reach it.

## Now: the corner is the play surface

No support can hang the projector or camera from the ceiling, so the projector sits in a corner of Room 1 and projects across the room into the **opposite corner**, where two whiteboard walls meet (reference photos: `~/Downloads/projector view`). Players interact with that corner. The iPhone sits **on top of the projector**, so it sees the corner almost exactly as the projector does.

**Start it:** double-click **`Zones.app`** in this folder. It starts the local server, opens the corner page, and puts the projector's picture full screen on a **known projector** as soon as one is connected. It follows projectors as they're plugged in and out. Known projectors are in `projectors.json`, matched by vendor, model and serial number, which stay the same, unlike macOS's display numbers. To add a projector, connect it, run `sh app/displays.sh`, and copy its line into `projectors.json`. Rebuild the app after changing `app/` with `sh app/build.sh`. The corner page shows the **live camera** next to the projector preview: press **Start camera** once, and it starts by itself after that (in the app, the camera is captured by the app itself, since the web page alone only gets the iPhone's warped Desk View). To see the corner through the iPhone (for example, to check how the projection lands), run `sh app/look.sh picture.jpg`.

**Step 1, done: fitting the picture to the corner** (`web/corner.html`). Open the projector window on the projector, then drag six pins in the preview onto the corner: each wall's outer top and bottom, and the fold's top and bottom. A grid of 10 cm squares shows the fit; when the squares measure 10 cm on both walls, it's right. Enter the projected area's real width on each wall, and its height.

How it works: the six pins are just enough to work out the projector as a lens looking at a real corner (two walls at right angles). Both walls are drawn through that one lens, so the picture meets itself exactly along the fold. Fitting each wall separately was off by 2% of the picture in the middle of the fold.

**Step 2, the experience: a pirate hunt on a chalk-line mural** (the **Pirate hunt** button). In the style of a white-line doodle mural on a black wall, the corner shows a pirate world: a compass, a ship, an island, the Kraken and a treasure chest, among small doodles (clouds, stars, anchor, telescope, lighthouse, parrot, mermaid, waves). Black is no light, so only the drawings shine. Touch the compass, and a dotted trail draws itself to the next scene: ship, island, the Kraken, then the treasure. Each scene celebrates when it's reached. Until hands are tracked, the mouse is the hand: hold it on a scene in the preview.

The illustrations come from libraries, drawn hand-sketched and gently wobbling with [Rough.js](https://roughjs.com) (MIT): [Oreo Doodle Icons](https://github.com/oreo-design/doodle-icons) (MIT), [Tabler Icons](https://tabler.io/icons) (MIT) and [OpenMoji](https://openmoji.org) line art (CC BY-SA 4.0) for the Kraken. They're in `web/vendor/art` and `web/vendor/rough`, each with its license.

Next: link the camera to the picture, track hands and bodies (MediaPipe, in the browser) against zones on the walls, and the pirate content.

## Before: a round pirate table

A **round table** with three objects on it, **a pirate figure and two ships**, each carrying a small marker. An iPhone looks down at the table through **Continuity Camera** (nothing to install on the phone) and the Mac works out:

- **Zones:** the middle of the table is the **play zone**: a center, *The Calm Eye*, and four seas around it, each toward a real compass direction. Around it, the table's edge is a **compass rim**, like a compass card: its degree ring follows the room's real north, things in the room (a door, a window) are marked at their real directions, and each object has a pointer on the rim that moves as it turns.
- **Object and zone:** which zone each object is in.
- **Directionality:** which way each object faces (a real compass bearing), the zones its line of sight crosses, the object it's facing, and the room's landmarks in that direction.
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

Each place the game runs is an **environment**: its table size, camera height, zones, its real north (read with the iPhone's built-in Compass app: point it from the table's center toward the rim's N marker) and its landmarks ("Door 135, Window 270"). **New room** makes one, and **Export** and **Import** move it between computers as a file.

### Room 1: a 3D twin

**Room 1 (3D)** puts the simulation in a 3D model of the meeting room in `rooms/room 1`. It was built from the photos there:
- a black, glossy 90 cm round table with four chairs
- the cork wall with the TV (south)
- the door (west)
- the whiteboards (north and east)

The iPhone is modeled on the ceiling grid, straight above the table, seeing it through the same 1x (24 mm) lens the photos used. The tracker reads that picture exactly as it would read the real camera, so you can test what the camera sees, whether the markers read on the black table, and the directions to the door, TV and whiteboard. Drag the pieces in the top view to move them in the room. One small picture shows the ceiling camera's view; the other shows the room from a corner.

The compass is mimicked for now: the TV wall is south. Sizes are estimates from the photos (`web/src/room1.js`); measure the room, the table and the ceiling height to make it exact. In the simulation, 4 cm markers track to within 0.8 cm and 2° from the ceiling.

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
| `web/src/room1.js`, `web/src/room3d.js` | Room 1 and its 3D twin (three.js, MIT, in `web/vendor/three`) |
| `web/print.html` | The markers, to print at true size |
| `Zones.app` (`app/`), `projectors.json` | The Mac app that starts everything and finds the projector, and the projectors it knows |
| `web/corner.html`, `web/corner-projector.html` | The corner: fitting the projector's picture to two walls, and the projector's window |
| `web/src/mural.js`, `web/src/art.js` | The pirate mural and its hunt, and drawing the library art hand-sketched |
| `web/src/corner.js`, `web/src/cornerProjection.js`, `web/src/cornerState.js` | The corner's geometry (the projector as a lens), drawing it, and its saved setup |

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
