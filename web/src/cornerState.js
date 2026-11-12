// The corner setup, saved in the browser and shared between the corner page and the projector
// window: what the projector shows, the output's settings, the walls' sizes and the six pins.
import { defaultCorner } from "./corner.js";

const KEY = "zones-corner", SETUPS = "zones-corner-setups";

// output: brightness 0..1; soft: how far the picture's outer edges fade out (cm); pattern: what
// "Full picture" shows (grid, white, bars); makeWay: keep the mural off people, moving it around them.
export const defaultOutput = () => ({ brightness: 1, soft: 0, pattern: "grid", makeWay: true });
const MODES = ["frame", "fit", "play", "off"];

export function loadCornerState() {
  const state = { mode: "fit", selected: -1, blackout: false, corner: defaultCorner(), output: defaultOutput(), cameraFit: null };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved) applySetup(state, saved);
  } catch {}
  return state;
}

export function saveCornerState(state) {
  try { localStorage.setItem(KEY, JSON.stringify(setupOf(state))); } catch {}
}

// A setup: everything needed to bring the corner back, as plain data (for files and saved setups).
// cameraFit: how the camera's picture maps onto the walls (people.js), or null until it's fitted.
export const setupOf = state => ({ app: "zones-corner", version: 1, mode: state.mode, corner: state.corner, output: state.output, cameraFit: state.cameraFit });
export function applySetup(state, setup) {
  if (setup.corner) state.corner = { ...defaultCorner(), ...setup.corner };
  if (setup.output) state.output = { ...defaultOutput(), ...setup.output };
  if ("cameraFit" in setup) state.cameraFit = setup.cameraFit;
  if (MODES.includes(setup.mode)) state.mode = setup.mode;
}

// Setups saved by name in the browser: { name: setup }.
export function savedSetups() {
  try { return JSON.parse(localStorage.getItem(SETUPS)) || {}; } catch { return {}; }
}
export function storeSetups(setups) {
  try { localStorage.setItem(SETUPS, JSON.stringify(setups)); } catch {}
}
