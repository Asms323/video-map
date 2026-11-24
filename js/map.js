// The map itself: MapLibre drawing OpenFreeMap's street data, with the app's
// own layers (places, route, pin, "you are here") on top.

import {
  BUILDING_SOURCE,
  PLACE_CATEGORIES,
  RIYADH,
  VECTOR_SOURCE,
  WALL_DETAILS,
  WALL_KINDS,
  WALL_TINTS,
  buildingFootprints,
  buildingShadows,
  buildingsOnStreets,
  categoryFilter,
  circleRing,
  cityModelStyle,
  cleanCategories,
  clipLine,
  darkness,
  detailedStyle,
  displayName,
  footprintsIn,
  groundWidth,
  inRiyadh,
  lampsLit,
  linesFromGeometry,
  nearestRoad,
  osmRefFromTileId,
  placeKind,
  placeLayerIds,
  satelliteStyle,
  shadowReach,
  sunLight,
  skyColours,
  sunPosition,
  tileBox,
  wallImage,
  withOverlays,
} from './lib.js';
import { drawCuttings, overCutting } from './cuttings.js';
import { inFairground, onLagoon } from './boulevard.js';
import { CHARACTERS, characterAt, districtAt } from './districts.js';
import { dressHouses, parcelHouses, streetAprons } from './houses.js';
import { PLAIN_FUEL, brandOf, localKind, mosqueExtras, mosquesAmong, stationExtras, storeExtras } from './dress.js';
import { STAYED_BRIDGES, landmarkBeacons, landmarkModels, landmarkRoofs, landmarkShades, replacedByLandmarks } from './landmarks.js';
import { drawFarLights, drawLamps, drawRoofLights, drawTrafficLights, lightPoints, shopSpill } from './lights.js';
import { buildNetwork, drawBridges, drawMarks, drawParkedNear, drawRoofs, drawStreet, drawTraffic, drawTrees, faceLight, lightFrom, Mesh, stayedHere, streetDirection, streetNear, Traffic, trafficLevel } from './life.js';
import { ModelMesh } from './models.js';
import { propsNear, readProp } from './props.js';
import { plotWalls } from './plots.js';
import { drawFootbridges, drawRoadside, drawSigns, medianPalms } from './roadside.js';
import { RoofMesh, parapetShade, roofDecks, roofTone } from './roofs.js';
import { SceneLayer } from './scene.js';
import { aircraftOverRiyadh, buildingArchive, loadStyle, photoDate, photoProtocol, photoTile } from './services.js';
import { footprintGrid, heightsFromShadows, passSuns, pavedGrid, photoGrid, roofColours, tilesFor, treesInPhoto } from './sight.js';
import { CasterMesh, groundCasters, shadowCasters, shadowFall, shadowMapSize } from './shade.js';
import { Flights } from './flights.js';
import { drawSignalLamps, drawSignals, signalsOf } from './signals.js';
import { Walkers, drawWalkers } from './people.js';
import { CLOUD_LAYERS, cloudDrift, cloudLayersOf, cloudsNear, drawAircraft, drawClouds, drawHeavens, drawStars, moonAt, planetsAt, starPoints, starsAt, sunBetween } from './sky.js';
import { PARAPET_METERS, PARAPET_THICK_METERS, WallMesh, colourOf, facadeOf, footShade, parapetTops, tilePieces, wallTone, wallsOf } from './walls.js';

export const MAP_TYPES = ['city', 'streets', 'night', 'satellite', 'detailed'];

// How the 3D city is lit: by the sun as it really stands over the city at this hour ('sun'), or as by
// day or as by night whatever the hour.
export const LIGHT_MODES = ['sun', 'day', 'night'];
// The sun put in the sky to show the city by day when the real one is low or down: a morning sun from
// the south-east. And the one that shows it by night when the real one is up: well below the horizon.
const SHOWN_DAY_SUN = { azimuth: 128, altitude: 44 };
const SHOWN_NIGHT_SUN = { azimuth: 300, altitude: -30 };
const SHOWN_DAY_FROM_DEGREES = 12; // the real sun does for "day" once it stands this high
// The map's own drawing follows the dark in steps this fine, and the pictures of the walls in coarser ones.
const NIGHT_STEP = 0.04;
const WALL_NIGHT_STEPS = 8;
const LAMPS_MOST = 3000;
// How wide a point of light is, in metres: the head of a street lamp, a headlight or a tail light, the red
// lamp on a tower, and one of the city's lights seen from afar. (None is ever drawn smaller than a speck.)
const POINT_METERS = { lamp: 2.6, vehicle: 1.5, beacon: 3.4, far: 7, signal: 2.4 };
const CORNER_LAMPS_FROM_METERS = 60; // a building this tall has a red lamp on each corner of its roof
// A vehicle is drawn with its wheels and its rounded corners while a pixel of the screen shows no more
// of it than this; and never further from the eye than so far.
const FINE_VEHICLE_METERS_A_PIXEL = 0.17;
const FINE_VEHICLE_FURTHEST_METERS = 450;
// Somebody on a pavement is drawn while a pixel of the screen shows no more than this of them (so that
// they stand a dozen pixels tall at the least); and never further from the eye than so far.
const PARKED_NEAR_AGAIN_METERS = 14; // the cars that stand near are looked over again when the eye has moved so far
const WALKER_METERS_A_PIXEL = 0.14;
const WALKER_FURTHEST_METERS = 320;

// Styles drawn on a dark ground need light text on the app's own markers.
const DARK_TYPES = new Set(['night', 'satellite']);

// How the camera sits while it follows you: how far it leans over (degrees from
// straight down) and, in the view that does not turn, which way it looks.
const FLAT_CAMERA = { north: { pitch: 0, bearing: 0, lens: 36.87 }, heading: { pitch: 55, lens: 36.87 } };

// The 3D city is drawn isometric, the way an architect draws a model: looking
// down at the angle where the three edges of a cube all measure the same on
// screen, corner-on to the streets, and through a lens so long that parallel
// lines stay parallel instead of running off to a vanishing point.
const ISO_PITCH = 54.7;
const ISO_BEARING = 45; // looking north-east
const ISO_LENS = 6; // degrees of view, top to bottom
const NORMAL_LENS = 36.87; // the map library's own
// Turned the way you travel, the 3D city is seen the way a camera sees it from a tall building or a
// drone: from low behind you, along the road to the horizon, through an ordinary lens, with the sky
// over the skyline. Close enough in for the camera to be a hundred metres or so up.
const SKY_PITCH = 78;
const SKY_ZOOM = 17.2;
const SKY_BELOW_MIDDLE = 0.3; // how far below the middle of the picture you are, as a part of its height
const MOST_PITCH = 82;
const CITY_CAMERA = { north: { pitch: ISO_PITCH, bearing: ISO_BEARING, lens: ISO_LENS }, heading: { pitch: SKY_PITCH, lens: NORMAL_LENS, zoom: SKY_ZOOM, below: SKY_BELOW_MIDDLE } };
const cameraOf = (type) => (type === 'city' ? CITY_CAMERA : FLAT_CAMERA);
// Towards the horizon the air itself shows: what is far off fades into haze (see the scene), from this
// much tilt on, and fully from a few degrees more.
const HAZE_FROM_PITCH = 62;
const HAZE_FULL_PITCH = 70;
// The sky has things in it (see sky.js): put afresh round the eye with every picture, once the view is
// tilted far enough to show any sky at all.
const SKY_FROM_PITCH = 40;
const SKY_POINT_PIXELS = 2.4; // how wide the faintest star, or an aircraft's lamp, is drawn
const SKY_SLOW_MS = 60000; // what stands in the sky (the sun's colours, the moon, the stars, the clouds) is set out afresh this often,
const SKY_MOVED_METERS = 1500; // or when the eye has moved this far,
const SKY_NIGHT_STEP = 0.01; // or the light has changed by this much
const SKY_EAST_METERS = Math.cos((24.7 * Math.PI) / 180) * 111320; // a degree east, over Riyadh
// The parts of the sky, in the order they are drawn in: the furthest first.
const SKY_CLOUD_PARTS = ['skyhigh', 'skymid', 'skylow'];
const SKY_GRAIN_WRAP_METERS = 262144;
const FLIGHTS_ASK_MS = 15000; // how often the feed of live aircraft is given the chance to be asked
const PLACES_GONE_PITCH = 82; // tilted this far the places' markers are put away; four degrees short of it they are all there

// Shadows are worked out for what is on screen and a margin around it, and
// again once the view leaves that area, new map tiles arrive or the sun moves on.
const SHADE_SOURCE = 'city-shade';
const EXTRAS_SOURCE = 'city-extras';
const SHADE_MIN_ZOOM = 15;
const SHADE_MARGIN_METERS = 250;
const SHADE_REACH_METERS = 1500; // never further than this from the middle of the view
const SHADE_SMALLEST_PX = 1.5;
const SHADE_PAUSE_MS = 500;
const SHADE_LONGEST_WAIT_MS = 2500;
// The picture of the buildings from straight above (how open to the sky a place is): a spot of it is so
// many metres of ground, and it is never more than so many spots a side.
const HEIGHTS_FINE_METERS = 1.5;
const HEIGHTS_SIZE_MOST = 1024;
const SUN_CHECK_MS = 60000;
const EARTH_AROUND_METERS = 40075016.686;
const METERS_PER_DEGREE = 111320;

// The traffic lives on the streets of a wider area than the screen, so vehicles
// are already on their way when they come into view.
const LIFE_LAYER = 'city-life';
const LIFE_MIN_ZOOM = 15;
const MODEL_MIN_ZOOM = 10.5; // the models of the famous buildings show from much further off
const LIFE_MARGIN_METERS = 500;
const LIFE_REACH_METERS = 2200;
const LIFE_LINES = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'busway', 'service', 'rail', 'transit']);

// Buildings come one outline each from Overture's archive. When its address
// is slow to find the city is shown with the street map's own buildings first;
// when the archive does not answer at all, those are what stays.
const ARCHIVE_WAIT_MS = 2500;
const ARCHIVE_FAILURES = 3;
// The layers that draw buildings from the archive, and the streets no building may stand on.
const BUILDING_LAYERS = ['city-buildings', 'city-towers', 'city-painted', 'city-stations', 'city-roofs', 'city-contact'];
const PART_LAYERS = ['city-parts', 'city-parts-painted', 'city-parts-roofs'];
const THROUGH_STREETS = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor']);
const ON_STREET_METERS = 15;
// The kinds of place that make a building a shared one: with several of them in it, it is no single chain's.
const SHOP_CLASSES = new Set(['restaurant', 'fast_food', 'cafe', 'shop', 'grocery', 'clothing_store', 'bank', 'pharmacy', 'bakery', 'car', 'lodging', 'cinema', 'office', 'bar', 'ice_cream', 'beer']);

// The satellite photo is never shown in the 3D city. It is read, around the
// view: for trees, for building heights, and for the colours of roofs and walls.
const PHOTO_ZOOM = 17;
const PHOTO_MIN_ZOOM = 15.5;
const PHOTO_MARGIN_METERS = 150;
const PHOTO_REACH_METERS = 700; // never further than this from the middle of the view
const PHOTO_MOST_TREES = 2500;
// How far above the slab the map draws on top of every building its roof is laid. Seen through the long
// lens of the isometric view the map cannot tell heights much closer than this apart.
const ROOF_LIFT_METERS = 0.3;
// The photo is taken a little from the side, and a tall building leans in it: what it shows where the
// outline says the roof is, is the roof only for buildings no taller than this.
const ROOF_COLOUR_MOST_METERS = 40;
const STORE_ROOF = [222, 221, 216]; // the roof of a store drawn in its chain's dress: pale metal sheet
const HEIGHTS_KEPT = 30000;
const UNRECORDED_METERS = 5; // the height the street map gives a building whose height nobody recorded
const ROOF_CAP_METERS = 1.2; // the slab the map draws on top of every building
const PARKED_MOST = 4000;
const BUILT_SQUARE_METERS = 32; // buildings are filed under squares of ground this wide, to be found quickly
const TRUNK_SQUARE_METERS = 6; // and trees under squares this wide
const TRUNK_CLEAR_METERS = 1.6; // no car stands this close to the trunk of a tree
const TREE_CLEAR_METERS = 2; // no tree this close to the edge of a road or a track
const PATH_CLEAR_METERS = 0.5;
const breathe = () => new Promise((resolve) => setTimeout(resolve, 0));
const wait = (ms, value) => new Promise((resolve) => setTimeout(() => resolve(value), ms));

/**
 * A number that is one outline's own and the same every time: from its
 * building's number in the map data, or from where it stands. What is made
 * up for a building (what stands on its roof) is made up from this.
 */
const ownNumber = (building, index) => {
  const [lng, lat] = building.polygons[index][0][0];
  const from = typeof building.id === 'number' && Number.isFinite(building.id) ? Math.floor(Math.abs(building.id) / 1024) : Math.abs(Math.round(lng * 1e5) * 31 + Math.round(lat * 1e5));
  return (from % 2147480000) + index * 7919;
};

/** The lines of a map feature, each [[lng, lat], …]. */
const lineParts = (geometry) => {
  if (geometry?.type === 'LineString') return [geometry.coordinates];
  if (geometry?.type === 'MultiLineString') return geometry.coordinates;
  return [];
};

/** Where the shadow of a 1 m pole ends, in metres east and north of its foot. */
const shadowTip = (reach) => {
  const direction = (reach.bearing * Math.PI) / 180;
  return [reach.factor * Math.sin(direction), reach.factor * Math.cos(direction)];
};
/** True while shadows made for one sun still fit another: their ends within 2% of their length. */
const sameShade = (made, now) => {
  const [east, north] = shadowTip(made);
  const [eastNow, northNow] = shadowTip(now);
  return Math.hypot(east - eastNow, north - northNow) <= 0.02 * Math.max(now.factor, 0.3);
};

const BLANK_STYLE = {
  version: 8,
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#dde4e8' } }],
};
const EMPTY = { type: 'FeatureCollection', features: [] };

const CREDITS_SHOWN_MS = 8000;
const LONG_PRESS_MS = 600;
const LONG_PRESS_SLOP_PX = 10;
const TAP_REACH_PX = 14;

// Marker drawings on a 24×24 grid; filled white on the category colour.
const ICON_PATHS = {
  fuel: 'M12 4.5c2.6 3.2 4.6 5.7 4.6 8.4a4.6 4.6 0 1 1-9.2 0c0-2.7 2-5.2 4.6-8.4z',
  charging: 'M13.2 3.5 6.5 13h4.3l-1 7.5 6.7-9.5h-4.3z',
  parking: 'M8.5 18.5v-13h4.6a4 4 0 0 1 0 8H11v5z M11 8v3h2a1.5 1.5 0 0 0 0-3z',
  food: 'M7.4 4.5h1v4.2h.9V4.5h1v4.2h.9V4.5h1v5.3a2 2 0 0 1-1.6 2v7.7H9v-7.7a2 2 0 0 1-1.6-2z M14.5 4.5c1.8.6 2.6 2.6 2.6 5v2.6h-1.4v7.4h-1.2z',
  worship: 'M12 5.2a.9.9 0 0 1 .9.9c1.9.7 3.6 2.6 3.6 5.2v.7H7.5v-.7c0-2.6 1.7-4.5 3.6-5.2a.9.9 0 0 1 .9-.9z M6.5 13h11v5.5h-11z',
  health: 'M10 5.5h4V10h4.5v4H14v4.5h-4V14H5.5v-4H10z',
  money: 'M4.5 7.5h15v9h-15z M6 10h12v1.6H6z',
  shops: 'M7 9h10l-.8 9.5H7.8z M9.5 9V7.5a2.5 2.5 0 0 1 5 0V9h-1.3V7.5a1.2 1.2 0 0 0-2.4 0V9z',
  hotels: 'M4.5 7v10.5H6V15h12v2.5h1.5V12a2.5 2.5 0 0 0-2.5-2.5h-6V13.5H6V7z M8.2 9.6a1.6 1.6 0 1 1 0 3.2 1.6 1.6 0 0 1 0-3.2z',
};

/** A round marker picture, drawn at twice the size it is shown at. */
function drawMarker(color, path) {
  const size = 56;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 4, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  if (path) {
    const scale = (size - 20) / 24;
    ctx.translate(10, 10);
    ctx.scale(scale, scale);
    ctx.fillStyle = '#ffffff';
    ctx.fill(new Path2D(path), 'evenodd');
  }
  return ctx.getImageData(0, 0, size, size);
}

// A wall's picture holds this many windows each way: by night some of them are lit and some dark.
const WALL_PICTURE_WINDOWS = 4;
// What the dark leaves of a wall's colour, and the light in a window with a lamp on behind it.
const WALL_NIGHT_TINT = [0.175, 0.195, 0.275];
const WINDOW_LIGHT = { low: [255, 204, 128], tall: [236, 242, 255], station: [255, 206, 118] };
// Of the sixteen windows of a picture, the ones with a lamp on: about one in three, fewer in a tower.
const WINDOWS_LIT = { low: [1, 4, 6, 11, 14], tall: [2, 9, 15], station: [] };

/**
 * A patch of wall to repeat along and up a building: four windows by four,
 * drawn at twice the size they are shown at. Without a layout the wall is
 * plain. night: how dark it is, 0 to 1: the wall goes dark and blue, and
 * some of the windows light up. own: a number that shifts which ones.
 */
