// The corner setup, saved in the browser and shared between the corner page and the projector
// window: what the projector shows, the walls' sizes and the six pins.
import { defaultCorner } from "./corner.js";

const KEY = "zones-corner";

export function loadCornerState() {
  const state = { mode: "fit", selected: -1, projAspect: 16 / 9, corner: defaultCorner() };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved) state.corner = { ...state.corner, ...saved.corner };
  } catch {}
  return state;
}

export function saveCornerState(state) {
  try { localStorage.setItem(KEY, JSON.stringify({ corner: state.corner })); } catch {}
}
