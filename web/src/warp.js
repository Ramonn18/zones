// Draws a flat image (the board) onto any four corners of another canvas, in true perspective,
// with the graphics card: the camera view uses it to lay the map over the table, and the
// projector view uses it to fit the map to the table as the projector sees it.
import { homography, UNIT } from "./homography.js";

const VERTEX = `
attribute vec2 pos;
void main() { gl_Position = vec4(pos, 0.0, 1.0); }`;

// For each output pixel: where it falls on the board (through the inverse mapping); outside
// the board, nothing is drawn.
const FRAGMENT = `
precision highp float;
uniform sampler2D board;
uniform mat3 toBoard;
uniform float height;
void main() {
  vec3 q = toBoard * vec3(gl_FragCoord.x, height - gl_FragCoord.y, 1.0);
  vec2 uv = q.xy / q.z;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) discard;
  gl_FragColor = texture2D(board, uv);
}`;

export function createWarp() {
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl", { premultipliedAlpha: true, preserveDrawingBuffer: true });
  const shader = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAGMENT));
  gl.linkProgram(prog);
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const pos = gl.getAttribLocation(prog, "pos");
  gl.enableVertexAttribArray(pos);
  gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR],
    [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  const toBoard = gl.getUniformLocation(prog, "toBoard"), height = gl.getUniformLocation(prog, "height");

  // board: the image to draw; quad: where its corners go (top left, top right, bottom right,
  // bottom left), in pixels of a w x h output. Returns the output canvas.
  function render(board, quad, w, h) {
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, board);
    const H = homography(quad, UNIT); // output pixel -> board (0..1)
    gl.uniformMatrix3fv(toBoard, false, [H[0], H[3], H[6], H[1], H[4], H[7], H[2], H[5], H[8]]); // column-major
    gl.uniform1f(height, h);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return canvas;
  }
  return { render, canvas };
}
