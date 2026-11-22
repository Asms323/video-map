// The map itself: MapLibre drawing OpenFreeMap's street data, with the app's
// own layers (places, route, pin, "you are here") on top.

import {
  BUILDING_SOURCE,
  PLACE_CATEGORIES,
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
  detailedStyle,
  displayName,
  footprintsIn,
  groundWidth,
  linesFromGeometry,
  nearestRoad,
  osmRefFromTileId,
  placeKind,
  placeLayerIds,
  satelliteStyle,
  groundLook,
  shadowReach,
  sunLight,
  sunPosition,
  tileBox,
  wallImage,
  withOverlays,
} from './lib.js';
import { PLAIN_FUEL, brandOf, localKind, mosqueExtras, mosquesAmong, stationExtras, storeExtras } from './dress.js';
import { STAYED_BRIDGES, landmarkRoofs, landmarkShades, replacedByLandmarks } from './landmarks.js';
import { Mesh, Traffic, buildNetwork, drawBridges, drawMarks, drawRoofs, drawStreet, drawTraffic, drawTrees, lightFrom, stayedHere, streetDirection, streetNear, trafficLevel } from './life.js';
import { PHOTO_ROOF_MOST_METERS, PhotoMesh, photoMosaic, photoRoofs, tileRange } from './roofs.js';
import { SceneLayer } from './scene.js';
import { buildingArchive, loadStyle, photoDate, photoTile } from './services.js';
import { footprintGrid, heightsFromShadows, passSuns, pavedGrid, photoGrid, tilesFor, treesInPhoto } from './sight.js';

export const MAP_TYPES = ['city', 'streets', 'night', 'satellite', 'detailed'];

// Styles drawn on a dark ground need light text on the app's own markers.
const DARK_TYPES = new Set(['night', 'satellite']);

// How the camera sits while it follows you: how far it leans over (degrees from
// straight down) and, in the view that does not turn, which way it looks.
const FLAT_CAMERA = { north: { pitch: 0, bearing: 0 }, heading: { pitch: 55 } };

// The 3D city is drawn isometric, the way an architect draws a model: looking
// down at the angle where the three edges of a cube all measure the same on
// screen, corner-on to the streets, and through a lens so long that parallel
// lines stay parallel instead of running off to a vanishing point.
const ISO_PITCH = 54.7;
const ISO_BEARING = 45; // looking north-east
const ISO_LENS = 6; // degrees of view, top to bottom
const NORMAL_LENS = 36.87; // the map library's own
const CITY_CAMERA = { north: { pitch: ISO_PITCH, bearing: ISO_BEARING }, heading: { pitch: ISO_PITCH } };
const cameraOf = (type) => (type === 'city' ? CITY_CAMERA : FLAT_CAMERA);

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
const SUN_CHECK_MS = 60000;
const EARTH_AROUND_METERS = 40075016.686;
const METERS_PER_DEGREE = 111320;

// The traffic lives on the streets of a wider area than the screen, so vehicles
// are already on their way when they come into view.
const LIFE_LAYER = 'city-life';
const LIFE_MIN_ZOOM = 15;
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

// The satellite photo is read for trees and for building heights around the
// view, at the zoom level the map itself shows it at, so little is downloaded twice.
const PHOTO_ZOOM = 17;
const PHOTO_MIN_ZOOM = 15.5;
const PHOTO_MARGIN_METERS = 150;
const PHOTO_REACH_METERS = 700; // never further than this from the middle of the view
const PHOTO_MOST_TREES = 2500;
// The roofs are cut out of the very photo tiles the map is showing on the ground, which are one
// level finer than the map's own zoom: so a roof is as sharp as the yard beside it, and costs no download of its own.
const ROOF_PHOTO_LEAST_ZOOM = 16;
const ROOF_PHOTO_MOST_ZOOM = 18;
const ROOF_KEPT_FOR_ZOOMS = 0.25; // once on finer tiles, they are kept this much of a zoom level out again: no to and fro at the edge
const ROOF_MARGIN_METERS = 220;
// How far above the slab the map draws on top of every building its photo is laid. Seen through the long
// lens of the isometric view the map cannot tell heights much closer than this apart.
const ROOF_LIFT_METERS = 0.3;
const HEIGHTS_KEPT = 30000;
const UNRECORDED_METERS = 5; // the height the street map gives a building whose height nobody recorded
const ROOF_CAP_METERS = 1.2; // the slab the map draws on top of every building
const PARKED_MOST = 2500;
const TREE_CLEAR_METERS = 2; // no tree this close to the edge of a road or a track
const PATH_CLEAR_METERS = 0.5;
const breathe = () => new Promise((resolve) => setTimeout(resolve, 0));
const wait = (ms, value) => new Promise((resolve) => setTimeout(() => resolve(value), ms));

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

