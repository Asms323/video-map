// The layer the app draws for itself inside the map's 3D scene: everything
// it builds and lights for itself, placed in metres around an origin. It
// shares the buildings' depth, so a car behind a tower is hidden by it. Five
// kinds of thing are drawn:
//   - the walls of the buildings, whose every point is worked out where it
//     is drawn: its floor and bay, glass or wall, sun or shade;
//   - the roofs, worked out the same way: slabs, gravel or sheet in the
//     roof's own colour, in the sun or in a neighbour's shadow;
//   - the models of the famous buildings: flat faces that lean and fold,
//     each worked out point by point as glass with the sky in it, the edge of
//     a floor, a line of light (see models.js);
//   - coloured triangles: the traffic, the trees, the bridges, the paint on
//     the roads, what stands on the roofs;
//   - and, unseen, the picture the shadows are read from: the buildings as
//     the sun sees them (see shade.js).

import { LAMP_THROW_POWER, lampsLit, skyColours } from './lib.js';

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
// (Heights are counted from some way below the ground: a road in a cutting lies below it, and the ground
// beside the cutting, which is among the things that throw a shadow, shades it. See cuttings.js.)
const SHADOW_BELOW = '16.0';
const SHADOW = `
uniform sampler2D u_shadow;
uniform vec4 u_shadowBox;   // the ground the picture covers: west, south, 1 / width, 1 / height (metres)
uniform vec3 u_shadowFall;  // how far a shadow falls for each metre of height: east, north; and the height the picture counts up to
uniform float u_shadowSize; // spots a side; 0 when there are no shadows
uniform float u_shadowDeep; // how deep a shadow is: 1 under a clear sky, less under cloud
float shadowTop(vec2 at) {
  vec4 kept = texture2D(u_shadow, at);
  return (kept.r + kept.g / 255.0) * (u_shadowFall.z + ${SHADOW_BELOW}) - ${SHADOW_BELOW};
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
  return mix(mix(a, b, part.x), mix(c, d, part.x), part.y) * u_shadowDeep;
}`;

// How open to the sky a place is. Light comes not only from the sun but from the whole sky, and a place
// that sees little of the sky is dim: the foot of a wall, a lane between two houses, a yard, a low roof
// with a tall block standing over it. For that the scene keeps a second picture: the buildings seen from
// straight above, every spot holding the height of what stands there (counted up to so many metres: what
// rises higher shuts out no more of the sky from close by). A place asks it how high the buildings stand
// at a few spots round about, and is the dimmer the more they rise over it and the nearer they are.
const HEIGHTS_MOST = '120.0';
const HEIGHTS = `
uniform sampler2D u_heights;
uniform vec4 u_heightsBox;  // the ground the picture covers: west, south, 1 / width, 1 / height (metres); no width at all when there is none
float builtAt(vec2 at) {
  vec2 spot = (at - u_heightsBox.xy) * u_heightsBox.zw;
  if (spot.x <= 0.0 || spot.x >= 1.0 || spot.y <= 0.0 || spot.y >= 1.0) return 0.0;
  return texture2D(u_heights, spot).r * ${HEIGHTS_MOST};
}
// How much of the sky is shut out for a point by what stands so far off, one way: by how steeply one has to look up to see over it.
float shut(vec3 point, vec2 away, float far) {
  float rise = max(builtAt(point.xy + away * far) - point.z, 0.0);
  return rise / (rise + far);
}`;

// The light as a camera takes it. A white wall in full sun is not a patch of pure white on the film: the
// brightest things lose their glare gently, and keep what is drawn on them.
// (Half of the easing is of the brightness as a whole, so that a cream wall stays cream in the sun; half
// is of each colour apart, as film does it, which pales the brightest things a little.)
const TONE = `
vec3 toned(vec3 colour) {
  float bright = max(colour.r, max(colour.g, colour.b));
  float over = max(bright - 0.7, 0.0);
  vec3 whole = colour * ((bright - over + over / (1.0 + over * 2.4)) / max(bright, 0.0001));
  vec3 each = max(colour - 0.7, 0.0);
  return mix(whole, colour - each + each / (1.0 + each * 2.4), 0.5);
}`;

// The colour a shadow leaves of what it falls on: as on the ground, where the map lays a dark blue over it.
const SHADOW_TINT = 'vec3(0.078, 0.102, 0.157)';
const SHADOW_DEPTH = '0.42';

