// Draws the corner's picture for the projector: the content, laid out in corner space, is cut at
// the fold and each wall's half is warped onto its own quad, so it lands straight on both walls.
// The projector window and the control page's preview both use this.
import { createWarp } from "./warp.js";
import { drawAlignment, wallQuads } from "./corner.js";
import { createArtist, loadArt } from "./art.js";
import { drawMural, newHunt } from "./mural.js";
import { defaultOutput } from "./cornerState.js";

const PX = 6; // content pixels per centimeter

// preview: true on the control page, where a blackout still shows the picture, dimmed, under a note.
export function createCornerProjection(canvas, { preview = false } = {}) {
  const ctx = canvas.getContext("2d"), warp = createWarp();
  const content = document.createElement("canvas"), half = document.createElement("canvas");
  let artist = null; // the mural's illustrations, once loaded
  loadArt().then(art => { artist = createArtist(content.getContext("2d"), art); }).catch(err => console.error("The mural's art didn't load:", err));

  // state: { mode: "off" | "frame" | "fit" | "play", blackout, output, corner, hunt }. In "fit",
  // the alignment grid; in "play", the pirate mural and its treasure hunt.
  function draw(state) {
    const w = canvas.width, h = canvas.height, out = state.output || defaultOutput();
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, w, h);
    if (state.blackout && !preview) return;
    if (state.mode === "frame") pattern(w, h, out.pattern);
    else if (state.mode !== "off") walls(state, w, h, out);
    if (out.brightness < 1) { ctx.fillStyle = `rgba(0,0,0,${1 - out.brightness})`; ctx.fillRect(0, 0, w, h); }
    if (state.mode === "fit") pins(state, w, h);
    if (state.blackout) blackoutNote(w, h);
  }

  function walls(state, w, h, out) {
    const c = state.corner;
    const drawContent = state.mode === "play" && artist
      ? (g, c, px) => drawMural(g, artist, c, px, state.hunt || newHunt(), Date.now())
      : drawAlignment;
    const CW = Math.round((c.left.width + c.right.width) * PX), CH = Math.round(c.height * PX);
    if (content.width !== CW || content.height !== CH) { content.width = CW; content.height = CH; }
    const g = content.getContext("2d");
    g.clearRect(0, 0, CW, CH);
    drawContent(g, c, PX);
    if (out.soft > 0) soften(g, CW, CH, out.soft * PX);
    const quads = wallQuads(c), split = Math.round(c.left.width * PX);
    for (const [side, x0, x1] of [["left", 0, split], ["right", split, CW]]) {
      if (half.width !== x1 - x0 || half.height !== CH) { half.width = x1 - x0; half.height = CH; }
      const hg = half.getContext("2d");
      hg.clearRect(0, 0, half.width, CH);
      hg.drawImage(content, x0, 0, x1 - x0, CH, 0, 0, x1 - x0, CH);
      ctx.drawImage(warp.render(half, quads[side].map(p => ({ x: p.x * w, y: p.y * h })), w, h), 0, 0);
    }
  }

  // Fades the picture's four outer edges (not the fold) to nothing over `d` pixels, so its
  // border doesn't show as a hard line of projector glow on the wall.
  function soften(g, W, H, d) {
    g.save();
    g.globalCompositeOperation = "destination-out";
    for (const [x0, y0, x1, y1] of [[0, 0, d, 0], [W, 0, W - d, 0], [0, 0, 0, d], [0, H, 0, H - d]]) {
      const grad = g.createLinearGradient(x0, y0, x1, y1);
      grad.addColorStop(0, "#000"); grad.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grad;
      g.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0) || W, Math.abs(y1 - y0) || H);
    }
    g.restore();
  }

  // Numbered handles on the six pins.
  function pins(state, w, h) {
    const r = h / 36;
    state.corner.pins.forEach((p, i) => {
      ctx.fillStyle = i === state.selected ? "#fff" : "#facc15";
      ctx.beginPath(); ctx.arc(p.x * w, p.y * h, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#000"; ctx.font = `700 ${r * 1.15}px system-ui`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(i + 1, p.x * w, p.y * h);
    });
  }

  // The projector's whole picture, to check it's on, in focus, and how much of the corner it
  // covers (grid), how bright and even it is (white), and its colors (bars).
  function pattern(w, h, kind) {
    if (kind === "white") { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h); return; }
    if (kind === "bars") {
      const bars = ["#fff", "#ff0", "#0ff", "#0f0", "#f0f", "#f00", "#00f", "#000"];
      bars.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(Math.floor(i * w / 8), 0, Math.ceil(w / 8), h * 0.75); });
      for (let i = 0; i < 16; i++) { const v = Math.round(i * 255 / 15); ctx.fillStyle = `rgb(${v},${v},${v})`; ctx.fillRect(Math.floor(i * w / 16), h * 0.75, Math.ceil(w / 16), h * 0.25); }
      return;
    }
    ctx.strokeStyle = "rgba(255,255,255,.5)"; ctx.lineWidth = 2; ctx.beginPath();
    for (let x = 0; x <= w; x += h / 9) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    for (let y = 0; y <= h; y += h / 9) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
    ctx.stroke();
    ctx.strokeStyle = "#facc15"; ctx.lineWidth = 8; ctx.strokeRect(4, 4, w - 8, h - 8);
  }

  // On the preview during a blackout: the picture, dimmed, and a reminder the projector is dark.
  function blackoutNote(w, h) {
    ctx.fillStyle = "rgba(0,0,0,.7)"; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#f87171"; ctx.font = `800 ${h / 12}px system-ui`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("BLACKOUT", w / 2, h / 2);
    ctx.font = `500 ${h / 30}px system-ui`; ctx.fillStyle = "#e8eef7";
    ctx.fillText("The projector shows nothing. Press B to bring it back.", w / 2, h / 2 + h / 12);
  }

  return { draw };
}
