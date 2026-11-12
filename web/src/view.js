// The top-down view of the table, drawn as the camera sees it (the rim's N marker up): the play
// zone, the compass rim around it turned to the room's real north, the rim markers, and each
// object with the way it faces and what lies ahead of it.
import { RIM, rimPosition } from "./environment.js";
import { CONE, PLAY, WINDS, lookout, real, zoneAt } from "./table.js";

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
    const rpx = R * scale, play = rpx * (1 - (env.rim || 0)), busy = new Set(objects.map(o => zoneAt(env, o)?.id));
    const north = env.room?.north || 0;
    const angle = realDeg => (realDeg - north - 90) * Math.PI / 180; // a real bearing, as a canvas angle

    // The play zone: wedges toward the real directions around the center, and the center.
    for (const s of env.zones.sectors) {
      const a0 = angle(s.bearing - s.width / 2), a1 = angle(s.bearing + s.width / 2);
      ctx.beginPath();
      ctx.arc(cx, cy, play, a0, a1);
      ctx.arc(cx, cy, play * env.zones.center.radius, a1, a0, true);
      ctx.closePath();
      zoneFill(s, busy.has(s.id));
      const mid = angle(s.bearing), d = play * (1 + env.zones.center.radius) / 2;
      label(s.name, cx + Math.cos(mid) * d, cy + Math.sin(mid) * d, s.color, 15 * dpr);
    }
    ctx.beginPath();
    ctx.arc(cx, cy, play * env.zones.center.radius, 0, Math.PI * 2);
    zoneFill(env.zones.center, busy.has(env.zones.center.id));
    label(env.zones.center.name, cx, cy - play * env.zones.center.radius * 0.55, env.zones.center.color, 15 * dpr);

    // The compass rim: a degree ring that follows the room's real north, the way the room's
    // landmarks lie, and a pointer for the way each object faces.
    ctx.beginPath(); ctx.arc(cx, cy, rpx, 0, Math.PI * 2); ctx.arc(cx, cy, play, 0, Math.PI * 2, true);
    ctx.fillStyle = busy.has(PLAY.id) ? "#334155" : "#1e293b"; ctx.fill("evenodd");
    ctx.lineWidth = 2 * dpr; ctx.strokeStyle = "#cbd5e1";
    ctx.beginPath(); ctx.arc(cx, cy, rpx, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, play, 0, Math.PI * 2); ctx.stroke();
    const band = rpx - play;
    for (let d = 0; d < 360; d += 5) {
      const a = angle(d), long = d % 30 === 0 ? 0.42 : d % 10 === 0 ? 0.28 : 0.16;
      ctx.lineWidth = (d % 30 === 0 ? 2 : 1) * dpr; ctx.strokeStyle = "#cbd5e1";
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * rpx, cy + Math.sin(a) * rpx);
      ctx.lineTo(cx + Math.cos(a) * (rpx - band * long), cy + Math.sin(a) * (rpx - band * long)); ctx.stroke();
      if (d % 30 === 0 && d % 90 !== 0) label(String(d), cx + Math.cos(a) * (rpx - band * 0.66), cy + Math.sin(a) * (rpx - band * 0.66), DIM, 11 * dpr);
    }
    WINDS.forEach((w, i) => {
      const a = angle(i * 45), d = rpx - band * 0.66;
      label(w, cx + Math.cos(a) * d, cy + Math.sin(a) * d, i % 2 ? DIM : INK, (i % 2 ? 12 : 17) * dpr, true);
    });
    for (const l of env.room?.landmarks || []) { // outside the rim, at its real direction
      const a = angle(l.bearing), d = rpx + 26 * dpr;
      label(`▲ ${l.name}`, cx + Math.cos(a) * d, cy + Math.sin(a) * d, "#fde68a", 13 * dpr, true);
    }
    for (const o of objects) { // each object's heading, marked on the rim: it moves as the object turns
      const a = angle(real(env, o.heading)), tip = rpx - band * 0.05, base = play + band * 0.05, w = 0.05;
      ctx.fillStyle = o.color;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * tip, cy + Math.sin(a) * tip);
      ctx.lineTo(cx + Math.cos(a - w) * base, cy + Math.sin(a - w) * base);
      ctx.lineTo(cx + Math.cos(a + w) * base, cy + Math.sin(a + w) * base);
      ctx.closePath(); ctx.fill();
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
