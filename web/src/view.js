// The top-down view of the table: zones, compass, rim markers, and each object with the way it
// faces and what lies ahead of it.
import { RIM, rimPosition } from "./environment.js";
import { CONE, lookout, zoneAt } from "./table.js";

const INK = "#e8eef7", DIM = "#93a0b2";

export function createView(canvas) {
  const ctx = canvas.getContext("2d");
  let scale = 1, cx = 0, cy = 0; // pixels per centimeter, and where the table's center is

  // Table space (cm) to canvas pixels, and back.
  const toPx = p => ({ x: cx + p.x * scale, y: cy + p.y * scale });
  const toTable = p => ({ x: (p.x - cx) / scale, y: (p.y - cy) / scale });

  function draw(env, objects) {
    const dpr = window.devicePixelRatio || 1, w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const R = env.table.diameter / 2;
    scale = Math.min(w, h) * 0.42 / R;
    cx = w / 2; cy = h / 2;
    ctx.clearRect(0, 0, w, h);
    const rpx = R * scale, busy = new Set(objects.map(o => zoneAt(env, o)?.id));

    // Zones: wedges around the center, and the center.
    for (const s of env.zones.sectors) {
      const a0 = (s.bearing - s.width / 2 - 90) * Math.PI / 180, a1 = (s.bearing + s.width / 2 - 90) * Math.PI / 180;
      ctx.beginPath();
      ctx.arc(cx, cy, rpx, a0, a1);
      ctx.arc(cx, cy, rpx * env.zones.center.radius, a1, a0, true);
      ctx.closePath();
      zoneFill(s, busy.has(s.id));
      const mid = (s.bearing - 90) * Math.PI / 180, d = rpx * (1 + env.zones.center.radius) / 2;
      label(s.name, cx + Math.cos(mid) * d, cy + Math.sin(mid) * d, s.color, 15 * dpr);
    }
    ctx.beginPath();
    ctx.arc(cx, cy, rpx * env.zones.center.radius, 0, Math.PI * 2);
    zoneFill(env.zones.center, busy.has(env.zones.center.id));
    label(env.zones.center.name, cx, cy - rpx * env.zones.center.radius * 0.55, env.zones.center.color, 15 * dpr);

    // The table's edge and the compass.
    ctx.lineWidth = 3 * dpr; ctx.strokeStyle = "#cbd5e1";
    ctx.beginPath(); ctx.arc(cx, cy, rpx, 0, Math.PI * 2); ctx.stroke();
    for (const [t, b] of [["N", 0], ["E", 90], ["S", 180], ["W", 270]]) {
      const a = (b - 90) * Math.PI / 180;
      label(t, cx + Math.cos(a) * (rpx + 22 * dpr), cy + Math.sin(a) * (rpx + 22 * dpr), INK, 18 * dpr, true);
    }
    for (const m of RIM) {
      const p = toPx(rimPosition(env, m)), s = env.markers.rim * scale;
      ctx.strokeStyle = DIM; ctx.lineWidth = dpr; ctx.setLineDash([4 * dpr, 4 * dpr]);
      ctx.strokeRect(p.x - s / 2, p.y - s / 2, s, s);
      ctx.setLineDash([]);
    }

    // Objects: the cone they look along, the line of sight to the edge, and the object itself.
    for (const o of objects) {
      const p = toPx(o), a = (o.heading - 90) * Math.PI / 180, look = lookout(env, o, objects);
      ctx.fillStyle = `${o.color}18`;
      ctx.beginPath(); ctx.moveTo(p.x, p.y);
      ctx.arc(p.x, p.y, rpx * 2, a - CONE * Math.PI / 180, a + CONE * Math.PI / 180);
      ctx.closePath(); ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, rpx, 0, Math.PI * 2); ctx.clip();
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.arc(p.x, p.y, rpx * 2, a - CONE * Math.PI / 180, a + CONE * Math.PI / 180); ctx.closePath(); ctx.fill();
      ctx.restore();
      if (look.ahead[0]) {
        const t = toPx(look.ahead[0].object);
        ctx.strokeStyle = o.color; ctx.lineWidth = 2 * dpr; ctx.setLineDash([6 * dpr, 5 * dpr]);
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(t.x, t.y); ctx.stroke(); ctx.setLineDash([]);
      }
    }
    for (const o of objects) {
      const p = toPx(o), a = (o.heading - 90) * Math.PI / 180, r = 4.5 * scale;
      ctx.fillStyle = o.color; ctx.strokeStyle = "#0b1220"; ctx.lineWidth = 2 * dpr;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      // The arrow: its tip is also the handle to turn the object in the simulation.
      const tip = { x: p.x + Math.cos(a) * r * 2.2, y: p.y + Math.sin(a) * r * 2.2 };
      ctx.strokeStyle = o.color; ctx.lineWidth = 4 * dpr;
      ctx.beginPath(); ctx.moveTo(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r); ctx.lineTo(tip.x, tip.y); ctx.stroke();
      ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(tip.x, tip.y, 5 * dpr, 0, Math.PI * 2); ctx.fill();
      label(o.name, p.x, p.y + r + 14 * dpr, INK, 14 * dpr, true);
    }

    function zoneFill(z, on) {
      ctx.fillStyle = `${z.color}${on ? "66" : "22"}`; ctx.fill();
      ctx.lineWidth = (on ? 3 : 1) * dpr; ctx.strokeStyle = on ? z.color : `${z.color}88`; ctx.stroke();
    }
    function label(text, x, y, color, size, bold) {
      ctx.font = `${bold ? 700 : 600} ${size}px system-ui`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.lineWidth = 4 * dpr; ctx.strokeStyle = "#0b1220"; ctx.strokeText(text, x, y);
      ctx.fillStyle = color; ctx.fillText(text, x, y);
    }
  }

  // Which object, or which object's turning handle, is under a canvas point (in CSS pixels).
  function hit(objects, cssPoint) {
    const dpr = window.devicePixelRatio || 1, p = { x: cssPoint.x * dpr, y: cssPoint.y * dpr }, r = 4.5 * scale;
    for (const o of objects) {
      const c = toPx(o), a = (o.heading - 90) * Math.PI / 180, tip = { x: c.x + Math.cos(a) * r * 2.2, y: c.y + Math.sin(a) * r * 2.2 };
      if (Math.hypot(p.x - tip.x, p.y - tip.y) < 12 * dpr) return { object: o, turn: true };
    }
    const body = objects.find(o => { const c = toPx(o); return Math.hypot(p.x - c.x, p.y - c.y) < r * 1.2; });
    return body ? { object: body, turn: false } : null;
  }

  return { draw, hit, toTable: css => { const dpr = window.devicePixelRatio || 1; return toTable({ x: css.x * dpr, y: css.y * dpr }); } };
}