/**
 * A patch of wall to repeat along and up a building: one window, drawn at twice
 * the size it is shown at. Without a layout the wall is plain.
 */
function drawWall(kind, layout) {
  const width = (layout?.bay ?? 2) * 2 * (layout ? (kind.scale ?? 1) : 1);
  const height = (layout?.floor ?? 2) * 2 * (layout ? (kind.scale ?? 1) : 1);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = kind.colour;
  ctx.fillRect(0, 0, width, height);
  if (layout && kind.lattice) {
    // A screen pierced in triangles: the two diagonals of every bay, and a line where the bays meet.
    ctx.strokeStyle = kind.glass;
    ctx.lineWidth = Math.max(1, width / 9);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(width, height);
    ctx.moveTo(width, 0);
    ctx.lineTo(0, height);
    ctx.moveTo(0, height - 0.5);
    ctx.lineTo(width, height - 0.5);
    ctx.stroke();
  } else if (layout) {
    // Glass in the middle of the bay, with wall left at the sides and above and below.
    const paneWidth = Math.round(width * kind.across);
    const paneHeight = Math.round(height * kind.up);
    const left = Math.round((width - paneWidth) / 2);
    const top = Math.round((height - paneHeight) / 2);
    ctx.fillStyle = kind.glass;
    ctx.fillRect(left, top, paneWidth, paneHeight);
    if (layout.floor >= 6) {
      // Close enough to see the shade under the top of the window opening.
      ctx.fillStyle = 'rgba(30, 40, 60, 0.22)';
      ctx.fillRect(left, top, paneWidth, Math.max(1, Math.round(height * 0.08)));
    }
  }
  return ctx.getImageData(0, 0, width, height);
}