// (A part that is points of light: each corner is one point, a round glow as wide on screen as so many
// metres are where it stands, but never smaller than a speck that can be seen, however far off. That is
// what lets a lamp show from across the city, and makes a carpet of the lights towards the horizon.)
const VERTEX = `
attribute vec3 a_pos;
attribute vec4 a_color;
uniform mat4 u_matrix;
uniform float u_opacity;
uniform float u_point;      // for points of light: how wide each is, in metres; 0 for triangles
uniform vec2 u_pointRange;  // the narrowest and the widest a point is drawn, in pixels
uniform float u_pixel;      // metres to a pixel of the screen, for each unit of depth
uniform float u_depth;      // how deep in the picture its middle lies
uniform float u_sky;        // 1 for what is in the sky: drawn behind all else, however near it was put
uniform vec3 u_shift;       // how far the whole part has moved since it was made, in metres (a layer of cloud drifts)
uniform vec3 u_eye;         // where the eye is, in the scene's metres
uniform float u_cloud;      // more than 0 for a layer of cloud: how solid its clouds are
uniform vec4 u_grain;       // for a layer of cloud: where its grain is measured from (x, y), one over the size of its coarsest grain, and how many times longer than wide the grain is, along the wind
uniform vec2 u_grainTurn;   // the way the wind blows: (east, north), one long
uniform float u_halo;       // 1 for the glow round a point of light: wide and faint
varying vec4 v_color;
varying vec3 v_world;
varying float v_solid;
varying vec3 v_grain;       // for a cloud: where in its grain this is (x, y), and how much of a grain one pixel covers here
varying float v_fade;       // for a cloud: how much of it shows, so low towards the horizon
void main() {
  vec3 pos = a_pos + u_shift;
  v_color = a_color * u_opacity;
  v_world = pos;
  v_solid = a_color.a;
  v_grain = vec3(0.0);
  v_fade = 1.0;
  gl_Position = u_matrix * vec4(pos, 1.0);
  gl_PointSize = 1.0;
  if (u_cloud > 0.0) {
    // A cloud thins into the haze towards the horizon. And its grain is fixed to the cloud itself: measured
    // from a spot that drifts with it, along the wind and across. (Height counts too, for the heaps that
    // stand upright.) Far off, where a grain is smaller than a pixel, it is not drawn: see the fragment
    // shader. (A level cloud low in the sky is seen very much on edge: how much is counted only up to five
    // times, or a far cloud would have no grain at all; what is finer than that runs together into the
    // streaks a far cloud has.)
    vec3 from = pos - u_eye;
    float rise = max(from.z, 0.0) / max(length(from), 1.0);
    v_fade = smoothstep(0.014, 0.06, rise);
    vec2 g = a_pos.xy + u_grain.xy + a_pos.z * vec2(0.83, 0.56);
    g = vec2(dot(g, u_grainTurn), dot(g, vec2(-u_grainTurn.y, u_grainTurn.x)));
    v_grain.xy = g * vec2(u_grain.z / u_grain.w, u_grain.z);
    v_grain.z = u_pixel * gl_Position.w / max(rise, 0.2) * u_grain.z;
  }
  if (u_sky > 0.5) {
    // The sky: wherever a thing in it was put, it lies as deep as the picture goes, so that every wall
    // and roof is in front of it. (A star or a lamp up there is so many pixels wide: and the wider the
    // brighter it is, which is told in the part of its colour that a light has no other use for.)
    gl_Position.z = gl_Position.w * 0.99995;
    if (u_point > 0.0) {
      gl_PointSize = u_point * u_pointRange.x / 1.1 * (1.0 + 5.0 * a_color.a);
      v_color.a = 0.0;
    }
  } else if (u_halo > 0.5) {
    // The glow round a lamp, as a lens and the dusty air make it: several times as wide as the lamp
    // itself and faint. It is seen from near by only: from further off than it is a few pixels wide,
    // the lamp is a point and has none.
    float wide = u_point / max(u_pixel * gl_Position.w, 0.000001);
    gl_PointSize = min(wide, u_pointRange.y * 7.0);
    v_color *= smoothstep(u_pointRange.x * 5.0, u_pointRange.x * 14.0, wide);
  } else if (u_point > 0.0) {
    float wide = u_point / max(u_pixel * gl_Position.w, 0.000001);
    gl_PointSize = clamp(wide, u_pointRange.x, u_pointRange.y);
    // A light too far off to be as wide as a speck is drawn as a speck, and as much fainter; and the
    // air between dims what is very far away.
    float away = gl_Position.w / max(u_depth, 0.000001);
    v_color *= clamp(wide / u_pointRange.x, 0.35, 1.0) * mix(1.0, 0.55, smoothstep(4.0, 30.0, away));
  }
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
uniform float u_point;  // more than 0 for a part that is points of light
uniform float u_cloud;  // more than 0 for a layer of cloud: how solid its clouds are
uniform float u_halo;   // 1 for the glow round a point of light
uniform float u_opacity;
varying vec4 v_color;
varying vec3 v_world;
varying float v_solid;
varying vec3 v_grain;
varying float v_fade;
// A number from 0 to 1 for each square of a grid; and the same, running smoothly from square to square.
float speck(vec2 p) {
  p = fract(p * vec2(0.1031, 0.1030));
  p += dot(p, p.yx + 33.33);
  return fract((p.x + p.y) * p.y);
}
float grain(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(speck(i), speck(i + vec2(1.0, 0.0)), f.x), mix(speck(i + vec2(0.0, 1.0)), speck(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  vec4 colour = v_color;
  if (u_glow > 0.5) {
    if (u_point > 0.0) {
      // Round, brightest in its middle. (Its glow falls away faster from the middle than the lamp does.)
      vec2 from = gl_PointCoord - 0.5;
      float round = max(1.0 - 4.0 * dot(from, from), 0.0);
      colour *= mix(round, round * round * round, u_halo);
    }
    gl_FragColor = colour * u_lamps;
    return;
  }
  if (u_cloud > 0.0) {
    // A cloud. What comes with each corner is how thick the cloud is there: full in its middle, nothing at
    // its rim. On that its grain is laid, coarse and fine: where grain and thickness together are too
    // little there is no cloud, and so its edge is ragged, with wisps and holes, and a sheet of it breaks
    // up into small clouds. Where it is thickest it is darkest underneath.
    float thickness = v_solid;
    vec3 tone = colour.rgb / max(colour.a, 0.0001);
    float n = 0.0;
#ifdef GL_FRAGMENT_PRECISION_HIGH
    // (A grain that is smaller than a few pixels is left out: it would only flicker.)
    vec4 keep = 1.0 - smoothstep(0.18, 0.6, v_grain.z * vec4(1.0, 2.13, 4.37, 9.1));
    n = (grain(v_grain.xy) - 0.5) * keep.x + (grain(v_grain.xy * 2.13 + 7.1) - 0.5) * 0.55 * keep.y + (grain(v_grain.xy * 4.37 + 3.7) - 0.5) * 0.32 * keep.z + (grain(v_grain.xy * 9.1 + 1.3) - 0.5) * 0.18 * keep.w;
#endif
    // (The grain counts for nothing at the very rim: no cloud begins outside its own outline.)
    float thick = thickness + n * 1.5 * min(thickness * 5.0, 1.0);
    float seen = smoothstep(0.2, 0.5, thick) * u_cloud * v_fade * u_opacity;
    tone *= mix(1.03, 0.95, smoothstep(0.5, 1.4, thick)) * (1.0 + 0.2 * n);
    gl_FragColor = vec4(min(tone, vec3(1.0)) * seen, seen);
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
${HEIGHTS}
${TONE}
uniform vec3 u_sun;      // the way to the sun: east, north, up
uniform float u_day;     // 1 while the sun is up, 0 once it is down
uniform float u_night;   // 0 by day, 1 by night, in between at dusk and dawn
uniform float u_pixel;   // metres of roof to a pixel of the screen, for each unit of depth
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
  // How much roof a pixel shows here: more the further off this point is. (Seen through a long lens all
  // of the picture is as good as equally far; in a view along the ground to the horizon it is not.)
  float pixel = u_pixel / gl_FragCoord.w;
  float style = floor(v_tint.a * 255.0 + 0.5);
  float kind = floor(style / 64.0);   // 0 slabs of concrete, 1 gravel, 2 metal sheet
  float seed = style - kind * 64.0;
  float gravel = step(0.5, kind) * step(kind, 1.5);
  float sheet = step(1.5, kind);
  vec3 colour = v_tint.rgb;
  // A roof is laid and mended a piece at a time, and no two pieces weather alike: seen from close by.
  // (Sheet comes all of a piece.)
  colour *= 1.0 + (0.07 * chance(floor(v_lay / vec2(6.4, 4.8)) + seed) - 0.035) * (1.0 - sheet) * (1.0 - 0.6 * smoothstep(0.15, 0.4, pixel));
  // A line no wider than a pixel is drawn a pixel wide and as much fainter.
  float thin = 0.75 * pixel;
  // Slabs: a joint every few metres, both ways. Sheet: a rib every metre, along the building.
  float jointWide = max(0.05, thin);
  float joints = max(lines(v_lay.x / 3.2, jointWide / 3.2), lines(v_lay.y / 3.2, jointWide / 3.2)) * min(0.05 / thin, 1.0);
  float ribWide = max(0.04, thin);
  float ribs = lines(v_lay.y / 1.1, ribWide / 1.1) * min(0.04 / thin, 1.0);
  colour *= 1.0 - 0.14 * mix(joints * (1.0 - gravel), ribs, sheet);
  // Gravel: greyer, and grainy from close by.
  vec3 grey = vec3(dot(colour, vec3(0.3333)));
  float grain = chance(floor(v_lay / 0.3) + seed) - 0.5;
  colour = mix(colour, mix(colour, grey, 0.3) * (0.97 + 0.07 * grain * (1.0 - smoothstep(0.05, 0.16, pixel))), gravel);

  // Dust and old rain lie in patches on every flat roof: seen until the roof is a few pixels across.
  vec2 lies = v_lay / 7.0 + seed;
  vec2 whole = floor(lies);
  vec2 part = fract(lies);
  part = part * part * (3.0 - 2.0 * part);
  float patch = mix(mix(chance(whole), chance(whole + vec2(1.0, 0.0)), part.x), mix(chance(whole + vec2(0.0, 1.0)), chance(whole + vec2(1.0, 1.0)), part.x), part.y);
  colour *= 1.0 - 0.10 * patch * (1.0 - smoothstep(1.5, 6.0, pixel));

  // The light: the whole sky, less what a taller neighbour shuts out of it; and the sun by how high it
  // stands, unless a neighbour is in its way.
  float sunned = max(u_sun.z, 0.0) * u_day;
  if (sunned > 0.0) sunned *= 1.0 - inShadow(v_world, 0.5);
  float closed = 0.25 * (shut(v_world, vec2(1.0, 0.0), 3.0) + shut(v_world, vec2(-1.0, 0.0), 3.0) + shut(v_world, vec2(0.0, 1.0), 3.0) + shut(v_world, vec2(0.0, -1.0), 3.0));
  vec3 sky = vec3(0.59, 0.62, 0.67) * (1.0 - 0.6 * closed);
  vec3 sunlight = mix(vec3(1.0, 0.72, 0.44), vec3(1.0, 0.925, 0.77), smoothstep(0.1, 0.6, u_sun.z)) * 0.62;
  vec3 light = mix(vec3(0.80, 0.82, 0.88) * (1.0 - 0.4 * closed), sky + sunlight * sunned, u_day);
  // By night no lamp shines on a roof: it has what light the sky over a lit city gives, little and blue.
  light = mix(light, vec3(0.15, 0.175, 0.26), u_night);
  gl_FragColor = vec4(min(toned(colour * light), vec3(1.0)) * u_opacity, u_opacity);
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
${HEIGHTS}
${TONE}
uniform vec3 u_sun;      // the way to the sun: east, north, up
uniform float u_day;     // 1 while the sun is up, 0 once it is down
uniform float u_night;   // 0 by day, 1 by night, in between at dusk and dawn
uniform float u_lamps;   // how far the lamps are on: 0 by day, 1 by night
uniform vec3 u_eye;      // where the eye is, in the scene's metres
uniform float u_pixel;   // metres of wall to a pixel of the screen, for each unit of depth
uniform float u_top;     // how much of the top of a wall is roof and parapet, above the top floor
uniform vec3 u_skyHigh;  // the colour of the sky overhead
uniform vec3 u_skyLow;   // and where it meets the ground
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
// What a mirror shows along a line: up, and it is the sky, paler towards the horizon; down, and it is the
// city: the far of it pale in the haze, the near of it sand-coloured by day and a glow of lamps by night.
vec3 mirrored(vec3 along) {
  vec3 streets = mix(vec3(0.60, 0.56, 0.49), vec3(0.20, 0.14, 0.09), u_night);
  vec3 above = mix(u_skyLow, u_skyHigh, smoothstep(0.0, 0.35, along.z));
  vec3 below = mix(u_skyLow * 0.72, streets * 0.82, smoothstep(0.0, -0.3, along.z));
  return mix(below, above, smoothstep(-0.04, 0.04, along.z));
}

void main() {
  // How much wall a pixel shows here (more, the further off), and the way from here to the eye.
  float pixel = u_pixel / gl_FragCoord.w;
  vec3 eye = normalize(u_eye - v_world);
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
  // What a wall is made of shows from close by. Plaster is rough. And one in three or so of the larger
  // buildings is faced with stone, as Riyadh's are: courses of it, every stone a shade of its own, with
  // the joints between them. (A tower of glass is neither.)
  float solidWall = 1.0 - tower;
  wall *= 1.0 + 0.05 * (chance(floor(vec2(along, up) / 0.15) + seed) - 0.5) * (1.0 - smoothstep(0.03, 0.14, pixel)) * solidWall;
  float stone = (1.0 - house) * solidWall * step(fract(seed * 0.4142), 0.38);
  float course = floor(up / 0.6);
  float laid = along + 0.6 * mod(course, 2.0);
  wall *= 1.0 + stone * 0.08 * (chance(vec2(floor(laid / 1.2) + seed, course * 1.7)) - 0.5) * (1.0 - smoothstep(0.08, 0.4, pixel));
  float jointWide = max(0.012, 0.75 * pixel);
  float joint = max(1.0 - smoothstep(0.0, jointWide, 0.6 * (0.5 - abs(fract(up / 0.6) - 0.5))), 1.0 - smoothstep(0.0, jointWide, 1.2 * (0.5 - abs(fract(laid / 1.2) - 0.5))));
  wall *= 1.0 - stone * 0.16 * joint * min(0.012 / (0.75 * pixel), 1.0);
  // Rain and dust run down a wall from its top and leave their streaks: here a long one, there none.
  float runs = chance(vec2(floor(along / 0.5) + seed * 5.3, 2.0));
  float streak = step(0.66, runs) * exp(-max(tall - up, 0.0) / (1.0 + 4.5 * fract(runs * 11.0))) * sin(3.14159 * fract(along / 0.5));
  wall *= 1.0 - 0.09 * streak * solidWall * (1.0 - smoothstep(0.12, 0.5, pixel));
  // And the dust of the street dulls its foot.
  wall = mix(wall, wall * vec3(0.94, 0.90, 0.83), 0.6 * (1.0 - smoothstep(0.2, 2.0, up)));

  // (Only the front of a wall is ever drawn: see the scene's own note on that.)
  vec2 normal = normalize(v_normal);
  float front = 1.0;
  vec2 facing = normal;
  float towardsSun = dot(facing, u_sun.xy);
  float sunned = max(towardsSun, 0.0) * u_day;
  if (sunned > 0.0) sunned *= 1.0 - inShadow(v_world, 0.5);

  vec3 colour = wall;
  vec3 glow = vec3(0.0); // the light a point of the wall gives of its own, by night
  float floors = tall - u_top;
  // How a tower is lit by night goes by its own number; and so does the colour of its lights: violet,
  // the blue of ice, a warm white, or white.
  float towerWay = fract(seed * 0.381966);
  vec3 towerTint = mix(vec3(0.74, 0.42, 1.0), mix(vec3(0.30, 0.85, 1.0), mix(vec3(1.0, 0.82, 0.55), vec3(0.95, 0.97, 1.0), step(45.0, seed)), step(30.0, seed)), step(15.0, seed));
  // Glass is a mirror too, the more the more it is looked along: follow the eye's line as the wall would
  // throw it. (The wall is upright: a line that comes down to it goes on down, to the streets.)
  vec3 thrownFlat = reflect(-eye, vec3(facing, 0.0));
  float glance = pow(1.0 - max(dot(vec3(facing, 0.0), eye), 0.0), 3.0);
  float mirror = mix(0.14, 0.40, tower) + 0.45 * glance;
  if (front > 0.5) {
    // Towers are glass in a frame of metal, and the glass shows the sky: lighter the higher it is.
    vec3 glassTint = mix(vec3(0.36, 0.44, 0.54), mix(vec3(0.40, 0.54, 0.68), mix(vec3(0.42, 0.58, 0.60), vec3(0.58, 0.52, 0.44), step(40.0, seed)), step(20.0, seed)), tower);
    // (A house's windows are small and stand dark in its wall by day: so Riyadh's villas show in photographs.)
    glassTint = mix(glassTint, vec3(0.20, 0.215, 0.24), house);
    mirror *= mix(1.0, 0.55, house);
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
      vec4 box = mix(vec4(0.22, 0.78, 0.26, 0.76), mix(vec4(0.375, 0.625, 0.27, 0.72), vec4(0.05, 0.95, 0.12, 0.90), tower), step(0.5, kind) * step(kind, 2.5));
      box = mix(box, vec4(0.05, 0.95, 0.02, 0.70), shopFloor);
      // A house has a window in half its bays or so: a villa keeps its walls to the street mostly blank.
      float there = mix(1.0, step(0.5, pick), house);
      float gx = (fx - box.x) / (box.y - box.x);
      float gy = (fy - box.z) / (box.w - box.z);
      // (Edges are softened over a pixel, so that a window does not flicker as the map moves.)
      float softX = pixel / (wide * (box.y - box.x));
      float softY = pixel / (each * (box.w - box.z));
      float glass = over(0.0, softX, gx) * over(0.0, softX, 1.0 - gx) * over(0.0, softY, gy) * over(0.0, softY, 1.0 - gy) * there;

      // The glass: dark, with the sky in it, the lighter the higher; a blind or a curtain behind some.
      vec3 pane = glassTint * (0.40 + 0.50 * gy) * (0.82 + 0.36 * pick) * mix(1.0, 0.86 + 0.5 * up / tall, tower);
      pane = mix(pane, vec3(0.74, 0.71, 0.64) * (0.7 + 0.3 * gy), step(0.72, pick) * 0.55 * (1.0 - tower) * (1.0 - shopFloor));
      // And what a mirror standing so would show the eye: the sky, or the streets (see below). No two
      // panes are set quite alike, so each shows a slightly different piece of it.
      vec3 thrownHere = normalize(vec3(thrownFlat.xy, thrownFlat.z + (pick - 0.5) * 0.2));
      pane = mix(pane, mirrored(thrownHere) * mix(vec3(1.0), min(glassTint * 1.7, vec3(1.0)), 0.55), min(mirror * (0.75 + 0.5 * pick), 1.0));
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
      pane += vec3(1.0, 0.96, 0.86) * pow(max(dot(thrown, eye), 0.0), 14.0) * mix(0.30, 0.85, tower) * step(0.001, sunned) * (1.0 - shaded);
      // A frame round the glass, and a bar across it.
      float frame = max(step(gx, 0.07) + step(0.93, gx), step(gy, 0.06) + step(0.94, gy));
      frame = max(frame, step(abs(gx - 0.5), mix(0.035, 0.012, shopFloor)) * (1.0 - tower));
      pane = mix(pane, wall * mix(0.86, 0.60, tower), min(frame, 1.0));

      // By night: the rooms with a lamp on. One in three or so in a house or a block; and a shop is lit
      // from end to end. Towers differ, each by its own number: one is offices with most of its floors
      // lit from end to end; one is all but dark; one has lines of light running up its front; one is
      // lived in, a lamp here and a lamp there.
      float room = chance(vec2(column * 1.7 + seed, level * 2.3 + floor(span)));
      float offices = tower * step(towerWay, 0.30);
      float unlit = tower * step(0.30, towerWay) * step(towerWay, 0.50);
      float lined = tower * step(0.50, towerWay) * step(towerWay, 0.74);
      float lived = tower * step(0.74, towerWay);
      float share = mix(mix(mix(0.33, 0.40, house), 0.20, tower), 0.07, unlit);
      share = mix(share, 0.42, lived);
      float wholeFloor = tower * step(mix(0.88, 0.40, offices), chance(vec2(level * 0.61 + seed, seed * 0.37))) * (1.0 - unlit);
      float on = max(step(1.0 - share, room), wholeFloor * step(mix(0.3, 0.1, offices), room));
      // No two lamps are alike: most are warm, some white, a few the blue of a screen. Offices are white.
      vec3 lamp = mix(vec3(1.0, 0.78, 0.48), mix(vec3(1.0, 0.92, 0.78), vec3(0.72, 0.84, 1.0), step(0.93, pick)), step(0.62, pick));
      vec3 lampOfTower = mix(vec3(0.92, 0.96, 1.0), vec3(1.0, 0.84, 0.60), lived);
      lamp = mix(lamp, lampOfTower, tower * 0.75);
      // (Behind a curtain, where by day there is a blind, a lamp is dimmer.)
      vec3 roomLight = lamp * (0.55 + 0.6 * fract(pick * 7.3)) * on * mix(1.0, 0.62, step(0.72, pick) * (1.0 - tower));
      vec3 shopLight = vec3(1.0, 0.90, 0.72);
      vec3 through = mix(roomLight, shopLight, shopFloor) * (1.0 - 0.8 * min(frame, 1.0)) * (0.85 + 0.3 * gy);
      // The glass of a tower gives back the lights of the streets below it, the lower the more.
      through += vec3(1.0, 0.66, 0.36) * 0.10 * exp(-up / 45.0) * tower;
      vec3 lights = through * glass;
      // The lines of light: one up every fourth bay, from the pavement to the top, in the tower's own colour.
      float line = lined * step(mod(column, 4.0), 0.5) * step(fx, 0.16);
      lights = mix(lights, towerTint * 0.95, line);

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
      float cover = (box.y - box.x) * (box.w - box.z) * mix(1.0, 0.5, house);
      vec3 mean = mix(wall, mix(glassTint * 0.66, mirrored(thrownFlat) * mix(vec3(1.0), min(glassTint * 1.7, vec3(1.0)), 0.55), mirror), cover);
      // (A floor that is lit from end to end still shows as a band of light from where its windows no
      // longer do; from further off than that, a tower has the even light of all its floors.)
      float evenShare = mix(share + 0.08 * tower * (1.0 - unlit), 0.52, offices);
      float shareHere = mix(evenShare, max(share, wholeFloor * 0.85), smoothstep(1.2, 3.0, each / pixel));
      vec3 meanLights = mix(mix(vec3(1.0, 0.82, 0.58), lampOfTower, tower * 0.75) * 0.8 * shareHere, shopLight * 0.85, shopFloor) * cover + towerTint * 0.04 * lined;
      float fine = smoothstep(1.4, 3.6, wide / pixel);
      colour = mix(mean, detailed, fine);
      glow = mix(meanLights, lights, fine);
    }
    // Round the top of many a tower runs a band of light, in the tower's own colour.
    glow += towerTint * tower * step(fract(seed * 0.618), 0.62) * step(tall - 1.8, up) * 0.95;
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
  // (A wall sees the less of the sky, the nearer something stands in front of it and the higher that
  // rises over this point of it: so a lane between two houses is dim, and the top of a wall is not.)
  float closed = 0.45 * shut(v_world, facing, 2.5) + 0.35 * shut(v_world, facing, 6.0) + 0.20 * shut(v_world, facing, 14.0);
  float open = 1.0 - 0.62 * closed;
  vec3 sky = vec3(0.57, 0.60, 0.66) * (0.95 + 0.10 * dot(facing, vec2(-0.6, -0.8))) * open;
  // The sunlit ground throws its light back up at the foot of every wall that stands open to it: warm,
  // as the ground of this city is, and fading upwards.
  vec3 thrownUp = vec3(0.20, 0.168, 0.12) * max(u_sun.z, 0.0) * exp(-up / 16.0) * open * open;
  vec3 sunlight = mix(vec3(1.0, 0.72, 0.44), vec3(1.0, 0.925, 0.77), smoothstep(0.1, 0.6, u_sun.z)) * 0.62;
  vec3 light = mix(vec3(0.80, 0.82, 0.88) * (0.6 + 0.4 * open), sky + thrownUp + sunlight * sunned, u_day);
  // By night: what little the sky gives, and on the foot of the wall the light of the street lamps, warm,
  // fading upwards, and stronger near a lamp than between two.
  vec3 lamps = vec3(1.0, 0.72, 0.42) * 0.62 * exp(-up / 5.5) * (0.72 + 0.28 * sin(along * 0.21 + seed)) * front * u_lamps;
  // One large building in six or so is floodlit: lamps at the foot of every storey throw their light up
  // its front, white; and on some the upper half is lit in green.
  float flood = (1.0 - tower) * (1.0 - house) * step(15.0, tall) * step(fract(seed * 0.7548777), 0.17);
  float storey = fract(up / 3.4);
  vec3 floodTint = mix(vec3(1.0, 0.87, 0.64), vec3(0.14, 0.95, 0.55), step(0.5, up / tall) * step(fract(seed * 0.3183099), 0.45));
  vec3 flooded = floodTint * (0.30 + 0.55 * (1.0 - storey) * (1.0 - storey)) * flood * u_lamps;
  light = mix(light, vec3(0.15, 0.17, 0.25) + lamps + flooded, u_night);
  gl_FragColor = vec4(min(toned(colour * light) + glow * u_lamps, vec3(1.0)) * u_opacity, u_opacity);
}`;

