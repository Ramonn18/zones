// Draws the corner's picture for the projector: the content, laid out in corner space, is cut at
// the fold and each wall's half is warped onto its own quad, so it lands straight on both walls.
// The projector window and the control page's preview both use this.
import { createWarp } from "./warp.js";
import { drawAlignment, wallQuads } from "./corner.js";

const PX = 6; // content pixels per centimeter

export function createCornerProjection(canvas) {
  const ctx = canvas.getContext("2d"), warp = createWarp();
  const content = document.createElement("canvas"), half = document.createElement("canvas");

  // state: { mode: "off" | "frame" | "fit", corner }. draw(content) is a function that draws the
  // content in corner space (ctx, corner, px); by default the alignment grid.
  function draw(state, drawContent = drawAlignment) {
    const w = canvas.width, h = canvas.height, c = state.corner;
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, w, h);
    if (state.mode === "off") return;
    if (state.mode === "frame") return frame(w, h);
    const CW = Math.round((c.left.width + c.right.width) * PX), CH = Math.round(c.height * PX);
    if (content.width !== CW || content.height !== CH) { content.width = CW; content.height = CH; }
    const g = content.getContext("2d");
    g.clearRect(0, 0, CW, CH);
    drawContent(g, c, PX);
    const quads = wallQuads(c), split = Math.round(c.left.width * PX);
    for (const [side, x0, x1] of [["left", 0, split], ["right", split, CW]]) {
      if (half.width !== x1 - x0 || half.height !== CH) { half.width = x1 - x0; half.height = CH; }
      const hg = half.getContext("2d");
      hg.clearRect(0, 0, half.width, CH);
      hg.drawImage(content, x0, 0, x1 - x0, CH, 0, 0, x1 - x0, CH);
      ctx.drawImage(warp.render(half, quads[side].map(p => ({ x: p.x * w, y: p.y * h })), w, h), 0, 0);
    }
    if (state.mode === "fit") pins(state, w, h);
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

  // The projector's whole picture: to check it's on, in focus, and how much of the corner it covers.
  function frame(w, h) {
    ctx.strokeStyle = "rgba(255,255,255,.5)"; ctx.lineWidth = 2; ctx.beginPath();
    for (let x = 0; x <= w; x += h / 9) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    for (let y = 0; y <= h; y += h / 9) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
    ctx.stroke();
    ctx.strokeStyle = "#facc15"; ctx.lineWidth = 8; ctx.strokeRect(4, 4, w - 8, h - 8);
  }

  return { draw };
}