function drawWall(kind, layout, night = 0, own = 0, name = 'low') {
  const scale = layout ? (kind.scale ?? 1) : 1;
  const bay = (layout?.bay ?? 2) * 2 * scale;
  const floor = (layout?.floor ?? 2) * 2 * scale;
  const each = layout ? WALL_PICTURE_WINDOWS : 1;
  const width = bay * each;
  const height = floor * each;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const lamps = lampsLit(night);
  const base = colourOf(kind.colour) ?? [240, 238, 232];
  const wall = base.map((part, i) => Math.round(part * (1 + (WALL_NIGHT_TINT[i] - 1) * night)));
  const light = WINDOW_LIGHT[name] ?? WINDOW_LIGHT.low;
  ctx.fillStyle = `rgb(${wall[0]}, ${wall[1]}, ${wall[2]})`;
  ctx.fillRect(0, 0, width, height);
  if (!layout) {
    // Too far off for windows: by night the wall has a little of the light of them all.
    if (lamps > 0) {
      ctx.fillStyle = `rgba(${light[0]}, ${light[1]}, ${light[2]}, ${0.09 * lamps})`;
      ctx.fillRect(0, 0, width, height);
    }
    return ctx.getImageData(0, 0, width, height);
  }
  const lit = new Set((WINDOWS_LIT[name] ?? WINDOWS_LIT.low).map((index) => (index + own * 5) % (each * each)));
  for (let row = 0; row < each; row += 1) {
    for (let column = 0; column < each; column += 1) {
      const x = column * bay;
      const y = row * floor;
      if (kind.lattice) {
        // A screen pierced in triangles: the two diagonals of every bay, and a line where the bays meet.
        // (By night the light of the station shows through it.)
        ctx.strokeStyle = kind.glass;
        ctx.lineWidth = Math.max(1, bay / 9);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + bay, y + floor);
        ctx.moveTo(x + bay, y);
        ctx.lineTo(x, y + floor);
        ctx.moveTo(x, y + floor - 0.5);
        ctx.lineTo(x + bay, y + floor - 0.5);
        ctx.stroke();
        if (lamps > 0) {
          ctx.strokeStyle = `rgba(${light[0]}, ${light[1]}, ${light[2]}, ${0.85 * lamps})`;
          ctx.stroke();
        }
        continue;
      }
      // Glass in the middle of the bay, with wall left at the sides and above and below.
      const paneWidth = Math.round(bay * kind.across);
      const paneHeight = Math.round(floor * kind.up);
      const left = x + Math.round((bay - paneWidth) / 2);
      const top = y + Math.round((floor - paneHeight) / 2);
      ctx.fillStyle = kind.glass;
      ctx.fillRect(left, top, paneWidth, paneHeight);
      if (layout.floor >= 6) {
        // Close enough to see the shade under the top of the window opening.
        ctx.fillStyle = 'rgba(30, 40, 60, 0.22)';
        ctx.fillRect(left, top, paneWidth, Math.max(1, Math.round(floor * 0.08)));
      }
      if (night > 0) {
        // By night the glass is dark, but for the rooms with a lamp on.
        const on = lit.has(row * each + column);
        ctx.fillStyle = on ? `rgba(${light[0]}, ${light[1]}, ${light[2]}, ${0.95 * lamps})` : `rgba(8, 11, 20, ${0.6 * night})`;
        ctx.fillRect(left, top, paneWidth, paneHeight);
      }
    }
  }
  return ctx.getImageData(0, 0, width, height);
}

/** The picture for a wall, by what its name stands for (see wallImage in lib.js), as it shows at a darkness. */
function wallPicture(wall, night) {
  const kind = wall.tint === null ? WALL_KINDS[wall.kind] : { ...WALL_KINDS[wall.kind], colour: WALL_TINTS[wall.tint] };
  return drawWall(kind, WALL_DETAILS[wall.detail], night, wall.tint ?? 0, wall.kind);
}

let rtlRequested = false;
let archiveReader = false;
let photoWay = false;

export class MapView {
  /**
   * handlers: onUserPan(), onViewChange(view), onPlaceTap(place),
   * onLongPress({ lat, lng }), onMeTap(), onMapTap(), onStyleError(error).
   * Throws if the browser cannot draw the map (no WebGL).
   */
  constructor(container, { view, handlers = {} } = {}) {
    const maplibregl = window.maplibregl;
    if (!maplibregl) throw new Error('The map library did not load');

    // Arabic, Hebrew and other right-to-left names need this add-on to be drawn joined up.
    if (!rtlRequested) {
      rtlRequested = true;
      try {
        const url = new URL('vendor/maplibre/mapbox-gl-rtl-text.js', document.baseURI).href;
        maplibregl.setRTLTextPlugin(url, true);
      } catch {
        // Already set by another map on the page.
      }
    }

    // Lets the map read tiles straight out of one big archive file on a plain web server.
    if (!archiveReader && window.pmtiles) {
      archiveReader = true;
      maplibregl.addProtocol('pmtiles', new window.pmtiles.Protocol().tile);
    }
    // The satellite photo comes by a way of the app's own, which knows how sharp it is to be had for each place.
    if (!photoWay) {
      photoWay = true;
      maplibregl.addProtocol('photo', photoProtocol);
    }

    this.handlers = handlers;
    this.type = null;
    this.categories = [];
    this.position = null;
    this.heading = null;
    this.pin = null;
    this.route = null;
    this.followMode = 'off';
    this.placeLayers = [];
    this.styleRequest = 0;
    this.cameraTarget = null;
    this.ignoreTapsUntil = 0;
    this.marker = null;
    this.images = new Map();
    this.sun = null;
    this.shade = null; // what the shadows on screen were made for
    this.shadeTimer = null;
    this.shadeWaitingSince = 0;
    this.tilesLoaded = 0;
    this.buildings = null; // the address of the buildings archive the style on screen draws from, if any
    this.archiveFailed = false;
    this.archiveErrors = 0;
    this.archiveTiles = 0;
    this.onStreets = new Set(); // buildings a street runs through, which are not drawn
    this.onStreetsFor = null; // the tiles they were last looked for in
    this.replaced = { building: new Set(), parts: new Set() }; // the map's own blocks where a landmark model stands
    this.dressed = new Set(); // the buildings drawn in a chain's colours instead
    this.storeRoofs = new Map(); // of those, the ones with walls and a roof of their own → how high that roof lies
    this.buildingFilters = new Map(); // layer → its filter as the style gave it
    this.archiveRead = null; // the archive's buildings as last read from the map, kept until new tiles arrive
    this.extrasMade = null; // what the footbridges, pavilions and store fronts were last built for
    this.extraShades = []; // what of all that throws a shadow of its own: the minarets
    this.lifeOn = true;
    this.lifeMade = null; // what the street network in use was made for
    this.lifeAt = 0;
    this.lifeDrawn = 0;
    this.traffic = new Traffic({ seed: Date.now() % 2147483647 });
    this.trafficMesh = new Mesh();
    this.walkers = new Walkers({ seed: (Date.now() + 7919) % 2147483647 }); // the people on the pavements
    this.walkerMesh = new Mesh();
    this.parkedNearMesh = new Mesh(); // the cars that stand near the eye, drawn with care
    this.parked = null; // { cars, kept, folded, at, drawn }: see layStreet() and moveParked()
    this.walkersDrawn = 0;
    this.photoOn = true;
    this.photoMade = null; // the area the photo was last read for
    this.photoRequest = 0;
    this.photoRead = null;
    this.heights = new Map(); // building → metres, as read from shadows in the photo
    this.heightsRead = 0;
    this.lifeView = null; // what is on screen, in the traffic's own metres
    this.trees = []; // { lng, lat, radius }
    this.treeMesh = new Mesh();
    this.treesLit = null;
    this.streetMesh = new Mesh(); // parked cars and bus shelters
    this.streetMade = null;
    this.network = null; // the streets and tracks around the view, as last read from the map
    this.bridgeMesh = new Mesh(); // the decks and piers of bridges and viaducts
    this.bridgesMade = 0;
    this.markMesh = new Mesh(); // the lines painted on the roads, and the crossings
    this.marksMade = null;
    this.roofMesh = new Mesh(); // what stands on the roofs
    this.roofs = []; // the buildings the shadows were last laid for
    this.houses = []; // the houses the blocks of villas among them were divided into (see houses.js)
    this.divided = new Set(); // the map's own blocks laid flat because the app draws houses of its own in their place
    this.mosqueIds = new Set(); // the buildings that are mosques: never divided into houses
    this.roofsMade = null;
    this.casterMesh = new CasterMesh(); // what throws the shadows on walls and roofs
    this.heightMesh = new CasterMesh(); // the tops of the buildings, for the picture of how open to the sky each place is
    this.heightsMade = null;
    this.shadowsMade = null;
    this.shadesNear = null; // which of the landmarks' shades were round here when the shadows were last laid
    this.wallMesh = new WallMesh(); // the walls, laid over the blocks the map draws
    this.wallsMade = null;
    this.footMesh = new Mesh(); // the shade on the ground at the foot of the walls
    this.parapetMesh = new Mesh(); // the tops of the parapets, and their inner sides
    this.wallColours = new Map(); // building → the colour of its walls, worked out from its roof in the photo
    this.roofColours = new Map(); // building → the colour of its roof, as the photo shows it
    this.deckMesh = new RoofMesh(); // the roofs themselves
    this.roofShadeMesh = new Mesh(); // the shade on the roofs: of their parapets and of what stands on them
    this.sharpOn = true; // the photo of the Satellite look as sharp as the screen can show it
    this.detailOn = true; // walls drawn window by window, and shadows on walls and roofs
    this.lightMode = 'sun'; // one of LIGHT_MODES
    this.night = 0; // how dark the 3D city is right now: 0 by day, 1 by night
    this.cityBase = null; // the street map's style the 3D city on screen was built on
    this.cityStyle = null; // the 3D city's style as it was last brought into line with the dark
    this.wallNight = 0; // the dark the walls' pictures were last drawn for
    this.lampPostMesh = new Mesh(); // the street lamps: posts, arms and heads
    this.lampLightMesh = new Mesh(); // their light: the lit heads, and the pools on the ground
    this.lampsMade = null;
    this.lampHeadMesh = new Mesh(); // and the lit head of each, a point of light
    this.lightMesh = new Mesh(); // the lights of the traffic: the beams on the road, the lit windows
    this.carLightMesh = new Mesh(); // and its lamps, white ahead and red behind, each a point of light
    this.farLightMesh = new Mesh(); // the city's lights beyond where the lamps stand one by one, out to the horizon
    this.farMade = null;
    this.beaconMesh = new Mesh(); // the red lamps on what is tall
    this.plotMesh = new Mesh(); // the walls round the houses
    this.houseMesh = new Mesh(); // the plot of each house the app has laid out itself: wall, gate, court (see houses.js)
    this.apronMesh = new Mesh(); // the asphalt between each house street and the walls along it
    this.apronsMade = null;
    this.roadsideMesh = new Mesh(); // barriers, sign gantries and the kerbs of medians
    this.signMesh = new Mesh(); // the signs along the roads, and the hoardings beside the great ones
    this.signLightMesh = new Mesh(); // the hoardings as they are lit by night
    this.signsMade = null;
    this.roadsideMade = null;
    this.footbridgeMesh = new Mesh(); // the footbridges over the great roads
    this.signalMesh = new Mesh(); // the traffic signals: their posts, arms and heads, and the stop lines
    this.signalLampMesh = new Mesh(); // the lamp that is lit on each
    this.signalGlowMesh = new Mesh(); // and its shine by night
    this.signals = null; // where the signals stand and how they are run (see signals.js)
    this.signalMarks = null; // where OpenStreetMap marks signals, once it has been asked: { bounds, points }
    this.signalsMade = null;
    this.signalsRead = null; // the streets and the marks the signals were last worked out from
    // The sky (see sky.js), in the order it is drawn in, the furthest first:
    this.skyWashMesh = new Mesh(); // the Earth's shadow, rising opposite the sun as it goes down
    this.skyGlowMesh = new Mesh(); // its light: the glare round the sun, the glow where it goes down, the shine round the moon
    this.skySunMesh = new Mesh(); // the sun's own disc, which shows through the haze
    this.skyStarMesh = new Mesh(); // the stars and the planets
    this.skyMoonMesh = new Mesh(); // the moon's face
    this.skyCloudMeshes = [new Mesh(), new Mesh(), new Mesh()]; // the clouds: high, middle and low
    this.skyPlaneMesh = new Mesh(); // the aircraft and their trails
    this.skyPlaneLampMesh = new Mesh(); // and their lamps
    this.skyMade = null;
    this.skyKept = null; // what of the sky is set out only now and then
    this.skyOrdered = false; // whether the scene has had the parts of the sky, in their order
    this.weather = null; // what is known of the weather: how much cloud, the wind
    this.sunlight = 1; // how much of the sun gets through the clouds
    this.flights = new Flights(); // the aircraft: live where a feed has them, the airport's typical traffic otherwise
    this.flightsAskedAt = 0;
    this.footbridges = []; // the footpaths the map marks as bridges, round here
    this.footbridgesMade = null;
    this.cuttingMesh = new Mesh(); // the floors and walls of the roads that run below the ground
    this.bankMesh = new Mesh(); // the ground beside them, which hides what is behind it
    this.cuttingGlowMesh = new Mesh(); // and the lamps' light on their floors and walls by night
    this.cuttingsMade = null;
    this.plotsMade = null;
    this.housesMade = null;
    this.modelMesh = new ModelMesh(); // the famous buildings that are true models
    this.modelsMade = null;
    this.propFiles = new Map(); // the models that carry a picture, as fetched: by file, { mesh, picture } (both null while on their way)
    this.propsMade = null;
    this.roadNames = null; // the layers of names along the roads, and how strongly they are shown
    this.spillMesh = new Mesh(); // the light from shop windows on the pavement
    this.roofLightMesh = new Mesh(); // the lamps left on up on the roofs
    this.spillMade = null;
    this.groundMade = null; // where the buildings stand, as last worked out (see builtGround)
    this.scene = new SceneLayer(LIFE_LAYER, { onFrame: () => this.moveLife() });
    // For anyone looking at the scene from outside (the tests do): what it holds.
    this.scene.counts = () => ({ life: this.lifeCounts(), photo: this.photoCounts(), buildings: this.buildingCounts(), detail: this.detailCounts(), night: this.nightCounts(), busy: { ...this.busy } });
    // How often each piece of work has been done, for anyone wondering what keeps the map from coming to rest.
    this.busy = { shade: 0, roofs: 0, extras: 0, photo: 0, filters: 0, tiles: 0, night: 0 };

    // The map opens on Riyadh, and keeps to it: it cannot be moved off the city, nor drawn back until
    // the city is a dot.
    const { west, south, east, north } = RIYADH.bounds;
    const start = view && inRiyadh(view) ? view : { ...RIYADH.centre, zoom: RIYADH.zoom };
    this.map = new maplibregl.Map({
      container,
      style: BLANK_STYLE,
      center: [start.lng, start.lat],
      zoom: start.zoom,
      maxBounds: [[west, south], [east, north]],
      minZoom: 8,
      maxZoom: 19,
      maxPitch: MOST_PITCH,
      // Photo tiles that have left the screen are kept for coming back to, but not many: sharp ones are small and there are a lot of them.
      maxTileCacheZoomLevels: 2,
      // (The aircraft are the OpenSky Network's wherever its receivers have any to report; it asks to be named.)
      attributionControl: { compact: true, customAttribution: 'Live aircraft, where any are known: The OpenSky Network' },
    });
    const map = this.map;
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');

    this.meElement = document.createElement('button');
    this.meElement.type = 'button';
    this.meElement.className = 'me';
    this.meElement.setAttribute('aria-label', 'You are here. Tap for details.');
    this.meElement.innerHTML = '<span class="me-heading"></span><span class="me-dot"></span>';
    this.meElement.addEventListener('click', (event) => {
      event.stopPropagation();
      this.handlers.onMeTap?.();
    });

    // The pane changes size when the bar is dragged, the layout changes or the phone turns.
    new ResizeObserver(() => map.resize()).observe(container);

    // The map credits start open, as the data providers ask. After a few seconds they
    // fold into their "i" button so they do not sit on top of the map for the whole drive.
    setTimeout(() => {
      container.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
    }, CREDITS_SHOWN_MS);

    map.on('styleimagemissing', (event) => this.provideImage(event.id));
    map.on('style.load', () => {
      this.applyOverlays();
      this.sun = null;
      this.shade = null;
      this.lifeMade = null;
      this.network = null;
      this.raiseBuildings(this.heights.keys()); // a new style starts without the heights read from the photo
      this.divided = new Set(); // and with every block standing: those the app has divided are laid flat again with the shadows
      this.buildingFilters.clear();
      this.extrasMade = null;
      this.clearStreets(true);
      this.syncLife();
      this.followSun();
    });
    map.on('move', () => {
      this.lifeView = null;
    });
    map.on('error', (event) => {
      if (event.sourceId === BUILDING_SOURCE) this.archiveTrouble(Boolean(event.tile));
    });
    map.on('dragstart', () => {
      this.cameraTarget = null;
      this.handlers.onUserPan?.();
    });
    map.on('moveend', () => {
      this.handlers.onViewChange?.(this.view());
      this.followSun();
    });
    map.on('sourcedata', (event) => {
      if ((event.sourceId !== VECTOR_SOURCE && event.sourceId !== BUILDING_SOURCE) || !event.tile) return;
      if (event.sourceId === BUILDING_SOURCE) this.archiveTiles += 1;
      this.tilesLoaded += 1;
      this.busy.tiles += 1;
      this.queueShade(true);
    });
    setInterval(() => this.followSun(), SUN_CHECK_MS);
    map.on('click', (event) => this.handleTap(event));
    this.watchLongPress();
  }

  // ── Style ───────────────────────────────────────────────────────────────

  /** How many real pixels of the screen the photo is fitted to, to each of the map's: the screen's own count, or 1 for the photo as coarse as the map would have it. */
  photoPixels() {
    return this.sharpOn ? Math.min(Math.max(window.devicePixelRatio || 1, 1), 3) : 1;
  }

  /**
   * Draw the walls window by window and let the buildings throw shadows on
   * each other (which is more work for the phone with every picture), or
   * leave the walls as the map draws them.
   */
  setDetail(on) {
    if (this.detailOn === Boolean(on)) return;
    this.detailOn = Boolean(on);
    this.layRoofs();
    this.laySigns();
    this.map.triggerRepaint();
  }