// A face of a model of one of the famous buildings (see models.js). It is flat, and knows which way it
// looks: so the sun lights it by how squarely it faces the sun, and a face of glass shows what a mirror
// standing so would show the eye: the sky if it leans back, the streets if it leans forward. That is what
// makes a tower of folded glass read as a crystal: no two of its faces show the same. On the glass the
// storeys are counted off by height: the edge of each floor is a paler line by day and by night a line of
// light in the building's own colour; and between them are the rooms, some with their lamps on.
const MODEL_VERTEX = `
attribute vec3 a_pos;
attribute vec4 a_normal;
attribute vec4 a_surf;
attribute vec4 a_edge;
attribute vec4 a_tint;
attribute vec4 a_light;
attribute vec4 a_more;
uniform mat4 u_matrix;
varying vec3 v_world;
varying vec4 v_normal;
varying vec4 v_surf;
varying vec4 v_edge;
varying vec4 v_tint;
varying vec4 v_light;
varying vec4 v_more;
void main() {
  v_world = a_pos;
  v_normal = a_normal;
  v_surf = a_surf;
  v_edge = a_edge;
  v_tint = a_tint;
  v_light = a_light;
  v_more = a_more;
  gl_Position = u_matrix * vec4(a_pos, 1.0);
}`;

const MODEL_FRAGMENT = `${PRECISION}
${SHADOW}
${TONE}
uniform vec3 u_sun;      // the way to the sun: east, north, up
uniform float u_day;     // 1 while the sun is up, 0 once it is down
uniform float u_night;   // 0 by day, 1 by night, in between at dusk and dawn
uniform float u_lamps;   // how far the lamps are on: 0 by day, 1 by night
uniform vec3 u_eye;      // where the eye is, in the scene's metres
uniform float u_pixel;   // metres to a pixel of the screen, for each unit of depth
uniform vec3 u_skyHigh;  // the colour of the sky overhead
uniform vec3 u_skyLow;   // and where it meets the ground
uniform float u_time;    // seconds, for the lights that change colour
uniform float u_opacity;
varying vec3 v_world;
varying vec4 v_normal;   // which way the face looks; and how much of a mirror it is
varying vec4 v_surf;     // along the face, up from the ground, the height of a storey, the width of a bay
varying vec4 v_edge;     // how far it is to each edge of the face; and how plainly the edges of its floors show
varying vec4 v_tint;     // the face's colour; and what it is made of (x 32) with the face's own number
varying vec4 v_light;    // the light it gives by night, and how strong
varying vec4 v_more;     // the share of its rooms that are lit; the net of fins over it; the lines along its edges; and (x 3) 1 if it takes no shadow, 2 if its light changes colour

float chance(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
// A soft-edged step: 0 below the edge and 1 above it, over a width.
float over(float edge, float width, float value) {
  return smoothstep(edge - width, edge + width, value);
}
// A line along the edges of squares a unit across: 1 on the line, 0 off it, as wide as told (in units).
float lines(float value, float wide) {
  return 1.0 - smoothstep(0.0, wide, 0.5 - abs(fract(value) - 0.5));
}

void main() {
  vec3 normal = normalize(v_normal.xyz);
  vec3 eye = normalize(u_eye - v_world);
  // Only the outside of a face is ever seen. (A piece of a curved surface is lit as the curve is, which
  // at its rim looks a little away from the eye while the piece itself does not: so the line is drawn a
  // little past edge-on.)
  if (dot(normal, eye) < -0.12) discard;
  float marks = floor(v_more.w * 3.0 + 0.5);
  float changing = step(1.5, marks);
  float open = mod(marks, 2.0);
  float pixel = u_pixel / gl_FragCoord.w;
  float style = floor(v_tint.a * 255.0 + 0.5);
  float kind = floor(style / 32.0);   // 0 plain, 1 glass, 2 a lamp
  float own = style - kind * 32.0;    // the face's own number, 0 to 31
  float up = v_surf.y;

  // The light. By day: the sky from all round, more of it on what faces upwards, and the sun by how
  // squarely the face is turned to it, unless something stands in its way. (A model does not stand
  // exactly where the block that throws its shadow does: the shadow is asked for a little way out from
  // the face.) By night: what little the sky gives.
  float sunned = max(dot(normal, u_sun), 0.0) * u_day;
  if (sunned > 0.0 && open < 0.5) sunned *= 1.0 - inShadow(v_world + vec3(normal.xy * 4.0, 0.0), 0.6);
  vec3 sky = vec3(0.60, 0.63, 0.70) * (0.88 + 0.12 * normal.z) * (0.95 + 0.10 * dot(normal.xy, vec2(-0.6, -0.8)));
  vec3 sunlight = mix(vec3(1.0, 0.72, 0.44), vec3(1.0, 0.925, 0.77), smoothstep(0.1, 0.6, u_sun.z)) * 0.60;
  vec3 light = mix(vec3(0.80, 0.82, 0.88), sky + sunlight * sunned, u_day);
  light = mix(light, vec3(0.15, 0.17, 0.25), u_night);

  vec3 colour = v_tint.rgb * light;
  vec3 glow = vec3(0.0); // the light a point of the face gives of its own once the lamps are on
  vec3 show = vec3(0.0); // and the light the building is dressed in, which is not put on until it is dark
  // (A light that changes colour goes round all the colours in a minute, never quite pure.)
  vec3 turning = clamp(abs(mod(u_time / 10.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  vec3 ownLight = mix(v_light.rgb, mix(vec3(1.0), turning, 0.82), changing) * v_light.a;

  if (kind > 0.5 && kind < 1.5) {
    // Glass. No two faces are of quite the same tone.
    vec3 body = v_tint.rgb * (0.90 + 0.20 * fract(own * 0.618034));
    float storey = max(v_surf.z, 0.5);
    float bay = max(v_surf.w, 0.5);
    float rise = up / storey;
    float level = floor(rise);
    float fy = rise - level;
    float fx = v_surf.x / bay;
    float column = floor(fx);
    fx -= column;
    // (What is too fine for the screen is not drawn line by line but as the even mixture it makes.)
    float fineFloors = smoothstep(1.2, 3.0, storey / pixel);
    float fineBays = smoothstep(1.4, 3.6, bay / pixel);
    float softX = clamp(pixel / bay, 0.001, 0.5);
    float softY = clamp(pixel / storey, 0.001, 0.5);

    // What shows in the glass: follow the eye's line as a mirror would throw it. Up, and it is the sky,
    // paler towards the horizon; down, and it is the city: sand-coloured by day, a glow of lamps by night.
    vec3 thrown = reflect(-eye, normal);
    vec3 streets = mix(vec3(0.58, 0.54, 0.47), vec3(0.22, 0.15, 0.09), u_night);
    vec3 above = mix(u_skyLow, u_skyHigh, smoothstep(0.0, 0.35, thrown.z));
    vec3 below = mix(u_skyLow * 0.62, streets * 0.85, smoothstep(0.0, -0.2, thrown.z));
    vec3 seen = mix(below, above, smoothstep(-0.04, 0.04, thrown.z));
    // (Glass mirrors more, the more it is looked along; and what shows in tinted glass takes its tint.)
    float glance = pow(1.0 - max(dot(normal, eye), 0.0), 3.0);
    float silvered = 0.18 + 0.5 * v_normal.w;
    float mirror = silvered + (0.9 - silvered) * 0.6 * glance;
    vec3 pane = body * light * (1.0 - 0.4 * mirror) + seen * mirror * 0.8 * min(0.6 + 1.3 * body, vec3(1.0));
    // The sun in the glass: a glint where the face throws its light straight at the eye.
    pane += vec3(1.0, 0.96, 0.86) * pow(max(dot(reflect(-u_sun, normal), eye), 0.0), 20.0) * 0.7 * step(0.001, sunned);
    // Over the glass, a net of slanting fins: each runs across half a bay from one floor to the next, and
    // they cross. From afar they only make the glass paler and greyer.
    float cell = bay * 0.5;
    float net = max(lines(v_surf.x / cell + rise, 0.13), lines(v_surf.x / cell - rise, 0.13));
    float netHere = mix(0.24, net, smoothstep(1.6, 3.6, cell / pixel));
    pane = mix(pane, vec3(0.60, 0.66, 0.67) * light, 0.5 * v_more.y * netHere);
    // The edge of each floor, with the walkway outside it: a paler line across the top of every storey.
    float edge = 1.0 - smoothstep(0.10 - softY, 0.10 + softY, abs(fract(fy + 0.6) - 0.5));
    pane = mix(pane, vec3(0.52, 0.58, 0.59) * light, 0.5 * v_edge.w * mix(0.2, edge, fineFloors));
    colour = pane;

    // By night that edge is a line of light in the building's own colour, which spills over the glass
    // above and below it. (Stronger on one face than on the next.)
    show = ownLight * (0.75 + 0.5 * fract(own * 0.754877)) * mix(0.46, 0.26 + 0.74 * edge, fineFloors);
    // And the rooms. A floor is lit or it is not, right round the building; on a lit floor most rooms have
    // their lamps on, in runs of several; on a dark one, a room here and there. (While there is light in
    // the sky the glass still mirrors it, and only the brightest floors show through.)
    float share = v_more.x;
    if (share > 0.004) {
      float always = step(0.99, share);
      float floorOn = max(step(1.0 - share, chance(vec2(level * 0.61, 7.3))), always);
      float room = chance(vec2(column * 1.7 + own, level * 2.3));
      float run = chance(vec2(floor(column / 4.0) + own * 3.1, level * 1.7));
      float on = mix(step(0.93, room), max(step(0.22, run) * step(0.10, room), always), floorOn);
      float glassY = over(0.10, softY, fy) * over(0.26, softY, 1.0 - fy);
      float glassX = over(0.03, softX, fx) * over(0.03, softX, 1.0 - fx);
      vec3 lampOfRoom = mix(vec3(0.86, 0.92, 1.0), mix(vec3(1.0, 0.90, 0.74), vec3(0.62, 0.78, 1.0), step(0.92, room)), step(0.72, room));
      vec3 rooms = lampOfRoom * (0.62 + 0.45 * fract(room * 7.3)) * on * glassX * glassY;
      // (From where its windows no longer show, a lit floor is a band of light; from further off still,
      // the face has the even light of all its floors.)
      vec3 white = vec3(0.88, 0.92, 1.0) * 0.84;
      vec3 byFloor = white * mix(0.07, mix(0.70, 1.0, always), floorOn) * 0.86 * glassY;
      vec3 even = white * mix(share * 0.70 + (1.0 - share) * 0.07, 1.0, always) * 0.86 * 0.64;
      // (And silvered glass lets less of a lamp through.)
      glow = mix(even, mix(byFloor, rooms, fineBays), fineFloors) * mix(0.3 + 0.7 * smoothstep(0.4, 0.9, u_night), 1.0, always) * (1.0 - 0.4 * v_normal.w);
    }
  } else if (kind > 1.5) {
    // A lamp: by night all of it gives its light. (One whose colour changes is part of the building's
    // show, and comes on with it.)
    glow = ownLight * (1.0 - changing);
    show = ownLight * changing;
  } else {
    // Plain stuff: a little uneven; and by night it shows in the colour of whatever lamps are trained on it.
    colour *= 0.97 + 0.06 * chance(floor(v_world.xy / 3.0) + own);
    glow = v_tint.rgb * ownLight * (1.0 - changing);
    show = v_tint.rgb * ownLight * changing;
  }

  // Along the edges of the face, where it is folded against its neighbour: a ridge that catches the light
  // by day, and by night is picked out in points of light. (A line no wider than a pixel is drawn a pixel
  // wide and fainter, but never so faint that the folds are lost from across the city.)
  float ridge = v_more.z;
  if (ridge > 0.004) {
    float nearest = min(min(v_edge.x, v_edge.y), v_edge.z);
    float wide = max(0.4, 1.1 * pixel);
    float line = (1.0 - smoothstep(wide * 0.5, wide, nearest)) * ridge * clamp(0.4 / (1.1 * pixel), 0.45, 1.0);
    colour = mix(colour, vec3(0.74, 0.79, 0.80) * light, 0.7 * line);
    show += mix(mix(v_light.rgb, turning, changing), vec3(1.0), 0.3) * step(0.004, v_light.a) * line * (0.25 + 0.35 * step(0.5, fract(up / 8.5)));
  }
  gl_FragColor = vec4(min(toned(colour) + glow * u_lamps + show * smoothstep(0.5, 0.85, u_night), vec3(1.0)) * u_opacity, u_opacity);
}`;

