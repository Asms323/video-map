// Two layers the app draws for itself inside the map's 3D scene.
//
// SceneLayer: everything the app builds and lights for itself, placed in
// metres around an origin. It shares the buildings' depth, so a car behind
// a tower is hidden by it. Four kinds of thing are drawn:
//   - coloured triangles: the traffic, the trees, the bridges, the paint on
//     the roads;
//   - the walls of the buildings, whose every point is worked out where it
//     is drawn: its floor and bay, glass or wall, sun or shade;
//   - the roofs, which show the satellite photo of the ground they stand on;
//   - and, unseen, the picture the shadows are read from: the buildings as
//     the sun sees them (see shade.js).
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

const PRECISION = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif`;

// Whether a point is in a building's shadow. The picture of the shadows holds, for every spot of ground,
// how high the highest thing is on the ray of sunlight that lands there. A point is followed down its own
// ray to the ground, and is in shadow if the picture has something higher on that ray than the point
// itself. Four spots round the place are asked and weighed by how near they are, which softens the edge.
const SHADOW = `
uniform sampler2D u_shadow;
uniform vec4 u_shadowBox;   // the ground the picture covers: west, south, 1 / width, 1 / height (metres)
uniform vec3 u_shadowFall;  // how far a shadow falls for each metre of height: east, north; and the height the picture counts up to
uniform float u_shadowSize; // spots a side; 0 when there are no shadows
float shadowTop(vec2 at) {
  vec4 kept = texture2D(u_shadow, at);
  return (kept.r + kept.g / 255.0) * u_shadowFall.z;
}
float inShadow(vec3 point, float margin) {
  if (u_shadowSize < 1.0) return 0.0;
  vec2 at = (point.xy + point.z * u_shadowFall.xy - u_shadowBox.xy) * u_shadowBox.zw;
  if (at.x <= 0.0 || at.x >= 1.0 || at.y <= 0.0 || at.y >= 1.0) return 0.0;
  vec2 spot = at * u_shadowSize - 0.5;
  vec2 corner = floor(spot);
  vec2 part = spot - corner;
  vec2 first = (corner + 0.5) / u_shadowSize;
  float next = 1.0 / u_shadowSize;
  float high = point.z + margin;
  float a = step(high, shadowTop(first));
  float b = step(high, shadowTop(first + vec2(next, 0.0)));
  float c = step(high, shadowTop(first + vec2(0.0, next)));
  float d = step(high, shadowTop(first + vec2(next, next)));
  return mix(mix(a, b, part.x), mix(c, d, part.x), part.y);
}`;

// The colour a shadow leaves of what it falls on: as on the ground, where the map lays a dark blue over the photo.
const SHADOW_TINT = 'vec3(0.078, 0.102, 0.157)';
const SHADOW_DEPTH = '0.42';

const VERTEX = `
attribute vec3 a_pos;
attribute vec4 a_color;
uniform mat4 u_matrix;
uniform float u_opacity;
varying vec4 v_color;
varying vec3 v_world;
varying float v_solid;
void main() {
  v_color = a_color * u_opacity;
  v_world = a_pos;
  v_solid = a_color.a;
  gl_Position = u_matrix * vec4(a_pos, 1.0);
}`;

// Coloured triangles. Where a building's shadow falls they are darkened; and what is itself the shade of a
// car or a tree (dark and see-through) is not drawn there at all: in a shadow nothing throws another.
const FRAGMENT = `${PRECISION}
${SHADOW}
uniform float u_shaded; // whether this part of the scene takes shadows
varying vec4 v_color;
varying vec3 v_world;
varying float v_solid;
void main() {
  vec4 colour = v_color;
  if (u_shaded > 0.5) {
    float shadow = inShadow(v_world, 0.6);
    // (Told by being both see-through and dark; a car that is fading in is see-through too, but not dark.)
    float dark = max(colour.r, max(colour.g, colour.b)) / max(colour.a, 0.0001);
    if (v_solid < 0.5 && dark < 0.14) colour *= 1.0 - shadow;
    else colour.rgb = mix(colour.rgb, ${SHADOW_TINT} * colour.a, ${SHADOW_DEPTH} * shadow);
  }
  gl_FragColor = colour;
}`;

// A roof: each of its points is drawn where it stands, and shows the ground under it, found where that
// ground is on screen. (A roof at the bottom edge of the picture stands over ground that is off screen:
// there the picture is turned back on itself, which gives it more of the same roofs and yards.)
const ROOF_VERTEX = `
attribute vec3 a_pos;
uniform mat4 u_matrix;
varying vec4 v_ground;
varying vec3 v_world;
void main() {
  v_ground = u_matrix * vec4(a_pos.xy, 0.0, 1.0);
  v_world = a_pos;
  gl_Position = u_matrix * vec4(a_pos, 1.0);
}`;

const ROOF_FRAGMENT = `${PRECISION}
${SHADOW}
uniform sampler2D u_ground;
uniform float u_opacity;
varying vec4 v_ground;
varying vec3 v_world;
void main() {
  vec2 at = v_ground.xy / v_ground.w * 0.5 + 0.5;
  at = 1.0 - abs(1.0 - abs(at));
  vec3 colour = texture2D(u_ground, at).rgb;
  colour = mix(colour, ${SHADOW_TINT}, ${SHADOW_DEPTH} * inShadow(v_world, 0.5));
  gl_FragColor = vec4(colour * u_opacity, u_opacity);
}`;

// A wall. Each point of it knows where on its wall it is (how far along and how far up, in metres), how
// long and tall the wall is, which way it faces and what its building is like. From that the point's
// colour is worked out: the floor and the bay it lies in, whether it is glass or wall, the shade the
// window's reveal throws on the glass, the dark at the foot of the wall, and the light of sun and sky.
const WALL_VERTEX = `
attribute vec3 a_pos;
attribute vec4 a_surf;
attribute vec2 a_normal;
attribute vec4 a_tint;
uniform mat4 u_matrix;
varying vec4 v_surf;
varying vec2 v_normal;
varying vec4 v_tint;
varying vec3 v_world;
void main() {
  v_surf = a_surf;
  v_normal = a_normal;
  v_tint = a_tint;
  v_world = a_pos;
  gl_Position = u_matrix * vec4(a_pos, 1.0);
}`;

const WALL_FRAGMENT = `${PRECISION}
${SHADOW}
uniform vec3 u_sun;      // the way to the sun: east, north, up
uniform float u_day;     // 1 by day, 0 by night
uniform vec3 u_eye;      // the way to the eye
uniform float u_pixel;   // metres of wall to a pixel of the screen
uniform float u_top;     // how much of the top of a wall is roof and parapet, above the top floor
uniform float u_opacity;
varying vec4 v_surf;     // along the wall, up the wall, the wall's length, the wall's height
varying vec2 v_normal;
varying vec4 v_tint;     // the wall's colour; and the kind of front (x 64) with the building's own number
varying vec3 v_world;

