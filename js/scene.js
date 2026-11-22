// Two layers the app draws for itself inside the map's 3D scene.
//
// SceneLayer: coloured triangles placed in metres around an origin. The
// traffic is drawn with it, the trees, the bridges. It shares the buildings'
// depth, so a car behind a tower is hidden by it. It also draws the roofs,
// which show the satellite photo of the ground they stand on.
//
// GroundCopy: put right above the photo of the ground, it keeps a copy of the
// picture as it is at that moment, with nothing but the ground in it. That
// copy is what the roofs are filled from: each point of a roof shows the
// ground straight beneath it, exactly as sharp and as toned as the ground
// beside the building is on screen, at no cost in downloads.

const EARTH_AROUND_METERS = 40075016.686;
const FRAME_MS = 33; // about 30 pictures a second is smooth enough, and easier on the battery
// After the ground has changed without the view moving (photo tiles coming in and fading in), it is copied afresh for this long.
const GROUND_SETTLES_MS = 900;

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

// A roof: each of its points is drawn where it stands, and shows the ground under it, found where that
// ground is on screen. (A roof at the bottom edge of the picture stands over ground that is off screen:
// there the picture is turned back on itself, which gives it more of the same roofs and yards.)
const ROOF_VERTEX = `
attribute vec3 a_pos;
uniform mat4 u_matrix;
varying vec4 v_ground;
void main() {
  v_ground = u_matrix * vec4(a_pos.xy, 0.0, 1.0);
  gl_Position = u_matrix * vec4(a_pos, 1.0);
}`;

