// The map itself: MapLibre drawing OpenFreeMap's street data, with the app's
// own layers (places, route, pin, "you are here") on top.

import {
  PLACE_CATEGORIES,
  VECTOR_SOURCE,
  WALL_DETAILS,
  WALL_KINDS,
  buildingShadows,
  categoryFilter,
  circleRing,
  cityModelStyle,
  cleanCategories,
  detailedStyle,
  displayName,
  footprintsIn,
  linesFromGeometry,
  nearestRoad,
  osmRefFromTileId,
  placeKind,
  placeLayerIds,
  satelliteStyle,
  shadowReach,
  sunLight,
  sunPosition,
  wallImage,
  withOverlays,
} from './lib.js';
import { Mesh, Traffic, buildNetwork, drawTraffic, lightFrom, trafficLevel } from './life.js';
import { SceneLayer } from './scene.js';
import { loadStyle } from './services.js';

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
  const width = (layout?.bay ?? 2) * 2;
  const height = (layout?.floor ?? 2) * 2;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = kind.colour;
  ctx.fillRect(0, 0, width, height);
  if (layout) {
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
    this.lifeOn = true;
    this.lifeMade = null; // what the street network in use was made for
    this.lifeAt = 0;
    this.lifeDrawn = 0;
    this.traffic = new Traffic({ seed: Date.now() % 2147483647 });
    this.trafficMesh = new Mesh();
    this.scene = new SceneLayer(LIFE_LAYER, { onFrame: () => this.moveLife() });

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
      this.syncLife();
      this.followSun();
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
      if (event.sourceId !== VECTOR_SOURCE || !event.tile) return;
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
    try {
      if (type === 'night') {
        base = await loadStyle('fiord');
      } else {
        const streets = await loadStyle('liberty');
        if (type === 'city') base = cityModelStyle(streets);
        else if (type === 'satellite') base = satelliteStyle(streets);
        else if (type === 'detailed') base = detailedStyle(streets);
        else base = streets;
      }
    } catch (error) {
      if (request === this.styleRequest) this.handlers.onStyleError?.(error);
      return false;
    }
    if (request !== this.styleRequest) return false; // a newer choice overtook this one

    this.type = type;
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
      else if (wall) image = drawWall(WALL_KINDS[wall.kind], WALL_DETAILS[wall.detail]);
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
    this.shadeTimer = setTimeout(() => {
      this.shadeTimer = null;
      this.layShade();
      this.layLife();
    }, SHADE_PAUSE_MS);
  }

  /** Work out the shadows of the buildings on screen, unless the ones already there still fit. */
  layShade() {
    const map = this.map;
    let source = null;
    this.whenStyled(() => {
      source = map.getSource(SHADE_SOURCE);
    });
    if (this.type !== 'city' || !source) return;

    const zoom = map.getZoom();
    const reach = zoom >= SHADE_MIN_ZOOM ? shadowReach(this.sun) : null;
    if (!reach) {
      if (this.shade?.reach !== null) source.setData(EMPTY);
      this.shade = { reach: null };
      return;
    }

    const bounds = map.getBounds();
    const view = { west: bounds.getWest(), south: bounds.getSouth(), east: bounds.getEast(), north: bounds.getNorth() };
    const made = this.shade;
    if (
      made?.reach &&
      made.tiles === this.tilesLoaded &&
      Math.abs(made.zoom - zoom) < 0.6 &&
      sameShade(made.reach, reach) &&
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

    let features;
    try {
      features = map.querySourceFeatures(VECTOR_SOURCE, { sourceLayer: 'building' });
    } catch {
      return;
    }
    const metersPerPixel = (EARTH_AROUND_METERS * Math.cos((centre.lat * Math.PI) / 180)) / (512 * 2 ** zoom);
    source.setData(buildingShadows(footprintsIn(features, box), reach, SHADE_SMALLEST_PX * metersPerPixel));
    this.shade = { reach, box, zoom, tiles: this.tilesLoaded };
  }

  // ── Traffic (3D city) ───────────────────────────────────────────────────

  /** Turn the moving traffic on or off. It is only ever drawn in the 3D city. */
  setLife(on) {
    this.lifeOn = Boolean(on);
    this.syncLife();
    this.queueShade(false);
  }

  /** Put the traffic's layer into the style on screen, or take it out. */
  syncLife() {
    this.whenStyled((map) => {
      const wanted = this.lifeOn && this.type === 'city';
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

  /** Read the streets and tracks around the view from the map, for the traffic to run on. */
  layLife() {
    const map = this.map;
    if (!this.lifeOn || this.type !== 'city' || map.getZoom() < LIFE_MIN_ZOOM) return;
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
    try {
      features = map.querySourceFeatures(VECTOR_SOURCE, { sourceLayer: 'transportation' });
    } catch {
      return;
    }
    const lines = [];
    for (const feature of features) {
      const properties = feature.properties ?? {};
      if (!LIFE_LINES.has(properties.class)) continue;
      const geometry = feature.geometry;
      let parts = [];
      if (geometry?.type === 'LineString') parts = [geometry.coordinates];
      else if (geometry?.type === 'MultiLineString') parts = geometry.coordinates;
      for (const coordinates of parts) {
        if (coordinates.length >= 2 && coordinates.some(inBox)) {
          lines.push({ class: properties.class, oneway: properties.oneway, tunnel: properties.brunnel === 'tunnel', coordinates });
        }
      }
    }

    // Vehicles keep their place on their street while the ground under them is measured from a new spot.
    const origin = { lng: centre.lng, lat: centre.lat };
    const before = this.scene.origin;
    const shift = before
      ? [(before.lng - origin.lng) * squeeze * METERS_PER_DEGREE, (before.lat - origin.lat) * METERS_PER_DEGREE]
      : [0, 0];
    this.traffic.level = trafficLevel(new Date(), centre.lng);
    this.traffic.setNetwork(buildNetwork(lines, origin), shift);
    this.scene.setOrigin(origin);
    this.lifeMade = { box, tiles: this.tilesLoaded };
    map.triggerRepaint();
  }

  /** Before each picture: move the traffic on and draw it afresh. True while there is something moving. */
  moveLife() {
    const now = performance.now();
    const seconds = (now - this.lifeAt) / 1000;
    this.lifeAt = now;
    const zoom = this.map.getZoom();
    if (!this.lifeOn || this.type !== 'city' || zoom < LIFE_MIN_ZOOM) {
      this.trafficMesh.clear();
      this.scene.set('traffic', this.trafficMesh);
      this.lifeDrawn = 0;
      return false;
    }
    this.traffic.step(seconds);
    // Life size from zoom 17.5 in; up to half as large again further out, so a car is still a car and not a speck.
    const scale = Math.min(Math.max(1 + (17.5 - zoom) * 0.5, 1), 1.5);
    this.lifeDrawn = drawTraffic(this.trafficMesh, this.traffic, lightFrom(this.sun), shadowReach(this.sun), scale);
    this.scene.set('traffic', this.trafficMesh);
    // Vehicles fade in over the first half zoom level they are shown at.
    this.scene.opacity = Math.min((zoom - LIFE_MIN_ZOOM) * 2, 1);
    return true;
  }

  /** What is on the streets right now, for anyone who wants to count it. */
  lifeCounts() {
    return { ...this.traffic.counts(), drawn: this.lifeDrawn, on: this.lifeOn && this.type === 'city' };
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
