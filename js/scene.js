// A layer the app draws for itself inside the map's 3D scene: coloured
// triangles placed in metres around an origin. The traffic is drawn with it.
// It shares the buildings' depth, so a car behind a tower is hidden by it.
// Some of its triangles show a picture instead of a colour: the roofs, cut
// out of the satellite photo.

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

// Triangles that show a picture. The picture is toned the way the map tones
// the photo on the ground, so a roof and the yard beside it belong together.
const PHOTO_VERTEX = `
attribute vec3 a_pos;
attribute vec2 a_place;
uniform mat4 u_matrix;
varying vec2 v_place;
void main() {
  v_place = a_place;
  gl_Position = u_matrix * vec4(a_pos, 1.0);
}`;

const PHOTO_FRAGMENT = `
precision mediump float;
uniform sampler2D u_photo;
uniform float u_opacity;
uniform vec4 u_look; // how strongly the photo shows, how far it is greyed, its contrast, its darkest tone
uniform vec3 u_ground; // what shows through where it is not at full strength
varying vec2 v_place;
void main() {
  vec3 rgb = texture2D(u_photo, v_place).rgb;
  float average = (rgb.r + rgb.g + rgb.b) / 3.0;
  rgb += (average - rgb) * u_look.y;
  rgb = (rgb - 0.5) * u_look.z + 0.5;
  rgb = mix(vec3(u_look.w), vec3(1.0), rgb);
  rgb = mix(u_ground, rgb, u_look.x);
  gl_FragColor = vec4(rgb * u_opacity, u_opacity);
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
   * onLost(): called when the pictures handed over with setPhoto() are gone
   * from the map and have to be handed over again (see render).
   */
  constructor(id, { onFrame, onLost } = {}) {
    this.id = id;
    this.type = 'custom';
    this.renderingMode = '3d';
    this.onFrame = onFrame;
    this.onLost = onLost;
    this.origin = null;
    this.opacity = 1;
    this.parts = new Map(); // name → { mesh, buffers, stale }
    this.photos = new Map(); // name → { mesh, picture, buffers, texture, stale, fresh }
    // How a picture is toned: { strength, grey, contrast, low, ground: [red, green, blue] }, each from 0 to 1.
    this.look = { strength: 1, grey: 0, contrast: 1, low: 0, ground: [1, 1, 1] };
    this.map = null;
    this.program = null;
    this.photoProgram = null;
    this.timer = null;
    this.matrix = new Float32Array(16);
  }

  onAdd(map, gl) {
    this.map = map;
    this.build(gl);
  }

  /** Make what the scene keeps in the map's graphics memory: its two programs. Everything drawn so far is sent there again. */
  build(gl) {
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
    const photo = gl.createProgram();
    gl.attachShader(photo, compile(gl, gl.VERTEX_SHADER, PHOTO_VERTEX));
    gl.attachShader(photo, compile(gl, gl.FRAGMENT_SHADER, PHOTO_FRAGMENT));
    gl.linkProgram(photo);
    if (!gl.getProgramParameter(photo, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(photo) || 'program did not link');
    this.photoProgram = photo;
    this.photoAt = {
      pos: gl.getAttribLocation(photo, 'a_pos'),
      place: gl.getAttribLocation(photo, 'a_place'),
      matrix: gl.getUniformLocation(photo, 'u_matrix'),
      opacity: gl.getUniformLocation(photo, 'u_opacity'),
      photo: gl.getUniformLocation(photo, 'u_photo'),
      look: gl.getUniformLocation(photo, 'u_look'),
      ground: gl.getUniformLocation(photo, 'u_ground'),
    };
    // Whatever was drawn before the map changed its style is sent to the new one.
    for (const part of this.parts.values()) {
      part.buffers = null;
      part.stale = true;
    }
    // (A picture is let go of once the map has it. Its owner hands it over again after a change of style.)
    for (const part of this.photos.values()) {
      part.buffers = null;
      part.texture = null;
      part.stale = true;
      part.fresh = true;
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
    for (const part of this.photos.values()) {
      if (part.buffers) {
        gl.deleteBuffer(part.buffers.positions);
        gl.deleteBuffer(part.buffers.places);
      }
      if (part.texture) gl.deleteTexture(part.texture);
      part.buffers = null;
      part.texture = null;
    }
    if (this.program) gl.deleteProgram(this.program);
    if (this.photoProgram) gl.deleteProgram(this.photoProgram);
    this.program = null;
    this.photoProgram = null;
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

  /**
   * Give a named part of the scene triangles that show a picture: a PhotoMesh
   * (see roofs.js) and the picture it is cut from, { size, data } with its
   * pixels as red, green, blue, alpha in a square `size` a side. Without a
   * new picture the part keeps the one it has. The picture's pixels are let
   * go of once the map has taken them.
   */
  setPhoto(name, mesh, picture) {
    const part = this.photos.get(name) ?? { mesh: null, picture: null, buffers: null, texture: null, stale: true, fresh: false };
    part.mesh = mesh;
    part.stale = true;
    if (picture) {
      part.picture = picture;
      part.fresh = true;
    }
    this.photos.set(name, part);
  }

  render(gl, args) {
    // A phone may take the graphics memory away while the app is in the background, and hand back an empty
    // one. What the scene had built there is then gone: it is built again, and the pictures asked for anew.
    if (this.program && !gl.isContextLost() && !gl.isProgram(this.program)) {
      this.build(gl);
      this.onLost?.();
    }
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

    // The parts that show a picture.
    let photoReady = false;
    for (const part of this.photos.values()) {
      const mesh = part.mesh;
      if (!mesh || mesh.count === 0) continue;
      if (part.fresh && part.picture?.data) {
        // The picture goes to the map once; smaller copies of it are made for when it is seen from afar.
        if (!part.texture) part.texture = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, part.texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, part.picture.size, part.picture.size, 0, gl.RGBA, gl.UNSIGNED_BYTE, part.picture.data);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        part.picture = { size: part.picture.size, data: null };
        part.fresh = false;
      }
      if (!part.texture) continue;
      if (!photoReady) {
        photoReady = true;
        // A roof lies on the slab the map draws on top of its building: it is drawn a touch nearer, so that the two do not flicker.
        gl.enable(gl.POLYGON_OFFSET_FILL);
        gl.polygonOffset(-2, -6);
        gl.useProgram(this.photoProgram);
        gl.uniformMatrix4fv(this.photoAt.matrix, false, m);
        gl.uniform1f(this.photoAt.opacity, this.opacity);
        gl.uniform1i(this.photoAt.photo, 0);
        gl.uniform4f(this.photoAt.look, this.look.strength, this.look.grey, this.look.contrast, this.look.low);
        gl.uniform3f(this.photoAt.ground, this.look.ground[0], this.look.ground[1], this.look.ground[2]);
        gl.enableVertexAttribArray(this.photoAt.pos);
        gl.enableVertexAttribArray(this.photoAt.place);
        gl.activeTexture(gl.TEXTURE0);
      }
      gl.bindTexture(gl.TEXTURE_2D, part.texture);
      if (!part.buffers) part.buffers = { positions: gl.createBuffer(), places: gl.createBuffer() };
      gl.bindBuffer(gl.ARRAY_BUFFER, part.buffers.positions);
      if (part.stale) gl.bufferData(gl.ARRAY_BUFFER, mesh.positions.subarray(0, mesh.count * 3), gl.DYNAMIC_DRAW);
      gl.vertexAttribPointer(this.photoAt.pos, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, part.buffers.places);
      if (part.stale) gl.bufferData(gl.ARRAY_BUFFER, mesh.places.subarray(0, mesh.count * 2), gl.DYNAMIC_DRAW);
      gl.vertexAttribPointer(this.photoAt.place, 2, gl.FLOAT, false, 0, 0);
      part.stale = false;
      gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
    }
    if (photoReady) {
      gl.disable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(0, 0);
      gl.disableVertexAttribArray(this.photoAt.pos);
      gl.disableVertexAttribArray(this.photoAt.place);
      gl.bindTexture(gl.TEXTURE_2D, null);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }
}