const ROOF_FRAGMENT = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D u_ground;
uniform float u_opacity;
varying vec4 v_ground;
void main() {
  vec2 at = v_ground.xy / v_ground.w * 0.5 + 0.5;
  at = 1.0 - abs(1.0 - abs(at));
  gl_FragColor = vec4(texture2D(u_ground, at).rgb * u_opacity, u_opacity);
}`;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || 'shader did not compile');
  return shader;
}

function link(gl, vertex, fragment) {
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, vertex));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fragment));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'program did not link');
  return program;
}

export class GroundCopy {
  constructor(id) {
    this.id = id;
    this.type = 'custom';
    this.renderingMode = '2d';
    this.texture = null;
    this.width = 0;
    this.height = 0;
    this.copies = 0; // how many times the picture has been copied, for anyone counting
    this.view = new Float32Array(16); // the view the copy in hand was made of
    this.freshUntil = 0;
    this.wanted = true; // nobody needs the copy when no roof is filled from it
    this.kept = false; // whether the copy in hand was made while it was wanted, and so has been kept up
  }

  onAdd() {
    this.texture = null;
    this.width = 0;
    this.height = 0;
  }

  onRemove(_map, gl) {
    if (this.texture) gl.deleteTexture(this.texture);
    this.texture = null;
  }

  /** The ground is changing without the view moving: copy it afresh for a while. */
  touch() {
    this.freshUntil = performance.now() + GROUND_SETTLES_MS;
  }

  render(gl, args) {
    if (!this.wanted || gl.isContextLost()) {
      this.kept = false;
      return;
    }
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    if (!(width > 0 && height > 0)) return;
    // The copy in hand still shows the ground as it is, unless the view has moved or the ground has changed.
    const main = args?.defaultProjectionData?.mainMatrix ?? args?.modelViewProjectionMatrix ?? args;
    let moved = !this.kept || !this.texture || !gl.isTexture(this.texture) || this.width !== width || this.height !== height || performance.now() < this.freshUntil;
    this.kept = true;
    if (main && main.length === 16) {
      for (let i = 0; i < 16; i += 1) {
        if (this.view[i] !== main[i]) {
          moved = true;
          this.view[i] = main[i];
        }
      }
    } else {
      moved = true;
    }
    if (!moved) return;

    gl.activeTexture(gl.TEXTURE0);
    if (!this.texture || !gl.isTexture(this.texture)) {
      // (Gone with the graphics memory, if the phone took that away in the background.)
      this.texture = gl.createTexture();
      this.width = 0;
    }
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    if (this.width !== width || this.height !== height) {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.copyTexImage2D(gl.TEXTURE_2D, 0, gl.RGB, 0, 0, width, height, 0);
      this.width = width;
      this.height = height;
    } else {
      gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, width, height);
    }
    gl.bindTexture(gl.TEXTURE_2D, null);
    this.copies += 1;
  }
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
    this.roofs = { mesh: null, buffer: null, stale: true }; // the roofs, filled from the copy of the ground
    this.ground = null; // the GroundCopy they are filled from
    this.map = null;
    this.program = null;
    this.roofProgram = null;
    this.timer = null;
    this.matrix = new Float32Array(16);
  }

  onAdd(map, gl) {
    this.map = map;
    this.build(gl);
  }

  /** Make what the scene keeps in the map's graphics memory: its two programs. Everything drawn so far is sent there again. */
  build(gl) {
    this.program = link(gl, VERTEX, FRAGMENT);
    this.at = {
      pos: gl.getAttribLocation(this.program, 'a_pos'),
      color: gl.getAttribLocation(this.program, 'a_color'),
      matrix: gl.getUniformLocation(this.program, 'u_matrix'),
      opacity: gl.getUniformLocation(this.program, 'u_opacity'),
    };
    this.roofProgram = link(gl, ROOF_VERTEX, ROOF_FRAGMENT);
    this.roofAt = {
      pos: gl.getAttribLocation(this.roofProgram, 'a_pos'),
      matrix: gl.getUniformLocation(this.roofProgram, 'u_matrix'),
      opacity: gl.getUniformLocation(this.roofProgram, 'u_opacity'),
      ground: gl.getUniformLocation(this.roofProgram, 'u_ground'),
    };
    // Whatever was drawn before the map changed its style is sent to the new one.
    for (const part of this.parts.values()) {
      part.buffers = null;
      part.stale = true;
    }
    this.roofs.buffer = null;
    this.roofs.stale = true;
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
    if (this.roofs.buffer) gl.deleteBuffer(this.roofs.buffer);
    this.roofs.buffer = null;
    if (this.program) gl.deleteProgram(this.program);
    if (this.roofProgram) gl.deleteProgram(this.roofProgram);
    this.program = null;
    this.roofProgram = null;
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

  /** Give the scene its roofs: a RoofMesh (see roofs.js), or one that is empty for none. */
  setRoofs(mesh) {
    this.roofs.mesh = mesh;
    this.roofs.stale = true;
    if (this.ground) this.ground.wanted = Boolean(mesh && mesh.count > 0);
  }

  render(gl, args) {
    // A phone may take the graphics memory away while the app is in the background, and hand back an empty
    // one. What the scene had built there is then gone: it is built again.
    if (this.program && !gl.isContextLost() && !gl.isProgram(this.program)) this.build(gl);
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

    // The roofs, filled from the copy of the ground. Until that copy is there they are left out, and the
    // plain roofs the map draws show.
    const roofs = this.roofs.mesh;
    const ground = this.ground?.texture;
    if (roofs && roofs.count > 0 && ground && gl.isTexture(ground)) {
      // A roof lies on the slab the map draws on top of its building: it is drawn a touch nearer, so that the two do not flicker.
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(-2, -6);
      gl.useProgram(this.roofProgram);
      gl.uniformMatrix4fv(this.roofAt.matrix, false, m);
      gl.uniform1f(this.roofAt.opacity, this.opacity);
      gl.uniform1i(this.roofAt.ground, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, ground);
      gl.enableVertexAttribArray(this.roofAt.pos);
      if (!this.roofs.buffer) this.roofs.buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.roofs.buffer);
      if (this.roofs.stale) gl.bufferData(gl.ARRAY_BUFFER, roofs.positions.subarray(0, roofs.count * 3), gl.DYNAMIC_DRAW);
      gl.vertexAttribPointer(this.roofAt.pos, 3, gl.FLOAT, false, 0, 0);
      this.roofs.stale = false;
      gl.drawArrays(gl.TRIANGLES, 0, roofs.count);
      gl.disableVertexAttribArray(this.roofAt.pos);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.disable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(0, 0);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }
}
