// The layer the app draws for itself inside the map's 3D scene: everything
// it builds and lights for itself, placed in metres around an origin. It
// shares the buildings' depth, so a car behind a tower is hidden by it. Four
// kinds of thing are drawn:
//   - the walls of the buildings, whose every point is worked out where it
//     is drawn: its floor and bay, glass or wall, sun or shade;
//   - the roofs, worked out the same way: slabs, gravel or sheet in the
//     roof's own colour, in the sun or in a neighbour's shadow;
//   - coloured triangles: the traffic, the trees, the bridges, the paint on
//     the roads, what stands on the roofs;
//   - and, unseen, the picture the shadows are read from: the buildings as
//     the sun sees them (see shade.js).

import { lampsLit } from './lib.js';

const EARTH_AROUND_METERS = 40075016.686;
const FRAME_MS = 33; // about 30 pictures a second is smooth enough, and easier on the battery

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

// The colour a shadow leaves of what it falls on: as on the ground, where the map lays a dark blue over it.
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

// What is left of a colour by night, away from any lamp: little, and bluer.
const NIGHT_TINT = 'vec3(0.23, 0.26, 0.36)';

// Coloured triangles. Where a building's shadow falls they are darkened; and what is itself shade (of a
// car, a tree, a parapet, a tank on a roof: dark and see-through) is not drawn there at all: in a shadow
// nothing throws another. By night they are dark, all but what gives light of its own (a lamp and the
// pool of light under it, a headlight): that is drawn as it is, once the lamps are on, and not at all by day.
const FRAGMENT = `${PRECISION}
${SHADOW}
uniform float u_shaded; // whether this part of the scene takes shadows
uniform float u_night;  // 0 by day, 1 by night, in between at dusk and dawn
uniform float u_lamps;  // how far the lamps are on: 0 by day, 1 by night
uniform float u_glow;   // 1 for a part that gives light of its own
varying vec4 v_color;
varying vec3 v_world;
varying float v_solid;
void main() {
  vec4 colour = v_color;
  if (u_glow > 0.5) {
    gl_FragColor = colour * u_lamps;
    return;
  }
  if (u_shaded > 0.5) {
    float shadow = inShadow(v_world, 0.6);
    // (Told by being both see-through and dark; a car that is fading in is see-through too, but not dark.)
    float dark = max(colour.r, max(colour.g, colour.b)) / max(colour.a, 0.0001);
    if (v_solid < 0.5 && dark < 0.14) colour *= 1.0 - shadow;
    else colour.rgb = mix(colour.rgb, ${SHADOW_TINT} * colour.a, ${SHADOW_DEPTH} * shadow);
  }
  colour.rgb *= mix(vec3(1.0), ${NIGHT_TINT}, u_night);
  gl_FragColor = colour;
}`;

// A roof. Each point of it knows where on its roof it is (metres along the building and across it), its
// roof's colour and what the roof is covered with. From that the point's colour is worked out: the slabs
// and the joints between them, the grain of gravel or the ribs of metal sheet, each fading out as it
// becomes too fine for the screen; then the light of sun and sky, less the sun where a neighbour's
// shadow falls.
const ROOF_VERTEX = `
attribute vec3 a_pos;
attribute vec2 a_lay;
attribute vec4 a_tint;
uniform mat4 u_matrix;
varying vec3 v_world;
varying vec2 v_lay;
varying vec4 v_tint;
void main() {
  v_world = a_pos;
  v_lay = a_lay;
  v_tint = a_tint;
  gl_Position = u_matrix * vec4(a_pos, 1.0);
}`;