  /**
   * Light the 3D city by the sun as it really stands ('sun'), or show it as
   * by day or as by night whatever the hour.
   */
  setLightMode(mode) {
    const wanted = LIGHT_MODES.includes(mode) ? mode : 'sun';
    if (this.lightMode === wanted) return;
    this.lightMode = wanted;
    this.followSun();
    this.map.triggerRepaint();
  }

  /**
   * The sun the 3D city is lit by at a place { lat, lng }: the real one for
   * this hour, unless the city is being shown by day or by night and the real
   * one does not do for that.
   */
  sunAt(place) {
    const real = sunPosition(new Date(), place.lat, place.lng);
    if (this.lightMode === 'day' && !(real.altitude >= SHOWN_DAY_FROM_DEGREES)) return SHOWN_DAY_SUN;
    if (this.lightMode === 'night' && darkness(real) < 1) return SHOWN_NIGHT_SUN;
    return real;
  }

  /** The 3D city's style for a darkness, with the app's own drawings on top. */
  cityStyleFor(night) {
    return withOverlays(cityModelStyle(this.cityBase, { buildings: this.buildings, night, sunlight: this.sunlight }), {
      categories: this.categories,
      dark: night >= 0.5,
      accuracy: this.accuracyData(),
      pin: this.pinData(),
      route: this.routeData(),
    });
  }

  /**
   * Bring the map's own drawing of the 3D city into line with how dark it is:
   * the dark over the ground, the lamps along the roads, the sky, the colours
   * of the blocks and the names, the pictures of the walls. Only what differs
   * from what is on screen is changed.
   */
  applyNight(night) {
    if (this.type !== 'city' || !this.cityBase || !this.cityStyle) return;
    const made = this.cityStyle.night;
    const ends = (night === 0 || night === 1) && night !== made; // day and night themselves are always reached exactly
    // (The clouds count too: under them the shadows on the ground are fainter.)
    const clouded = Math.abs((this.cityStyle.sunlight ?? 1) - this.sunlight) > 0.02;
    if (Math.abs(night - made) < NIGHT_STEP && night >= 0.5 === made >= 0.5 && !ends && !clouded) return;
    this.whenStyled((map) => {
      if (!map.getLayer('city-night')) return; // the style is still on its way
      const next = this.cityStyleFor(night);
      const before = new Map(this.cityStyle.layers.map((layer) => [layer.id, layer.paint ?? {}]));
      for (const layer of next.layers) {
        const old = before.get(layer.id);
        if (!old || !map.getLayer(layer.id)) continue;
        const paint = layer.paint ?? {};
        // (What was said before and is not said now goes back to what it is when nothing is said: a name's dark edge by day.)
        for (const name of new Set([...Object.keys(paint), ...Object.keys(old)])) {
          if (JSON.stringify(paint[name]) !== JSON.stringify(old[name])) map.setPaintProperty(layer.id, name, paint[name]);
        }
      }
      map.setSky(next.sky);
      next.night = night;
      next.sunlight = this.sunlight;
      this.cityStyle = next;
      this.busy.night += 1;
    });
    this.repaintWalls(night);
  }

  /** Draw the pictures of the walls afresh for a darkness, if it has changed by a step since they were drawn. */
  repaintWalls(night) {
    const step = Math.round(night * WALL_NIGHT_STEPS) / WALL_NIGHT_STEPS;
    if (step === this.wallNight) return;
    this.wallNight = step;
    for (const id of [...this.images.keys()]) {
      const wall = wallImage(id);
      if (!wall) continue;
      const image = wallPicture(wall, step);
      this.images.set(id, image);
      this.whenStyled((map) => {
        if (map.hasImage(id)) map.updateImage(id, image);
      });
    }
  }

  /** How dark the 3D city is and what is lit in it, for anyone who wants to know. */
  nightCounts() {
    return {
      mode: this.lightMode,
      night: this.night,
      lamps: lampsLit(this.night),
      styled: this.cityStyle?.night ?? null,
      walls: this.wallNight,
      streetLamps: this.lampsMade?.lamps ?? 0,
      lampWays: this.lampsMade?.ways ?? 0,
      glow: this.lampLightMesh.count,
      heads: this.lampHeadMesh.count,
      far: this.farMade?.points ?? 0,
      vehicleLights: this.lightMesh.count,
      vehicleLamps: this.carLightMesh.count,
      spill: this.spillMade?.strips ?? 0,
      beacons: this.spillMade?.beacons ?? 0,
      roofLamps: this.spillMade?.roofLamps ?? 0,
    };
  }

  /** Show the photo of the Satellite look as sharp as the screen can show it (which takes more of it to fetch), or not. */
  setSharp(on) {
    if (this.sharpOn === Boolean(on)) return;
    this.sharpOn = Boolean(on);
    if (this.type === 'satellite') this.setType(this.type);
  }

  /** Switch to one of MAP_TYPES. Resolves true once the new style is on its way to the screen. */
  async setType(type) {
    const request = ++this.styleRequest;
    let base;
    let buildings = null;
    let cityBase = null;
    // (The 3D city starts in the light it is to be shown in: by night it is not first drawn by day.)
    const centre = this.map.getCenter();
    const night = type === 'city' ? darkness(this.sunAt(centre)) : 0;
    try {
      if (type === 'night') {
        base = await loadStyle('fiord');
      } else if (type === 'city') {
        const archive = this.archiveFailed || !window.pmtiles ? Promise.resolve(null) : buildingArchive();
        const [streets, found] = await Promise.all([loadStyle('liberty'), Promise.race([archive, wait(ARCHIVE_WAIT_MS, undefined)])]);
        buildings = found ?? null;
        cityBase = streets;
        base = cityModelStyle(streets, { buildings, night, sunlight: this.sunlight });
        if (found === undefined) {
          // Still looking. Once the address is known the city is drawn again, a house at a time.
          archive.then((late) => {
            if (late && request === this.styleRequest && this.type === 'city' && !this.archiveFailed) this.setType('city');
          });
        }
      } else {
        const streets = await loadStyle('liberty');
        if (type === 'satellite') base = satelliteStyle(streets, { pixelRatio: this.photoPixels() });
        else if (type === 'detailed') base = detailedStyle(streets);
        else base = streets;
      }
    } catch (error) {
      if (request === this.styleRequest) this.handlers.onStyleError?.(error);
      return false;
    }
    if (request !== this.styleRequest) return false; // a newer choice overtook this one

    this.type = type;
    if (buildings !== this.buildings) {
      // Another set of buildings: what was read from the photo belonged to the old ones.
      this.buildings = buildings;
      this.onStreets.clear();
      this.replaced.building.clear();
      this.replaced.parts.clear();
      this.dressed = new Set();
      this.storeRoofs = new Map();
      this.onStreetsFor = null;
      this.heights.clear();
      this.photoMade = null;
      this.heightsRead += 1;
    }
    this.archiveErrors = 0;
    this.archiveTiles = 0;
    const style = withOverlays(base, {
      categories: this.categories,
      dark: DARK_TYPES.has(type) || night >= 0.5,
      accuracy: this.accuracyData(),
      pin: this.pinData(),
      route: this.routeData(),
    });
    this.cityBase = cityBase;
    this.cityStyle = cityBase ? { ...style, night, sunlight: this.sunlight } : null;
    if (cityBase) this.repaintWalls(night);
    this.placeLayers = placeLayerIds(style);
    this.map.setStyle(style, { diff: false });
    // Each map type has its own lens and camera angle.
    this.cameraTarget = null;
    if (this.followMode === 'off' || !this.position || !inRiyadh(this.position)) {
      // Not following anyone: the map stays where it is, seen the way this type is seen when it does
      // not turn (the 3D city isometric, the others from straight above with north up).
      const { pitch, bearing, lens } = cameraOf(type).north;
      this.map.setVerticalFieldOfView(lens);
      this.map.jumpTo({ pitch, bearing });
    } else {
      this.map.setVerticalFieldOfView(cameraOf(type)[this.followMode].lens);
      this.moveCamera(false, true);
    }
    return true;
  }

  provideImage(id) {
    if (this.map.hasImage(id)) return;
    if (!this.images.has(id)) {
      const category = PLACE_CATEGORIES.find((item) => `vm-${item.id}` === id);
      const wall = wallImage(id);
      let image;
      if (category) image = drawMarker(category.color, ICON_PATHS[category.id]);
      else if (id === 'vm-other') image = drawMarker('#868e96', null);
      else if (wall) image = wallPicture(wall, this.wallNight);
      // A base style sometimes names a picture its sprite sheet lacks; draw nothing for it.
      else image = { width: 1, height: 1, data: new Uint8Array(4) };
      this.images.set(id, image);
    }
    this.map.addImage(id, this.images.get(id), { pixelRatio: 2 });
  }

  /**
   * Run a change against the style on screen. While a new style is still
   * loading the change cannot land; "style.load" then applies everything.
   */
  whenStyled(change) {
    try {
      change(this.map);
    } catch {
      // Picked up by applyOverlays() once the style is ready.
    }
  }

  setSourceData(id, data) {
    this.whenStyled((map) => map.getSource(id)?.setData(data));
  }

  syncPlaces() {
    this.whenStyled((map) => {
      if (!map.getLayer('vm-places')) return;
      map.setFilter('vm-places', categoryFilter(this.categories));
      map.setLayoutProperty('vm-places', 'visibility', this.categories.length > 0 ? 'visible' : 'none');
    });
  }

  /** Push the current markers, pin, route and accuracy circle into a freshly loaded style. */
  applyOverlays() {
    this.setSourceData('vm-accuracy', this.accuracyData());
    this.setSourceData('vm-pin', this.pinData());
    this.setSourceData('vm-route', this.routeData());
    this.syncPlaces();
  }

  setCategories(ids) {
    this.categories = cleanCategories(ids);
    this.syncPlaces();
  }

  // ── Buildings (3D city) ─────────────────────────────────────────────────

  /**
   * The buildings archive failed to answer: for one tile, or (oneTile false)
   * when it was opened. If it has never given a tile, go back to the street
   * map's own buildings.
   */
  archiveTrouble(oneTile) {
    this.archiveErrors += oneTile ? 1 : ARCHIVE_FAILURES;
    if (this.archiveFailed || !this.buildings || this.archiveTiles > 0 || this.archiveErrors < ARCHIVE_FAILURES) return;
    this.archiveFailed = true;
    if (this.type === 'city') this.setType('city');
  }

  /**
   * Stand buildings up to the heights read from the photo. The map keeps a
   * height for each building by its number, and draws it in place of the usual one.
   */
  raiseBuildings(ids) {
    if (!this.buildings || !this.photoOn) return;
    this.whenStyled((map) => {
      if (!map.getSource(BUILDING_SOURCE)) return;
      for (const id of ids) {
        const height = this.heights.get(id);
        if (height !== undefined) map.setFeatureState({ source: BUILDING_SOURCE, sourceLayer: 'building', id }, { h: height });
      }
    });
  }

  /**
   * The buildings the map has loaded from the archive: { building, parts }, as
   * map features. Reading them out of the map is the slow part, so they are
   * kept until new tiles arrive.
   */
  archiveBuildings() {
    if (this.archiveRead?.tiles !== this.tilesLoaded || this.archiveRead.archive !== this.buildings) {
      this.archiveRead = {
        tiles: this.tilesLoaded,
        archive: this.buildings,
        building: this.map.querySourceFeatures(BUILDING_SOURCE, { sourceLayer: 'building' }),
        parts: this.map.querySourceFeatures(BUILDING_SOURCE, { sourceLayer: 'building_part' }),
      };
    }
    return this.archiveRead;
  }

  /**
   * Leave out the map's own buildings that should not be drawn: those a street
   * runs straight through (mostly stations under the street, which the data
   * does not always say are underground), and those a landmark model stands
   * in for. Looked for whenever new map tiles have arrived. always: put the
   * filters on the layers even if nothing new was found (a new style has none).
   */
  clearStreets(always = false) {
    const map = this.map;
    if (!this.buildings || this.type !== 'city') return;
    let grown = false;
    if (this.onStreetsFor !== this.tilesLoaded) {
      try {
        const everywhere = { west: -180, south: -90, east: 180, north: 90 };
        const { building, parts } = this.archiveBuildings();
        const buildings = buildingFootprints(building, everywhere, null, this.onStreets);
        const streets = [];
        for (const feature of map.querySourceFeatures(VECTOR_SOURCE, { sourceLayer: 'transportation' })) {
          const properties = feature.properties ?? {};
          if (!THROUGH_STREETS.has(properties.class) || properties.brunnel === 'tunnel' || properties.brunnel === 'bridge') continue;
          streets.push(...lineParts(feature.geometry));
        }
        for (const id of buildingsOnStreets(buildings, streets, ON_STREET_METERS)) {
          this.onStreets.add(id);
          grown = true;
        }
        const outlines = (list) => list.flatMap((one) => one.polygons.map((polygon) => ({ id: one.id, ring: polygon[0] })));
        for (const [kind, list] of [['building', buildings], ['parts', buildingFootprints(parts, everywhere, null)]]) {
          for (const id of replacedByLandmarks(outlines(list))) {
            if (this.replaced[kind].has(id)) continue;
            this.replaced[kind].add(id);
            grown = true;
          }
        }
        this.onStreetsFor = this.tilesLoaded;
      } catch {
        return; // the style is on its way; looked for again with the next tiles
      }
    }
    if (!grown && !always) return;
    this.leaveOutBuildings();
    if (grown) this.heightsRead += 1; // their shadows and roof furniture go too
  }

  /** Tell the map which of its own buildings not to draw: those on streets, under landmarks, or dressed as stores. */
  leaveOutBuildings() {
    const map = this.map;
    this.busy.filters += 1;
    this.whenStyled(() => {
      const leaveOut = (layers, ids) => {
        for (const id of layers) {
          if (!map.getLayer(id)) continue;
          if (!this.buildingFilters.has(id)) this.buildingFilters.set(id, map.getFilter(id) ?? true);
          const own = this.buildingFilters.get(id);
          map.setFilter(id, ids.length > 0 ? ['all', own, ['!', ['in', ['id'], ['literal', ids]]]] : own);
        }
      };
      leaveOut(BUILDING_LAYERS, [...this.onStreets, ...this.replaced.building, ...this.dressed]);
      leaveOut(PART_LAYERS, [...this.replaced.parts]);
    });
  }

  /**
   * Lay flat the map's own blocks that the app has divided into houses of its
   * own (see houses.js), and stand up again those it no longer has divided.
   */
  flatten(ids) {
    const next = new Set(ids);
    this.whenStyled((map) => {
      if (!map.getSource(BUILDING_SOURCE)) return;
      for (const id of this.divided) if (!next.has(id)) map.setFeatureState({ source: BUILDING_SOURCE, sourceLayer: 'building', id }, { flat: false });
      for (const id of next) if (!this.divided.has(id)) map.setFeatureState({ source: BUILDING_SOURCE, sourceLayer: 'building', id }, { flat: true });
      this.divided = next;
    });
  }

  /** The footprints of the buildings that reach into a box, from whichever source the style on screen draws them from. */
  footprints(box, estimates) {
    const map = this.map;
    if (this.buildings) {
      const { building, parts } = this.archiveBuildings();
      // (The heights read from the photo are for whole buildings; the parts of one carry their own.)
      // A block that a landmark model stands in for still throws its shadow, but gets no roof furniture.
      const whole = buildingFootprints(building, box, estimates, this.onStreets).map((one) => {
        if (!this.replaced.building.has(one.id) && !this.dressed.has(one.id)) return one;
        // (A store in its chain's dress stands as tall as that dress was made, whatever a shadow in the photo suggested: its shadow is to match.)
        const roofTop = this.storeRoofs.get(one.id);
        return { ...one, replaced: true, roofTop, ...(roofTop > 0 ? { height: roofTop } : {}) };
      });
      const pieces = buildingFootprints(parts, box, null).map((one) => (this.replaced.parts.has(one.id) ? { ...one, replaced: true } : one));
      return [...whole, ...pieces];
    }
    return footprintsIn(map.querySourceFeatures(VECTOR_SOURCE, { sourceLayer: 'building' }), box).map((building) => ({
      ...building,
      id: undefined,
      known: building.height !== UNRECORDED_METERS,
    }));
  }

