// A layer the app draws for itself inside the map's 3D scene: coloured
// triangles placed in metres around an origin. The traffic is drawn with it.
// It shares the buildings' depth, so a car behind a tower is hidden by it.

const EARTH_AROUND_METERS = 40075016.686;
const FRAME_MS = 33; // about 30 pictures a second is smooth enough, and easier on the battery

const VERTEX = `
attribute vec3 a_pos;
attribute vec4 a_color;
uniform mat4 u_matrix;
uniform float u_opacity;
varying vec4 v_color;
void main() {
  v_color = a_color * u_opacity;
  gl_Position = u_matrix * vec4(a_pos, 1.0);
}`;

const FRAGMENT = `
precision mediump float;
varying vec4 v_color;
void main() {
  gl_FragColor = v_color;
}`;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || 'shader did not compile');
  return shader;
}

export class SceneLayer {
  /**
   * onFrame(): called before each picture is drawn, to move things on. It
   * returns true while there is movement to show, which keeps the pictures coming.
   */
  constructor(id, { onFrame } = {}) {
    this.id = id;
    this.type = 'custom';
    this.renderingMode = '3d';
    this.onFrame = onFrame;
    this.origin = null;
    this.opacity = 1;
    this.parts = new Map(); // name → { mesh, buffers, stale }
    this.map = null;
    this.program = null;
    this.timer = null;
    this.matrix = new Float32Array(16);
  }

  onAdd(map, gl) {
    this.map = map;
    const program = gl.createProgram();
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'program did not link');
    this.program = program;
    this.at = {
      pos: gl.getAttribLocation(program, 'a_pos'),
      color: gl.getAttribLocation(program, 'a_color'),
      matrix: gl.getUniformLocation(program, 'u_matrix'),
      opacity: gl.getUniformLocation(program, 'u_opacity'),
    };
    // Whatever was drawn before the map changed its style is sent to the new one.
    for (const part of this.parts.values()) {
      part.buffers = null;
      part.stale = true;
    }
  }

  onRemove(_map, gl) {
    clearTimeout(this.timer);
    this.timer = null;
    for (const part of this.parts.values()) {
      if (part.buffers) {
        gl.deleteBuffer(part.buffers.positions);
        gl.deleteBuffer(part.buffers.colours);
      }
      part.buffers = null;
    }
    if (this.program) gl.deleteProgram(this.program);
    this.program = null;
    this.map = null;
  }

  /** The place the meshes are measured from: { lng, lat }. */
  setOrigin(origin) {
    this.origin = origin ? { lng: origin.lng, lat: origin.lat } : null;
  }

  /** Give a named part of the scene its triangles (see Mesh in life.js). */
  set(name, mesh) {
    const part = this.parts.get(name) ?? { mesh: null, buffers: null, stale: true };
    part.mesh = mesh;
    part.stale = true;
    this.parts.set(name, part);
  }

  render(gl, args) {
    const moving = this.onFrame ? this.onFrame() : false;
    if (moving && this.timer === null && this.map) {
      this.timer = setTimeout(() => {
        this.timer = null;
        this.map?.triggerRepaint();
      }, FRAME_MS);
    }
    if (!this.program || !this.origin || !(this.opacity > 0)) return;

    // Metres around the origin, into the map's own measure of the world: the
    // whole width of the Earth is 1, and north is towards 0.
    const main = args?.defaultProjectionData?.mainMatrix ?? args?.modelViewProjectionMatrix ?? args;
    if (!main || main.length !== 16) return;
    const latitude = (this.origin.lat * Math.PI) / 180;
    const unit = 1 / (EARTH_AROUND_METERS * Math.cos(latitude));
    const x = (this.origin.lng + 180) / 360;
    const y = (1 - Math.log(Math.tan(Math.PI / 4 + latitude / 2)) / Math.PI) / 2;
    const m = this.matrix;
    for (let row = 0; row < 4; row += 1) {
      m[row] = main[row] * unit;
      m[4 + row] = -main[4 + row] * unit;
      m[8 + row] = main[8 + row] * unit;
      m[12 + row] = main[row] * x + main[4 + row] * y + main[12 + row];
    }

    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.at.matrix, false, m);
    gl.uniform1f(this.at.opacity, this.opacity);
    gl.enableVertexAttribArray(this.at.pos);
    gl.enableVertexAttribArray(this.at.color);
    for (const part of this.parts.values()) {
      const mesh = part.mesh;
      if (!mesh || mesh.count === 0) continue;
      if (!part.buffers) part.buffers = { positions: gl.createBuffer(), colours: gl.createBuffer() };
      gl.bindBuffer(gl.ARRAY_BUFFER, part.buffers.positions);
      if (part.stale) gl.bufferData(gl.ARRAY_BUFFER, mesh.positions.subarray(0, mesh.count * 3), gl.DYNAMIC_DRAW);
      gl.vertexAttribPointer(this.at.pos, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, part.buffers.colours);
      if (part.stale) gl.bufferData(gl.ARRAY_BUFFER, mesh.colours.subarray(0, mesh.count * 4), gl.DYNAMIC_DRAW);
      gl.vertexAttribPointer(this.at.color, 4, gl.UNSIGNED_BYTE, true, 0, 0);
      part.stale = false;
      gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
    }
    gl.disableVertexAttribArray(this.at.pos);
    gl.disableVertexAttribArray(this.at.color);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }
}