let rtlRequested = false;
let archiveReader = false;

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
    this.roofsMade = null;
    this.roofPhotoMesh = new PhotoMesh(); // the roofs themselves, cut out of the photo
    this.roofPhotoMade = null; // what they were last cut for
    this.roofPhotoRequest = 0;
    this.roofPhotoShown = false; // whether roofs are being shown by their photo: then nothing made up is put on them
    this.scene = new SceneLayer(LIFE_LAYER, {
      onFrame: () => this.moveLife(),
      // The picture the roofs are cut from has to be handed to the map again.
      onLost: () => {
        this.roofPhotoMade = null;
        this.queueShade(false);
      },
    });
    // For anyone looking at the scene from outside (the tests do): what it holds.
    this.scene.counts = () => ({ life: this.lifeCounts(), photo: this.photoCounts(), buildings: this.buildingCounts() });

    this.map = new maplibregl.Map({
      container,
      style: BLANK_STYLE,
      center: view ? [view.lng, view.lat] : [0, 20],
      zoom: view ? view.zoom : 1.6,
      maxZoom: 19,
      maxPitch: 70,
      attributionControl: { compact: true },
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
      this.buildingFilters.clear();
      this.extrasMade = null;
      this.roofPhotoMade = null; // the picture the roofs are cut from is handed to the new style's scene afresh
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
      this.queueShade(true);
    });
    setInterval(() => this.followSun(), SUN_CHECK_MS);
    map.on('click', (event) => this.handleTap(event));
    this.watchLongPress();
  }

  // ── Style ───────────────────────────────────────────────────────────────

  /** Switch to one of MAP_TYPES. Resolves true once the new style is on its way to the screen. */
  async setType(type) {
    const request = ++this.styleRequest;
    let base;
    let buildings = null;
    try {
      if (type === 'night') {
        base = await loadStyle('fiord');
      } else if (type === 'city') {
        const archive = this.archiveFailed || !window.pmtiles ? Promise.resolve(null) : buildingArchive();
        const [streets, found] = await Promise.all([loadStyle('liberty'), Promise.race([archive, wait(ARCHIVE_WAIT_MS, undefined)])]);
        buildings = found ?? null;
        base = cityModelStyle(streets, { buildings });
        if (found === undefined) {
          // Still looking. Once the address is known the city is drawn again, a house at a time.
          archive.then((late) => {
            if (late && request === this.styleRequest && this.type === 'city' && !this.archiveFailed) this.setType('city');
          });
        }
      } else {
        const streets = await loadStyle('liberty');
        if (type === 'satellite') base = satelliteStyle(streets);
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
      dark: DARK_TYPES.has(type),
      accuracy: this.accuracyData(),
      pin: this.pinData(),
      route: this.routeData(),
    });
    this.placeLayers = placeLayerIds(style);
    this.map.setStyle(style, { diff: false });
    // Each map type has its own lens and camera angle.
    this.map.setVerticalFieldOfView(type === 'city' ? ISO_LENS : NORMAL_LENS);
    this.cameraTarget = null;
    this.moveCamera(false);
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
      else if (wall) image = drawWall(wall.tint === null ? WALL_KINDS[wall.kind] : { ...WALL_KINDS[wall.kind], colour: WALL_TINTS[wall.tint] }, WALL_DETAILS[wall.detail]);
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

  /** The footprints of the buildings that reach into a box, from whichever source the style on screen draws them from. */
  footprints(box, estimates) {
    const map = this.map;
    if (this.buildings) {
      const { building, parts } = this.archiveBuildings();
      // (The heights read from the photo are for whole buildings; the parts of one carry their own.)
      // A block that a landmark model stands in for still throws its shadow, but gets no roof furniture.
      const whole = buildingFootprints(building, box, estimates, this.onStreets).map((one) => (this.replaced.building.has(one.id) || this.dressed.has(one.id) ? { ...one, replaced: true, roofTop: this.storeRoofs.get(one.id) } : one));
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
    const sun = sunPosition(new Date(), centre.lat, centre.lng);
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
      if (lit) this.sun = sun;
    }
    const lit = this.treesLit;
    if (!lit || Math.abs(lit.altitude - this.sun?.altitude) > 1.5 || Math.abs(((lit.azimuth - this.sun?.azimuth + 540) % 360) - 180) > 1.5) {
      // What stands still is lit by the sun too: drawn afresh once it has moved on.
      if (this.trees.length > 0) this.layTrees();
      this.layStreet();
      this.layRoofs();
      this.layBridges();
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
      await breathe();
      this.layRoofPhoto();
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
    const metersPerPixel = (EARTH_AROUND_METERS * Math.cos((centre.lat * Math.PI) / 180)) / (512 * 2 ** zoom);
    // (Landmarks the map has no building for throw a shadow too.)
    source.setData(reach ? buildingShadows([...buildings, ...landmarkShades(), ...this.extraShades], reach, SHADE_SMALLEST_PX * metersPerPixel) : EMPTY);
    this.shade = { reach, box, zoom, tiles: this.tilesLoaded, heights: this.heightsRead };
    // The same buildings get their roofs furnished.
    this.roofs = this.buildings ? buildings : [];
    if (!this.scene.origin) this.scene.setOrigin({ lng: centre.lng, lat: centre.lat });
    this.layRoofs();
  }

  /** Draw what stands on the roofs afresh: measured from the scene's origin and lit by the sun. */
  layRoofs() {
    const origin = this.scene.origin;
    if (!origin || this.type !== 'city' || this.roofs.length === 0) {
      if (this.roofMesh.count > 0) {
        this.roofMesh.clear();
        this.scene.set('roofs', this.roofMesh);
      }
      this.roofsMade = null;
      return;
    }
    const squeeze = Math.max(Math.cos((origin.lat * Math.PI) / 180), 0.01) * METERS_PER_DEGREE;
    const local = [];
    const photoRoofs = this.roofPhotoShown;
    for (const building of this.roofs) {
      if (building.base > 0 || building.replaced) continue; // a part that starts above the ground (a bridge between towers, a canopy), or a landmark with a roof of its own
      // A roof that shows its own photo needs nothing made up put on it. (A station keeps its vault.)
      if (photoRoofs && building.kind !== 'station' && building.height <= PHOTO_ROOF_MOST_METERS) continue;
      for (const polygon of building.polygons) {
        if (polygon.length > 1) continue; // a courtyard in the middle: leave its roof bare
        local.push({
          ring: polygon[0].map(([lng, lat]) => [(lng - origin.lng) * squeeze, (lat - origin.lat) * METERS_PER_DEGREE]),
          top: building.height + ROOF_CAP_METERS,
          vault: building.kind === 'station',
        });
      }
    }
    this.roofsMade = { furnished: drawRoofs(this.roofMesh, local, lightFrom(this.sun)), of: local.length };
    this.scene.set('roofs', this.roofMesh);
    this.map.triggerRepaint();
  }

  // ── The satellite photo (3D city) ───────────────────────────────────────

  /** Turn reading the photo, for trees and building heights, on or off. */
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

  /** Fetch the photo of an area and read it: building heights from shadows, and trees. */
  async readPhoto(origin, half, box) {
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
        list.push({ ring: polygon[0].map(local), known: building.known ? building.height : null, id: building.id, usual: building.height });
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
          const { id, known, usual } = list[index];
          if (height === null || known !== null || id === undefined || !(height > usual + 1)) return;
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
          this.whenStyled((map) => map.removeFeatureState({ source: BUILDING_SOURCE, sourceLayer: 'building', id }));
        }
        this.raiseBuildings(raised);
        this.heightsRead += 1;
      }
      await breathe();
      if (request !== this.photoRequest) return;
    }

    this.trees = treesInPhoto(grid, footprintGrid(list, half), PHOTO_MOST_TREES, pavedGrid(roads, half)).map((tree) => ({
      lng: origin.lng + tree.x / squeeze,
      lat: origin.lat + tree.y / METERS_PER_DEGREE,
      radius: tree.radius,
    }));
    this.photoRead = { day, buildings: list.length, measured, trees: this.trees.length };
    if (!this.scene.origin) this.scene.setOrigin(origin);
    this.layShade();
    this.layTrees();
    this.layRoofPhoto(); // the roofs go up with the buildings that were found to be taller
    this.map.triggerRepaint();
  }

  /** Whether the roofs are to be shown by their photo, as things stand. */
  photoRoofsWanted() {
    return this.photoOn && this.type === 'city' && Boolean(this.buildings) && this.map.getZoom() >= PHOTO_MIN_ZOOM;
  }

  /**
   * Cut the roofs around the view out of the photo, unless the ones there
   * still fit. again: cut them afresh from the picture in use (the scene has
   * a new origin to measure from).
   */
  layRoofPhoto(again = false) {
    const map = this.map;
    const zoom = map.getZoom();
    const shown = this.photoRoofsWanted();
    if (shown !== this.roofPhotoShown) {
      // The roofs change hands: what is made up comes off those that get their photo, or goes back on.
      this.roofPhotoShown = shown;
      this.layRoofs();
    }
    if (!shown) {
      if (this.roofPhotoMesh.count > 0 || this.roofPhotoMade) {
        this.roofPhotoRequest += 1;
        this.roofPhotoMesh.clear();
        this.scene.setPhoto('roofs', this.roofPhotoMesh);
        this.roofPhotoMade = null;
        map.triggerRepaint();
      }
      return;
    }
    const bounds = map.getBounds();
    const view = { west: bounds.getWest(), south: bounds.getSouth(), east: bounds.getEast(), north: bounds.getNorth() };
    const made = this.roofPhotoMade;
    const centre = map.getCenter();
    if (again && made) {
      this.cutRoofs(made, made.box);
      return;
    }
    const squeeze = Math.max(Math.cos((centre.lat * Math.PI) / 180), 0.01) * METERS_PER_DEGREE;
    const wanted = {
      west: view.west - ROOF_MARGIN_METERS / squeeze,
      east: view.east + ROOF_MARGIN_METERS / squeeze,
      south: view.south - ROOF_MARGIN_METERS / METERS_PER_DEGREE,
      north: view.north + ROOF_MARGIN_METERS / METERS_PER_DEGREE,
    };
    // As sharp as the ground is being shown; and where one picture that sharp cannot take in the whole view
    // (a large screen), a level coarser, which covers four times the ground.
    const ideal = Math.min(Math.max(Math.floor(zoom) + 1, ROOF_PHOTO_LEAST_ZOOM), ROOF_PHOTO_MOST_ZOOM);
    let photoZoom = made && made.zoom === ideal + 1 && !made.trimmed && zoom >= ideal - ROOF_KEPT_FOR_ZOOMS ? made.zoom : ideal;
    let range;
    let box;
    let trimmed;
    for (;;) {
      range = tileRange(wanted, photoZoom);
      // What the tiles of that range cover.
      const corner = tileBox(photoZoom, range.x0, range.y0);
      const far = tileBox(photoZoom, range.x1, range.y1);
      box = { west: Math.max(wanted.west, corner.west), east: Math.min(wanted.east, far.east), south: Math.max(wanted.south, far.south), north: Math.min(wanted.north, corner.north) };
      trimmed = box.west > view.west || box.east < view.east || box.south > view.south || box.north < view.north;
      if (!trimmed || photoZoom <= ROOF_PHOTO_LEAST_ZOOM) break;
      photoZoom -= 1;
    }
    if (made && made.zoom === photoZoom && made.tiles === this.tilesLoaded && made.heights === this.heightsRead) {
      const covers = made.box.west <= view.west && made.box.east >= view.east && made.box.south <= view.south && made.box.north >= view.north;
      // (A view too wide for any one picture is served about its middle, and again once that has moved on.)
      const stillMiddle = made.trimmed && Math.hypot((centre.lng - made.centre.lng) * Math.cos((centre.lat * Math.PI) / 180), centre.lat - made.centre.lat) * METERS_PER_DEGREE < ROOF_MARGIN_METERS / 2;
      if (covers || stillMiddle) return;
    }
    const same = made && made.zoom === photoZoom && made.range.x0 === range.x0 && made.range.y0 === range.y0 && made.range.x1 === range.x1 && made.range.y1 === range.y1 ? made.mosaic : null;
    this.roofPhotoMade = { zoom: photoZoom, tiles: this.tilesLoaded, heights: this.heightsRead, box, trimmed, centre: { lng: centre.lng, lat: centre.lat }, range, mosaic: same, roofs: made?.roofs ?? 0 };
    this.cutRoofs(this.roofPhotoMade, box);
  }

  /** Fetch the photo tiles of a range, lay them out as one picture and cut the roofs out of it. */
  async cutRoofs(made, box) {
    const request = ++this.roofPhotoRequest;
    try {
      await this.cutRoofsNow(made, box, request);
    } catch {
      // The style changed under it, or the photo could not be read: the roofs stay as they are until the next try.
    }
  }

  async cutRoofsNow(made, box, request) {
    let mosaic = made.mosaic;
    let fresh = false;
    if (!mosaic || mosaic.missing.size > 0) {
      const wanted = [];
      for (let y = made.range.y0; y <= made.range.y1; y += 1) for (let x = made.range.x0; x <= made.range.x1; x += 1) wanted.push({ x, y });
      const pictures = await Promise.all(wanted.map((tile) => photoTile(made.zoom, tile.x, tile.y)));
      if (request !== this.roofPhotoRequest) return;
      const tiles = new Map();
      wanted.forEach((tile, index) => {
        if (pictures[index]) tiles.set(`${tile.x}/${tile.y}`, pictures[index]);
      });
      if (tiles.size === 0) return;
      mosaic = photoMosaic(tiles, made.zoom, made.range);
      fresh = true;
      await breathe();
      if (request !== this.roofPhotoRequest) return;
    }
    let buildings;
    try {
      buildings = this.footprints(box, this.heights);
    } catch {
      return; // the style is on its way; cut again with the next tiles
    }
    if (!this.scene.origin) {
      const centre = this.map.getCenter();
      this.scene.setOrigin({ lng: centre.lng, lat: centre.lat });
    }
    // (With them, the low roofs among the landmarks' models.)
    const cut = photoRoofs(this.roofPhotoMesh, [...buildings, ...landmarkRoofs()], mosaic, this.scene.origin, { cap: ROOF_CAP_METERS, lift: ROOF_LIFT_METERS });
    this.scene.setPhoto('roofs', this.roofPhotoMesh, fresh ? { size: mosaic.size, data: mosaic.data } : undefined);
    // (The picture's pixels now belong to the scene; what is kept says only where the picture lies.)
    made.mosaic = { ...mosaic, data: null };
    made.roofs = cut;
    this.map.triggerRepaint();
  }

  /** Draw the trees afresh: they are measured from the scene's origin and lit by the sun. */
  layTrees() {
    const origin = this.scene.origin;
    if (!origin || !this.photoOn || this.type !== 'city') {
      this.treeMesh.clear();
      this.scene.set('trees', this.treeMesh);
      return;
    }
    const squeeze = Math.max(Math.cos((origin.lat * Math.PI) / 180), 0.01) * METERS_PER_DEGREE;
    const local = this.trees.map((tree) => ({
      x: (tree.lng - origin.lng) * squeeze,
      y: (tree.lat - origin.lat) * METERS_PER_DEGREE,
      radius: tree.radius,
    }));
    drawTrees(this.treeMesh, local, lightFrom(this.sun), shadowReach(this.sun));
    this.scene.set('trees', this.treeMesh);
    this.treesLit = this.sun;
  }

  /** What the photo gave, for anyone who wants to count it. */
  photoCounts() {
    return { on: this.photoOn && this.type === 'city', trees: this.trees.length, heights: this.heights.size, read: this.photoRead ?? null, roofs: this.roofPhotoMade ? { cut: this.roofPhotoMade.roofs, zoom: this.roofPhotoMade.zoom, corners: this.roofPhotoMesh.count } : null };
  }

  // ── Traffic (3D city) ───────────────────────────────────────────────────

  /** Turn the moving traffic on or off. It is only ever drawn in the 3D city. */
  setLife(on) {
    this.lifeOn = Boolean(on);
    if (!this.lifeOn) this.traffic = new Traffic({ seed: Date.now() % 2147483647 }); // a fresh start when it is switched on again
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
    for (const feature of features) {
      const properties = feature.properties ?? {};
      if (!LIFE_LINES.has(properties.class)) continue;
      // A map tile holds its roads a little way past its own edge. Cut to its tile, each
      // stretch of road is there once, and meets the next tile's stretch end to end.
      const tile = Number.isInteger(feature._z) ? tileBox(feature._z, feature._x, feature._y) : null;
      for (const part of lineParts(feature.geometry)) {
        for (const coordinates of tile ? clipLine(part, tile) : [part]) {
          if (coordinates.length < 2 || !coordinates.some(inBox)) continue;
          lines.push({
            class: properties.class,
            oneway: properties.oneway,
            tunnel: properties.brunnel === 'tunnel',
            bridge: properties.brunnel === 'bridge',
            layer: properties.layer,
            service: properties.service,
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
    if (this.lifeOn) {
      this.traffic.level = trafficLevel(new Date(), centre.lng);
      this.traffic.view = null; // set again, from the new origin, before the next step
      this.lifeView = null;
      this.traffic.setNetwork(this.network, shift, origin);
    }
    this.scene.setOrigin(origin);
    this.lifeMade = { box, tiles: this.tilesLoaded, stops: busStops.size, stations: stations.size };
    // Everything that stands still is measured from the same spot.
    this.layTrees();
    this.layRoofs();
    this.layRoofPhoto(true);
    this.layBridges();
    this.layStreet();
    map.triggerRepaint();
  }

  /** Build the bridges and viaducts afresh: their decks, parapets and piers. And paint the roads: their lines and crossings. */
  layBridges() {
    if (!this.scene.origin || this.type !== 'city' || !this.network) {
      if (this.bridgeMesh.count > 0 || this.markMesh.count > 0) {
        this.bridgeMesh.clear();
        this.markMesh.clear();
        this.scene.set('bridges', this.bridgeMesh);
        this.scene.set('marks', this.markMesh);
      }
      this.bridgesMade = 0;
      this.marksMade = null;
      return;
    }
    this.bridgesMade = drawBridges(this.bridgeMesh, this.network, lightFrom(this.sun), STAYED_BRIDGES);
    this.scene.set('bridges', this.bridgeMesh);
    // (The paint does not change with the sun: laid once for each network.)
    if (this.marksMade?.network !== this.network) {
      this.marksMade = { network: this.network, ...drawMarks(this.markMesh, this.network) };
      this.scene.set('marks', this.markMesh);
    }
  }

  /** Draw the parked cars and the bus shelters afresh, for the streets the traffic runs on. */
  layStreet() {
    if (!this.scene.origin || !this.lifeOn || this.type !== 'city' || !this.lifeMade) {
      if (this.streetMesh.count > 0) {
        this.streetMesh.clear();
        this.scene.set('street', this.streetMesh);
      }
      this.streetMade = null;
      return;
    }
    this.streetMade = drawStreet(this.streetMesh, this.traffic.network, lightFrom(this.sun), shadowReach(this.sun), PARKED_MOST);
    this.scene.set('street', this.streetMesh);
  }

  /** Before each picture: move the traffic on and draw it afresh. True while there is something moving. */
  moveLife() {
    const now = performance.now();
    const seconds = (now - this.lifeAt) / 1000;
    this.lifeAt = now;
    const zoom = this.map.getZoom();
    // Everything in the scene fades in over the first half zoom level it is shown at.
    this.scene.opacity = Math.min(Math.max((zoom - LIFE_MIN_ZOOM) * 2, 0), 1);
    this.scene.look = groundLook(zoom); // the roofs are toned as the photo on the ground is
    if (!this.lifeOn || this.type !== 'city' || zoom < LIFE_MIN_ZOOM) {
      if (this.trafficMesh.count > 0) {
        this.trafficMesh.clear();
        this.scene.set('traffic', this.trafficMesh);
      }
      this.lifeDrawn = 0;
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
    this.lifeDrawn = drawTraffic(this.trafficMesh, this.traffic, lightFrom(this.sun), shadowReach(this.sun), scale);
    this.scene.set('traffic', this.trafficMesh);
    return true;
  }

  /** What is on the streets right now, for anyone who wants to count it. */
  lifeCounts() {
    return {
      ...this.traffic.counts(),
      drawn: this.lifeDrawn,
      on: this.lifeOn && this.type === 'city',
      busStops: this.lifeMade?.stops ?? 0,
      stations: this.lifeMade?.stations ?? 0,
      busKm: this.traffic.network.busKm ?? 0,
      parked: this.streetMade?.parked ?? 0,
      shelters: this.streetMade?.shelters ?? 0,
      bridges: this.bridgesMade,
      marks: this.marksMade ? { lines: this.marksMade.lines, crossings: this.marksMade.crossings } : null,
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
    const first = this.position === null;
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

    this.setSourceData('vm-accuracy', this.accuracyData());
    this.moveCamera(first);
  }

  /**
   * 'off', 'north' (you in the middle and the map does not turn: north up, or
   * the isometric angle in the 3D city) or 'heading' (tilted, the way you travel is up).
   */
  setFollowMode(mode) {
    this.followMode = mode;
    this.cameraTarget = null; // always move, even to the place the camera was last sent
    // While following, zooming keeps you in place instead of drifting away.
    const around = mode === 'off' ? undefined : { around: 'center' };
    this.map.scrollZoom.enable(around);
    this.map.touchZoomRotate.enable(around);
    this.moveCamera(false);
  }

  moveCamera(first) {
    if (this.followMode === 'off' || !this.position) return;
    const map = this.map;
    const center = [this.position.lng, this.position.lat];
    const camera = cameraOf(this.type)[this.followMode];
    const bearing = this.followMode === 'heading' ? (this.heading ?? map.getBearing()) : camera.bearing;
    const pitch = camera.pitch;

    // Standing still sends the same position again and again: leave the map at rest.
    const target = `${this.followMode}|${pitch}|${center[0].toFixed(6)}|${center[1].toFixed(6)}|${bearing.toFixed(1)}`;
    if (target === this.cameraTarget && !first) return;
    this.cameraTarget = target;

    map.easeTo({
      center,
      bearing,
      pitch,
      zoom: first ? Math.max(map.getZoom(), pitch > 0 ? 16.5 : 16) : map.getZoom(),
      // Turned the way you travel, you sit below the middle, so more of what lies ahead is on screen.
      offset: [0, this.followMode === 'heading' ? Math.round(map.getContainer().clientHeight * 0.2) : 0],
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