  /**
   * Build what stands around the map's own buildings: the footbridges and
   * entrance pavilions of metro stations, and the fronts of chain stores in
   * their house colours. Done again when new map tiles arrive.
   */
  layExtras() {
    const map = this.map;
    let source = null;
    this.whenStyled(() => {
      source = map.getSource(EXTRAS_SOURCE);
    });
    if (this.type !== 'city' || !source) return;
    const made = this.extrasMade;
    if (made && made.tiles === this.tilesLoaded && made.network === this.network && made.heights === this.heightsRead) return;
    this.busy.extras += 1;
    let features = [];
    let counts = { stations: 0, entrances: 0, stores: 0, mosques: 0, locals: 0 };
    let dressed = new Set();
    let shades = [];
    try {
      const entrances = new Map();
      const stores = new Map();
      const others = [];
      const locals = new Map();
      const prayers = new Map();
      for (const feature of map.querySourceFeatures(VECTOR_SOURCE, { sourceLayer: 'poi' })) {
        const properties = feature.properties ?? {};
        if (feature.geometry?.type !== 'Point') continue;
        const [lng, lat] = feature.geometry.coordinates;
        const key = `${lng.toFixed(6)},${lat.toFixed(6)}`;
        if (properties.subclass === 'subway_entrance') {
          entrances.set(key, [lng, lat]);
          continue;
        }
        if (properties.class === 'place_of_worship') {
          if (properties.subclass === 'muslim') prayers.set(key, [lng, lat]);
          continue;
        }
        const brand = brandOf(properties);
        if (brand) stores.set(`${key}:${brand.id}`, { at: [lng, lat], brand });
        else if (properties.class === 'fuel') stores.set(`${key}:fuel`, { at: [lng, lat], brand: PLAIN_FUEL }); // a fuel station of no chain the app knows
        else if (SHOP_CLASSES.has(properties.class)) {
          others.push([lng, lat]);
          const kind = localKind(properties);
          if (kind) locals.set(key, { at: [lng, lat], kind });
        }
      }
      // The station buildings above ground, once each (a building on a tile's edge comes with both tiles).
      const stations = new Map();
      let buildings = [];
      if (this.buildings) {
        const everywhere = { west: -180, south: -90, east: 180, north: 90 };
        buildings = buildingFootprints(this.archiveBuildings().building, everywhere, this.photoOn ? this.heights : null, this.onStreets);
        for (const building of buildings) {
          // (A station with a model of its own, as at KAFD, keeps to that: none of the usual footbridges.)
          if (building.kind !== 'station' || this.replaced.building.has(building.id)) continue;
          const outline = building.polygons.reduce((largest, polygon) => (polygon[0].length > largest.length ? polygon[0] : largest), []);
          if (!stations.has(building.id) || outline.length > stations.get(building.id).length) stations.set(building.id, outline);
        }
      }
      // A pavilion, a kiosk or a canopy faces the street it stands in.
      const origin = this.scene.origin;
      const squeeze = origin ? Math.max(Math.cos((origin.lat * Math.PI) / 180), 0.01) * METERS_PER_DEGREE : 1;
      const facing = ([lng, lat]) => (this.network && origin ? streetDirection(this.network, (lng - origin.lng) * squeeze, (lat - origin.lat) * METERS_PER_DEGREE) : null);
      // A shop has its front towards the nearest street.
      const street = ([lng, lat]) => {
        const near = this.network && origin ? streetNear(this.network, (lng - origin.lng) * squeeze, (lat - origin.lat) * METERS_PER_DEGREE, 80) : null;
        return near ? [origin.lng + near.x / squeeze, origin.lat + near.y / METERS_PER_DEGREE] : null;
      };
      features = stationExtras([...stations.values()], [...entrances.values()], facing);
      if (this.buildings) {
        // (With only the street map's welded blocks to go by, no building can be told to be one store's.)
        const shops = storeExtras([...stores.values()], buildings.filter((one) => !this.replaced.building.has(one.id)), facing, others, { street, locals: [...locals.values()] });
        features = features.concat(shops.features);
        dressed = shops.dressed;
        this.storeRoofs = shops.roofs;
        // Mosques: a dome and a minaret on each.
        const mosques = mosquesAmong(buildings.filter((one) => !this.replaced.building.has(one.id) && !dressed.has(one.id)), [...prayers.values()]);
        const marks = mosqueExtras(mosques, ROOF_CAP_METERS);
        features = features.concat(marks.features);
        shades = marks.shades;
        counts.mosques = mosques.length;
        this.mosqueIds = new Set(mosques.map((mosque) => mosque.id).filter((id) => id !== undefined));
      }
      counts = { ...counts, stations: stations.size, entrances: entrances.size, stores: stores.size, locals: locals.size };
    } catch {
      return; // the style is on its way; built again with the next tiles
    }
    // More tiles seldom bring anything new here: the map is only handed what differs from what it has.
    const drawn = JSON.stringify(features);
    if (made?.drawn !== drawn) source.setData({ type: 'FeatureCollection', features });
    const changed = dressed.size !== this.dressed.size || [...dressed].some((id) => !this.dressed.has(id)) || shades.length !== this.extraShades.length;
    this.dressed = dressed;
    this.extraShades = shades;
    this.extrasMade = { tiles: this.tilesLoaded, network: this.network, heights: this.heightsRead + (changed ? 1 : 0), slabs: features.length, dressed: dressed.size, drawn, ...counts };
    if (changed) {
      this.leaveOutBuildings();
      this.heightsRead += 1; // the roofs are furnished again, without theirs
      this.layShade();
    }
  }

  /** Which buildings the city is drawn with, for anyone who wants to know. */
  buildingCounts() {
    return { source: this.buildings ? 'overture' : 'streets', archive: this.buildings, tiles: this.archiveTiles, raised: this.heights.size, roofs: this.roofsMade, onStreets: this.onStreets.size, replaced: this.replaced.building.size + this.replaced.parts.size, extras: this.extrasMade ? { slabs: this.extrasMade.slabs, stations: this.extrasMade.stations, entrances: this.extrasMade.entrances, stores: this.extrasMade.stores, dressed: this.extrasMade.dressed, mosques: this.extrasMade.mosques, locals: this.extrasMade.locals } : null };
  }

  // ── Sun and shadows (3D city) ───────────────────────────────────────────

  /** Light the city from where the sun is right now, for the place in the middle of the map. */
  followSun() {
    if (this.type !== 'city') return;
    const centre = this.map.getCenter();
    const sun = this.sunAt(centre);
    const moved =
      !this.sun ||
      Math.abs(sun.altitude - this.sun.altitude) > 0.2 ||
      Math.abs(((sun.azimuth - this.sun.azimuth + 540) % 360) - 180) > 0.2;
    if (moved) {
      let lit = false;
      this.whenStyled((map) => {
        map.setLight(sunLight(sun));
        lit = true;
      });
      if (lit) {
        this.sun = sun;
        // The walls the app draws itself are lit from the same sun; after dark their windows light up.
        const light = lightFrom(sun);
        this.scene.sun = light ? [light.east, light.north, light.up] : [0.3, -0.5, 0.8];
        this.scene.day = light ? 1 : 0;
        // And as the sun goes down the city goes dark, and its lamps come on.
        this.night = darkness(sun);
        this.scene.night = this.night;
      }
    }
    if (this.sun) this.applyNight(this.night);
    const lit = this.treesLit;
    if (!lit || Math.abs(lit.altitude - this.sun?.altitude) > 1.5 || Math.abs(((lit.azimuth - this.sun?.azimuth + 540) % 360) - 180) > 1.5) {
      // What stands still is lit by the sun too: drawn afresh once it has moved on.
      if (this.trees.length > 0) this.layTrees();
      this.layStreet();
      this.layRoofs();
      this.layBridges();
      this.laySignals();
      this.layLamps();
      this.treesLit = this.sun;
    }
    this.queueShade(false);
  }

  /**
   * Lay the shadows again soon. Map tiles arrive in bursts, so each arrival
   * (restart = true) pushes the work back a little, but never for long.
   */
  queueShade(restart) {
    if (this.type !== 'city') return;
    const now = Date.now();
    if (this.shadeTimer !== null) {
      if (!restart || now - this.shadeWaitingSince > SHADE_LONGEST_WAIT_MS) return;
      clearTimeout(this.shadeTimer);
    } else {
      this.shadeWaitingSince = now;
    }
    this.shadeTimer = setTimeout(async () => {
      this.shadeTimer = null;
      // One piece of work at a time, with room for the map to draw a picture between them.
      this.clearStreets();
      await breathe();
      this.layShade();
      await breathe();
      this.layLife();
      await breathe();
      this.layExtras();
      await breathe();
      this.layPhoto();
    }, SHADE_PAUSE_MS);
  }

  /** Lay the shadows of the buildings on screen, unless what is there still fits. */
  layShade() {
    const map = this.map;
    let source = null;
    this.whenStyled(() => {
      source = map.getSource(SHADE_SOURCE);
    });
    if (this.type !== 'city' || !source) return;

    const zoom = map.getZoom();
    if (zoom < SHADE_MIN_ZOOM) {
      if (this.shade?.box !== null) source.setData(EMPTY);
      this.shade = { box: null };
      return;
    }

    const reach = shadowReach(this.sun);
    const bounds = map.getBounds();
    const view = { west: bounds.getWest(), south: bounds.getSouth(), east: bounds.getEast(), north: bounds.getNorth() };
    const made = this.shade;
    if (
      made?.box &&
      made.tiles === this.tilesLoaded &&
      made.heights === this.heightsRead &&
      made.network === this.network &&
      made.detail === this.detailOn &&
      Math.abs(made.zoom - zoom) < 0.6 &&
      (reach === null ? made.reach === null : made.reach !== null && sameShade(made.reach, reach)) &&
      made.box.west <= view.west &&
      made.box.east >= view.east &&
      made.box.south <= view.south &&
      made.box.north >= view.north
    ) {
      return;
    }

    const centre = map.getCenter();
    const latDegrees = (meters) => meters / METERS_PER_DEGREE;
    const lngDegrees = (meters) => meters / (METERS_PER_DEGREE * Math.max(Math.cos((centre.lat * Math.PI) / 180), 0.01));
    const box = {
      west: Math.max(view.west - lngDegrees(SHADE_MARGIN_METERS), centre.lng - lngDegrees(SHADE_REACH_METERS)),
      east: Math.min(view.east + lngDegrees(SHADE_MARGIN_METERS), centre.lng + lngDegrees(SHADE_REACH_METERS)),
      south: Math.max(view.south - latDegrees(SHADE_MARGIN_METERS), centre.lat - latDegrees(SHADE_REACH_METERS)),
      north: Math.min(view.north + latDegrees(SHADE_MARGIN_METERS), centre.lat + latDegrees(SHADE_REACH_METERS)),
    };

    let buildings;
    try {
      buildings = this.footprints(box, this.photoOn ? this.heights : null);
    } catch {
      return;
    }
    // A block of villas is divided into its houses (see houses.js), where the app draws the walls itself and
    // knows the streets the houses front on. The map's own block is laid flat meanwhile.
    if (this.detailOn && this.buildings && this.network) {
      const wholeInTile = (building) => {
        if (!building.tile) return true;
        const tile = tileBox(...building.tile);
        return building.polygons[0][0].every(([lng, lat]) => lng > tile.west && lng < tile.east && lat > tile.south && lat < tile.north);
      };
      const districtOf = (lng, lat) => {
        const kind = districtAt(lng, lat).kind;
        return { kind, fenced: (CHARACTERS[kind] ?? CHARACTERS.villa).fenced };
      };
      const parcelled = parcelHouses(buildings, this.network, { districtOf, whole: wholeInTile, skip: this.mosqueIds });
      buildings = parcelled.buildings;
      this.houses = parcelled.houses;
      this.flatten(parcelled.divided);
    } else {
      this.houses = [];
      this.flatten([]);
    }
    const metersPerPixel = (EARTH_AROUND_METERS * Math.cos((centre.lat * Math.PI) / 180)) / (512 * 2 ** zoom);
    // (Landmarks the map has no building for throw a shadow too.)
    this.busy.shade += 1;
    source.setData(reach ? buildingShadows([...buildings, ...landmarkShades(), ...this.extraShades], reach, SHADE_SMALLEST_PX * metersPerPixel) : EMPTY);
    this.shade = { reach, box, zoom, tiles: this.tilesLoaded, heights: this.heightsRead, network: this.network, detail: this.detailOn };
    // The same buildings get their roofs furnished.
    this.roofs = this.buildings ? buildings : [];
    if (!this.scene.origin) this.scene.setOrigin({ lng: centre.lng, lat: centre.lat });
    this.layRoofs();
    // (And the car parks are filled where these buildings leave room; and no lamp post stands in one of them.)
    if (this.streetMade && this.streetMade.roofs !== this.roofs) this.layStreet();
    if (this.lampsMade && this.lampsMade.roofs !== this.roofs) this.layLamps();
  }

  /**
   * The colour of a building's walls: the one on record, else the one worked
   * out from its roof in the photo, else one of the shades of plaster.
   */
  wallColourOf(building) {
    const recorded = building.colour ? colourOf(building.colour) : null;
    if (recorded) return recorded;
    const worked = this.photoOn ? this.wallColours.get(building.id) : undefined;
    if (worked) return worked;
    // Not known: one of the colours its district is built in. (The same one every time, by the building's own number.)
    const place = building.polygons?.[0]?.[0]?.[0];
    const tints = place ? characterAt(place[0], place[1]).walls : WALL_TINTS;
    return colourOf(tints[typeof building.id === 'number' ? Math.abs(building.id) % tints.length : 0]);
  }

  /**
   * The colour of a building's roof: the one on record, else the one the
   * photo shows it in, calmed; else null, for one of the usual shades.
   */
  roofColourOf(building) {
    const recorded = building.roofColour ? colourOf(building.roofColour) : null;
    if (recorded) return recorded;
    if (building.replaced) return STORE_ROOF;
    if (!this.photoOn || !(building.height <= ROOF_COLOUR_MOST_METERS)) return null;
    return this.roofColours.get(building.id) ?? null;
  }

  /** The walls and the shadows on them, for anyone who wants to count them. */
  detailCounts() {
    const made = this.shadowsMade;
    return {
      on: this.detailOn,
      walls: this.wallsMade ? { ...this.wallsMade, corners: this.wallMesh.count } : null,
      coloured: this.wallColours.size,
      shadows: made ? { size: made.size, top: made.top, corners: made.corners, box: made.box } : null,
      heights: this.heightsMade ? { size: this.heightsMade.size, corners: this.heightsMade.corners, box: this.heightsMade.box, drawn: this.scene.heights.drawn, ready: this.scene.heights.ready } : null,
    };
  }

  /**
   * Lay the roofs afresh, measured from the scene's origin, with the walls
   * under them and the shadows on them. Every building gets a roof in its own
   * colour, with something made up standing on it, lit by the sun.
   */
  layRoofs() {
    this.busy.roofs += 1;
    const origin = this.scene.origin;
    if (!origin || this.type !== 'city' || this.roofs.length === 0) {
      if (this.roofMesh.count > 0 || this.deckMesh.count > 0 || this.wallMesh.count > 0) {
        this.roofMesh.clear();
        this.roofShadeMesh.clear();
        this.deckMesh.clear();
        this.wallMesh.clear();
        this.footMesh.clear();
        this.parapetMesh.clear();
        this.plotMesh.clear();
        this.scene.set('plots', this.plotMesh);
        this.houseMesh.clear();
        this.scene.set('houses', this.houseMesh);
        this.apronMesh.clear();
        this.scene.set('aprons', this.apronMesh);
        this.scene.set('roofs', this.roofMesh, { lifted: 1 });
        this.scene.set('roofshade', this.roofShadeMesh, { lifted: 2 });
        this.scene.set('parapets', this.parapetMesh, { lifted: 1 });
        this.scene.set('feet', this.footMesh, { shaded: false });
        this.scene.setRoofs(this.deckMesh);
        this.scene.setWalls(this.wallMesh);
        this.scene.setShadows(this.casterMesh, null);
        this.scene.setHeights(this.heightMesh, null);
        this.scene.grounded = false;
      }
      if (this.spillMesh.count > 0 || this.roofLightMesh.count > 0 || this.beaconMesh.count > 0) {
        this.spillMesh.clear();
        this.roofLightMesh.clear();
        this.beaconMesh.clear();
        this.scene.set('spill', this.spillMesh, { glow: true });
        this.scene.set('rooflights', this.roofLightMesh, { glow: true, lifted: 2 });
        this.scene.set('beacons', this.beaconMesh, { glow: true, point: POINT_METERS.beacon, halo: true });
      }
      this.spillMade = null;
      this.roofsMade = null;
      this.wallsMade = null;
      this.shadowsMade = null;
      return;
    }
    // (A building that lies across the edge of a map tile comes twice over: each copy is cut to its own tile.)
    const whole = tilePieces(this.roofs, tileBox);
    // The walls: over each block the map draws, walls of the app's own, up past the roof as a parapet.
    const wallTop = ROOF_CAP_METERS + ROOF_LIFT_METERS + PARAPET_METERS;
    this.scene.wallTop = wallTop;
    if (this.detailOn) {
      const colourOfWalls = (building) => this.wallColourOf(building);
      this.wallsMade = wallsOf(this.wallMesh, whole, origin, { top: (building) => building.height + wallTop, colourOf: colourOfWalls });
      footShade(this.footMesh, whole, origin);
      // (A parapet has a top as wide as it is thick, and an inner side.)
      const light = lightFrom(this.sun);
      parapetTops(this.parapetMesh, whole, origin, {
        top: (building) => building.height + wallTop,
        roof: (building) => building.height + ROOF_CAP_METERS + ROOF_LIFT_METERS,
        colourOf: colourOfWalls,
        lit: (east, north, up) => faceLight(light, east, north, up),
      });
    } else {
      this.wallMesh.clear();
      this.footMesh.clear();
      this.parapetMesh.clear();
      this.wallsMade = null;
    }
    this.scene.setWalls(this.wallMesh);
    this.scene.set('feet', this.footMesh, { shaded: false });
    this.scene.set('parapets', this.parapetMesh, { lifted: 1 });
    // Round the houses, the walls of their plots: as many as the district they stand in has.
    if (this.detailOn) {
      this.plotsMade = plotWalls(this.plotMesh, whole, this.network, origin, lightFrom(this.sun), { fencedAt: (lng, lat) => characterAt(lng, lat), built: this.builtGround()?.built ?? null });
    } else {
      this.plotMesh.clear();
      this.plotsMade = null;
    }
    this.scene.set('plots', this.plotMesh);
    // And round each house the app has laid out itself, its own plot: wall, gate, court (see houses.js).
    if (this.detailOn && this.houses.length > 0) {
      const sunlight = lightFrom(this.sun);
      this.housesMade = dressHouses(this.houseMesh, this.houses, origin, (east, north, up) => faceLight(sunlight, east, north, up));
    } else {
      this.houseMesh.clear();
      this.housesMade = null;
    }
    this.scene.set('houses', this.houseMesh);
    // And between each house street and what is built along it: asphalt to the foot of the walls.
    if (this.detailOn && this.network) {
      const sunlight = lightFrom(this.sun);
      this.apronsMade = streetAprons(this.apronMesh, this.network, origin, this.builtGround()?.built ?? null, (east, north, up) => faceLight(sunlight, east, north, up));
    } else {
      this.apronMesh.clear();
      this.apronsMade = null;
    }
    this.scene.set('aprons', this.apronMesh);
    const sunFall = shadowFall(shadowReach(this.sun));
    const fall = this.detailOn ? sunFall : null;
    // (Of the landmarks and minarets that throw a shadow of their own, only those round here: one far across the city would stretch the picture of the shadows thin.)
    const here = this.shade?.box;
    const near = (one) => {
      const [lng, lat] = one.polygons[0][0][0];
      return Boolean(here) && lng >= here.west && lng <= here.east && lat >= here.south && lat <= here.north;
    };
    this.layShadows(fall, near);

    // The roofs: one on every building, in its own colour, inside its parapet. (And on the flat roofs among the landmarks' models.)
    const roofed = [...whole, ...landmarkRoofs().filter(near)];
    const decks = roofDecks(this.deckMesh, roofed, origin, { cap: ROOF_CAP_METERS, lift: ROOF_LIFT_METERS, colourOf: (building) => this.roofColourOf(building) });
    this.scene.setRoofs(this.deckMesh);
    // The shade each parapet throws on its own roof. (Without the app's own walls there is no parapet.)
    const strips = this.detailOn ? parapetShade(this.roofShadeMesh, whole, origin, sunFall, { cap: ROOF_CAP_METERS, lift: ROOF_LIFT_METERS, parapet: PARAPET_METERS, thick: PARAPET_THICK_METERS }) : 0;
    if (!this.detailOn) this.roofShadeMesh.clear();
    // What stands on the roofs, and its shade.
    const squeeze = Math.max(Math.cos((origin.lat * Math.PI) / 180), 0.01) * METERS_PER_DEGREE;
    const local = [];
    for (const building of roofed) {
      if (building.base > 0) continue; // a part that starts above the ground: a bridge between towers, a canopy
      if (building.replaced && !(building.roofTop > 0)) continue; // the map's block where a landmark's model stands
      const station = building.kind === 'station';
      const top = station ? building.height + ROOF_CAP_METERS : (building.roofTop > 0 ? building.roofTop : building.height + ROOF_CAP_METERS) + ROOF_LIFT_METERS;
      const kind = building.replaced ? 'store' : facadeOf(building);
      const wall = building.replaced ? null : this.wallColourOf(building);
      building.polygons.forEach((polygon, index) => {
        if (polygon.length > 1) return; // a courtyard in the middle: leave its roof bare
        local.push({
          ring: polygon[0].map(([lng, lat]) => [(lng - origin.lng) * squeeze, (lat - origin.lat) * METERS_PER_DEGREE]),
          top,
          vault: station,
          kind,
          wall,
          seed: ownNumber(building, index),
        });
      });
    }
    const beacons = [];
    const roofLamps = [];
    const furnished = drawRoofs(this.roofMesh, local, lightFrom(this.sun), { fall: sunFall, shade: this.roofShadeMesh, beacons, lamps: roofLamps });
    this.roofsMade = { furnished, of: local.length, decks, strips, corners: this.roofMesh.count };
    this.scene.set('roofs', this.roofMesh, { lifted: 1 });
    this.scene.set('roofshade', this.roofShadeMesh, { lifted: 2 });
    // What shows only by night: the light from the shop windows on the pavement, and the red lamps on
    // the masts of the towers and on top of the landmarks.
    this.spillMesh.clear();
    const spilled = shopSpill(this.spillMesh, whole, origin);
    for (const [lng, lat, height] of landmarkBeacons()) {
      if (here && lng >= here.west && lng <= here.east && lat >= here.south && lat <= here.north) beacons.push([(lng - origin.lng) * squeeze, (lat - origin.lat) * METERS_PER_DEGREE, height]);
    }
    // (And on each corner of the roof of whatever is tall: the four corners that reach furthest out.)
    for (const building of whole) {
      if (!(building.height >= CORNER_LAMPS_FROM_METERS) || building.replaced || building.base > 0) continue;
      const top = building.height + ROOF_CAP_METERS + ROOF_LIFT_METERS + PARAPET_METERS + 0.4;
      for (const polygon of building.polygons) {
        const corners = polygon[0].map(([lng, lat]) => [(lng - origin.lng) * squeeze, (lat - origin.lat) * METERS_PER_DEGREE]);
        const furthest = [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([east, north]) => corners.reduce((best, corner) => (corner[0] * east + corner[1] * north > best[0] * east + best[1] * north ? corner : best)));
        for (const corner of new Set(furthest)) beacons.push([corner[0], corner[1], top]);
      }
    }
    this.beaconMesh.clear();
    this.spillMade = { strips: spilled, beacons: lightPoints(this.beaconMesh, beacons), roofLamps: drawRoofLights(this.roofLightMesh, roofLamps) };
    this.scene.set('spill', this.spillMesh, { glow: true });
    this.scene.set('beacons', this.beaconMesh, { glow: true, point: POINT_METERS.beacon, halo: true });
    // (Like the shade on the roofs, the light on them is drawn a touch nearer the eye than the roofs are.)
    this.scene.set('rooflights', this.roofLightMesh, { glow: true, lifted: 2 });
    this.map.triggerRepaint();
  }

