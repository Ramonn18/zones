// ArUco markers (4x4), drawn and read with js-aruco2 (vendor/aruco, MIT), which the page loads.
// A 4x4 marker is 6 squares across with its black border, so each square is big in the camera
// picture: much easier to read at small sizes than a QR code, which is at least 21 squares.
const DICTIONARY = "ARUCO_4X4_1000";
const QUIET = 1; // white squares around the black border, so the marker stands out from the table

let dictionary = null;
const dict = () => (dictionary ||= new window.AR.Dictionary(DICTIONARY));

// Draws marker `id` centered on (x, y), `size` pixels wide including its white margin, turned
// by `heading` degrees (0 = the marker's top edge faces up).
export function drawMarker(ctx, id, x, y, size, heading = 0) {
  const d = dict(), n = d.markSize - 2, bits = d.codeList[id], cells = n + 2 + QUIET * 2, cell = size / cells;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(heading * Math.PI / 180);
  ctx.fillStyle = "#fff";
  ctx.fillRect(-size / 2, -size / 2, size, size);
  ctx.fillStyle = "#000";
  ctx.fillRect(-size / 2 + QUIET * cell, -size / 2 + QUIET * cell, (n + 2) * cell, (n + 2) * cell);
  ctx.fillStyle = "#fff";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (bits[r * n + c] === "1") ctx.fillRect(-size / 2 + (QUIET + 1 + c) * cell, -size / 2 + (QUIET + 1 + r) * cell, cell + 0.5, cell + 0.5);
  }
  ctx.restore();
}

// Reads markers from a picture (a video or canvas): [{ id, corners: [{ x, y } x4] }], corners
// starting at the marker's own top left and going clockwise, in picture pixels.
// region: only read this part of the picture ({ x, y, w, h }), enlarged `zoom` times first. The
// detector misses markers under about 7 px a square; enlarged 2x, it reads them down to about 4.
export function createReader() {
  const detector = new window.AR.Detector({ dictionaryName: DICTIONARY });
  const canvas = document.createElement("canvas"), ctx = canvas.getContext("2d", { willReadFrequently: true });
  return (picture, region = null, zoom = 1) => {
    const W = picture.videoWidth || picture.width, H = picture.videoHeight || picture.height;
    const r = region ? clip(region, W, H) : { x: 0, y: 0, w: W, h: H };
    if (r.w < 8 || r.h < 8) return [];
    const w = Math.round(r.w * zoom), h = Math.round(r.h * zoom);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(picture, r.x, r.y, r.w, r.h, 0, 0, w, h);
    return detector.detect(ctx.getImageData(0, 0, w, h))
      .map(m => ({ id: m.id, corners: m.corners.map(p => ({ x: r.x + p.x / zoom, y: r.y + p.y / zoom })) }));
  };
}

const clip = (r, W, H) => {
  const x = Math.max(0, Math.floor(r.x)), y = Math.max(0, Math.floor(r.y));
  return { x, y, w: Math.min(W, Math.ceil(r.x + r.w)) - x, h: Math.min(H, Math.ceil(r.y + r.h)) - y };
};