// A model that carries a picture (see props.js): a mesh made from a photograph of the real thing, with the
// photograph's colours laid over it. It is measured from the middle of its own foot, and put where it stands
// and turned as it is drawn. The sun lights it by how each part of its surface faces. A picture taken by
// night shows the thing as its lamps light it: by night it is drawn just so, giving that light; by day its
// colours are lifted out of the dark, as near as may be to what the sun would show.
const PROP_VERTEX = `
attribute vec3 a_pos;
attribute vec3 a_normal;
attribute vec2 a_uv;
attribute vec4 a_tint;  // what its picture's colours are multiplied by, halved (so that it may brighten as well as darken); and how it shows by night: under a half, how much of the street lamps' light falls on it; from a half, a lamp or a lit window
uniform mat4 u_matrix;
uniform vec3 u_at;      // where its foot stands, in the scene's metres
uniform vec2 u_turn;    // the cosine and the sine of how far it is turned, clockwise
uniform float u_tall;   // how tall it stands, in metres: the mesh itself is one high
varying vec3 v_world;
varying vec3 v_normal;
varying vec2 v_uv;
varying vec3 v_paint;
varying vec2 v_byNight; // how much of the street lamps' light falls on it; and, for a lamp or a lit window, how brightly it glows
void main() {
  vec3 place = vec3(a_pos.x * u_turn.x + a_pos.y * u_turn.y, a_pos.y * u_turn.x - a_pos.x * u_turn.y, a_pos.z) * u_tall;
  v_world = u_at + place;
  v_normal = vec3(a_normal.x * u_turn.x + a_normal.y * u_turn.y, a_normal.y * u_turn.x - a_normal.x * u_turn.y, a_normal.z);
  v_uv = a_uv;
  v_paint = a_tint.rgb * 2.0;
  v_byNight = a_tint.a < 0.5 ? vec2(a_tint.a * 2.008, 0.0) : vec2(0.0, (a_tint.a - 0.5) * 2.0);
  gl_Position = u_matrix * vec4(v_world, 1.0);
}`;

const PROP_FRAGMENT = `${PRECISION}
${SHADOW}
${TONE}
uniform sampler2D u_picture;
uniform vec3 u_sun;      // the way to the sun: east, north, up
uniform float u_day;     // 1 while the sun is up, 0 once it is down
uniform float u_night;   // 0 by day, 1 by night, in between at dusk and dawn
uniform float u_lit;     // how far its picture shows it lit by its lamps: 1 for a photograph taken after dark
uniform vec2 u_byDay;    // for such a picture, by day: how much brighter its colours are made, and how much of the lamps' colour is taken out of them
uniform float u_opacity;
varying vec3 v_world;
varying vec3 v_normal;
varying vec2 v_uv;
varying vec3 v_paint;
varying vec2 v_byNight;

void main() {
  vec3 normal = normalize(v_normal);
  vec3 picture = min(texture2D(u_picture, v_uv).rgb * v_paint, vec3(1.0));
  // The light: the sky from all round, and the sun by how squarely the surface is turned to it, unless
  // something stands in its way. (The mesh is fine and full of hollows: it is lit as one that is seen from
  // both sides, and never wholly dark where it turns from the sun.)
  float facing = dot(normal, u_sun);
  float sunned = max(facing, 0.0) * u_day;
  if (sunned > 0.0) sunned *= 1.0 - inShadow(v_world + vec3(normal.xy * 3.0, 0.0), 0.6);
  vec3 sky = vec3(0.62, 0.65, 0.72) * (0.86 + 0.14 * normal.z);
  vec3 sunlight = mix(vec3(1.0, 0.72, 0.44), vec3(1.0, 0.925, 0.77), smoothstep(0.1, 0.6, u_sun.z)) * 0.62;
  vec3 light = mix(vec3(0.80, 0.82, 0.88), sky + sunlight * sunned, u_day);
  // By night: what little the sky gives; and on what faces the street the light of the street lamps, warm and
  // fading upwards, as on the walls the app builds itself.
  vec3 lamps = vec3(1.0, 0.72, 0.42) * 0.62 * exp(-max(v_world.z, 0.0) / 5.5) * v_byNight.x;
  light = mix(light, vec3(0.16, 0.18, 0.26) + lamps, u_night);
  // Its own colours. Out of a picture taken by night: what the lamps did not reach is lifted, and the cast
  // of the lamps' own colour taken part away (a whitewashed wall under violet lamps is white by day).
  float grey = dot(picture, vec3(0.3, 0.59, 0.11));
  vec3 lifted = pow(mix(picture, vec3(grey), u_byDay.y), vec3(0.6)) * 1.08 * u_byDay.x;
  vec3 colour = mix(picture, lifted, u_lit) * light;
  // By night: as the picture has it, lit by its own lamps. In a picture taken by day, a lamp or a lit window
  // glows: the dark of its glass bright, whatever bars it in the picture darker against it.
  vec3 glow = picture * u_lit * 1.12 + vec3(1.0, 0.80, 0.54) * (1.12 - 0.85 * grey) * v_byNight.y;
  gl_FragColor = vec4(min(toned(colour) + glow * smoothstep(0.35, 0.85, u_night), vec3(1.0)) * u_opacity, u_opacity);
}`;

// The ground. The map paints it in flat colours: asphalt one grey, sand one beige, from kerb to kerb and
// from here to the horizon. Real ground is never one colour over any distance: it is patched, stained,
// dusty, grained. So over all that lies flat the scene lays a thin dark veil that is uneven: wide
// patches, smaller ones, and from close by a grain; each is left out where it would be finer than the
// screen can show. And the veil is thicker wherever the ground sees little of the sky: along the foot of
// every wall, deeper in the lanes between houses (see the picture of heights, above). The veil is fixed
// to the ground itself, wherever the scene happens to be measured from. It hides nothing: whatever
// stands on the ground is drawn after it.
const GROUND_ROUND = 4096; // metres: the grain comes round again after so far, each way
// (Metres of the world to a degree, the same wherever the scene is measured from: east at Riyadh's latitude.)
const GROUND_METERS_NORTH = 111320;
const GROUND_METERS_EAST = 111320 * Math.cos((24.7 * Math.PI) / 180);
const GROUND_UP_METERS = 0.2; // drawn so far over the ground: above the shadows the map lays on it
const GROUND_VERTEX = `
attribute vec2 a_pos;      // a corner of the square of ground the veil is laid on: -1 to 1 each way
uniform mat4 u_matrix;
uniform vec4 u_ground;     // the square's middle (east, north), half its width, and how high it lies (metres)
varying vec3 v_world;
void main() {
  v_world = vec3(u_ground.xy + a_pos * u_ground.z, u_ground.w);
  gl_Position = u_matrix * vec4(v_world, 1.0);
}`;