  // ── The satellite photo (3D city) ───────────────────────────────────────

  /** Turn reading the photo, for trees, building heights and colours, on or off. (It is never shown.) */
  setPhoto(on) {
    this.photoOn = Boolean(on);
    this.photoMade = null;
    this.heightsRead += 1; // lay the shadows again, with or without the estimates
    if (this.photoOn) {
      this.raiseBuildings(this.heights.keys());
    } else {
      this.photoRequest += 1; // drop a reading that is under way
      this.trees = [];
      // Back to the usual height for every building.
      this.whenStyled((map) => {
        if (map.getSource(BUILDING_SOURCE)) map.removeFeatureState({ source: BUILDING_SOURCE, sourceLayer: 'building' });
      });
      // (That stood the divided blocks up again as well: lay them flat once more.)
      const flat = [...this.divided];
      this.divided = new Set();
      this.flatten(flat);
    }
    this.syncLife();
    this.layTrees();
    this.queueShade(false);
  }

  /** Read the photo around the view, unless the last reading still covers it. */
  layPhoto() {
    const map = this.map;
    if (!this.photoOn || this.type !== 'city' || map.getZoom() < PHOTO_MIN_ZOOM) return;
    const bounds = map.getBounds();
    const view = { west: bounds.getWest(), south: bounds.getSouth(), east: bounds.getEast(), north: bounds.getNorth() };
    const made = this.photoMade;
    if (
      made &&
      made.tiles === this.tilesLoaded &&
      made.box.west <= view.west &&
      made.box.east >= view.east &&
      made.box.south <= view.south &&
      made.box.north >= view.north
    ) {
      return;
    }
    const centre = map.getCenter();
    const squeeze = Math.max(Math.cos((centre.lat * Math.PI) / 180), 0.01) * METERS_PER_DEGREE;
    // A square around the middle that takes in the view and a margin, in whole metres.
    const across = Math.max(view.east - centre.lng, centre.lng - view.west) * squeeze;
    const up = Math.max(view.north - centre.lat, centre.lat - view.south) * METERS_PER_DEGREE;
    const half = Math.round(Math.min(Math.max(across, up) + PHOTO_MARGIN_METERS, PHOTO_REACH_METERS));
    const box = {
      west: centre.lng - half / squeeze,
      east: centre.lng + half / squeeze,
      south: centre.lat - half / METERS_PER_DEGREE,
      north: centre.lat + half / METERS_PER_DEGREE,
    };
    this.photoMade = { box, tiles: this.tilesLoaded };
    this.readPhoto({ lng: centre.lng, lat: centre.lat }, half, box);
  }

  /** Fetch the photo of an area and read it: building heights from shadows, the colours of roofs, and trees. */
  async readPhoto(origin, half, box) {
    this.busy.photo += 1;
    const request = ++this.photoRequest;
    const squeeze = Math.max(Math.cos((origin.lat * Math.PI) / 180), 0.01) * METERS_PER_DEGREE;
    const local = ([lng, lat]) => [(lng - origin.lng) * squeeze, (lat - origin.lat) * METERS_PER_DEGREE];
    let footprints;
    let streets;
    try {
      footprints = this.footprints(box, null);
      streets = this.map.querySourceFeatures(VECTOR_SOURCE, { sourceLayer: 'transportation' });
    } catch {
      return;
    }
    const list = [];
    for (const building of footprints) {
      for (const polygon of building.polygons) {
        // (In the fairground of Boulevard World dark water and canopies would be taken for shadows: nothing there is measured by its shadow.)
        list.push({ ring: polygon[0].map(local), known: building.known ? building.height : null, id: building.id, usual: building.height, water: inFairground(polygon[0][0][0], polygon[0][0][1]) });
      }
    }
    // The ground taken up by roads, tracks and paths, a little wider than drawn: no tree stands there.
    const roads = [];
    for (const feature of streets) {
      const properties = feature.properties ?? {};
      const width = groundWidth(properties.class);
      if (!(width > 0) || properties.brunnel === 'tunnel') continue;
      const clear = width / 2 + (properties.class === 'path' ? PATH_CLEAR_METERS : TREE_CLEAR_METERS);
      for (const line of lineParts(feature.geometry)) roads.push({ points: line.map(local), half: clear });
    }

    const wanted = tilesFor(box, PHOTO_ZOOM);
    const [day, ...pictures] = await Promise.all([photoDate(origin), ...wanted.map((tile) => photoTile(PHOTO_ZOOM, tile.x, tile.y))]);
    if (request !== this.photoRequest) return;
    const tiles = new Map();
    wanted.forEach((tile, index) => {
      if (pictures[index]) tiles.set(`${tile.x}/${tile.y}`, pictures[index]);
    });
    if (tiles.size === 0) return;
    const grid = photoGrid(tiles, PHOTO_ZOOM, origin, half);
    await breathe(); // the reading is done in steps, so the map keeps moving between them
    if (request !== this.photoRequest) return;

    let measured = 0;
    if (day && list.length > 0 && this.buildings) {
      const suns = passSuns((date) => sunPosition(date, origin.lat, origin.lng), day, origin.lng);
      const read = heightsFromShadows(grid, list, suns);
      if (read) {
        measured = read.measured;
        // Kept where nobody recorded a height and the shadow says the building is taller than the usual.
        const raised = new Set();
        read.heights.forEach((height, index) => {
          const { id, known, usual, water } = list[index];
          if (height === null || known !== null || id === undefined || water || !(height > usual + 1)) return;
          if (!(this.heights.get(id) >= height)) {
            this.heights.delete(id); // newest last, so the oldest can be forgotten first
            this.heights.set(id, height);
            raised.add(id);
          }
        });
        // Forget the oldest when there are very many: a long drive passes a lot of buildings.
        for (const id of this.heights.keys()) {
          if (this.heights.size <= HEIGHTS_KEPT) break;
          this.heights.delete(id);
          this.whenStyled((map) => {
            map.removeFeatureState({ source: BUILDING_SOURCE, sourceLayer: 'building', id });
            if (this.divided.has(id)) map.setFeatureState({ source: BUILDING_SOURCE, sourceLayer: 'building', id }, { flat: true });
          });
        }
        this.raiseBuildings(raised);
        this.heightsRead += 1;
      }
      await breathe();
      if (request !== this.photoRequest) return;
    }

    // The colour of each roof: for the roof as it is drawn, and for its building's walls to go with.
    let coloured = 0;
    roofColours(tiles, PHOTO_ZOOM, origin, list).forEach((colour, index) => {
      const id = list[index].id;
      if (!colour || id === undefined) return;
      if (!this.wallColours.has(id)) coloured += 1;
      this.wallColours.delete(id); // newest last, so the oldest can be forgotten first
      this.wallColours.set(id, wallTone(colour));
      this.roofColours.delete(id);
      this.roofColours.set(id, roofTone(colour));
    });
    for (const colours of [this.wallColours, this.roofColours]) {
      for (const id of colours.keys()) {
        if (colours.size <= HEIGHTS_KEPT) break;
        colours.delete(id);
      }
    }
    if (coloured > 0) this.heightsRead += 1; // roofs and walls are laid again, in their colours
    await breathe();
    if (request !== this.photoRequest) return;

    this.trees = treesInPhoto(grid, footprintGrid(list, half), PHOTO_MOST_TREES, pavedGrid(roads, half)).map((tree) => ({
      lng: origin.lng + tree.x / squeeze,
      lat: origin.lat + tree.y / METERS_PER_DEGREE,
      radius: tree.radius,
    }))
      // (The lagoon of Boulevard World is dark green in the photo, as a tree is: nothing is stood on its water.)
      .filter((tree) => !onLagoon(tree.lng, tree.lat));
    this.photoRead = { day, buildings: list.length, measured, trees: this.trees.length };
    if (!this.scene.origin) this.scene.setOrigin(origin);
    this.layShade(); // the roofs go up with the buildings that were found to be taller
    this.layTrees();
    this.map.triggerRepaint();
  }

  /** Draw the trees afresh: they are measured from the scene's origin and lit by the sun. */
  layTrees() {
    const origin = this.scene.origin;
    if (!origin || this.type !== 'city') {
      this.treeMesh.clear();
      this.scene.set('trees', this.treeMesh);
      return;
    }
    const squeeze = Math.max(Math.cos((origin.lat * Math.PI) / 180), 0.01) * METERS_PER_DEGREE;
    // (What the photo shows as a tree over a road that runs in a cutting is down in the cutting: none is stood there.)
    const sunken = Boolean(this.network?.ways.some((way) => way.sunk));
    const local = this.photoOn
      ? this.trees
          .map((tree) => ({
            x: (tree.lng - origin.lng) * squeeze,
            y: (tree.lat - origin.lat) * METERS_PER_DEGREE,
            radius: tree.radius,
          }))
          .filter((tree) => !sunken || !overCutting(this.network, tree.x, tree.y))
      : [];
    // Down the medians of the avenues, a row of date palms: stood by rule (see roadside.js).
    const palms = this.detailOn && this.network ? medianPalms(this.network, { built: this.builtGround()?.built ?? null }) : [];
    this.palmsMade = palms.length;
    // (Where the photo already shows a tree, there is no need of another.)
    for (const palm of palms) if (!local.some((tree) => Math.hypot(tree.x - palm.x, tree.y - palm.y) < 5)) local.push(palm);
    drawTrees(this.treeMesh, local, lightFrom(this.sun), shadowReach(this.sun));
    this.scene.set('trees', this.treeMesh);
    this.treesLit = this.sun;
    // (No car is parked where a tree stands.)
    if (this.streetMade && this.streetMade.trees !== this.trees) this.layStreet();
  }

  /** What the photo gave, for anyone who wants to count it. */
  photoCounts() {
    return { on: this.photoOn && this.type === 'city', trees: this.trees.length, heights: this.heights.size, coloured: this.roofColours.size, read: this.photoRead ?? null };
  }

  // ── Traffic (3D city) ───────────────────────────────────────────────────

  /** Turn the moving traffic on or off. It is only ever drawn in the 3D city. */
  setLife(on) {
    this.lifeOn = Boolean(on);
    if (!this.lifeOn) {
      // A fresh start when it is switched on again.
      this.traffic = new Traffic({ seed: Date.now() % 2147483647 });
      this.walkers = new Walkers({ seed: (Date.now() + 7919) % 2147483647 });
    }
    this.lifeMade = null; // read the streets again, with or without traffic on them
    this.syncLife();
    this.layStreet();
    this.queueShade(false);
  }

  /** Put the traffic's layer into the style on screen, or take it out. */
  syncLife() {
    this.whenStyled((map) => {
      const wanted = this.type === 'city'; // the roofs' furniture is always there; traffic and trees come and go inside it
      const there = Boolean(map.getLayer(LIFE_LAYER));
      if (wanted && !there) {
        // Under the names, over the buildings: the scene's depth hides what is behind a wall.
        const names = map.getStyle().layers.find((layer) => layer.type === 'symbol');
        map.addLayer(this.scene, names?.id);
      } else if (!wanted && there) {
        map.removeLayer(LIFE_LAYER);
      }
    });
  }

