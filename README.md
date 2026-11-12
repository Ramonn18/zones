# Zones

A spatial computing project for SVA's Spatial Computing course (fall 2026). People move through a real space divided into zones, and the space reacts to them. The space doesn't depend on a projected map to be played: projection, sound or light are ways for it to respond, not something players have to read to interact.

This is a fresh start. The first version, a projection-mapped pirate game, is archived on the [`v1` branch](../../tree/v1).

## What v1 taught us

- **Projected light and printed markers don't mix.** The projector washed out the QR codes, and the camera couldn't read them reliably.
- **A projected map made the screen the subject, not the space.** Players were reading a picture instead of moving through a room.
- **A phone used only as a webcam is a waste.** Continuity Camera hands the Mac plain video, so none of the iPhone's other sensors reach it.

## Sensing: the iPhone 15 Pro

The plan is a small iPhone app that senses the space and streams what it finds to the Mac, which decides how the space reacts. Sensors to design around:

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

## Setting up

- **Xcode** (the full app, from the Mac App Store), to build the iPhone app. Only its command line tools are installed now.
- The iPhone in **Developer Mode** (Settings → Privacy & Security), with this Mac trusted.

## Open questions

- What are the zones, and what does each one do or not do?
- Who are the subjects: people, objects, or both?
- How does the space respond: projection, sound, light?