const ROOF_FRAGMENT = `${PRECISION}
${SHADOW}
uniform vec3 u_sun;      // the way to the sun: east, north, up
uniform float u_day;     // 1 while the sun is up, 0 once it is down
uniform float u_night;   // 0 by day, 1 by night, in between at dusk and dawn
uniform float u_pixel;   // metres of roof to a pixel of the screen
uniform float u_opacity;
varying vec3 v_world;
varying vec2 v_lay;      // along the building and across it, in metres from its middle
varying vec4 v_tint;     // the roof's colour; and its covering (x 64) with the building's own number

float chance(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
// A line along the edges of squares a unit across: 1 on the line, 0 off it, as wide as told (in units).
float lines(float value, float wide) {
  return 1.0 - smoothstep(0.0, wide, 0.5 - abs(fract(value) - 0.5));
}

void main() {
  float style = floor(v_tint.a * 255.0 + 0.5);
  float kind = floor(style / 64.0);   // 0 slabs of concrete, 1 gravel, 2 metal sheet
  float seed = style - kind * 64.0;
  float gravel = step(0.5, kind) * step(kind, 1.5);
  float sheet = step(1.5, kind);
  vec3 colour = v_tint.rgb;
  // A roof is laid and mended a piece at a time, and no two pieces weather alike: seen from close by.
  // (Sheet comes all of a piece.)
  colour *= 1.0 + (0.07 * chance(floor(v_lay / vec2(6.4, 4.8)) + seed) - 0.035) * (1.0 - sheet) * (1.0 - 0.6 * smoothstep(0.15, 0.4, u_pixel));
  // A line no wider than a pixel is drawn a pixel wide and as much fainter.
  float thin = 0.75 * u_pixel;
  // Slabs: a joint every few metres, both ways. Sheet: a rib every metre, along the building.
  float jointWide = max(0.05, thin);
  float joints = max(lines(v_lay.x / 3.2, jointWide / 3.2), lines(v_lay.y / 3.2, jointWide / 3.2)) * min(0.05 / thin, 1.0);
  float ribWide = max(0.04, thin);
  float ribs = lines(v_lay.y / 1.1, ribWide / 1.1) * min(0.04 / thin, 1.0);
  colour *= 1.0 - 0.14 * mix(joints * (1.0 - gravel), ribs, sheet);
  // Gravel: greyer, and grainy from close by.
  vec3 grey = vec3(dot(colour, vec3(0.3333)));
  float grain = chance(floor(v_lay / 0.3) + seed) - 0.5;
  colour = mix(colour, mix(colour, grey, 0.3) * (0.97 + 0.07 * grain * (1.0 - smoothstep(0.05, 0.16, u_pixel))), gravel);

  // The light: the whole sky, and the sun by how high it stands, unless a neighbour is in its way.
  float sunned = max(u_sun.z, 0.0) * u_day;
  if (sunned > 0.0) sunned *= 1.0 - inShadow(v_world, 0.5);
  vec3 sky = vec3(0.63, 0.66, 0.73);
  vec3 sunlight = mix(vec3(1.0, 0.74, 0.48), vec3(1.0, 0.95, 0.86), smoothstep(0.1, 0.6, u_sun.z)) * 0.5;
  vec3 light = mix(vec3(0.80, 0.82, 0.88), sky + sunlight * sunned, u_day);
  // By night no lamp shines on a roof: it has what light the sky over a lit city gives, little and blue.
  light = mix(light, vec3(0.15, 0.175, 0.26), u_night);
  gl_FragColor = vec4(min(colour * light, vec3(1.0)) * u_opacity, u_opacity);
}`;