  /**
   * Read the streets and tracks around the view from the map: for the bridges
   * to be built on, and for the traffic to run on.
   */
  layLife() {
    const map = this.map;
    if (this.type !== 'city' || map.getZoom() < LIFE_MIN_ZOOM) return;
    const bounds = map.getBounds();
    const view = { west: bounds.getWest(), south: bounds.getSouth(), east: bounds.getEast(), north: bounds.getNorth() };
    const made = this.lifeMade;
    if (
      made &&
      made.tiles === this.tilesLoaded &&
      made.box.west <= view.west &&
      made.box.east >= view.east &&
      made.box.south <= view.south &&
      made.box.north >= view.north
    ) {
      return;
    }

    const centre = map.getCenter();
    const squeeze = Math.max(Math.cos((centre.lat * Math.PI) / 180), 0.01);
    const latDegrees = (meters) => meters / METERS_PER_DEGREE;
    const lngDegrees = (meters) => meters / (METERS_PER_DEGREE * squeeze);
    const box = {
      west: Math.max(view.west - lngDegrees(LIFE_MARGIN_METERS), centre.lng - lngDegrees(LIFE_REACH_METERS)),
      east: Math.min(view.east + lngDegrees(LIFE_MARGIN_METERS), centre.lng + lngDegrees(LIFE_REACH_METERS)),
      south: Math.max(view.south - latDegrees(LIFE_MARGIN_METERS), centre.lat - latDegrees(LIFE_REACH_METERS)),
      north: Math.min(view.north + latDegrees(LIFE_MARGIN_METERS), centre.lat + latDegrees(LIFE_REACH_METERS)),
    };
    const inBox = ([lng, lat]) => lng >= box.west && lng <= box.east && lat >= box.south && lat <= box.north;

    let features;
    let places;
    try {
      features = map.querySourceFeatures(VECTOR_SOURCE, { sourceLayer: 'transportation' });
      places = map.querySourceFeatures(VECTOR_SOURCE, { sourceLayer: 'poi' });
    } catch {
      return;
    }
    const lines = [];
    const farLines = []; // every road there is, near and far, for the lights of the city from afar
    const walks = []; // the footbridges: footpaths the map marks as bridges
    for (const feature of features) {
      const properties = feature.properties ?? {};
      if (properties.class === 'path' && properties.brunnel === 'bridge') {
        const tile = Number.isInteger(feature._z) ? tileBox(feature._z, feature._x, feature._y) : null;
        for (const part of lineParts(feature.geometry)) {
          for (const coordinates of tile ? clipLine(part, tile) : [part]) {
            if (coordinates.length >= 2 && coordinates.some(inBox)) walks.push({ coordinates });
          }
        }
        continue;
      }
      if (!LIFE_LINES.has(properties.class)) continue;
      // A map tile holds its roads a little way past its own edge. Cut to its tile, each
      // stretch of road is there once, and meets the next tile's stretch end to end.
      const tile = Number.isInteger(feature._z) ? tileBox(feature._z, feature._x, feature._y) : null;
      const lit = tile && properties.brunnel !== 'tunnel' && properties.class !== 'service' && properties.class !== 'rail' && properties.class !== 'transit';
      for (const part of lineParts(feature.geometry)) {
        for (const coordinates of tile ? clipLine(part, tile) : [part]) {
          if (lit && coordinates.length >= 2) farLines.push({ class: properties.class, tile: [feature._z, feature._x, feature._y], coordinates });
          if (coordinates.length < 2 || !coordinates.some(inBox)) continue;
          lines.push({
            class: properties.class,
            subclass: properties.subclass,
            oneway: properties.oneway,
            tunnel: properties.brunnel === 'tunnel',
            bridge: properties.brunnel === 'bridge',
            layer: properties.layer,
            service: properties.service,
            ramp: properties.ramp === 1,
            width: groundWidth(properties.class),
            coordinates,
          });
        }
      }
    }
    // The bus stops and the stations marked on the map. (A stop near a tile's edge comes with both tiles.)
    const busStops = new Map();
    const stations = new Map();
    for (const feature of places) {
      const kind = feature.properties?.class;
      if ((kind !== 'bus' && kind !== 'railway') || feature.geometry?.type !== 'Point') continue;
      const [lng, lat] = feature.geometry.coordinates;
      (kind === 'bus' ? busStops : stations).set(`${lng.toFixed(6)},${lat.toFixed(6)}`, [lng, lat]);
    }

    // Vehicles keep their place on their street while the ground under them is measured from a new spot.
    const origin = { lng: centre.lng, lat: centre.lat };
    const before = this.scene.origin;
    const shift = before
      ? [(before.lng - origin.lng) * squeeze * METERS_PER_DEGREE, (before.lat - origin.lat) * METERS_PER_DEGREE]
      : [0, 0];
    this.network = buildNetwork(lines, origin, { busStops: [...busStops.values()], stations: [...stations.values()] });
    this.footbridges = walks;
    if (this.lifeOn) {
      this.traffic.level = trafficLevel(new Date(), centre.lng);
      this.traffic.view = null; // set again, from the new origin, before the next step
      this.lifeView = null;
      // (With the signals at its junctions: whoever is put on the new streets is put there with regard to them.)
      this.traffic.setNetwork(this.network, shift, origin, this.readSignals(origin));
      this.walkers.setNetwork(this.network, origin);
    }
    this.scene.setOrigin(origin);
    this.lifeMade = { box, tiles: this.tilesLoaded, stops: busStops.size, stations: stations.size };
    // Everything that stands still is measured from the same spot.
    this.layTrees();
    this.layRoofs();
    this.layBridges();
    this.laySignals();
    this.layStreet();
    this.layLamps();
    this.layFarLights(farLines, box);
    map.triggerRepaint();
  }

  /**
   * Make afresh the picture the shadows on walls, roofs and cars are read from. What throws them: the
   * buildings, and the ground beside every road that runs below it, which shades the road in its cutting.
   * fall: how the shadows fall (null for none); near: which of the landmarks' shades are round here.
   * Without either, as they were when the roofs were last laid.
   */
  layShadows(fall = this.shadowsMade?.fall ?? null, near = this.shadesNear ?? (() => false)) {
    this.shadesNear = near;
    const origin = this.scene.origin;
    const cast = fall && origin ? shadowCasters(this.casterMesh, [...this.roofs, ...landmarkShades().filter(near), ...this.extraShades.filter(near)], origin, fall) : null;
    const ground = cast ? groundCasters(this.casterMesh, this.bankMesh) : 0;
    this.shadowsMade = cast ? { ...cast, fall, size: shadowMapSize(cast.box), corners: this.casterMesh.count, ground } : null;
    this.scene.setShadows(this.casterMesh, this.shadowsMade);
    // And the same buildings as they stand under the open sky, seen from straight above: from that picture
    // every wall, roof and patch of ground learns how much of the sky it sees (see scene.js). By night too.
    const tops = this.detailOn && origin ? shadowCasters(this.heightMesh, [...this.roofs, ...landmarkShades().filter(near), ...this.extraShades.filter(near)], origin, [0, 0]) : null;
    this.heightsMade = tops ? { box: tops.box, size: shadowMapSize(tops.box, HEIGHTS_FINE_METERS, HEIGHTS_SIZE_MOST), corners: this.heightMesh.count } : null;
    this.scene.setHeights(this.heightMesh, this.heightsMade);
    this.scene.grounded = this.detailOn;
  }

  /** Build the bridges and viaducts afresh: their decks, parapets and piers. And paint the roads: their lines and crossings. */
  layBridges() {
    if (!this.scene.origin || this.type !== 'city' || !this.network) {
      if (this.bridgeMesh.count > 0 || this.markMesh.count > 0 || this.roadsideMesh.count > 0) {
        this.bridgeMesh.clear();
        this.markMesh.clear();
        this.roadsideMesh.clear();
        this.cuttingMesh.clear();
        this.bankMesh.clear();
        this.scene.set('bridges', this.bridgeMesh);
        this.scene.set('marks', this.markMesh);
        this.scene.set('roadside', this.roadsideMesh);
        this.footbridgeMesh.clear();
        this.scene.set('footbridges', this.footbridgeMesh);
        this.cuttingGlowMesh.clear();
        this.scene.set('cuttings', this.cuttingMesh);
        this.scene.set('banks', this.bankMesh, { mask: true });
        this.scene.set('cuttinglight', this.cuttingGlowMesh, { glow: true });
        if (this.shadowsMade?.ground > 0) this.layShadows();
      }
      this.bridgesMade = 0;
      this.marksMade = null;
      this.roadsideMade = null;
      this.footbridgesMade = null;
      this.cuttingsMade = null;
      return;
    }
    this.bridgesMade = drawBridges(this.bridgeMesh, this.network, lightFrom(this.sun), STAYED_BRIDGES);
    this.scene.set('bridges', this.bridgeMesh);
    // What stands along the roads: the barrier down the middle of a great road, the sign gantries over it,
    // the yellow-and-black kerb of an avenue's median.
    this.roadsideMade = drawRoadside(this.roadsideMesh, this.network, lightFrom(this.sun));
    this.scene.set('roadside', this.roadsideMesh);
    // The footbridges over the great roads: roofed walkways, with a tower for the stairs and the lift at each end.
    this.footbridgesMade = drawFootbridges(this.footbridgeMesh, this.footbridges, this.network, this.scene.origin, lightFrom(this.sun));
    this.scene.set('footbridges', this.footbridgeMesh);
    // The great roads that run below the ground: King Fahd Road through the centre, and every road where
    // it goes down into a tunnel.
    this.cuttingsMade = drawCuttings(this.cuttingMesh, this.bankMesh, this.network, lightFrom(this.sun), this.cuttingGlowMesh);
    this.scene.set('cuttings', this.cuttingMesh);
    this.scene.set('banks', this.bankMesh, { mask: true });
    this.scene.set('cuttinglight', this.cuttingGlowMesh, { glow: true });
    // (The ground beside a cutting is among the things that throw a shadow: into the cutting.)
    if (this.bankMesh.count > 0 || this.shadowsMade?.ground > 0) this.layShadows();
    // (The paint does not change with the sun: laid once for each network.)
    if (this.marksMade?.network !== this.network) {
      this.marksMade = { network: this.network, ...drawMarks(this.markMesh, this.network) };
      this.scene.set('marks', this.markMesh);
    }
  }

  /**
   * What OpenStreetMap says of where traffic signals stand: { bounds: { west, south, east, north } (the
   * area it has been asked about), points: [[lng, lat], …] }, or null if it has not been asked.
   */
  setSignalMarks(marks) {
    if (marks === this.signalMarks) return;
    this.signalMarks = marks ?? null;
    this.laySignals();
    this.map?.triggerRepaint();
  }

  /**
   * Stand the traffic signals afresh at the junctions of the streets read from the map (see
   * signals.js), and tell the traffic of them: it stops at their red.
   */
  laySignals() {
    const origin = this.scene.origin;
    if (!origin || this.type !== 'city' || !this.network) {
      if (this.signalMesh.count > 0 || this.signalLampMesh.count > 0) {
        for (const mesh of [this.signalMesh, this.signalLampMesh, this.signalGlowMesh]) mesh.clear();
        this.scene.set('signals', this.signalMesh);
        this.scene.set('signallamps', this.signalLampMesh, { shaded: false, bright: true });
        this.scene.set('signalglow', this.signalGlowMesh, { glow: true, point: POINT_METERS.signal, halo: true });
      }
      this.signals = null;
      this.signalsMade = null;
      this.signalsRead = null;
      this.traffic.setSignals(null);
      return;
    }
    this.readSignals(origin);
    // (The traffic runs on this network only while it is switched on.)
    this.traffic.setSignals(this.lifeOn && this.traffic.network === this.network ? this.signals : null);
    const made = drawSignals(this.signalMesh, this.signals, lightFrom(this.sun));
    this.scene.set('signals', this.signalMesh);
    this.signalsMade = { ...made, marked: this.signals.junctions.filter((junction) => junction.marked).length };
  }

  /**
   * The traffic signals of the streets read from the map, worked out afresh if the streets or what is
   * known of where signals stand have changed since they last were. origin: where the streets are
   * measured from, { lng, lat }.
   */
  readSignals(origin) {
    if (this.signalsRead?.network === this.network && this.signalsRead?.marks === this.signalMarks) return this.signals;
    // Where the map marks signals, measured as the streets are; and the area that is known for.
    let marks = null;
    if (this.signalMarks) {
      const squeeze = Math.max(Math.cos((origin.lat * Math.PI) / 180), 0.01) * METERS_PER_DEGREE;
      const { bounds, points } = this.signalMarks;
      const [west, east] = [(bounds.west - origin.lng) * squeeze, (bounds.east - origin.lng) * squeeze];
      const [south, north] = [(bounds.south - origin.lat) * METERS_PER_DEGREE, (bounds.north - origin.lat) * METERS_PER_DEGREE];
      marks = {
        points: points.map(([lng, lat]) => [(lng - origin.lng) * squeeze, (lat - origin.lat) * METERS_PER_DEGREE]),
        within: (x, y) => x >= west && x <= east && y >= south && y <= north,
      };
    }
    this.signals = signalsOf(this.network, { marks });
    this.signalsRead = { network: this.network, marks: this.signalMarks };
    return this.signals;
  }

  /**
   * Stand the street lamps afresh along the streets read from the map: the
   * posts, which stand by day too, and their light, which shows by night.
   */
  layLamps() {
    if (!this.scene.origin || this.type !== 'city' || !this.network) {
      if (this.lampPostMesh.count > 0 || this.lampLightMesh.count > 0 || this.lampHeadMesh.count > 0 || this.farLightMesh.count > 0) {
        this.lampPostMesh.clear();
        this.lampLightMesh.clear();
        this.lampHeadMesh.clear();
        this.farLightMesh.clear();
        this.scene.set('lampposts', this.lampPostMesh);
        this.scene.set('lamplight', this.lampLightMesh, { glow: true });
        this.scene.set('lampheads', this.lampHeadMesh, { glow: true, point: POINT_METERS.lamp, halo: true });
        this.scene.set('farlights', this.farLightMesh, { glow: true, point: POINT_METERS.far });
      }
      this.lampsMade = null;
      this.farMade = null;
      this.laySigns();
      return;
    }
    // (The side streets of a district have the new white lamps or the old amber ones, by the kind of district it is.)
    const from = this.scene.origin;
    const squeezed = from ? Math.max(Math.cos((from.lat * Math.PI) / 180), 0.01) * METERS_PER_DEGREE : 1;
    const ledAt = from ? (x, y) => characterAt(from.lng + x / squeezed, from.lat + y / METERS_PER_DEGREE).led : null;
    const made = drawLamps(this.lampPostMesh, this.lampLightMesh, this.network, lightFrom(this.sun), { most: LAMPS_MOST, built: this.builtGround()?.built ?? null, heads: this.lampHeadMesh, ledAt });
    this.lampsMade = { ...made, roofs: this.roofs };
    this.scene.set('lampposts', this.lampPostMesh);
    this.scene.set('lamplight', this.lampLightMesh, { glow: true });
    this.scene.set('lampheads', this.lampHeadMesh, { glow: true, point: POINT_METERS.lamp, halo: true });
    this.laySigns();
  }

  /**
   * Stand the road signs afresh along the streets read from the map, and the hoardings beside the
   * great roads (see roadside.js): like the lamps, wherever no building is in the way. They come with
   * the detailed walls, and go with them.
   */
  laySigns() {
    if (!this.scene.origin || this.type !== 'city' || !this.network || !this.detailOn) {
      if (this.signMesh.count > 0 || this.signLightMesh.count > 0) {
        this.signMesh.clear();
        this.signLightMesh.clear();
        this.scene.set('signs', this.signMesh);
        this.scene.set('signlights', this.signLightMesh, { glow: true });
      }
      this.signsMade = null;
      return;
    }
    this.signsMade = drawSigns(this.signMesh, this.signLightMesh, this.network, lightFrom(this.sun), { built: this.builtGround()?.built ?? null });
    this.scene.set('signs', this.signMesh);
    this.scene.set('signlights', this.signLightMesh, { glow: true });
  }

  /**
   * The city's lights beyond where its lamps stand one by one: a point of
   * light every so many metres along every road the map has loaded, out to
   * the horizon. lines: the roads as layLife() read them from the map, each
   * cut to its own tile; box: the ground the lamps stand on, in degrees.
   */
  layFarLights(lines, box) {
    const origin = this.scene.origin;
    if (!origin || this.type !== 'city') return;
    const squeeze = Math.max(Math.cos((origin.lat * Math.PI) / 180), 0.01) * METERS_PER_DEGREE;
    const [west, south, east, north] = [(box.west - origin.lng) * squeeze, (box.south - origin.lat) * METERS_PER_DEGREE, (box.east - origin.lng) * squeeze, (box.north - origin.lat) * METERS_PER_DEGREE];
    const reach = this.lampsMade?.reach ?? 0;
    // (A lamp stands wherever the streets were read for lamps, as far out as there were lamps to go round.)
    const skip = (x, y) => x >= west && x <= east && y >= south && y <= north && Math.hypot(x, y) < reach;
    this.farMade = { points: drawFarLights(this.farLightMesh, lines, origin, { skip }), lines: lines.length };
    this.scene.set('farlights', this.farLightMesh, { glow: true, point: POINT_METERS.far });
  }

  /** Draw the parked cars and the bus shelters afresh, for the streets the traffic runs on. */
  layStreet() {
    if (!this.scene.origin || !this.lifeOn || this.type !== 'city' || !this.lifeMade) {
      if (this.streetMesh.count > 0 || this.parkedNearMesh.count > 0) {
        this.streetMesh.clear();
        this.parkedNearMesh.clear();
        this.scene.set('street', this.streetMesh);
        this.scene.set('parkednear', this.parkedNearMesh);
      }
      this.streetMade = null;
      this.parked = null;
      return;
    }
    this.streetMade = drawStreet(this.streetMesh, this.traffic.network, lightFrom(this.sun), shadowReach(this.sun), PARKED_MOST, this.builtGround() ?? {});
    this.streetMade.roofs = this.roofs;
    this.streetMade.trees = this.trees;
    // (The cars that stand, as they were drawn: those near the eye are drawn again with more care, each
    // taken out of this mesh meanwhile. See moveParked().)
    this.parked = { cars: this.streetMade.cars, kept: this.streetMesh.positions.slice(0, this.streetMesh.count * 3), folded: new Set(), at: null, drawn: 0 };
    delete this.streetMade.cars;
    this.parkedNearMesh.clear();
    this.scene.set('street', this.streetMesh);
    this.scene.set('parkednear', this.parkedNearMesh);
  }

  /**
   * Draw the cars that stand near the eye with the care the moving ones near it are drawn with. Done
   * again only when the eye has moved some way, or sees further or less far: near = { eye, within } as
   * for the traffic, or null for none.
   */
  moveParked(near) {
    const parked = this.parked;
    if (!parked) return;
    const at = parked.at;
    if (near && at && at.near && Math.hypot(near.eye[0] - at.eye[0], near.eye[1] - at.eye[1], near.eye[2] - at.eye[2]) < PARKED_NEAR_AGAIN_METERS && Math.abs(near.within - at.within) < at.within * 0.1) return;
    if (!near && at && !at.near) return;
    parked.at = near ? { near: true, eye: [...near.eye], within: near.within } : { near: false };
    const made = drawParkedNear(this.parkedNearMesh, this.streetMesh, parked.cars, parked.kept, parked.folded, lightFrom(this.sun), shadowReach(this.sun), near);
    parked.drawn = made.drawn;
    if (made.changed) this.scene.set('street', this.streetMesh);
    this.scene.set('parkednear', this.parkedNearMesh);
  }