float chance(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
// A soft-edged step: 0 below the edge and 1 above it, over a width.
float over(float edge, float width, float value) {
  return smoothstep(edge - width, edge + width, value);
}

void main() {
  float along = v_surf.x;
  float up = v_surf.y;
  float span = v_surf.z;
  float tall = v_surf.w;
  float style = floor(v_tint.a * 255.0 + 0.5);
  float kind = floor(style / 64.0);   // 0 a block, 1 a house, 2 a tower, 3 a block with shops at its foot
  float seed = style - kind * 64.0;   // the building's own number, 0 to 60
  float tower = step(1.5, kind) * step(kind, 2.5);
  float house = step(0.5, kind) * step(kind, 1.5);
  float shops = step(2.5, kind);
  vec3 wall = v_tint.rgb;
  // No wall is one flat colour: weather and repainting leave it a little uneven.
  wall *= 0.965 + 0.07 * chance(vec2(floor(along / 5.0) + seed, floor(up / 3.4)));

  // The front of the wall, or its back seen over the roof: the inside of the parapet.
  vec2 normal = normalize(v_normal);
  float front = step(0.0, dot(normal, u_eye.xy));
  vec2 facing = mix(-normal, normal, front);
  float towardsSun = dot(facing, u_sun.xy);
  float sunned = max(towardsSun, 0.0) * u_day;
  if (sunned > 0.0) sunned *= 1.0 - inShadow(v_world, 0.5);

  vec3 colour = wall;
  float floors = tall - u_top;
  if (front > 0.5) {
    // Towers are glass in a frame of metal, and the glass shows the sky: lighter the higher it is.
    vec3 glassTint = mix(vec3(0.36, 0.44, 0.54), mix(vec3(0.40, 0.54, 0.68), mix(vec3(0.42, 0.58, 0.60), vec3(0.58, 0.52, 0.44), step(40.0, seed)), step(20.0, seed)), tower);
    if (floors > 2.4 && span > 2.2 && up < floors) {
      float storey = mix(3.2, mix(3.4, 3.7, tower), step(0.5, kind) * step(kind, 2.5));
      float levels = max(floor(floors / storey + 0.4), 1.0);
      float each = floors / levels;
      float fy = up / each;
      float level = floor(fy);
      fy -= level;
      // At the foot of a block with shops: a shop to every six metres or so, glass from the pavement nearly to the floor above.
      float shopFloor = shops * step(level, 0.5) * step(1.5, levels);
      float bay = mix(mix(3.3, mix(4.0, 1.9, tower), step(0.5, kind) * step(kind, 2.5)), 6.0, shopFloor);
      float bays = max(floor(span / bay + 0.5), 1.0);
      float wide = span / bays;
      float fx = along / wide;
      float column = floor(fx);
      fx -= column;
      float pick = chance(vec2(column + seed * 3.7, level * 1.3 + floor(span * 2.0)));
      // The window's place in its bay: left, right, bottom, top.
      vec4 box = mix(vec4(0.22, 0.78, 0.26, 0.76), mix(vec4(0.31, 0.69, 0.30, 0.72), vec4(0.05, 0.95, 0.12, 0.90), tower), step(0.5, kind) * step(kind, 2.5));
      box = mix(box, vec4(0.05, 0.95, 0.02, 0.70), shopFloor);
      // A house does not have a window in every bay of every floor.
      float there = mix(1.0, step(0.22, pick), house);
      float gx = (fx - box.x) / (box.y - box.x);
      float gy = (fy - box.z) / (box.w - box.z);
      // (Edges are softened over a pixel, so that a window does not flicker as the map moves.)
      float softX = u_pixel / (wide * (box.y - box.x));
      float softY = u_pixel / (each * (box.w - box.z));
      float glass = over(0.0, softX, gx) * over(0.0, softX, 1.0 - gx) * over(0.0, softY, gy) * over(0.0, softY, 1.0 - gy) * there;

      // The glass: dark, with the sky in it, the lighter the higher; a blind or a curtain behind some.
      vec3 pane = glassTint * (0.40 + 0.50 * gy) * (0.82 + 0.36 * pick) * mix(1.0, 0.86 + 0.5 * up / tall, tower);
      pane = mix(pane, vec3(0.74, 0.71, 0.64) * (0.7 + 0.3 * gy), step(0.72, pick) * 0.55 * (1.0 - tower) * (1.0 - shopFloor));
      // The window is set back in the wall: its head and the side towards the sun throw a shade on the glass.
      float deep = mix(0.20, 0.45, shopFloor);
      float headShade = deep * u_sun.z / max(towardsSun, 0.18) / (each * (box.w - box.z));
      float sideways = dot(u_sun.xy, vec2(-normal.y, normal.x));
      float sideShade = deep * abs(sideways) / max(towardsSun, 0.18) / (wide * (box.y - box.x));
      float shaded = max(step(1.0 - min(headShade, 0.6), gy), sideways > 0.0 ? step(1.0 - min(sideShade, 0.5), gx) : step(gx, min(sideShade, 0.5)));
      pane *= 1.0 - 0.42 * shaded * step(0.001, sunned);
      // The sun in the glass: a glint where the pane throws its light straight at the eye.
      vec3 out3 = vec3(facing, 0.0);
      vec3 thrown = 2.0 * dot(u_sun, out3) * out3 - u_sun;
      pane += vec3(1.0, 0.96, 0.86) * pow(max(dot(thrown, u_eye), 0.0), 14.0) * mix(0.30, 0.85, tower) * step(0.001, sunned) * (1.0 - shaded);
      // A frame round the glass, and a bar across it.
      float frame = max(step(gx, 0.07) + step(0.93, gx), step(gy, 0.06) + step(0.94, gy));
      frame = max(frame, step(abs(gx - 0.5), mix(0.035, 0.012, shopFloor)) * (1.0 - tower));
      pane = mix(pane, wall * mix(0.86, 0.60, tower), min(frame, 1.0));
      // By night the glass is dark, but for the rooms with a light on.
      float lit = step(0.64, chance(vec2(column * 1.7 + seed, level * 2.3 + floor(span))));
      vec3 dark = mix(vec3(0.10, 0.12, 0.17), vec3(1.0, 0.82, 0.54) * (0.8 + 0.4 * pick), max(lit, shopFloor));
      pane = mix(dark * (1.0 - 0.6 * min(frame, 1.0)), pane, u_day);

      vec3 detailed = mix(wall, pane, glass);
      // The sill under the window, the line of each floor, and over a shop the board its name is on.
      detailed *= 1.0 + 0.07 * step(box.z - 0.045, fy) * step(fy, box.z) * step(box.x - 0.03, fx) * step(fx, box.y + 0.03) * there * (1.0 - tower) * (1.0 - shopFloor);
      detailed *= 1.0 - 0.07 * step(fy, 0.035) * step(0.5, level);
      vec3 board = mix(vec3(0.62, 0.20, 0.17), mix(vec3(0.16, 0.34, 0.58), mix(vec3(0.14, 0.44, 0.34), mix(vec3(0.85, 0.66, 0.18), vec3(0.90, 0.89, 0.86), step(0.8, pick)), step(0.6, pick)), step(0.4, pick)), step(0.2, pick));
      detailed = mix(detailed, board, shopFloor * step(0.74, fy) * step(fy, 0.95) * step(0.04, fx) * step(fx, 0.96));
      // Seen from so far off that a bay is a pixel or two, a wall is the even mixture of its wall and its glass.
      float cover = (box.y - box.x) * (box.w - box.z) * mix(1.0, 0.78, house);
      vec3 mean = mix(wall, mix(glassTint * 0.66, vec3(0.30, 0.27, 0.22), 1.0 - u_day), cover);
      colour = mix(mean, detailed, smoothstep(1.4, 3.6, wide / u_pixel));
    }
    // Where the floors end and roof and parapet begin: a line of shade; and a cap along the top.
    colour *= 1.0 - 0.10 * step(floors, up) * step(up, floors + 0.16);
    colour *= 1.0 + 0.05 * step(tall - 0.2, up);
    // The dark that gathers at the foot of a wall.
    colour *= mix(0.76, 1.0, smoothstep(0.0, 2.6, up));
  } else {
    colour *= 0.94;
  }

  // The light. By day: the sky from all round, a little more of it from the south-west, and the sun on
  // what faces it and is not in shadow. By night: an even light, as on the rest of the city.
  vec3 sky = vec3(0.60, 0.63, 0.70) * (0.95 + 0.10 * dot(facing, vec2(-0.6, -0.8)));
  vec3 sunlight = mix(vec3(1.0, 0.74, 0.48), vec3(1.0, 0.95, 0.86), smoothstep(0.1, 0.6, u_sun.z)) * 0.52;
  vec3 light = mix(vec3(0.80, 0.82, 0.88), sky + sunlight * sunned, u_day);
  gl_FragColor = vec4(min(colour * light, vec3(1.0)) * u_opacity, u_opacity);
}`;

// The picture the shadows are read from. Every corner of a building is put where the ray of sunlight
// through it lands on the ground, and of all that lands on one spot the highest is kept, with its height.
const CAST_VERTEX = `
attribute vec3 a_pos;
uniform vec4 u_box;  // west, south, 1 / width, 1 / height
uniform vec3 u_fall; // east and north for each metre of height; and the height counted up to
varying float v_height;
void main() {
  vec2 lands = (a_pos.xy + a_pos.z * u_fall.xy - u_box.xy) * u_box.zw;
  v_height = a_pos.z / u_fall.z;
  gl_Position = vec4(lands * 2.0 - 1.0, 1.0 - 2.0 * v_height, 1.0);
}`;

const CAST_FRAGMENT = `${PRECISION}
varying float v_height;
void main() {
  float height = clamp(v_height, 0.0, 0.99998) * 255.0;
  gl_FragColor = vec4(floor(height) / 255.0, fract(height), 0.0, 1.0);
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

/** Where a program keeps what it is told: its attributes and uniforms, by name. */
function places(gl, program, attributes, uniforms) {
  const at = {};
  for (const name of attributes) at[name] = gl.getAttribLocation(program, `a_${name}`);
  for (const name of uniforms) at[name] = gl.getUniformLocation(program, `u_${name}`);
  return at;
}

const SHADOW_UNIFORMS = ['shadow', 'shadowBox', 'shadowFall', 'shadowSize'];

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
    this.parts = new Map(); // name → { mesh, buffers, stale, shaded }
    this.roofs = { mesh: null, buffer: null, stale: true }; // the roofs, filled from the copy of the ground
    this.ground = null; // the GroundCopy they are filled from
    this.walls = { mesh: null, buffers: null, stale: true }; // the walls, worked out point by point
    // What the walls are lit and drawn by.
    this.sun = [0.4, -0.6, 0.7]; // the way to the sun: east, north, up
    this.day = 1; // 1 by day, 0 by night
    this.eye = [0, -0.8, 0.6]; // the way to the eye
    this.pixel = 1; // metres to a pixel of the screen
    this.wallTop = 0; // how much of the top of a wall is roof and parapet
    // The shadows: what throws them, and the picture they are read from.
    this.shadow = { casters: null, frame: null, stale: false, target: null, buffer: null, ready: false, drawn: 0 };
    this.map = null;
    this.program = null;
    this.roofProgram = null;
    this.wallProgram = null;
    this.castProgram = null;
    this.blank = null;
    this.timer = null;
    this.matrix = new Float32Array(16);
  }

  onAdd(map, gl) {
    this.map = map;
    this.build(gl);
  }

  /** Make what the scene keeps in the map's graphics memory: its programs. Everything drawn so far is sent there again. */
  build(gl) {
    this.program = link(gl, VERTEX, FRAGMENT);
    this.at = places(gl, this.program, ['pos', 'color'], ['matrix', 'opacity', 'shaded', ...SHADOW_UNIFORMS]);
    this.roofProgram = link(gl, ROOF_VERTEX, ROOF_FRAGMENT);
    this.roofAt = places(gl, this.roofProgram, ['pos'], ['matrix', 'opacity', 'ground', ...SHADOW_UNIFORMS]);
    this.wallProgram = link(gl, WALL_VERTEX, WALL_FRAGMENT);
    this.wallAt = places(gl, this.wallProgram, ['pos', 'surf', 'normal', 'tint'], ['matrix', 'opacity', 'sun', 'day', 'eye', 'pixel', 'top', ...SHADOW_UNIFORMS]);
    this.castProgram = link(gl, CAST_VERTEX, CAST_FRAGMENT);
    this.castAt = places(gl, this.castProgram, ['pos'], ['box', 'fall']);
    // Shadows are worked out in metres over kilometres of ground: too fine a sum for a device that counts coarsely.
    const fine = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
    this.shadow.able = Boolean(fine && fine.precision > 0);
    this.shadow.most = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE) || 1024, 2048);
    // Something for the shadows to be read from while there are none.
    this.blank = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.blank);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.bindTexture(gl.TEXTURE_2D, null);
    // Whatever was drawn before the map changed its style is sent to the new one.
    for (const part of this.parts.values()) {
      part.buffers = null;
      part.stale = true;
    }
    this.roofs.buffer = null;
    this.roofs.stale = true;
    this.walls.buffers = null;
    this.walls.stale = true;
    this.shadow.target = null;
    this.shadow.buffer = null;
    this.shadow.ready = false;
    this.shadow.stale = true;
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
    if (this.walls.buffers) for (const buffer of Object.values(this.walls.buffers)) gl.deleteBuffer(buffer);
    this.walls.buffers = null;
    const target = this.shadow.target;
    if (target) {
      gl.deleteFramebuffer(target.frame);
      gl.deleteTexture(target.picture);
      gl.deleteRenderbuffer(target.depth);
    }
    if (this.shadow.buffer) gl.deleteBuffer(this.shadow.buffer);
    this.shadow.target = null;
    this.shadow.buffer = null;
    this.shadow.ready = false;
    if (this.blank) gl.deleteTexture(this.blank);
    this.blank = null;
    for (const name of ['program', 'roofProgram', 'wallProgram', 'castProgram']) {
      if (this[name]) gl.deleteProgram(this[name]);
      this[name] = null;
    }
    this.map = null;
  }

  /** The place the meshes are measured from: { lng, lat }. */
  setOrigin(origin) {
    this.origin = origin ? { lng: origin.lng, lat: origin.lat } : null;
  }

  /** Give a named part of the scene its triangles (see Mesh in life.js). shaded: false for a part that takes no shadows. */
  set(name, mesh, { shaded = true } = {}) {
    const part = this.parts.get(name) ?? { mesh: null, buffers: null, stale: true, shaded: true };
    part.mesh = mesh;
    part.stale = true;
    part.shaded = shaded;
    this.parts.set(name, part);
  }

  /** Give the scene its roofs: a RoofMesh (see roofs.js), or one that is empty for none. */
  setRoofs(mesh) {
    this.roofs.mesh = mesh;
    this.roofs.stale = true;
    if (this.ground) this.ground.wanted = Boolean(mesh && mesh.count > 0);
  }

  /** Give the scene its walls: a WallMesh (see walls.js), or one that is empty for none. */
  setWalls(mesh) {
    this.walls.mesh = mesh;
    this.walls.stale = true;
  }

  /**
   * Give the scene what throws the shadows: a CasterMesh, and
   * { box: [west, south, east, north], top, fall: [east, north] } as
   * shadowCasters() and shadowFall() give them (see shade.js). Without a
   * frame there are no shadows.
   */
  setShadows(casters, frame) {
    this.shadow.casters = casters;
    this.shadow.frame = frame && casters && casters.count > 0 ? frame : null;
    this.shadow.stale = true;
    if (!this.shadow.frame) this.shadow.ready = false;
  }

  /** Before the map's own picture is begun: draw the picture of the shadows, if what throws them has changed. */
  prerender(gl) {
    const shadow = this.shadow;
    if (!this.castProgram || gl.isContextLost()) return;
    if (!gl.isProgram(this.castProgram)) this.build(gl); // the graphics memory was taken away and handed back empty
    if (!shadow.stale) return;
    shadow.stale = false;
    shadow.ready = false;
    const { casters, frame } = shadow;
    if (!shadow.able || !frame || !casters || casters.count === 0) return;
    const [west, south, east, north] = frame.box;
    if (!(east > west && north > south && frame.top > 0)) return;
    const size = Math.min(frame.size || 1024, shadow.most);

    let target = shadow.target;
    if (!target || target.size !== size || !gl.isFramebuffer(target.frame)) {
      if (target) {
        gl.deleteFramebuffer(target.frame);
        gl.deleteTexture(target.picture);
        gl.deleteRenderbuffer(target.depth);
      }
      const picture = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, picture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindTexture(gl.TEXTURE_2D, null);
      const depth = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, size, size);
      gl.bindRenderbuffer(gl.RENDERBUFFER, null);
      const made = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, made);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, picture, 0);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
      const whole = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      target = { frame: made, picture, depth, size };
      shadow.target = target;
      if (!whole) {
        shadow.able = false; // this device cannot keep such a picture: it goes without these shadows
        return;
      }
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, target.frame);
    gl.viewport(0, 0, size, size);
    gl.disable(gl.BLEND);
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.STENCIL_TEST);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
    gl.depthRange(0, 1);
    gl.colorMask(true, true, true, true);
    gl.clearColor(0, 0, 0, 1);
    gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.castProgram);
    gl.uniform4f(this.castAt.box, west, south, 1 / (east - west), 1 / (north - south));
    gl.uniform3f(this.castAt.fall, frame.fall[0], frame.fall[1], frame.top);
    if (!shadow.buffer) shadow.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, shadow.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, casters.positions.subarray(0, casters.count * 3), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(this.castAt.pos);
    gl.vertexAttribPointer(this.castAt.pos, 3, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, casters.count);
    gl.disableVertexAttribArray(this.castAt.pos);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    shadow.ready = true;
    shadow.drawn += 1;
    shadow.using = { box: [west, south, east, north], fall: [frame.fall[0], frame.fall[1]], top: frame.top, size };
  }

  /** Tell a program where the shadows are to be read from. */
  shadowsFor(gl, at) {
    const shadow = this.shadow;
    const ready = shadow.ready && shadow.target && gl.isTexture(shadow.target.picture);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, ready ? shadow.target.picture : this.blank);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(at.shadow, 1);
    if (ready && this.day > 0) {
      const { box, fall, top, size } = shadow.using;
      gl.uniform4f(at.shadowBox, box[0], box[1], 1 / (box[2] - box[0]), 1 / (box[3] - box[1]));
      gl.uniform3f(at.shadowFall, fall[0], fall[1], top);
      gl.uniform1f(at.shadowSize, size);
    } else {
      gl.uniform1f(at.shadowSize, 0);
    }
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

    // The walls first: they stand a hand's breadth outside the blocks the map has drawn, and are drawn a
    // touch nearer still, so that it is they that show.
    const walls = this.walls.mesh;
    if (walls && walls.count > 0) {
      const at = this.wallAt;
      gl.disable(gl.CULL_FACE);
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(-1, -3);
      gl.useProgram(this.wallProgram);
      gl.uniformMatrix4fv(at.matrix, false, m);
      gl.uniform1f(at.opacity, this.opacity);
      gl.uniform3f(at.sun, this.sun[0], this.sun[1], this.sun[2]);
      gl.uniform1f(at.day, this.day);
      gl.uniform3f(at.eye, this.eye[0], this.eye[1], this.eye[2]);
      gl.uniform1f(at.pixel, this.pixel);
      gl.uniform1f(at.top, this.wallTop);
      this.shadowsFor(gl, at);
      if (!this.walls.buffers) this.walls.buffers = { positions: gl.createBuffer(), surfaces: gl.createBuffer(), normals: gl.createBuffer(), tints: gl.createBuffer() };
      const buffers = this.walls.buffers;
      const send = (buffer, where, data, size, type, normalised) => {
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        if (this.walls.stale) gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, walls.count * size), gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(where);
        gl.vertexAttribPointer(where, size, type, normalised, 0, 0);
      };
      send(buffers.positions, at.pos, walls.positions, 3, gl.FLOAT, false);
      send(buffers.surfaces, at.surf, walls.surfaces, 4, gl.FLOAT, false);
      send(buffers.normals, at.normal, walls.normals, 2, gl.FLOAT, false);
      send(buffers.tints, at.tint, walls.tints, 4, gl.UNSIGNED_BYTE, true);
      this.walls.stale = false;
      gl.drawArrays(gl.TRIANGLES, 0, walls.count);
      for (const where of [at.pos, at.surf, at.normal, at.tint]) gl.disableVertexAttribArray(where);
      gl.disable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(0, 0);
    }

    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.at.matrix, false, m);
    gl.uniform1f(this.at.opacity, this.opacity);
    this.shadowsFor(gl, this.at);
    gl.enableVertexAttribArray(this.at.pos);
    gl.enableVertexAttribArray(this.at.color);
    for (const part of this.parts.values()) {
      const mesh = part.mesh;
      if (!mesh || mesh.count === 0) continue;
      gl.uniform1f(this.at.shaded, part.shaded ? 1 : 0);
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
      this.shadowsFor(gl, this.roofAt);
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
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }
}