// A wall. Each point of it knows where on its wall it is (how far along and how far up, in metres), how
// long and tall the wall is, which way it faces and what its building is like. From that the point's
// colour is worked out: the floor and the bay it lies in, whether it is glass or wall, the shade the
// window's reveal throws on the glass, the dark at the foot of the wall, and the light of sun and sky.
// By night the same working-out gives the city its lights: which rooms have a lamp on and of what
// colour, the shops lit from end to end under their boards, a band of light round the top of a tower,
// and on the foot of every wall the light of the street lamps.
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
uniform float u_day;     // 1 while the sun is up, 0 once it is down
uniform float u_night;   // 0 by day, 1 by night, in between at dusk and dawn
uniform float u_lamps;   // how far the lamps are on: 0 by day, 1 by night
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
  vec3 glow = vec3(0.0); // the light a point of the wall gives of its own, by night
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

      // By night: the rooms with a lamp on. One in three or so; fewer in a tower of offices, where now
      // and then a whole floor is lit; and a shop is lit from end to end.
      float room = chance(vec2(column * 1.7 + seed, level * 2.3 + floor(span)));
      float share = mix(mix(0.33, 0.40, house), 0.20, tower);
      float on = step(1.0 - share, room);
      on = max(on, tower * step(0.88, chance(vec2(level * 0.61 + seed, seed * 0.37))) * step(0.3, room));
      // No two lamps are alike: most are warm, some white, a few the blue of a screen. Offices are white.
      vec3 lamp = mix(vec3(1.0, 0.78, 0.48), mix(vec3(1.0, 0.92, 0.78), vec3(0.72, 0.84, 1.0), step(0.93, pick)), step(0.62, pick));
      lamp = mix(lamp, vec3(0.92, 0.96, 1.0), tower * 0.75);
      // (Behind a curtain, where by day there is a blind, a lamp is dimmer.)
      vec3 roomLight = lamp * (0.55 + 0.6 * fract(pick * 7.3)) * on * mix(1.0, 0.62, step(0.72, pick) * (1.0 - tower));
      vec3 shopLight = vec3(1.0, 0.90, 0.72);
      vec3 through = mix(roomLight, shopLight, shopFloor) * (1.0 - 0.8 * min(frame, 1.0)) * (0.85 + 0.3 * gy);
      // The glass of a tower gives back the lights of the streets below it, the lower the more.
      through += vec3(1.0, 0.66, 0.36) * 0.10 * exp(-up / 45.0) * tower;
      vec3 lights = through * glass;

      vec3 detailed = mix(wall, pane, glass);
      // The sill under the window, the line of each floor, and over a shop the board its name is on.
      detailed *= 1.0 + 0.07 * step(box.z - 0.045, fy) * step(fy, box.z) * step(box.x - 0.03, fx) * step(fx, box.y + 0.03) * there * (1.0 - tower) * (1.0 - shopFloor);
      detailed *= 1.0 - 0.07 * step(fy, 0.035) * step(0.5, level);
      vec3 board = mix(vec3(0.62, 0.20, 0.17), mix(vec3(0.16, 0.34, 0.58), mix(vec3(0.14, 0.44, 0.34), mix(vec3(0.85, 0.66, 0.18), vec3(0.90, 0.89, 0.86), step(0.8, pick)), step(0.6, pick)), step(0.4, pick)), step(0.2, pick));
      float onBoard = shopFloor * step(0.74, fy) * step(fy, 0.95) * step(0.04, fx) * step(fx, 0.96);
      detailed = mix(detailed, board, onBoard);
      // (By night the board is lit: a shop's name in its own colour.)
      lights = mix(lights, board * 1.05 + 0.08, onBoard);
      // Seen from so far off that a bay is a pixel or two, a wall is the even mixture of its wall and its
      // glass, and gives the even mixture of its lights.
      float cover = (box.y - box.x) * (box.w - box.z) * mix(1.0, 0.78, house);
      vec3 mean = mix(wall, glassTint * 0.66, cover);
      vec3 meanLights = mix(mix(vec3(1.0, 0.82, 0.58), vec3(0.92, 0.96, 1.0), tower * 0.75) * 0.8 * share, shopLight * 0.85, shopFloor) * cover;
      float fine = smoothstep(1.4, 3.6, wide / u_pixel);
      colour = mix(mean, detailed, fine);
      glow = mix(meanLights, lights, fine);
    }
    // Round the top of many a tower runs a band of light, each in a colour of its own.
    vec3 crown = mix(vec3(0.95, 0.97, 1.0), mix(vec3(0.35, 0.85, 1.0), mix(vec3(0.75, 0.45, 1.0), vec3(0.35, 1.0, 0.6), step(48.0, seed)), step(34.0, seed)), step(18.0, seed));
    glow += crown * tower * step(fract(seed * 0.618), 0.62) * step(tall - 1.8, up) * 0.95;
    // Where the floors end and roof and parapet begin: a line of shade; and a cap along the top.
    colour *= 1.0 - 0.10 * step(floors, up) * step(up, floors + 0.16);
    colour *= 1.0 + 0.05 * step(tall - 0.2, up);
    // The dark that gathers at the foot of a wall.
    colour *= mix(0.76, 1.0, smoothstep(0.0, 2.6, up));
  } else {
    colour *= 0.94;
  }

  // The light. By day: the sky from all round, a little more of it from the south-west, and the sun on
  // what faces it and is not in shadow. Once the sun is down: an even light, as on the rest of the city.
  vec3 sky = vec3(0.60, 0.63, 0.70) * (0.95 + 0.10 * dot(facing, vec2(-0.6, -0.8)));
  vec3 sunlight = mix(vec3(1.0, 0.74, 0.48), vec3(1.0, 0.95, 0.86), smoothstep(0.1, 0.6, u_sun.z)) * 0.52;
  vec3 light = mix(vec3(0.80, 0.82, 0.88), sky + sunlight * sunned, u_day);
  // By night: what little the sky gives, and on the foot of the wall the light of the street lamps, warm,
  // fading upwards, and stronger near a lamp than between two.
  vec3 lamps = vec3(1.0, 0.72, 0.42) * 0.62 * exp(-up / 5.5) * (0.72 + 0.28 * sin(along * 0.21 + seed)) * front * u_lamps;
  light = mix(light, vec3(0.15, 0.17, 0.25) + lamps, u_night);
  gl_FragColor = vec4(min(colour * light + glow * u_lamps, vec3(1.0)) * u_opacity, u_opacity);
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
    this.parts = new Map(); // name → { mesh, buffers, stale, shaded, lifted, glow }
    this.roofs = { mesh: null, buffers: null, stale: true }; // the roofs, worked out point by point
    this.walls = { mesh: null, buffers: null, stale: true }; // the walls, worked out point by point
    // What the walls are lit and drawn by.
    this.sun = [0.4, -0.6, 0.7]; // the way to the sun: east, north, up
    this.day = 1; // 1 while the sun is up, 0 once it is down
    this.night = 0; // how dark it is: 0 by day, 1 by night, in between at dusk and dawn
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
    this.at = places(gl, this.program, ['pos', 'color'], ['matrix', 'opacity', 'shaded', 'night', 'lamps', 'glow', ...SHADOW_UNIFORMS]);
    this.roofProgram = link(gl, ROOF_VERTEX, ROOF_FRAGMENT);
    this.roofAt = places(gl, this.roofProgram, ['pos', 'lay', 'tint'], ['matrix', 'opacity', 'sun', 'day', 'night', 'pixel', ...SHADOW_UNIFORMS]);
    this.wallProgram = link(gl, WALL_VERTEX, WALL_FRAGMENT);
    this.wallAt = places(gl, this.wallProgram, ['pos', 'surf', 'normal', 'tint'], ['matrix', 'opacity', 'sun', 'day', 'night', 'lamps', 'eye', 'pixel', 'top', ...SHADOW_UNIFORMS]);
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
    this.roofs.buffers = null;
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
    if (this.roofs.buffers) for (const buffer of Object.values(this.roofs.buffers)) gl.deleteBuffer(buffer);
    this.roofs.buffers = null;
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

  /**
   * Give a named part of the scene its triangles (see Mesh in life.js).
   * shaded: false for a part that takes no shadows. lifted: 1 for what
   * stands on the roofs, which is drawn as much nearer the eye as the roofs
   * themselves are, and 2 for what lies flat on them, nearer still. glow:
   * true for a part that gives light of its own (lamps and the light they
   * throw, headlights): it is drawn by night only, over everything else, and
   * its colours are added to what lies behind them.
   */
  set(name, mesh, { shaded = true, lifted = 0, glow = false } = {}) {
    const part = this.parts.get(name) ?? { mesh: null, buffers: null, stale: true, shaded: true, lifted: 0, glow: false };
    part.mesh = mesh;
    part.stale = true;
    part.shaded = shaded;
    part.lifted = lifted;
    part.glow = glow;
    this.parts.set(name, part);
  }


  /** Give the scene its roofs: a RoofMesh (see roofs.js), or one that is empty for none. */
  setRoofs(mesh) {
    this.roofs.mesh = mesh;
    this.roofs.stale = true;
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

    const night = Math.min(Math.max(this.night, 0), 1);
    const lamps = lampsLit(night);

    // The walls first: they stand a hand's breadth outside the blocks the map has drawn, and are drawn a
    // touch nearer still, so that it is they that show.
    const walls = this.walls.mesh;
    if (walls && walls.count > 0) {
      const at = this.wallAt;
      // (Only the outer side of a wall is drawn: its inner side, where it shows over the roof as a parapet, is a face of its own.)
      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.BACK);
      gl.frontFace(gl.CCW);
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(-1, -3);
      gl.useProgram(this.wallProgram);
      gl.uniformMatrix4fv(at.matrix, false, m);
      gl.uniform1f(at.opacity, this.opacity);
      gl.uniform3f(at.sun, this.sun[0], this.sun[1], this.sun[2]);
      gl.uniform1f(at.day, this.day);
      gl.uniform1f(at.night, night);
      gl.uniform1f(at.lamps, lamps);
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
      gl.disable(gl.CULL_FACE);
    }

    // The roofs. A roof lies on the slab the map draws on top of its building: it is drawn a touch nearer,
    // so that the two do not flicker.
    const roofs = this.roofs.mesh;
    if (roofs && roofs.count > 0) {
      const at = this.roofAt;
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(-2, -6);
      gl.useProgram(this.roofProgram);
      gl.uniformMatrix4fv(at.matrix, false, m);
      gl.uniform1f(at.opacity, this.opacity);
      gl.uniform3f(at.sun, this.sun[0], this.sun[1], this.sun[2]);
      gl.uniform1f(at.day, this.day);
      gl.uniform1f(at.night, night);
      gl.uniform1f(at.pixel, this.pixel);
      this.shadowsFor(gl, at);
      if (!this.roofs.buffers) this.roofs.buffers = { positions: gl.createBuffer(), lays: gl.createBuffer(), tints: gl.createBuffer() };
      const buffers = this.roofs.buffers;
      const send = (buffer, where, data, size, type, normalised) => {
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        if (this.roofs.stale) gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, roofs.count * size), gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(where);
        gl.vertexAttribPointer(where, size, type, normalised, 0, 0);
      };
      send(buffers.positions, at.pos, roofs.positions, 3, gl.FLOAT, false);
      send(buffers.lays, at.lay, roofs.lays, 2, gl.FLOAT, false);
      send(buffers.tints, at.tint, roofs.tints, 4, gl.UNSIGNED_BYTE, true);
      this.roofs.stale = false;
      gl.drawArrays(gl.TRIANGLES, 0, roofs.count);
      for (const where of [at.pos, at.lay, at.tint]) gl.disableVertexAttribArray(where);
      gl.disable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(0, 0);
    }

    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.at.matrix, false, m);
    gl.uniform1f(this.at.opacity, this.opacity);
    gl.uniform1f(this.at.night, night);
    gl.uniform1f(this.at.lamps, lamps);
    this.shadowsFor(gl, this.at);
    gl.enableVertexAttribArray(this.at.pos);
    gl.enableVertexAttribArray(this.at.color);
    const draw = (part) => {
      const mesh = part.mesh;
      gl.uniform1f(this.at.shaded, part.shaded && !part.glow ? 1 : 0);
      gl.uniform1f(this.at.glow, part.glow ? 1 : 0);
      // (What is on a roof is drawn as much nearer as the roof was, or the roof would hide the foot of it.)
      if (part.lifted > 0) {
        gl.enable(gl.POLYGON_OFFSET_FILL);
        gl.polygonOffset(-1 - part.lifted, -3 - 3 * part.lifted);
      }
      if (!part.buffers) part.buffers = { positions: gl.createBuffer(), colours: gl.createBuffer() };
      gl.bindBuffer(gl.ARRAY_BUFFER, part.buffers.positions);
      if (part.stale) gl.bufferData(gl.ARRAY_BUFFER, mesh.positions.subarray(0, mesh.count * 3), gl.DYNAMIC_DRAW);
      gl.vertexAttribPointer(this.at.pos, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, part.buffers.colours);
      if (part.stale) gl.bufferData(gl.ARRAY_BUFFER, mesh.colours.subarray(0, mesh.count * 4), gl.DYNAMIC_DRAW);
      gl.vertexAttribPointer(this.at.color, 4, gl.UNSIGNED_BYTE, true, 0, 0);
      part.stale = false;
      gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
      if (part.lifted > 0) {
        gl.disable(gl.POLYGON_OFFSET_FILL);
        gl.polygonOffset(0, 0);
      }
    };
    for (const part of this.parts.values()) {
      if (!part.glow && part.mesh && part.mesh.count > 0) draw(part);
    }
    // Then the lights, over all that: each adds its light to what is behind it, and hides nothing. (So none
    // of them is written into the picture's depth: where two pools of light overlap, both are seen.)
    if (lamps > 0) {
      gl.depthMask(false);
      for (const part of this.parts.values()) {
        if (part.glow && part.mesh && part.mesh.count > 0) draw(part);
      }
      gl.depthMask(true);
    }
    gl.disableVertexAttribArray(this.at.pos);
    gl.disableVertexAttribArray(this.at.color);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }
}