  /**
   * Where the buildings stand, for whatever is put on the open ground between
   * them: { built(x, y), near(x, y, reach), within }: a test of whether a
   * spot (in the scene's metres) has a building on it, one of whether a
   * building stands within reach of it, and the ground [west, south, east,
   * north] the buildings are known for. Null without buildings of one outline
   * each.
   */
  builtGround() {
    const origin = this.scene.origin;
    const box = this.shade?.box;
    if (!origin || !box || !this.buildings || this.roofs.length === 0) return null;
    // (Asked for more than once for the same buildings, trees and origin: worked out once.)
    const kept = this.groundMade;
    if (kept && kept.roofs === this.roofs && kept.trees === this.trees && kept.box === box && kept.lng === origin.lng && kept.lat === origin.lat) return kept.ground;
    const squeeze = Math.max(Math.cos((origin.lat * Math.PI) / 180), 0.01) * METERS_PER_DEGREE;
    const squares = new Map();
    const squareOf = (cellX, cellY) => (cellX + 32768) * 65536 + (cellY + 32768);
    for (const building of this.roofs) {
      if (building.base > 0) continue; // what starts above the ground leaves the ground free
      for (const polygon of building.polygons) {
        const ring = polygon[0].map(([lng, lat]) => [(lng - origin.lng) * squeeze, (lat - origin.lat) * METERS_PER_DEGREE]);
        let west = Infinity;
        let south = Infinity;
        let east = -Infinity;
        let north = -Infinity;
        for (const [x, y] of ring) {
          west = Math.min(west, x);
          east = Math.max(east, x);
          south = Math.min(south, y);
          north = Math.max(north, y);
        }
        const outline = { ring, west, south, east, north };
        for (let cellX = Math.floor(west / BUILT_SQUARE_METERS); cellX <= Math.floor(east / BUILT_SQUARE_METERS); cellX += 1) {
          for (let cellY = Math.floor(south / BUILT_SQUARE_METERS); cellY <= Math.floor(north / BUILT_SQUARE_METERS); cellY += 1) {
            const key = squareOf(cellX, cellY);
            if (!squares.has(key)) squares.set(key, []);
            squares.get(key).push(outline);
          }
        }
      }
    }
    // (A tree counts as built on, as far as its trunk goes.)
    const trunks = new Map();
    for (const tree of this.trees) {
      const x = (tree.lng - origin.lng) * squeeze;
      const y = (tree.lat - origin.lat) * METERS_PER_DEGREE;
      const key = squareOf(Math.floor(x / TRUNK_SQUARE_METERS), Math.floor(y / TRUNK_SQUARE_METERS));
      if (!trunks.has(key)) trunks.set(key, []);
      trunks.get(key).push([x, y]);
    }
    const built = (x, y) => {
      for (let dx = -1; dx <= 1; dx += 1) {
        for (let dy = -1; dy <= 1; dy += 1) {
          for (const [tx, ty] of trunks.get(squareOf(Math.floor(x / TRUNK_SQUARE_METERS) + dx, Math.floor(y / TRUNK_SQUARE_METERS) + dy)) ?? []) {
            if (Math.hypot(tx - x, ty - y) < TRUNK_CLEAR_METERS) return true;
          }
        }
      }
      for (const { ring, west, south, east, north } of squares.get(squareOf(Math.floor(x / BUILT_SQUARE_METERS), Math.floor(y / BUILT_SQUARE_METERS))) ?? []) {
        if (x < west || x > east || y < south || y > north) continue;
        let inside = false;
        for (let i = 1; i < ring.length; i += 1) {
          const [x0, y0] = ring[i - 1];
          const [x1, y1] = ring[i];
          if (y0 > y !== y1 > y && x < x0 + ((y - y0) * (x1 - x0)) / (y1 - y0)) inside = !inside;
        }
        if (inside) return true;
      }
      return false;
    };
    // (Near enough: within reach of the box a building's outline fits in.)
    const near = (x, y, reach) => {
      const span = Math.ceil(reach / BUILT_SQUARE_METERS);
      const cellX = Math.floor(x / BUILT_SQUARE_METERS);
      const cellY = Math.floor(y / BUILT_SQUARE_METERS);
      for (let dx = -span; dx <= span; dx += 1) {
        for (let dy = -span; dy <= span; dy += 1) {
          for (const { west, south, east, north } of squares.get(squareOf(cellX + dx, cellY + dy)) ?? []) {
            if (Math.hypot(Math.max(west - x, 0, x - east), Math.max(south - y, 0, y - north)) <= reach) return true;
          }
        }
      }
      return false;
    };
    const ground = { built, near, within: [(box.west - origin.lng) * squeeze, (box.south - origin.lat) * METERS_PER_DEGREE, (box.east - origin.lng) * squeeze, (box.north - origin.lat) * METERS_PER_DEGREE] };
    this.groundMade = { roofs: this.roofs, trees: this.trees, box, lng: origin.lng, lat: origin.lat, ground };
    return ground;
  }

  /**
   * Show the names written along the roads this strongly (0 to 1). In a view
   * along the ground they are no use: those close by are drawn out long and
   * thin, and those far off are specks that lie across whatever stands in
   * front of them. (The street you are on is named at the top of the map.)
   */
  fadeRoadNames(shown) {
    this.whenStyled((map) => {
      let names = this.roadNames;
      if (!names || names.type !== this.type || !names.ids.every((id) => map.getLayer(id))) {
        if (shown === 1) return; // nothing has been faded in this style: it need not be read
        const ids = map.getStyle().layers.filter((layer) => layer.type === 'symbol' && String(layer.layout?.['symbol-placement'] ?? 'point').startsWith('line')).map((layer) => layer.id);
        names = { type: this.type, ids, shown: 1 };
        this.roadNames = names;
      }
      if (names.ids.length === 0 || (names.shown === shown && (map.getPaintProperty(names.ids[0], 'text-opacity') ?? 1) === shown)) return;
      for (const id of names.ids) {
        map.setPaintProperty(id, 'text-opacity', shown);
        map.setPaintProperty(id, 'icon-opacity', shown);
      }
      names.shown = shown;
    });
  }

  /**
   * Show the markers of the places this strongly (0 to 1). In a view along the ground they pile up along
   * the horizon, each as large as the one at your feet, across the skyline: there they are put away.
   */
  fadePlaces(shown) {
    this.whenStyled((map) => {
      if (!map.getLayer('vm-places')) return;
      if (this.placesShown === shown && (map.getPaintProperty('vm-places', 'icon-opacity') ?? 1) === shown) return;
      map.setPaintProperty('vm-places', 'icon-opacity', shown);
      map.setPaintProperty('vm-places', 'text-opacity', shown);
      this.placesShown = shown;
    });
  }

  /** Build the models of the famous buildings afresh, each where it stands from the scene's origin. */
  layModels() {
    const origin = this.scene.origin;
    if (!origin) return;
    const models = landmarkModels(this.modelMesh, origin);
    this.modelsMade = { origin, models, faces: this.modelMesh.faces, corners: this.modelMesh.count };
    this.scene.setModels(this.modelMesh);
    this.layProps();
  }

  /**
   * The models that carry a picture (see props.js): those that stand near are
   * fetched, once each, and put where they stand from the scene's origin.
   */
  layProps() {
    const origin = this.scene.origin;
    if (!origin) return;
    const shown = [];
    for (const { prop, east, north } of propsNear(origin)) {
      const kept = this.propFiles.get(prop.file);
      if (!kept) this.fetchProp(prop.file, prop.picture ?? prop.file);
      else if (kept.mesh) shown.push({ mesh: kept.mesh, picture: kept.picture, at: [east, north, 0], turn: prop.turn ?? 0, tall: prop.height, lit: prop.night ?? 0, gain: prop.day?.gain, plain: prop.day?.plain });
    }
    this.scene.setProps(shown);
    this.propsMade = { origin, shown: shown.length, triangles: shown.reduce((sum, one) => sum + one.mesh.indices.length / 3, 0) };
  }