const GROUND_FRAGMENT = `${PRECISION}
uniform sampler2D u_open;   // how much of the sky each spot of ground sees: worked out once from the picture of heights (see OPEN_FRAGMENT)
uniform vec4 u_heightsBox;  // the ground that picture covers: west, south, 1 / width, 1 / height (metres); no width at all when there is none
uniform vec4 u_ground;
uniform vec2 u_anchor;     // where the scene is measured from, in metres of the world, counted round and round: the grain is the ground's own
uniform float u_pixel;     // metres of ground to a pixel of the screen, for each unit of depth
uniform float u_night;
uniform float u_opacity;
varying vec3 v_world;
// A number from 0 to 1 for each square of a grid that comes round again after so many squares; and the
// same, running smoothly from square to square.
float speck(vec2 cell, float round) {
  vec2 p = mod(cell, round);
  p = fract(p * vec2(0.1031, 0.1030));
  p += dot(p, p.yx + 33.33);
  return fract((p.x + p.y) * p.y);
}
float grain(vec2 p, float round) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(speck(i, round), speck(i + vec2(1.0, 0.0), round), f.x), mix(speck(i + vec2(0.0, 1.0), round), speck(i + vec2(1.0, 1.0), round), f.x), f.y);
}
void main() {
  float pixel = u_pixel / gl_FragCoord.w;
  float dark = 0.0;
#ifdef GL_FRAGMENT_PRECISION_HIGH
  vec2 at = v_world.xy + u_anchor;
  dark += 0.055 * grain(at / 64.0, ${GROUND_ROUND / 64}.0) * (1.0 - smoothstep(8.0, 30.0, pixel));
  dark += 0.055 * grain(at / 16.0 + 3.7, ${GROUND_ROUND / 16}.0) * (1.0 - smoothstep(2.0, 8.0, pixel));
  dark += 0.04 * grain(at / 2.0 + 1.3, ${GROUND_ROUND / 2}.0) * (1.0 - smoothstep(0.3, 1.2, pixel));
  dark += 0.05 * speck(floor(at / 0.25), ${GROUND_ROUND * 4}.0) * (1.0 - smoothstep(0.04, 0.16, pixel));
#endif
  // How much of the sky the ground sees here.
  vec2 spot = (v_world.xy - u_heightsBox.xy) * u_heightsBox.zw;
  float closed = spot.x <= 0.0 || spot.x >= 1.0 || spot.y <= 0.0 || spot.y >= 1.0 ? 0.0 : texture2D(u_open, spot).r;
  dark = 1.0 - (1.0 - dark) * (1.0 - 0.62 * closed);
  // (The veil thins out towards the edge of its square; and by night, when there is little light to be shut out.)
  float edge = 1.0 - smoothstep(0.7, 1.0, length(v_world.xy - u_ground.xy) / u_ground.z);
  float veil = dark * edge * u_opacity * mix(1.0, 0.55, u_night);
  gl_FragColor = vec4(vec3(0.115, 0.095, 0.075) * veil, veil);
}`;

// How open the ground is, worked out once for every spot of it whenever the buildings change, and kept
// as a picture as large as the picture of heights: what is asked of that picture for each spot is how
// high the buildings stand round about, close by and a little further off, eight ways each; and what
// is kept is how much of the sky they shut out between them, 0 to 1. So the veil on the ground has one
// thing to look up for each pixel it draws, where it would have had sixteen.
const OPEN_VERTEX = `
attribute vec2 a_pos;
varying vec2 v_at;
void main() {
  v_at = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const OPEN_FRAGMENT = `${PRECISION}