  /** Fetch one such model's mesh and its picture; when both are in, it is put in its places. One that cannot be had is left out, and not asked for again. */
  fetchProp(file, pictured = file) {
    const kept = { mesh: null, picture: null };
    this.propFiles.set(file, kept);
    const mesh = fetch(`./models/${file}.vmm`)
      .then((answer) => (answer.ok ? answer.arrayBuffer() : Promise.reject(new Error(`no mesh: ${answer.status}`))))
      .then((bytes) => readProp(bytes));
    const picture = new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('no picture'));
      image.src = `./models/${pictured}.jpg`;
    });
    Promise.all([mesh, picture])
      .then(([made, image]) => {
        if (!made) throw new Error('not a mesh');
        kept.mesh = made;
        kept.picture = image;
        if (this.type !== 'city' || !this.scene.origin) return;
        this.layProps();
        this.map?.triggerRepaint();
      })
      .catch(() => {});
  }

  /** Before each picture: move the traffic on and draw it afresh. True while there is something moving. */
  moveLife() {
    const now = performance.now();
    const seconds = (now - this.lifeAt) / 1000;
    this.lifeAt = now;
    const zoom = this.map.getZoom();
    // Everything in the scene fades in over the first half zoom level it is shown at.
    this.scene.opacity = Math.min(Math.max((zoom - LIFE_MIN_ZOOM) * 2, 0), 1);
    // What the walls are drawn by: how much wall a pixel of the screen shows in the middle of the picture,
    // and where in the scene that middle is. (Further off a pixel shows more: the scene works that out.)
    const middle = this.map.getCenter();
    this.scene.sharp = window.devicePixelRatio || 1;
    this.scene.pixel = (EARTH_AROUND_METERS * Math.cos((middle.lat * Math.PI) / 180)) / (512 * 2 ** zoom) / this.scene.sharp;
    // The models of the famous buildings show from far further off than the rest, so they may be wanted
    // before anything else has given the scene a place to measure from. And they are measured from that
    // place: built again whenever it moves.
    this.scene.modelOpacity = Math.min(Math.max((zoom - MODEL_MIN_ZOOM) * 2, 0), 1);
    // In a view that reaches towards the horizon, what is far off fades into the haze; and the names
    // written along the roads fade out.
    this.scene.haze = this.type === 'city' ? Math.min(Math.max((this.map.getPitch() - HAZE_FROM_PITCH) / (HAZE_FULL_PITCH - HAZE_FROM_PITCH), 0), 1) : 0;
    this.fadeRoadNames(Math.round((1 - this.scene.haze) * 4) / 4);
    this.fadePlaces(Math.round(Math.min(Math.max((PLACES_GONE_PITCH - this.map.getPitch()) / 4, 0), 1) * 4) / 4);
    if (this.type === 'city') {
      if (!this.scene.origin) this.scene.setOrigin({ lng: middle.lng, lat: middle.lat });
      if (this.modelsMade?.origin !== this.scene.origin) this.layModels();
    }
    const from = this.scene.origin;
    this.scene.focus = from ? [(middle.lng - from.lng) * Math.max(Math.cos((from.lat * Math.PI) / 180), 0.01) * METERS_PER_DEGREE, (middle.lat - from.lat) * METERS_PER_DEGREE] : [0, 0];
    this.moveSky();
    if (!this.lifeOn || this.type !== 'city' || zoom < LIFE_MIN_ZOOM) {
      if (this.trafficMesh.count > 0) {
        this.trafficMesh.clear();
        this.scene.set('traffic', this.trafficMesh);
      }
      if (this.walkerMesh.count > 0) {
        this.walkerMesh.clear();
        this.scene.set('walkers', this.walkerMesh);
      }
      this.walkersDrawn = 0;
      if (this.lightMesh.count > 0 || this.carLightMesh.count > 0) {
        this.lightMesh.clear();
        this.carLightMesh.clear();
        this.scene.set('lights', this.lightMesh, { glow: true });
        this.scene.set('carlights', this.carLightMesh, { glow: true, point: POINT_METERS.vehicle });
      }
      this.lifeDrawn = 0;
      this.darkenSignals();
      return false;
    }
    if (!this.lifeView && this.scene.origin) {
      // What is on screen, so that a bus does not appear in the middle of the picture.
      const origin = this.scene.origin;
      const squeeze = Math.max(Math.cos((origin.lat * Math.PI) / 180), 0.01) * METERS_PER_DEGREE;
      const bounds = this.map.getBounds();
      this.lifeView = [
        (bounds.getWest() - origin.lng) * squeeze,
        (bounds.getSouth() - origin.lat) * METERS_PER_DEGREE,
        (bounds.getEast() - origin.lng) * squeeze,
        (bounds.getNorth() - origin.lat) * METERS_PER_DEGREE,
      ];
      this.traffic.view = this.lifeView;
    }
    this.traffic.step(seconds);
    // Life size from zoom 17.5 in; up to half as large again further out, so a car is still a car and not a speck.
    const scale = Math.min(Math.max(1 + (17.5 - zoom) * 0.5, 1), 1.5);
    // (A vehicle is drawn with more care while it is long enough on screen for that to show: so many
    // pixels to its length, which it is out to so far from the eye.)
    const eye = this.scene.eye;
    const reach = Math.hypot(this.scene.focus[0] - eye[0], this.scene.focus[1] - eye[1], eye[2]);
    const near = this.detailOn && this.scene.pixel > 0 ? { eye, within: Math.min((FINE_VEHICLE_METERS_A_PIXEL * reach) / this.scene.pixel, FINE_VEHICLE_FURTHEST_METERS) } : null;
    this.lifeDrawn = drawTraffic(this.trafficMesh, this.traffic, lightFrom(this.sun), shadowReach(this.sun), scale, near);
    this.scene.set('traffic', this.trafficMesh);
    this.moveParked(near);
    // The people on the pavements: they walk on; and those near enough to be made out are drawn.
    this.walkers.step(seconds);
    const seen = this.scene.pixel > 0 ? { eye, within: Math.min((WALKER_METERS_A_PIXEL * reach) / this.scene.pixel, WALKER_FURTHEST_METERS) } : null;
    this.walkersDrawn = drawWalkers(this.walkerMesh, this.walkers, lightFrom(this.sun), shadowReach(this.sun), seen);
    this.scene.set('walkers', this.walkerMesh);
    // The signals: on each head the lamp that is lit just now, and by night its shine.
    if (this.signals && this.traffic.signals) {
      drawSignalLamps(this.signalLampMesh, this.signalGlowMesh, this.signals, Date.now() / 1000, { eye: this.scene.eye });
      this.scene.set('signallamps', this.signalLampMesh, { shaded: false, bright: true });
      this.scene.set('signalglow', this.signalGlowMesh, { glow: true, point: POINT_METERS.signal, halo: true });
    } else {
      this.darkenSignals();
    }
    // By night everything that moves has its lights on.
    if (lampsLit(this.night) > 0) {
      drawTrafficLights(this.lightMesh, this.traffic, scale, this.carLightMesh);
      this.scene.set('lights', this.lightMesh, { glow: true });
      this.scene.set('carlights', this.carLightMesh, { glow: true, point: POINT_METERS.vehicle });
    } else if (this.lightMesh.count > 0 || this.carLightMesh.count > 0) {
      this.lightMesh.clear();
      this.carLightMesh.clear();
      this.scene.set('lights', this.lightMesh, { glow: true });
      this.scene.set('carlights', this.carLightMesh, { glow: true, point: POINT_METERS.vehicle });
    }
    return true;
  }

  /**
   * What is known of the weather, for the sky: { cloud (how much of it is covered, 0 to 1), cloudLow,
   * cloudMid, cloudHigh (the same for each layer of cloud), windFrom (degrees), windSpeed (m/s),
   * visibility (m) }, any of which may be missing; or null.
   */
  setWeather(weather) {
    this.weather = weather ?? null;
    // Under cloud the sun throws a weaker shadow, on the ground and on every wall and roof, and the sky
    // is greyer. (With a few clouds about the sun is out most of the time: little changes until the sky
    // is mostly covered.)
    const between = Math.min(Math.max((sunBetween(cloudLayersOf(this.weather)) - 0.1) / 0.65, 0), 1);
    this.sunlight = 0.1 + 0.9 * between * between * (3 - 2 * between);
    this.scene.sunlight = this.sunlight;
    this.applyNight(this.night);
    this.map?.triggerRepaint();
  }

  /** The parts of the sky as the scene has them, in the order they are drawn in: [name, mesh, how]. */
  skyParts() {
    return [
      ['skywash', this.skyWashMesh, { sky: true, shaded: false }],
      ['skyglow', this.skyGlowMesh, { sky: true, glow: true }],
      ['skystars', this.skyStarMesh, { sky: true, glow: true, point: SKY_POINT_PIXELS }],
      ['skymoon', this.skyMoonMesh, { sky: true, shaded: false }],
      ...SKY_CLOUD_PARTS.map((name, index) => [name, this.skyCloudMeshes[index], { sky: true, shaded: false }]),
      ['skyplanes', this.skyPlaneMesh, { sky: true, shaded: false }],
      ['skyplanelamps', this.skyPlaneLampMesh, { sky: true, glow: true, point: SKY_POINT_PIXELS }],
      ['skysun', this.skySunMesh, { sky: true, glow: true, late: true }],
    ];
  }

  /**
   * Set the sky out for where the eye now is. What stands in it (the sun and the colours of its going
   * down, the moon, the stars, the clouds the weather has) is set out afresh only now and then: in
   * between, each layer of cloud is moved along on the wind as a whole. What moves fast is drawn with
   * every picture: the aircraft (while the city's traffic is shown) and the twinkling of the stars.
   */
  moveSky() {
    const origin = this.scene.origin;
    if (this.type !== 'city' || !origin || !this.sun || this.map.getPitch() < SKY_FROM_PITCH || this.map.getZoom() < LIFE_MIN_ZOOM) {
      if (this.skyMade) {
        for (const [name, mesh, how] of this.skyParts()) {
          mesh.clear();
          this.scene.set(name, mesh, how);
        }
        this.skyMade = null;
        this.skyKept = null;
      }
      return;
    }
    const parts = new Map(this.skyParts().map(([name, mesh, how]) => [name, [mesh, how]]));
    if (!this.skyOrdered) {
      // (The scene draws the parts of the sky in the order it first had them in: so it has them all, once, in theirs.)
      for (const [name, [mesh, how]] of parts) this.scene.set(name, mesh, how);
      this.skyOrdered = true;
    }
    const now = Date.now();
    const seconds = now / 1000;
    const eye = this.scene.eye;
    const squeeze = Math.max(Math.cos((origin.lat * Math.PI) / 180), 0.01) * METERS_PER_DEGREE;
    const place = { lng: origin.lng + eye[0] / squeeze, lat: origin.lat + eye[1] / METERS_PER_DEGREE };
    const weather = this.weather ?? {};
    const wind = { windFrom: weather.windFrom ?? 315, windSpeed: weather.windSpeed ?? 4 };
    const cover = cloudLayersOf(this.weather);
    let kept = this.skyKept;
    const stale =
      !kept ||
      kept.origin !== origin ||
      kept.weather !== this.weather ||
      Math.abs(now - kept.at) > SKY_SLOW_MS ||
      Math.abs(this.night - kept.night) > SKY_NIGHT_STEP ||
      Math.hypot(eye[0] - kept.eye[0], eye[1] - kept.eye[1], eye[2] - kept.eye[2]) > SKY_MOVED_METERS;
    // (Measured from a new spot, every cloud has to be drawn again at once: or for a moment some would stand where they were.)
    const moved = Boolean(kept) && kept.origin !== origin;
    if (stale) {
      const date = new Date(now);
      const moon = moonAt(date, place.lng, place.lat);
      const heavens = drawHeavens({ wash: this.skyWashMesh, glow: this.skyGlowMesh, disc: this.skySunMesh, face: this.skyMoonMesh }, { eye, sun: this.sun, night: this.night, moon, cover });
      // (No star shows by day: none is looked up.)
      const dusk = this.night > 0.2;
      const points = starPoints({ eye, night: this.night, stars: dusk ? starsAt(date, place.lng, place.lat) : [], planets: dusk ? planetsAt(date, place.lng, place.lat) : [] });
      // The clouds are fixed to the air they drift in, measured from a place that never moves. Where they
      // are is worked out now; they are drawn one layer with each picture that follows, so that no one
      // picture has to wait for all three.
      const [east, north] = [origin.lng * SKY_EAST_METERS, origin.lat * METERS_PER_DEGREE];
      const clouds = cloudsNear([place.lng * SKY_EAST_METERS, place.lat * METERS_PER_DEGREE], { ...cover, ...wind, seconds }).map((cloud) => ({ ...cloud, x: cloud.x - east, y: cloud.y - north }));
      for (const name of ['skywash', 'skyglow', 'skymoon', 'skysun']) this.scene.set(name, ...parts.get(name));
      kept = {
        at: now,
        origin,
        weather: this.weather,
        night: this.night,
        eye: [eye[0], eye[1], eye[2]],
        moon,
        points,
        heavens,
        starsDrawn: -1,
        // The clouds as they are to be drawn, and which layers are still to be; for each layer, how many were
        // drawn and the moment its clouds stand as they were drawn (from when on it has drifted).
        clouds: { list: clouds, seconds, east, north, wind, cover, due: [0, 1, 2] },
        laid: this.skyKept?.laid ?? [null, null, null],
        since: this.skyKept?.since ?? [seconds, seconds, seconds],
        winds: this.skyKept?.winds ?? [wind, wind, wind],
      };
      this.skyKept = kept;
    }
    for (let turn = 0; kept.clouds.due.length > 0 && (turn === 0 || moved); turn += 1) {
      const index = kept.clouds.due.shift();
      const drawn = kept.clouds;
      const layer = CLOUD_LAYERS[index];
      kept.laid[index] = drawClouds(this.skyCloudMeshes, { only: index, eye: kept.eye, sun: this.sun, night: kept.night, horizon: skyColours(kept.night, this.sunlight).horizon, moon: kept.moon, clouds: drawn.list, visibility: weather.visibility, windFrom: drawn.wind.windFrom });
      // The layer's grain is fixed to the layer itself: measured from a spot that drifts with it. (Kept
      // within a few hundred kilometres, for the sake of the numbers: once in many hours the grain changes.)
      const blowing = ((drawn.wind.windFrom + 180) * Math.PI) / 180;
      const wrapped = (metres) => ((metres % SKY_GRAIN_WRAP_METERS) + SKY_GRAIN_WRAP_METERS) % SKY_GRAIN_WRAP_METERS;
      const drifted = cloudDrift(index, drawn.wind, drawn.seconds);
      const [mesh, how] = parts.get(SKY_CLOUD_PARTS[index]);
      this.scene.set(SKY_CLOUD_PARTS[index], mesh, {
        ...how,
        cloud: {
          // (High cloud is thin where there is little of it, a veil where there is much.)
          solid: layer.solid * (index === 0 ? 0.55 + 0.45 * drawn.cover.high : 1),
          grain: [wrapped(drawn.east - drifted[0]), wrapped(drawn.north - drifted[1])],
          size: layer.grain,
          stretch: layer.stretch,
          wind: [Math.sin(blowing), Math.cos(blowing)],
        },
      });
      kept.since[index] = drawn.seconds;
      kept.winds[index] = drawn.wind;
    }
    // Each layer of cloud has drifted on since it was drawn.
    CLOUD_LAYERS.forEach((layer, index) => this.scene.shift(SKY_CLOUD_PARTS[index], [...cloudDrift(index, kept.winds[index], seconds - kept.since[index]), 0]));
    // The stars, as they twinkle. (While none shows, nothing is drawn afresh.)
    if (kept.points.length > 0 || kept.starsDrawn !== 0) {
      kept.starsDrawn = drawStars(this.skyStarMesh, kept.points, seconds);
      this.scene.set('skystars', ...parts.get('skystars'));
    }
    // The aircraft: asked after now and then, where a feed of live ones can be had; flown by the clock otherwise.
    let flying = { kind: null, source: null, planes: [] };
    if (this.lifeOn) {
      if (Math.abs(now - this.flightsAskedAt) > FLIGHTS_ASK_MS && !document.hidden) {
        this.flightsAskedAt = now;
        aircraftOverRiyadh().then((found) => {
          if (found) this.flights.report(found.planes, found.seconds, found.source);
        });
      }
      flying = this.flights.at(seconds, { windFrom: this.weather?.windFrom });
    }
    const planes = drawAircraft(this.skyPlaneMesh, this.skyPlaneLampMesh, { eye, origin, planes: flying.planes, night: this.night, sun: this.sun, moon: kept.moon, cover, seconds });
    if (planes > 0 || this.skyMade?.planes !== 0) {
      this.scene.set('skyplanes', ...parts.get('skyplanes'));
      this.scene.set('skyplanelamps', ...parts.get('skyplanelamps'));
    }
    this.skyMade = {
      clouds: kept.laid.reduce((sum, laid) => sum + (laid?.clouds ?? 0), 0),
      patches: kept.laid.reduce((sum, laid) => sum + (laid?.patches ?? 0), 0),
      planes,
      stars: kept.points.length,
      planets: kept.points.filter((point) => point.planet).map((point) => point.planet),
      sun: kept.heavens.sun,
      moon: kept.heavens.moon,
      flights: flying.kind,
      source: flying.source,
      aloft: flying.planes.length,
      cover,
    };
  }

  /**
   * What is in the sky right now: { clouds, patches, planes, stars, planets, sun, moon, flights: 'live' |
   * 'typical' | null, source, aloft, cover: { low, mid, high } }, or null while no sky shows.
   */
  skyCounts() {
    return this.skyMade;
  }

  /** Put out the lamps of the signals: with no traffic running they stand dark. */
  darkenSignals() {
    if (this.signalLampMesh.count === 0 && this.signalGlowMesh.count === 0) return;
    this.signalLampMesh.clear();
    this.signalGlowMesh.clear();
    this.scene.set('signallamps', this.signalLampMesh, { shaded: false, bright: true });
    this.scene.set('signalglow', this.signalGlowMesh, { glow: true, point: POINT_METERS.signal, halo: true });
  }

  /** What is on the streets right now, for anyone who wants to count it. */
  lifeCounts() {
    return {
      ...this.traffic.counts(),
      drawn: this.lifeDrawn,
      walkers: { out: this.walkers.walkers.length, drawn: this.walkersDrawn },
      parkedNear: this.parked?.drawn ?? 0,
      signs: this.signsMade,
      on: this.lifeOn && this.type === 'city',
      busStops: this.lifeMade?.stops ?? 0,
      stations: this.lifeMade?.stations ?? 0,
      busKm: this.traffic.network.busKm ?? 0,
      parked: this.streetMade?.parked ?? 0,
      bays: this.streetMade?.bays ?? 0,
      shelters: this.streetMade?.shelters ?? 0,
      bridges: this.bridgesMade,
      marks: this.marksMade ? { lines: this.marksMade.lines, crossings: this.marksMade.crossings } : null,
      // The junctions with signals: how many, and at how many of them OpenStreetMap marks one (null: it has not said).
      signals: this.signalsMade ? { junctions: this.signalsMade.junctions, approaches: this.signalsMade.approaches, heads: this.signalsMade.heads, marked: this.signalMarks ? this.signalsMade.marked : null, lit: this.signalLampMesh.count / 18 } : null,
      stayed: this.bridgesMade > 0 ? stayedHere(this.network, STAYED_BRIDGES).length : 0,
    };
  }

  // ── "You are here" ──────────────────────────────────────────────────────

  accuracyData() {
    const p = this.position;
    if (!p || !(p.accuracy > 0)) return EMPTY;
    return {
      type: 'Feature',
      properties: {},
      geometry: { type: 'Polygon', coordinates: [circleRing(p, Math.min(p.accuracy, 2000))] },
    };
  }

  /** fix: { lat, lng, accuracy, heading (degrees or null), moving } */
  setPosition(fix) {
    const before = this.position;
    const first = before === null;
    this.position = { lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy };

    if (!this.marker) {
      this.marker = new window.maplibregl.Marker({
        element: this.meElement,
        rotationAlignment: 'map',
        pitchAlignment: 'map',
      })
        .setLngLat([fix.lng, fix.lat])
        .addTo(this.map);
    } else {
      this.marker.setLngLat([fix.lng, fix.lat]);
    }

    // The direction arrow only means something while moving.
    const pointing = Boolean(fix.moving) && typeof fix.heading === 'number' && Number.isFinite(fix.heading);
    this.meElement.classList.toggle('has-heading', pointing);
    if (pointing) {
      this.heading = fix.heading;
      this.marker.setRotation(fix.heading);
    }

    // (A phone that stands still repeats its position every second. The circle is handed to the map only
    // when it has changed: each time, the map works it out afresh and draws itself again.)
    if (first || before.lat !== fix.lat || before.lng !== fix.lng || before.accuracy !== fix.accuracy) this.setSourceData('vm-accuracy', this.accuracyData());
    this.moveCamera(first);
  }

  /**
   * 'off', 'north' (you in the middle and the map does not turn: north up, or
   * the isometric angle in the 3D city) or 'heading' (tilted, the way you travel is up).
   */
  setFollowMode(mode) {
    const changed = mode !== this.followMode;
    this.followMode = mode;
    this.cameraTarget = null; // always move, even to the place the camera was last sent
    // While following, zooming keeps you in place instead of drifting away.
    const around = mode === 'off' ? undefined : { around: 'center' };
    this.map.scrollZoom.enable(around);
    this.map.touchZoomRotate.enable(around);
    // Each way of following has its own lens. (Left alone, the map keeps the lens it has.)
    if (mode !== 'off' && this.type) this.map.setVerticalFieldOfView(cameraOf(this.type)[mode].lens);
    this.moveCamera(false, changed);
  }

  /** first: this is the first position there is. entering: the way of following has just been chosen. */
  moveCamera(first, entering = false) {
    // (Outside Riyadh there is nothing to follow anyone on: the map stays on the city.)
    if (this.followMode === 'off' || !this.position || !inRiyadh(this.position)) return;
    const map = this.map;
    const center = [this.position.lng, this.position.lat];
    const camera = cameraOf(this.type)[this.followMode];
    const bearing = this.followMode === 'heading' ? (this.heading ?? map.getBearing()) : camera.bearing;
    const pitch = camera.pitch;
    // (A view along the ground wants the camera close: on choosing it the map draws in, if it is further out.)
    const closeEnough = camera.zoom && (first || entering) ? Math.max(map.getZoom(), camera.zoom) : map.getZoom();

    // Standing still sends the same position again and again: leave the map at rest.
    const target = `${this.followMode}|${pitch}|${center[0].toFixed(6)}|${center[1].toFixed(6)}|${bearing.toFixed(1)}`;
    if (target === this.cameraTarget && !first) return;
    this.cameraTarget = target;

    map.easeTo({
      center,
      bearing,
      pitch,
      zoom: first ? Math.max(closeEnough, pitch > 0 ? 16.5 : 16) : closeEnough,
      // Turned the way you travel, you sit below the middle, so more of what lies ahead is on screen.
      offset: [0, this.followMode === 'heading' ? Math.round(map.getContainer().clientHeight * (camera.below ?? 0.2)) : 0],
      duration: first ? 0 : 900,
      easing: (t) => t, // steady, so one position flows into the next
    });
  }

  // ── Pin and route ───────────────────────────────────────────────────────

  pinData() {
    if (!this.pin) return EMPTY;
    return { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [this.pin.lng, this.pin.lat] } };
  }

  routeData() {
    if (!this.route) return EMPTY;
    return { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: this.route } };
  }

  setPin(position) {
    this.pin = position ? { lat: position.lat, lng: position.lng } : null;
    this.setSourceData('vm-pin', this.pinData());
  }

  /** coordinates: [[lng, lat], …] or null to remove the line. */
  setRoute(coordinates) {
    this.route = Array.isArray(coordinates) && coordinates.length >= 2 ? coordinates : null;
    this.setSourceData('vm-route', this.routeData());
  }

  /** Bring the whole route on screen. */
  showRoute() {
    if (!this.route) return;
    let west = Infinity;
    let south = Infinity;
    let east = -Infinity;
    let north = -Infinity;
    for (const [lng, lat] of this.route) {
      west = Math.min(west, lng);
      east = Math.max(east, lng);
      south = Math.min(south, lat);
      north = Math.max(north, lat);
    }
    const box = this.map.getContainer();
    const pad = Math.round(Math.min(box.clientWidth, box.clientHeight) * 0.18);
    this.map.fitBounds([[west, south], [east, north]], { padding: pad, bearing: 0, pitch: 0, maxZoom: 16, duration: 800 });
  }

  flyTo(position) {
    const camera = cameraOf(this.type).north;
    this.map.setVerticalFieldOfView(camera.lens);
    this.map.flyTo({
      center: [position.lng, position.lat],
      zoom: Math.max(this.map.getZoom(), 16),
      bearing: camera.bearing,
      pitch: camera.pitch,
      duration: 1200,
    });
  }

  // ── Reading the map ─────────────────────────────────────────────────────

  view() {
    const center = this.map.getCenter();
    return {
      lat: Number(center.lat.toFixed(5)),
      lng: Number(center.lng.toFixed(5)),
      zoom: Number(this.map.getZoom().toFixed(2)),
    };
  }

  center() {
    const center = this.map.getCenter();
    return { lat: center.lat, lng: center.lng };
  }

  /**
   * The named road at a position, from the map data already on screen:
   * { title, alt, ref } or null. Only knows roads in the part of the map
   * that is loaded, which is where you are while the map follows you.
   */
  roadAt(position, heading) {
    let features;
    try {
      features = this.map.querySourceFeatures(VECTOR_SOURCE, { sourceLayer: 'transportation_name' });
    } catch {
      return null;
    }
    if (!features || features.length === 0) return null;
    const roads = features.map((feature) => ({
      properties: feature.properties,
      lines: linesFromGeometry(feature.geometry),
    }));
    const match = nearestRoad(roads, position, heading, 30);
    if (!match) return null;
    const names = displayName(match.road.properties);
    const ref = match.road.properties.ref ? String(match.road.properties.ref) : '';
    if (!names.title && !ref) return null;
    return { title: names.title, alt: names.alt, ref };
  }

  handleTap(event) {
    // Lifting the finger after a press-and-hold also counts as a tap; that one is not meant.
    if (Date.now() < this.ignoreTapsUntil) return;
    const map = this.map;
    const layers = this.placeLayers.filter((id) => map.getLayer(id));
    let hits = [];
    if (layers.length > 0) {
      const { x, y } = event.point;
      try {
        hits = map.queryRenderedFeatures(
          [
            [x - TAP_REACH_PX, y - TAP_REACH_PX],
            [x + TAP_REACH_PX, y + TAP_REACH_PX],
          ],
          { layers },
        );
      } catch {
        hits = [];
      }
    }
    const hit = hits.find((feature) => feature.geometry && feature.geometry.type === 'Point');
    if (!hit) {
      this.handlers.onMapTap?.();
      return;
    }
    const [lng, lat] = hit.geometry.coordinates;
    const names = displayName(hit.properties);
    const kind = placeKind(hit.properties.class, hit.properties.subclass);
    this.handlers.onPlaceTap?.({
      title: names.title || kind,
      alt: names.alt,
      kind,
      detail: '',
      lat,
      lng,
      osm: osmRefFromTileId(hit.id),
    });
  }

  /** Pressing and holding a spot on the map (or right-clicking it) drops a pin there. */
  watchLongPress() {
    const map = this.map;
    let timer = null;
    let start = null;
    const cancel = () => {
      clearTimeout(timer);
      timer = null;
    };
    map.on('touchstart', (event) => {
      cancel();
      if (event.points.length !== 1) return;
      start = event.point;
      const where = event.lngLat;
      timer = setTimeout(() => {
        timer = null;
        this.ignoreTapsUntil = Date.now() + 800;
        this.handlers.onLongPress?.({ lat: where.lat, lng: where.lng });
      }, LONG_PRESS_MS);
    });
    map.on('touchmove', (event) => {
      if (timer === null) return;
      if (event.points.length !== 1 || event.point.dist(start) > LONG_PRESS_SLOP_PX) cancel();
    });
    for (const name of ['touchend', 'touchcancel', 'dragstart', 'zoomstart', 'rotatestart', 'pitchstart']) {
      map.on(name, cancel);
    }
    map.on('contextmenu', (event) => {
      event.preventDefault();
      this.handlers.onLongPress?.({ lat: event.lngLat.lat, lng: event.lngLat.lng });
    });
  }
}