uniform sampler2D u_heights;
uniform vec2 u_metre; // a metre of ground, as a share of the picture: across it and up it
varying vec2 v_at;
float shutBy(vec2 away, float far) {
  float rise = texture2D(u_heights, v_at + away * far * u_metre).r * ${HEIGHTS_MOST};
  return rise / (rise + far);
}
void main() {
  float closed = 0.0;
  for (int i = 0; i < 8; i += 1) {
    float angle = (float(i) + 0.5) * 0.7853982;
    vec2 away = vec2(cos(angle), sin(angle));
    closed += shutBy(away, 2.5) + shutBy(away, 7.0);
  }
  gl_FragColor = vec4(vec3(closed / 16.0), 1.0);
}`;

// The haze. Air is not clear: what is far off is seen through all the dust between, and fades towards
// the colour of the horizon. The map draws ground and buildings equally sharp however far away, so the
// scene hangs the air in front of them itself: curtains of thin haze across the view, one behind the
// other, each further off than the last. Whatever stands in front of a curtain hides it; whatever stands
// behind is seen through it, and through every curtain nearer than that: so a tower close by stays clear
// from top to bottom while the city behind it pales, the more the further off. A curtain is nothing at
// the ground (the map fades the ground into the horizon itself), thickens over the first few metres, and
// thins out again above the roofs, where the air is clearer.
const HAZE_VERTEX = `
attribute vec3 a_pos;
attribute float a_thick;
uniform mat4 u_matrix;
varying float v_thick;
void main() {
  v_thick = a_thick;
  gl_Position = u_matrix * vec4(a_pos, 1.0);
}`;

const HAZE_FRAGMENT = `${PRECISION}
uniform vec4 u_haze; // its colour, and how much of what is behind one curtain it hides
varying float v_thick;
void main() {
  float hidden = u_haze.a * v_thick;
  gl_FragColor = vec4(u_haze.rgb * hidden, hidden);
}`;

// How far off the curtains hang, as multiples of the distance from the eye to the middle of the picture;
// how much each hides of what is behind it; and the heights between which a curtain is thick.
const HAZE_AT = [2, 2.9, 4.2, 6, 8.6, 12.3, 17.5, 25];
const HAZE_EACH = 0.2;
const HAZE_HEIGHTS = [[0, 0], [8, 1], [260, 1], [750, 0]]; // [metres up, how thick]

// The picture the shadows are read from. Every corner of a building is put where the ray of sunlight
// through it lands on the ground, and of all that lands on one spot the highest is kept, with its height.
// (The picture of heights is drawn the same way, with rays that fall straight down: then every corner
// lands under itself. It keeps its heights more coarsely, in metres up to a limit, so that they can be
// read off smoothly between one spot and the next.)
const CAST_VERTEX = `
attribute vec3 a_pos;
uniform vec4 u_box;  // west, south, 1 / width, 1 / height
uniform vec3 u_fall; // east and north for each metre of height; and the height counted up to
varying float v_height;
varying float v_metres;
void main() {
  vec2 lands = (a_pos.xy + a_pos.z * u_fall.xy - u_box.xy) * u_box.zw;
  v_height = (a_pos.z + ${SHADOW_BELOW}) / (u_fall.z + ${SHADOW_BELOW});
  v_metres = a_pos.z;
  gl_Position = vec4(lands * 2.0 - 1.0, 1.0 - 2.0 * v_height, 1.0);
}`;

const CAST_FRAGMENT = `${PRECISION}
uniform float u_plain; // 1 for the picture of heights
varying float v_height;
varying float v_metres;
void main() {
  if (u_plain > 0.5) {
    gl_FragColor = vec4(vec3(clamp(v_metres / ${HEIGHTS_MOST}, 0.0, 1.0)), 1.0);
    return;
  }
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
  // (Every program's first attribute is its place: an attribute given one value for a whole mesh, with no
  // array of its own, must never be the first.)
  gl.bindAttribLocation(program, 0, 'a_pos');
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

// The glow round a lamp seen from close by: so many times as wide as the lamp, and so faint.
const HALO_WIDER = 7;
const HALO_FAINT = 0.2;
const HEIGHTS_SIZE_MOST = 1024; // spots a side, at most, in the picture of heights: a spot a metre or two of ground
const SHADOW_UNIFORMS = ['shadow', 'shadowBox', 'shadowFall', 'shadowSize', 'shadowDeep'];
const HEIGHTS_UNIFORMS = ['heights', 'heightsBox'];

/**
 * Where the eye is, for a matrix that takes the scene's metres to the
 * picture (sixteen numbers, a column at a time): [east, north, up], or null
 * if it cannot be told. It is the point whose place across the picture, up
 * it and deep in it all come out as nothing.
 */
export function eyeOf(m) {
  const [a, b, c, d] = [m[0], m[4], m[8], -m[12]];
  const [e, f, g, h] = [m[1], m[5], m[9], -m[13]];
  const [i, j, k, l] = [m[3], m[7], m[11], -m[15]];
  const whole = a * (f * k - g * j) - b * (e * k - g * i) + c * (e * j - f * i);
  if (!(Math.abs(whole) > 1e-30)) return null;
  const x = (d * (f * k - g * j) - b * (h * k - g * l) + c * (h * j - f * l)) / whole;
  const y = (a * (h * k - g * l) - d * (e * k - g * i) + c * (e * l - h * i)) / whole;
  const z = (a * (f * l - h * j) - b * (e * l - h * i) + d * (e * j - f * i)) / whole;
  return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) ? [x, y, z] : null;
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
    this.parts = new Map(); // name → { mesh, buffers, stale, shaded, lifted, glow, point }
    this.roofs = { mesh: null, buffers: null, stale: true }; // the roofs, worked out point by point
    this.walls = { mesh: null, buffers: null, stale: true }; // the walls, worked out point by point
    this.models = { mesh: null, buffers: null, stale: true }; // the models of the famous buildings
    this.props = []; // the models that carry a picture, each where it stands: { mesh, picture, at, turn, tall, lit }
    this.propStore = new Map(); // what each of their meshes keeps in the graphics memory: mesh -> { buffers }
    this.pictureStore = new Map(); // and each of their pictures, once however many meshes it lies on: picture -> texture
    this.modelOpacity = 1; // they show from further off than the rest of the scene does
    this.haze = 0; // how much haze hangs in the distance: 0 in a view from above, 1 in one that reaches the horizon
    this.hazeBuffer = null;
    this.hazeCorners = new Float32Array(HAZE_AT.length * (HAZE_HEIGHTS.length - 1) * 6 * 4);
    this.sky = { night: -1, high: [0.5, 0.7, 0.9], low: [0.9, 0.9, 0.9] }; // the sky that shows in their glass
    // What the walls are lit and drawn by.
    this.sun = [0.4, -0.6, 0.7]; // the way to the sun: east, north, up
    this.day = 1; // 1 while the sun is up, 0 once it is down
    this.night = 0; // how dark it is: 0 by day, 1 by night, in between at dusk and dawn
    this.pixel = 1; // metres to a pixel of the screen, in the middle of the picture
    this.sharp = 1; // how many of the screen's own pixels there are to each of the page's
    this.focus = [0, 0]; // the middle of the picture, in the scene's metres
    this.eye = [0, -800, 600]; // where the eye is, in the scene's metres: worked out with every picture
    this.sunlight = 1; // how much of the sun gets through the clouds: the shadows are as deep
    this.wallTop = 0; // how much of the top of a wall is roof and parapet
    // The shadows: what throws them, and the picture they are read from.
    this.shadow = { casters: null, frame: null, stale: false, target: null, buffer: null, ready: false, drawn: 0 };
    // The buildings from straight above, for how open to the sky a place is; and the veil that lies on the ground.
    this.heights = { casters: null, frame: null, stale: false, target: null, buffer: null, ready: false, drawn: 0 };
    this.grounded = false; // whether the ground is given its grain and the dimness at the foot of its walls
    this.groundProgram = null;
    this.groundBuffer = null;
    this.open = { target: null, ready: false }; // how open to the sky each spot of ground is: a picture, worked out from the heights
    this.openProgram = null;
    this.map = null;
    this.program = null;
    this.roofProgram = null;
    this.wallProgram = null;
    this.modelProgram = null;
    this.propProgram = null;
    this.hazeProgram = null;
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
    this.at = places(gl, this.program, ['pos', 'color'], ['matrix', 'opacity', 'shaded', 'night', 'lamps', 'glow', 'point', 'pointRange', 'pixel', 'depth', 'sky', 'shift', 'eye', 'cloud', 'grain', 'grainTurn', 'halo', ...SHADOW_UNIFORMS]);
    this.roofProgram = link(gl, ROOF_VERTEX, ROOF_FRAGMENT);
    this.roofAt = places(gl, this.roofProgram, ['pos', 'lay', 'tint'], ['matrix', 'opacity', 'sun', 'day', 'night', 'pixel', ...SHADOW_UNIFORMS, ...HEIGHTS_UNIFORMS]);
    this.wallProgram = link(gl, WALL_VERTEX, WALL_FRAGMENT);
    this.wallAt = places(gl, this.wallProgram, ['pos', 'surf', 'normal', 'tint'], ['matrix', 'opacity', 'sun', 'day', 'night', 'lamps', 'eye', 'pixel', 'top', 'skyHigh', 'skyLow', ...SHADOW_UNIFORMS, ...HEIGHTS_UNIFORMS]);
    this.groundProgram = link(gl, GROUND_VERTEX, GROUND_FRAGMENT);
    this.groundAt = places(gl, this.groundProgram, ['pos'], ['matrix', 'ground', 'anchor', 'pixel', 'night', 'opacity', 'open', 'heightsBox']);
    this.groundBuffer = null;
    this.openProgram = link(gl, OPEN_VERTEX, OPEN_FRAGMENT);
    this.openAt = places(gl, this.openProgram, ['pos'], ['heights', 'metre']);
    this.open.target = null;
    this.open.ready = false;
    this.modelProgram = link(gl, MODEL_VERTEX, MODEL_FRAGMENT);
    this.modelAt = places(gl, this.modelProgram, ['pos', 'normal', 'surf', 'edge', 'tint', 'light', 'more'], ['matrix', 'opacity', 'sun', 'day', 'night', 'lamps', 'eye', 'pixel', 'skyHigh', 'skyLow', 'time', ...SHADOW_UNIFORMS]);
    this.propProgram = link(gl, PROP_VERTEX, PROP_FRAGMENT);
    this.propAt = places(gl, this.propProgram, ['pos', 'normal', 'uv', 'tint'], ['matrix', 'opacity', 'sun', 'day', 'night', 'at', 'turn', 'tall', 'picture', 'lit', 'byDay', ...SHADOW_UNIFORMS]);
    this.hazeProgram = link(gl, HAZE_VERTEX, HAZE_FRAGMENT);
    this.hazeAt = places(gl, this.hazeProgram, ['pos', 'thick'], ['matrix', 'haze']);
    this.hazeBuffer = null;
    this.castProgram = link(gl, CAST_VERTEX, CAST_FRAGMENT);
    this.castAt = places(gl, this.castProgram, ['pos'], ['box', 'fall', 'plain']);
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
    this.models.buffers = null;
    this.models.stale = true;
    this.propStore.clear();
    this.pictureStore.clear();
    this.shadow.target = null;
    this.shadow.buffer = null;
    this.shadow.ready = false;
    this.shadow.stale = true;
    this.heights.target = null;
    this.heights.buffer = null;
    this.heights.ready = false;
    this.heights.stale = true;
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
    if (this.models.buffers) for (const buffer of Object.values(this.models.buffers)) gl.deleteBuffer(buffer);
    this.models.buffers = null;
    for (const kept of this.propStore.values()) this.dropProp(gl, kept);
    this.propStore.clear();
    for (const texture of this.pictureStore.values()) gl.deleteTexture(texture);
    this.pictureStore.clear();
    for (const kept of [this.shadow, this.heights]) {
      const target = kept.target;
      if (target) {
        gl.deleteFramebuffer(target.frame);
        gl.deleteTexture(target.picture);
        gl.deleteRenderbuffer(target.depth);
      }
      if (kept.buffer) gl.deleteBuffer(kept.buffer);
      kept.target = null;
      kept.buffer = null;
      kept.ready = false;
    }
    if (this.blank) gl.deleteTexture(this.blank);
    this.blank = null;
    if (this.hazeBuffer) gl.deleteBuffer(this.hazeBuffer);
    this.hazeBuffer = null;
    if (this.groundBuffer) gl.deleteBuffer(this.groundBuffer);
    this.groundBuffer = null;
    if (this.open.target) {
      gl.deleteFramebuffer(this.open.target.frame);
      gl.deleteTexture(this.open.target.picture);
    }
    this.open.target = null;
    this.open.ready = false;
    for (const name of ['program', 'roofProgram', 'wallProgram', 'modelProgram', 'propProgram', 'hazeProgram', 'castProgram', 'groundProgram', 'openProgram']) {
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
   * its colours are added to what lies behind them. point: for a part of
   * light whose every corner is a point of light of its own (a lamp seen
   * from afar), how wide each is, in metres. mask: true for a part that is
   * not seen itself but hides what lies behind it: the ground beside a road
   * that runs in a cutting, which the map draws without any depth. sky: true
   * for what is in the sky (see sky.js): drawn behind all else, in the
   * colours it was given, whatever the hour; the parts of the sky are drawn
   * in the order they were first given in, the furthest first (the sun and
   * the stars, then the clouds, then the aircraft). cloud: for a layer of
   * cloud, { solid (how solid its clouds are, 0 to 1), grain: [east, north]
   * (where its grain is measured from, in metres), size (how wide its
   * coarsest grain is, in metres), stretch (how many times longer than wide
   * the grain is, along the wind), wind: [east, north] (the way the wind
   * blows, one long) }: each corner's solidity is then how thick the cloud
   * is there, and its ragged edge is worked out point by point. late: true
   * for a light in the sky that shows through the haze on the horizon (the
   * sun's own disc, going down): it is drawn after the haze, with the lights.
   * bright: true for what is lit from within and seen by day as well as by
   * night (the lamp of a traffic signal): it keeps its colours in the dark.
   * halo: true for points of light that have a glow round them when they are
   * seen from close by, as a lens and dusty air give a lamp: each is drawn a
   * second time, several times as wide and faint.
   */
  set(name, mesh, { shaded = true, lifted = 0, glow = false, point = 0, mask = false, sky = false, cloud = null, late = false, bright = false, halo = false } = {}) {
    const part = this.parts.get(name) ?? { mesh: null, buffers: null, stale: true, shaded: true, lifted: 0, glow: false, point: 0, mask: false, sky: false, shift: null, cloud: null, late: false, bright: false, halo: false };
    part.shift = null;
    part.cloud = cloud;
    part.late = late;
    part.bright = bright;
    part.halo = Boolean(halo) && glow && point > 0;
    part.mesh = mesh;
    part.stale = true;
    part.shaded = shaded;
    part.lifted = lifted;
    part.glow = glow;
    part.point = glow ? point : 0;
    part.mask = mask;
    part.sky = sky;
    this.parts.set(name, part);
  }

  /**
   * Move a named part as a whole, without making it afresh: by [east, north,
   * up] metres from where it was made. (So a layer of cloud drifts.) Giving
   * the part its triangles again puts it back.
   */
  shift(name, by) {
    const part = this.parts.get(name);
    if (part) part.shift = by ? [by[0], by[1], by[2] ?? 0] : null;
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

  /** Give the scene its models of the famous buildings: a ModelMesh (see models.js), or one that is empty for none. */
  setModels(mesh) {
    this.models.mesh = mesh;
    this.models.stale = true;
  }

  /**
   * Give the scene its models that carry a picture (see props.js): [{ mesh:
   * { positions, normals, uvs, indices } (one high), picture: an image, at:
   * [east, north, up] of its foot in the scene's metres, turn: degrees
   * clockwise, tall: its height in metres, lit: 0 to 1, gain and plain: for
   * a picture taken by night, how much brighter it is drawn by day and how
   * much of the lamps' colour is taken out of it }]. One mesh may stand in
   * several places, and one picture may lie on several meshes: it is kept
   * once. A mesh or a picture no longer on the list is let go.
   */
  setProps(list) {
    this.props = list.map((one) => ({ mesh: one.mesh, picture: one.picture, at: one.at, turn: one.turn ?? 0, tall: one.tall ?? 1, lit: one.lit ?? 0, gain: one.gain ?? 1, plain: one.plain ?? 0.25 }));
    const gl = this.map?.painter?.context?.gl;
    const used = new Set(this.props.map((one) => one.mesh));
    for (const [mesh, kept] of this.propStore) {
      if (used.has(mesh)) continue;
      if (gl) this.dropProp(gl, kept);
      this.propStore.delete(mesh);
    }
    const shown = new Set(this.props.map((one) => one.picture));
    for (const [picture, texture] of this.pictureStore) {
      if (shown.has(picture)) continue;
      if (gl) gl.deleteTexture(texture);
      this.pictureStore.delete(picture);
    }
  }

  /** Let go of what one such model keeps in the graphics memory. */
  dropProp(gl, kept) {
    if (kept.buffers) for (const buffer of Object.values(kept.buffers)) gl.deleteBuffer(buffer);
    kept.buffers = null;
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

  /**
   * Give the scene the buildings as they are seen from straight above: a
   * CasterMesh of their tops, and { box: [west, south, east, north], size } (as
   * shadowCasters() gives the box when nothing falls aslant). From it every
   * wall, roof and patch of ground learns how much of the sky it sees.
   * Without a frame everything sees all of it.
   */
  setHeights(casters, frame) {
    this.heights.casters = casters;
    this.heights.frame = frame && casters && casters.count > 0 ? frame : null;
    this.heights.stale = true;
    if (!this.heights.frame) {
      this.heights.ready = false;
      this.open.ready = false;
    }
  }

  /**
   * Before the map's own picture is begun: draw the picture of the shadows
   * and the picture of the heights, each if what it shows has changed.
   */
  prerender(gl) {
    if (!this.castProgram || gl.isContextLost()) return;
    if (!gl.isProgram(this.castProgram)) this.build(gl); // the graphics memory was taken away and handed back empty
    const shadow = this.shadow;
    if (shadow.stale) {
      shadow.stale = false;
      shadow.ready = false;
      const { casters, frame } = shadow;
      if (shadow.able && frame && casters && casters.count > 0 && frame.top > 0) {
        const size = Math.min(frame.size || 1024, shadow.most);
        if (this.cast(gl, shadow, casters, frame.box, [frame.fall[0], frame.fall[1], frame.top], size, false)) {
          shadow.using = { box: [...frame.box], fall: [frame.fall[0], frame.fall[1]], top: frame.top, size };
        }
      }
    }
    const heights = this.heights;
    if (heights.stale) {
      heights.stale = false;
      heights.ready = false;
      const { casters, frame } = heights;
      if (shadow.able && frame && casters && casters.count > 0) {
        // (Its rays fall straight down. The tallest thing there could be is put at the bottom of its depth.)
        const size = Math.min(frame.size || 512, shadow.most, HEIGHTS_SIZE_MOST);
        if (this.cast(gl, heights, casters, frame.box, [0, 0, 1200], size, true)) heights.using = { box: [...frame.box], size };
      }
      this.open.ready = heights.ready && this.lay(gl, heights);
    }
  }

  /**
   * Work out how open to the sky every spot of ground is, from the picture
   * of heights, and keep it as a picture of the same size (see
   * OPEN_FRAGMENT). Returns whether it was done.
   */
  lay(gl, heights) {
    const { box, size } = heights.using;
    let target = this.open.target;
    if (!target || target.size !== size || !gl.isFramebuffer(target.frame)) {
      if (target) {
        gl.deleteFramebuffer(target.frame);
        gl.deleteTexture(target.picture);
      }
      const picture = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, picture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const made = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, made);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, picture, 0);
      const whole = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, null);
      target = { frame: made, picture, size };
      this.open.target = target;
      if (!whole) return false;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.frame);
    gl.viewport(0, 0, size, size);
    gl.disable(gl.BLEND);
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.STENCIL_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.colorMask(true, true, true, true);
    gl.useProgram(this.openProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, heights.target.picture);
    gl.uniform1i(this.openAt.heights, 0);
    gl.uniform2f(this.openAt.metre, 1 / (box[2] - box[0]), 1 / (box[3] - box[1]));
    if (!this.groundBuffer) {
      this.groundBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.groundBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);
    } else {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.groundBuffer);
    }
    gl.enableVertexAttribArray(this.openAt.pos);
    gl.vertexAttribPointer(this.openAt.pos, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.disableVertexAttribArray(this.openAt.pos);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);
    return true;
  }

  /**
   * Draw a picture of what throws the shadows into what `kept` keeps (the
   * scene's shadows, or its heights): every corner where its ray lands on
   * the ground, the highest of all that lands on a spot being kept. box:
   * the ground the picture covers; fall: [east, north] for each metre of
   * height, and the height counted up to; size: spots a side; plain: true
   * for the picture of heights. Returns whether it was drawn.
   */
  cast(gl, kept, casters, box, fall, size, plain) {
    const [west, south, east, north] = box;
    if (!(east > west && north > south)) return false;
    let target = kept.target;
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
      // (The shadows' heights are kept in two parts, which cannot be read off between two spots; the plain heights can.)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, plain ? gl.LINEAR : gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, plain ? gl.LINEAR : gl.NEAREST);
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
      kept.target = target;
      if (!whole) {
        this.shadow.able = false; // this device cannot keep such a picture: it goes without them
        return false;
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
    gl.uniform3f(this.castAt.fall, fall[0], fall[1], fall[2]);
    gl.uniform1f(this.castAt.plain, plain ? 1 : 0);
    if (!kept.buffer) kept.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, kept.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, casters.positions.subarray(0, casters.count * 3), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(this.castAt.pos);
    gl.vertexAttribPointer(this.castAt.pos, 3, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, casters.count);
    gl.disableVertexAttribArray(this.castAt.pos);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    kept.ready = true;
    kept.drawn += 1;
    return true;
  }

  /**
   * Hang the haze: curtains across the view, the furthest first, each
   * square to the line from the eye to the middle of the picture and wide
   * enough to fill the view from side to side. Nothing of them is written
   * into the picture's depth.
   */
  drawHaze(gl, matrix) {
    const strength = Math.min(Math.max(this.haze, 0), 1);
    if (!(strength > 0) || !this.hazeProgram) return;
    const [eyeEast, eyeNorth, eyeUp] = this.eye;
    const east = this.focus[0] - eyeEast;
    const north = this.focus[1] - eyeNorth;
    const level = Math.hypot(east, north);
    const reach = Math.hypot(level, eyeUp);
    if (!(level > 1) || !(reach > 1)) return;
    const along = [east / level, north / level];
    const corners = this.hazeCorners;
    let n = 0;
    const corner = (x, y, z, thick) => {
      corners[n] = x;
      corners[n + 1] = y;
      corners[n + 2] = z;
      corners[n + 3] = thick;
      n += 4;
    };
    for (let i = HAZE_AT.length - 1; i >= 0; i -= 1) {
      const far = reach * HAZE_AT[i];
      const wide = far * 1.6;
      const middle = [eyeEast + along[0] * far, eyeNorth + along[1] * far];
      const left = [middle[0] - along[1] * wide, middle[1] + along[0] * wide];
      const right = [middle[0] + along[1] * wide, middle[1] - along[0] * wide];
      for (let h = 1; h < HAZE_HEIGHTS.length; h += 1) {
        const [low, lowThick] = HAZE_HEIGHTS[h - 1];
        const [high, highThick] = HAZE_HEIGHTS[h];
        corner(left[0], left[1], low, lowThick);
        corner(right[0], right[1], low, lowThick);
        corner(right[0], right[1], high, highThick);
        corner(left[0], left[1], low, lowThick);
        corner(right[0], right[1], high, highThick);
        corner(left[0], left[1], high, highThick);
      }
    }
    const at = this.hazeAt;
    gl.useProgram(this.hazeProgram);
    gl.uniformMatrix4fv(at.matrix, false, matrix);
    gl.uniform4f(at.haze, this.sky.low[0], this.sky.low[1], this.sky.low[2], HAZE_EACH * strength * Math.min(this.modelOpacity > 0 || this.opacity > 0 ? 1 : 0, 1));
    if (!this.hazeBuffer) this.hazeBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.hazeBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, corners, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(at.pos);
    gl.vertexAttribPointer(at.pos, 3, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(at.thick);
    gl.vertexAttribPointer(at.thick, 1, gl.FLOAT, false, 16, 12);
    gl.depthMask(false);
    gl.drawArrays(gl.TRIANGLES, 0, n / 4);
    gl.depthMask(true);
    gl.disableVertexAttribArray(at.pos);
    gl.disableVertexAttribArray(at.thick);
  }

  /** Tell a program where the shadows are to be read from. */
  shadowsFor(gl, at) {
    const shadow = this.shadow;
    const ready = shadow.ready && shadow.target && gl.isTexture(shadow.target.picture);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, ready ? shadow.target.picture : this.blank);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(at.shadow, 1);
    gl.uniform1f(at.shadowDeep, Math.min(Math.max(this.sunlight, 0), 1));
    if (ready && this.day > 0) {
      const { box, fall, top, size } = shadow.using;
      gl.uniform4f(at.shadowBox, box[0], box[1], 1 / (box[2] - box[0]), 1 / (box[3] - box[1]));
      gl.uniform3f(at.shadowFall, fall[0], fall[1], top);
      gl.uniform1f(at.shadowSize, size);
    } else {
      gl.uniform1f(at.shadowSize, 0);
    }
  }

  /** Tell a program where the heights of the buildings are to be read from: how open to the sky a place is. */
  heightsFor(gl, at) {
    const heights = this.heights;
    const ready = heights.ready && heights.target && gl.isTexture(heights.target.picture);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, ready ? heights.target.picture : this.blank);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(at.heights, 2);
    if (ready) {
      const { box } = heights.using;
      gl.uniform4f(at.heightsBox, box[0], box[1], 1 / (box[2] - box[0]), 1 / (box[3] - box[1]));
    } else {
      gl.uniform4f(at.heightsBox, 0, 0, 0, 0);
    }
  }

  /**
   * Lay the veil on the ground (see GROUND_FRAGMENT): a square of it round
   * the middle of the picture, wide enough to reach as far as its grain can
   * be seen. Nothing of it is written into the picture's depth.
   */
  drawGround(gl, matrix, pixelPerDepth, night) {
    if (!this.grounded || !this.groundProgram || !this.origin) return;
    const reach = Math.hypot(this.focus[0] - this.eye[0], this.focus[1] - this.eye[1], this.eye[2]);
    if (!(reach > 1)) return;
    const half = Math.min(Math.max(reach * 8, 300), 5000);
    const at = this.groundAt;
    gl.useProgram(this.groundProgram);
    gl.uniformMatrix4fv(at.matrix, false, matrix);
    gl.uniform4f(at.ground, this.focus[0], this.focus[1], half, GROUND_UP_METERS);
    // Where the scene's origin lies in the world, in metres, counted round and round: so the grain stays
    // where it is on the ground when the scene comes to be measured from another spot.
    const round = (metres) => ((metres % GROUND_ROUND) + GROUND_ROUND) % GROUND_ROUND;
    gl.uniform2f(at.anchor, round(this.origin.lng * GROUND_METERS_EAST), round(this.origin.lat * GROUND_METERS_NORTH));
    gl.uniform1f(at.pixel, pixelPerDepth);
    gl.uniform1f(at.night, night);
    gl.uniform1f(at.opacity, this.opacity);
    // (How open the ground is: read from its own picture, where the buildings' heights are read by walls and roofs.)
    const open = this.open.ready && this.open.target && gl.isTexture(this.open.target.picture) && this.heights.ready;
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, open ? this.open.target.picture : this.blank);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(at.open, 2);
    if (open) {
      const { box } = this.heights.using;
      gl.uniform4f(at.heightsBox, box[0], box[1], 1 / (box[2] - box[0]), 1 / (box[3] - box[1]));
    } else {
      gl.uniform4f(at.heightsBox, 0, 0, 0, 0);
    }
    if (!this.groundBuffer) {
      this.groundBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.groundBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);
    } else {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.groundBuffer);
    }
    gl.enableVertexAttribArray(at.pos);
    gl.vertexAttribPointer(at.pos, 2, gl.FLOAT, false, 0, 0);
    gl.depthMask(false);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.depthMask(true);
    gl.disableVertexAttribArray(at.pos);
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
    if (!this.program || !this.origin) return;
    // (The models of the famous buildings show from further off than everything else in the scene.)
    const shown = this.opacity > 0;
    const models = this.models.mesh;
    const modelled = Boolean(models && models.count > 0 && this.modelOpacity > 0);
    const pictured = this.props.length > 0 && this.modelOpacity > 0;
    if (!shown && !modelled && !pictured) return;

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
    // Where the eye is: the one point that this picture's measure sends nowhere at all. And how much of
    // the scene a pixel shows for each unit of depth: what it shows in the middle of the picture, where
    // the map's own scale holds, over how deep in the picture that middle lies.
    const solved = eyeOf(m);
    if (solved) this.eye = solved;
    const depth = m[3] * this.focus[0] + m[7] * this.focus[1] + m[15];
    const pixelPerDepth = depth > 1e-9 ? this.pixel / depth : this.pixel;

    // First of all, what hides: the ground beside a cutting. It is drawn unseen, into the picture's depth
    // only, and a touch further off than it lies, so that nothing standing on the ground is hidden by it.
    const masks = shown ? [...this.parts.values()].filter((part) => part.mask && part.mesh && part.mesh.count > 0) : [];
    if (masks.length > 0) {
      gl.useProgram(this.program);
      gl.uniformMatrix4fv(this.at.matrix, false, m);
      gl.uniform1f(this.at.opacity, 1);
      gl.uniform1f(this.at.night, 0);
      gl.uniform1f(this.at.shaded, 0);
      gl.uniform1f(this.at.glow, 0);
      gl.uniform1f(this.at.point, 0);
      gl.uniform1f(this.at.lamps, 0);
      gl.uniform1f(this.at.sky, 0);
      gl.uniform3f(this.at.shift, 0, 0, 0);
      gl.uniform1f(this.at.cloud, 0);
      gl.uniform1f(this.at.halo, 0);
      this.shadowsFor(gl, this.at);
      gl.colorMask(false, false, false, false);
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(1, 6);
      gl.enableVertexAttribArray(this.at.pos);
      gl.enableVertexAttribArray(this.at.color);
      for (const part of masks) {
        if (!part.buffers) part.buffers = { positions: gl.createBuffer(), colours: gl.createBuffer() };
        gl.bindBuffer(gl.ARRAY_BUFFER, part.buffers.positions);
        if (part.stale) gl.bufferData(gl.ARRAY_BUFFER, part.mesh.positions.subarray(0, part.mesh.count * 3), gl.DYNAMIC_DRAW);
        gl.vertexAttribPointer(this.at.pos, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, part.buffers.colours);
        if (part.stale) gl.bufferData(gl.ARRAY_BUFFER, part.mesh.colours.subarray(0, part.mesh.count * 4), gl.DYNAMIC_DRAW);
        gl.vertexAttribPointer(this.at.color, 4, gl.UNSIGNED_BYTE, true, 0, 0);
        part.stale = false;
        gl.drawArrays(gl.TRIANGLES, 0, part.mesh.count);
      }
      gl.disableVertexAttribArray(this.at.pos);
      gl.disableVertexAttribArray(this.at.color);
      gl.disable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(0, 0);
      gl.colorMask(true, true, true, true);
    }

    // (The colours of the sky at this hour: they show in the glass of the models, and far things fade into them.)
    if (this.sky.night !== night || this.sky.sunlight !== this.sunlight) {
      const { overhead, horizon } = skyColours(night, this.sunlight);
      const parts = (colour) => [1, 3, 5].map((from) => Number.parseInt(colour.slice(from, from + 2), 16) / 255);
      this.sky = { night, sunlight: this.sunlight, high: parts(overhead), low: parts(horizon) };
    }

    // The veil on the ground: over what the map has painted flat, under everything the scene itself draws.
    if (shown) this.drawGround(gl, m, pixelPerDepth, night);

    // The walls: they stand a hand's breadth outside the blocks the map has drawn, and are drawn a
    // touch nearer still, so that it is they that show.
    const walls = this.walls.mesh;
    if (shown && walls && walls.count > 0) {
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
      gl.uniform1f(at.pixel, pixelPerDepth);
      gl.uniform1f(at.top, this.wallTop);
      gl.uniform3f(at.skyHigh, this.sky.high[0], this.sky.high[1], this.sky.high[2]);
      gl.uniform3f(at.skyLow, this.sky.low[0], this.sky.low[1], this.sky.low[2]);
      this.shadowsFor(gl, at);
      this.heightsFor(gl, at);
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
    if (shown && roofs && roofs.count > 0) {
      const at = this.roofAt;
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(-2, -6);
      gl.useProgram(this.roofProgram);
      gl.uniformMatrix4fv(at.matrix, false, m);
      gl.uniform1f(at.opacity, this.opacity);
      gl.uniform3f(at.sun, this.sun[0], this.sun[1], this.sun[2]);
      gl.uniform1f(at.day, this.day);
      gl.uniform1f(at.night, night);
      gl.uniform1f(at.pixel, pixelPerDepth);
      this.shadowsFor(gl, at);
      this.heightsFor(gl, at);
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

    // The models of the famous buildings. Each stands alone, where the map's own block was taken out for it.
    if (modelled) {
      const at = this.modelAt;
      gl.useProgram(this.modelProgram);
      gl.uniformMatrix4fv(at.matrix, false, m);
      gl.uniform1f(at.opacity, Math.min(this.modelOpacity, 1));
      gl.uniform3f(at.sun, this.sun[0], this.sun[1], this.sun[2]);
      gl.uniform1f(at.day, this.day);
      gl.uniform1f(at.night, night);
      gl.uniform1f(at.lamps, lamps);
      gl.uniform3f(at.eye, this.eye[0], this.eye[1], this.eye[2]);
      gl.uniform1f(at.pixel, pixelPerDepth);
      gl.uniform3f(at.skyHigh, this.sky.high[0], this.sky.high[1], this.sky.high[2]);
      gl.uniform3f(at.skyLow, this.sky.low[0], this.sky.low[1], this.sky.low[2]);
      // (Counted round the hour, so that the number stays small enough to be told finely.)
      gl.uniform1f(at.time, (performance.now() / 1000) % 3600);
      this.shadowsFor(gl, at);
      if (!this.models.buffers) this.models.buffers = { positions: gl.createBuffer(), normals: gl.createBuffer(), surfaces: gl.createBuffer(), edges: gl.createBuffer(), tints: gl.createBuffer(), lights: gl.createBuffer(), more: gl.createBuffer() };
      const buffers = this.models.buffers;
      const send = (buffer, where, data, size, type, normalised) => {
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        if (this.models.stale) gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, models.count * size), gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(where);
        gl.vertexAttribPointer(where, size, type, normalised, 0, 0);
      };
      send(buffers.positions, at.pos, models.positions, 3, gl.FLOAT, false);
      send(buffers.normals, at.normal, models.normals, 4, gl.FLOAT, false);
      send(buffers.surfaces, at.surf, models.surfaces, 4, gl.FLOAT, false);
      send(buffers.edges, at.edge, models.edges, 4, gl.FLOAT, false);
      send(buffers.tints, at.tint, models.tints, 4, gl.UNSIGNED_BYTE, true);
      send(buffers.lights, at.light, models.lights, 4, gl.UNSIGNED_BYTE, true);
      send(buffers.more, at.more, models.more, 4, gl.UNSIGNED_BYTE, true);
      this.models.stale = false;
      gl.drawArrays(gl.TRIANGLES, 0, models.count);
      for (const where of [at.pos, at.normal, at.surf, at.edge, at.tint, at.light, at.more]) gl.disableVertexAttribArray(where);
    }

    // The models that carry a picture: each its own mesh and its own picture, put where it stands.
    if (pictured) {
      const at = this.propAt;
      gl.useProgram(this.propProgram);
      gl.uniformMatrix4fv(at.matrix, false, m);
      gl.uniform1f(at.opacity, Math.min(this.modelOpacity, 1));
      gl.uniform3f(at.sun, this.sun[0], this.sun[1], this.sun[2]);
      gl.uniform1f(at.day, this.day);
      gl.uniform1f(at.night, night);
      this.shadowsFor(gl, at);
      gl.uniform1i(at.picture, 3);
      gl.activeTexture(gl.TEXTURE3);
      for (const where of [at.pos, at.normal, at.uv]) gl.enableVertexAttribArray(where);
      for (const prop of this.props) {
        // (What a mesh keeps in the graphics memory is made once, however many times it stands.)
        let kept = this.propStore.get(prop.mesh);
        const fresh = !kept;
        if (fresh) {
          kept = { buffers: { positions: gl.createBuffer(), normals: gl.createBuffer(), uvs: gl.createBuffer(), indices: gl.createBuffer(), ...(prop.mesh.tints ? { tints: gl.createBuffer() } : {}) } };
          this.propStore.set(prop.mesh, kept);
        }
        // Its tints: a mesh of many houses has one at every corner; a model that stands alone has none, and is left as it is.
        if (prop.mesh.tints) {
          gl.bindBuffer(gl.ARRAY_BUFFER, kept.buffers.tints);
          if (fresh) gl.bufferData(gl.ARRAY_BUFFER, prop.mesh.tints, gl.STATIC_DRAW);
          gl.enableVertexAttribArray(at.tint);
          gl.vertexAttribPointer(at.tint, 4, gl.UNSIGNED_BYTE, true, 0, 0);
        } else {
          gl.disableVertexAttribArray(at.tint);
          gl.vertexAttrib4f(at.tint, 0.5, 0.5, 0.5, 0); // (its own colours; by night neither lamp light nor a lit pane: it shows as its picture has it)
        }
        const send = (buffer, where, data, size) => {
          gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
          if (fresh) gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
          gl.vertexAttribPointer(where, size, gl.FLOAT, false, 0, 0);
        };
        send(kept.buffers.positions, at.pos, prop.mesh.positions, 3);
        send(kept.buffers.normals, at.normal, prop.mesh.normals, 3);
        send(kept.buffers.uvs, at.uv, prop.mesh.uvs, 2);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, kept.buffers.indices);
        if (fresh) gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, prop.mesh.indices, gl.STATIC_DRAW);
        let texture = this.pictureStore.get(prop.picture);
        const unseen = !texture;
        if (unseen) {
          texture = gl.createTexture();
          this.pictureStore.set(prop.picture, texture);
        }
        gl.bindTexture(gl.TEXTURE_2D, texture);
        if (unseen) {
          // Its picture: smoothed for the distance, and never repeated past its edge. (One larger than this
          // device can hold is halved until it can: a place on it is a share of its width and height, so
          // nothing that is drawn from it moves.)
          let picture = prop.picture;
          const most = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 2048;
          if (Math.max(picture.width, picture.height) > most && typeof document !== 'undefined') {
            let [wide, high] = [picture.width, picture.height];
            while (Math.max(wide, high) > most) [wide, high] = [Math.max(wide >> 1, 1), Math.max(high >> 1, 1)];
            const smaller = document.createElement('canvas');
            smaller.width = wide;
            smaller.height = high;
            smaller.getContext('2d').drawImage(picture, 0, 0, wide, high);
            picture = smaller;
          }
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
          gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, picture);
          const square = (size) => size > 0 && (size & (size - 1)) === 0;
          const whole = square(picture.width) && square(picture.height);
          if (whole) gl.generateMipmap(gl.TEXTURE_2D);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, whole ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        }
        const angle = (prop.turn * Math.PI) / 180;
        gl.uniform3f(at.at, prop.at[0], prop.at[1], prop.at[2] ?? 0);
        gl.uniform2f(at.turn, Math.cos(angle), Math.sin(angle));
        gl.uniform1f(at.tall, prop.tall);
        gl.uniform1f(at.lit, prop.lit);
        gl.uniform2f(at.byDay, prop.gain, prop.plain);
        gl.drawElements(gl.TRIANGLES, prop.mesh.indices.length, gl.UNSIGNED_SHORT, 0);
      }
      for (const where of [at.pos, at.normal, at.uv, at.tint]) gl.disableVertexAttribArray(where);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.activeTexture(gl.TEXTURE0);
    }
    if (!shown) {
      this.drawHaze(gl, m);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      return;
    }

    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.at.matrix, false, m);
    gl.uniform1f(this.at.opacity, this.opacity);
    gl.uniform1f(this.at.night, night);
    // (A lamp shows as soon as it is on. The light it throws on the ground counts for little until it is
    // dark: at dusk the daylight still drowns it.)
    const thrown = lamps * night ** LAMP_THROW_POWER;
    gl.uniform1f(this.at.pixel, pixelPerDepth);
    gl.uniform1f(this.at.depth, depth);
    gl.uniform3f(this.at.eye, this.eye[0], this.eye[1], this.eye[2]);
    // A point of light is never drawn smaller than a speck that shows on this screen, nor absurdly large.
    const sharp = Math.max(this.sharp, 1);
    gl.uniform2f(this.at.pointRange, 1.1 * sharp, 7 * sharp);
    this.shadowsFor(gl, this.at);
    gl.enableVertexAttribArray(this.at.pos);
    gl.enableVertexAttribArray(this.at.color);
    const draw = (part, halo = false) => {
      const mesh = part.mesh;
      gl.uniform1f(this.at.shaded, part.shaded && !part.glow && !part.sky ? 1 : 0);
      gl.uniform1f(this.at.glow, part.glow ? 1 : 0);
      gl.uniform1f(this.at.point, halo ? part.point * HALO_WIDER : part.point);
      gl.uniform1f(this.at.halo, halo ? 1 : 0);
      gl.uniform1f(this.at.opacity, halo ? this.opacity * HALO_FAINT : this.opacity);
      // (What is in the sky comes in the colours it was given: the hour is in them already.)
      gl.uniform1f(this.at.sky, part.sky ? 1 : 0);
      gl.uniform3f(this.at.shift, part.shift ? part.shift[0] : 0, part.shift ? part.shift[1] : 0, part.shift ? part.shift[2] : 0);
      const cloud = part.cloud;
      gl.uniform1f(this.at.cloud, cloud ? cloud.solid : 0);
      if (cloud) {
        gl.uniform4f(this.at.grain, cloud.grain[0], cloud.grain[1], 1 / cloud.size, cloud.stretch);
        gl.uniform2f(this.at.grainTurn, cloud.wind[0], cloud.wind[1]);
      }
      gl.uniform1f(this.at.night, part.sky || part.bright ? 0 : night);
      gl.uniform1f(this.at.lamps, part.sky ? 1 : part.point > 0 ? lamps : thrown);
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
      gl.drawArrays(part.point > 0 ? gl.POINTS : gl.TRIANGLES, 0, mesh.count);
      if (part.lifted > 0) {
        gl.disable(gl.POLYGON_OFFSET_FILL);
        gl.polygonOffset(0, 0);
      }
    };
    for (const part of this.parts.values()) {
      if (!part.glow && !part.mask && !part.sky && part.mesh && part.mesh.count > 0) draw(part);
    }
    // Then the sky, behind all that, in its own order: its lights first (the sun, the stars), then the
    // clouds over them, then the aircraft under the clouds. None of it is written into the picture's
    // depth: a cloud is thin at its edges, and hides nothing that comes after.
    gl.depthMask(false);
    for (const part of this.parts.values()) {
      if (part.sky && !part.late && part.mesh && part.mesh.count > 0) draw(part);
    }
    gl.depthMask(true);
    gl.disableVertexAttribArray(this.at.pos);
    gl.disableVertexAttribArray(this.at.color);
    // The haze, over everything that is solid and under every light: a lamp shows through the air.
    this.drawHaze(gl, m);
    gl.useProgram(this.program);
    gl.enableVertexAttribArray(this.at.pos);
    gl.enableVertexAttribArray(this.at.color);
    // Then the lights, over all that: each adds its light to what is behind it, and hides nothing. (So none
    // of them is written into the picture's depth: where two pools of light overlap, both are seen.)
    gl.depthMask(false);
    for (const part of this.parts.values()) {
      if (part.glow && (part.sky ? part.late : lamps > 0) && part.mesh && part.mesh.count > 0) draw(part);
    }
    // And round the lamps that are near, their glow.
    for (const part of this.parts.values()) {
      if (part.halo && lamps > 0 && part.mesh && part.mesh.count > 0) draw(part, true);
    }
    gl.depthMask(true);
    gl.disableVertexAttribArray(this.at.pos);
    gl.disableVertexAttribArray(this.at.color);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }
}
