import {
  PLACE_CATEGORIES,
  RIYADH,
  SPLIT_MAX,
  SPLIT_MIN,
  addRecent,
  clamp,
  cleanCategories,
  defaultSplit,
  describeTags,
  displayName,
  distanceMeters,
  formatDistance,
  formatDuration,
  formatSpeed,
  formatSpeedLimit,
  inRiyadh,
  isOverLimit,
  linkLabel,
  nearestRoad,
  parseVideoLink,
  youtubeEmbedUrl,
} from './lib.js';
import { LIGHT_MODES, MAP_TYPES, MapView } from './map.js';
import { aircraftFeed, cloudFieldAround, drivingRoute, placeAt, placeDetails, riyadhSignals, searchPlaces, speedLimitsNear, weatherAt } from './services.js';

const VERSION = '1.13.0';
const STORE_PREFIX = 'video-map:';

const $ = (id) => document.getElementById(id);

// ── Saved state (this phone only) ─────────────────────────────────────────

const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(STORE_PREFIX + key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(STORE_PREFIX + key, JSON.stringify(value));
    } catch {
      // Private browsing or full storage: the app still works, it just forgets.
    }
  },
};

const DEFAULT_SETTINGS = {
  layout: 'both', // 'both' | 'video' | 'map'
  swap: false, // map first
  keepAwake: true,
  unit: 'kmh', // 'kmh' | 'mph'
  mapType: 'city', // one of MAP_TYPES
  light: 'sun', // how the 3D city is lit: by the sun as it stands over Riyadh ('sun'), or as by 'day' or by 'night' whatever the hour
  places: ['fuel', 'parking'], // place categories shown on the map
  roadInfo: true, // road name and speed limit
  weather: true,
  traffic: true, // simulated cars, buses and trains in the 3D city
  photo: true, // trees, building heights and colours read from the satellite photo (which the 3D city never shows)
  sharp: true, // the photo of the Satellite look as sharp as the screen can show it (more to download)
  detail: true, // walls drawn window by window, and shadows on walls and roofs (more work for the phone)
  follow: 'north', // how the map follows you: 'north' (the map does not turn) | 'heading'
  splitPortrait: null,
  splitLandscape: null,
};

const settings = { ...DEFAULT_SETTINGS, ...sanitizeSettings(store.get('settings', {})) };

function sanitizeSettings(saved) {
  const out = {};
  if (!saved || typeof saved !== 'object') return out;
  if (['both', 'video', 'map'].includes(saved.layout)) out.layout = saved.layout;
  if (['kmh', 'mph'].includes(saved.unit)) out.unit = saved.unit;
  // ("auto" was a look of its own once: the 3D city by day and a flat dark map by night. The 3D city now has its own night.)
  if (MAP_TYPES.includes(saved.mapType)) out.mapType = saved.mapType;
  else if (saved.mapType === 'auto') out.mapType = 'city';
  if (LIGHT_MODES.includes(saved.light)) out.light = saved.light;
  if (Array.isArray(saved.places)) out.places = cleanCategories(saved.places);
  if (['north', 'heading'].includes(saved.follow)) out.follow = saved.follow;
  for (const key of ['swap', 'keepAwake', 'roadInfo', 'weather', 'traffic', 'photo', 'sharp', 'detail']) {
    if (typeof saved[key] === 'boolean') out[key] = saved[key];
  }
  for (const key of ['splitPortrait', 'splitLandscape']) {
    if (typeof saved[key] === 'number' && Number.isFinite(saved[key])) {
      out[key] = clamp(saved[key], SPLIT_MIN, SPLIT_MAX);
    }
  }
  return out;
}

function saveSettings() {
  store.set('settings', settings);
}

// ── Elements ──────────────────────────────────────────────────────────────

const stage = $('stage');
const bar = $('bar');
const grip = $('grip');
const player = $('player');
const embed = $('embed');
const videoEmpty = $('videoEmpty');
const videoError = $('videoError');
const videoErrorText = $('videoErrorText');
const linkForm = $('linkForm');
const linkInput = $('linkInput');
const linkError = $('linkError');
const pasteBtn = $('pasteBtn');
const recents = $('recents');
const recentList = $('recentList');
const stopVideoBtn = $('stopVideo');
const mapEl = $('map');
const mapStatus = $('mapStatus');
const locPrompt = $('locPrompt');
const locPromptText = $('locPromptText');
const locButton = $('locButton');
const locButtonLabel = $('locButtonLabel');
const roadEl = $('road');
const roadName = $('roadName');
const roadRef = $('roadRef');
const weatherEl = $('weather');
const limitEl = $('limit');
const speedEl = $('speed');
const speedValue = $('speedValue');
const speedUnit = $('speedUnit');
const followBtn = $('followBtn');
const placeEl = $('place');
const placeTitle = $('placeTitle');
const placeAlt = $('placeAlt');
const placeKindEl = $('placeKind');
const placeRows = $('placeRows');
const placeNote = $('placeNote');
const placeActions = $('placeActions');
const placeRouteBtn = $('placeRoute');
const placeMaps = $('placeMaps');
const searchForm = $('searchForm');
const searchInput = $('searchInput');
const searchNote = $('searchNote');
const searchResults = $('searchResults');

// ── Layout: which panes show, and how the screen is divided ───────────────

const landscapeQuery = window.matchMedia('(orientation: landscape)');
const isLandscape = () => landscapeQuery.matches;

/** The stage without its safe-area padding. */
function stageBox() {
  const rect = stage.getBoundingClientRect();
  const style = getComputedStyle(stage);
  const left = rect.left + parseFloat(style.paddingLeft);
  const top = rect.top + parseFloat(style.paddingTop);
  const width = rect.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  const height = rect.height - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
  return { left, top, width, height };
}

const barThickness = () => (isLandscape() ? bar.offsetWidth : bar.offsetHeight);

function currentSplit() {
  const saved = isLandscape() ? settings.splitLandscape : settings.splitPortrait;
  if (typeof saved === 'number') return saved;
  const box = stageBox();
  return defaultSplit(box.width, box.height, barThickness(), isLandscape());
}

function applySplit() {
  const split = currentSplit();
  const box = stageBox();
  const usable = Math.max((isLandscape() ? box.width : box.height) - barThickness(), 0);
  // Whole pixels, so the map never starts on a half pixel.
  stage.style.setProperty('--video-size', `${Math.round(usable * split)}px`);
  grip.setAttribute('aria-valuenow', String(Math.round(split * 100)));
  grip.setAttribute('aria-orientation', isLandscape() ? 'vertical' : 'horizontal');
}

function setSplit(fraction) {
  const split = clamp(fraction, SPLIT_MIN, SPLIT_MAX);
  if (isLandscape()) settings.splitLandscape = split;
  else settings.splitPortrait = split;
  applySplit();
}

function applyLayout() {
  stage.dataset.layout = settings.layout;
  stage.dataset.swap = String(settings.swap);
  for (const button of document.querySelectorAll('[data-layout].seg-btn')) {
    button.setAttribute('aria-pressed', String(button.dataset.layout === settings.layout));
  }
  applySplit();
  syncLocationWatch();
}

for (const button of document.querySelectorAll('[data-layout].seg-btn')) {
  button.addEventListener('click', () => {
    settings.layout = button.dataset.layout;
    saveSettings();
    applyLayout();
  });
}

// Dragging the bar resizes the two panes.
let dragPointer = null;
let dragOffset = 0; // where on the bar it was grabbed

grip.addEventListener('pointerdown', (event) => {
  if (settings.layout !== 'both') return;
  const barRect = bar.getBoundingClientRect();
  dragOffset = isLandscape() ? event.clientX - barRect.left : event.clientY - barRect.top;
  dragPointer = event.pointerId;
  grip.setPointerCapture(event.pointerId);
  stage.classList.add('dragging');
  event.preventDefault();
});

grip.addEventListener('pointermove', (event) => {
  if (event.pointerId !== dragPointer) return;
  const box = stageBox();
  const landscape = isLandscape();
  const usable = (landscape ? box.width : box.height) - barThickness();
  if (usable <= 0) return;
  // Distance of the bar's leading edge from the start of the stage.
  const along = (landscape ? event.clientX - box.left : event.clientY - box.top) - dragOffset;
  const fraction = along / usable;
  // With "map first" the video pane is the one after the bar.
  setSplit(settings.swap ? 1 - fraction : fraction);
});

function endDrag(event) {
  if (event.pointerId !== dragPointer) return;
  dragPointer = null;
  stage.classList.remove('dragging');
  if (grip.hasPointerCapture(event.pointerId)) grip.releasePointerCapture(event.pointerId);
  saveSettings();
}
grip.addEventListener('pointerup', endDrag);
grip.addEventListener('pointercancel', endDrag);

grip.addEventListener('keydown', (event) => {
  if (settings.layout !== 'both') return;
  const forward = event.key === 'ArrowDown' || event.key === 'ArrowRight';
  const back = event.key === 'ArrowUp' || event.key === 'ArrowLeft';
  if (!forward && !back) return;
  event.preventDefault();
  const step = (forward ? 0.02 : -0.02) * (settings.swap ? -1 : 1);
  setSplit(currentSplit() + step);
  saveSettings();
});

landscapeQuery.addEventListener('change', applySplit);
window.addEventListener('resize', applySplit);

// ── Video ─────────────────────────────────────────────────────────────────

let objectUrl = null;
let nowPlaying = null; // 'local' | 'file' | 'youtube' | null

function clearVideo() {
  nowPlaying = null;
  player.pause();
  player.removeAttribute('src');
  player.load();
  player.hidden = true;
  embed.replaceChildren();
  embed.hidden = true;
  videoError.hidden = true;
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }
}

function showNoVideo() {
  clearVideo();
  videoEmpty.hidden = false;
  stopVideoBtn.hidden = true;
}

function showVideoError(message) {
  clearVideo();
  videoEmpty.hidden = true;
  videoErrorText.textContent = message;
  videoError.hidden = false;
  stopVideoBtn.hidden = true;
}

function startPlayer(src, kind) {
  clearVideo();
  videoEmpty.hidden = true;
  stopVideoBtn.hidden = false;
  nowPlaying = kind;
  player.src = src;
  player.hidden = false;
  // Browsers may refuse to start with sound on their own; the play button still works.
  player.play().catch(() => {});
}

function playLocalFile(file) {
  const url = URL.createObjectURL(file);
  startPlayer(url, 'local');
  objectUrl = url;
}

function playLink(link) {
  if (link.kind === 'youtube') {
    clearVideo();
    videoEmpty.hidden = true;
    stopVideoBtn.hidden = false;
    nowPlaying = 'youtube';
    const frame = document.createElement('iframe');
    frame.src = youtubeEmbedUrl(link);
    frame.title = 'YouTube video';
    frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    frame.allowFullscreen = true;
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    embed.append(frame);
    embed.hidden = false;
    return;
  }

  if (link.hls && !player.canPlayType('application/vnd.apple.mpegurl')) {
    showVideoError('This kind of stream (.m3u8) plays in Safari on iPhone, but not in this browser.');
    return;
  }
  startPlayer(link.url, 'file');
}

player.addEventListener('error', () => {
  if (!player.getAttribute('src')) return; // just the element being emptied
  if (nowPlaying === 'local') {
    showVideoError("This phone can't play that file. Try another video. MP4 works best.");
  } else if (nowPlaying === 'file') {
    showVideoError("That link didn't play. It has to point straight at a video file or stream, not at a web page.");
  }
});

// There is one file input beside each "From this phone" button.
for (const input of document.querySelectorAll('[data-file-input]')) {
  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    input.value = ''; // so picking the same file again still fires "change"
    if (!file) return;
    closeSheets();
    playLocalFile(file);
  });
}

// The labels open their picker by themselves on tap; this adds the keyboard.
for (const label of document.querySelectorAll('[data-pick-file]')) {
  label.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    document.getElementById(label.htmlFor).click();
  });
}

const LINK_ERRORS = {
  empty: 'Paste a link first.',
  scheme: "That doesn't look like a video link.",
  'not-a-link': "That doesn't look like a video link.",
};

function openLink(text) {
  const link = parseVideoLink(text);
  if (link.kind === 'invalid') {
    linkError.textContent = LINK_ERRORS[link.reason] ?? LINK_ERRORS['not-a-link'];
    linkError.hidden = false;
    return;
  }
  linkError.hidden = true;
  linkInput.value = '';
  store.set('recents', addRecent(store.get('recents', []), text.trim()));
  closeSheets();
  playLink(link);
}

linkForm.addEventListener('submit', (event) => {
  event.preventDefault();
  openLink(linkInput.value);
});

if (navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
  pasteBtn.hidden = false;
  pasteBtn.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) linkInput.value = text.trim();
      linkInput.focus();
    } catch {
      pasteBtn.hidden = true; // not allowed here; pasting into the field still works
    }
  });
}

function renderRecents() {
  const saved = store.get('recents', []);
  const list = Array.isArray(saved) ? saved.filter((item) => typeof item === 'string') : [];
  recentList.replaceChildren();
  for (const href of list) {
    const link = parseVideoLink(href);
    if (link.kind === 'invalid') continue;

    const play = document.createElement('button');
    play.type = 'button';
    play.className = 'btn recent-play';
    const name = document.createElement('span');
    name.textContent = linkLabel(link);
    play.append(name);
    play.addEventListener('click', () => openLink(href));

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'btn recent-remove';
    remove.setAttribute('aria-label', `Remove ${linkLabel(link)} from recent links`);
    remove.textContent = '×';
    remove.addEventListener('click', () => {
      store.set('recents', list.filter((item) => item !== href));
      renderRecents();
    });

    const row = document.createElement('li');
    row.className = 'recent-item';
    row.append(play, remove);
    recentList.append(row);
  }
  recents.hidden = recentList.children.length === 0;
}

stopVideoBtn.addEventListener('click', () => {
  closeSheets();
  showNoVideo();
});

// ── Sheets ────────────────────────────────────────────────────────────────

const sheets = {
  source: $('sheet-source'),
  search: $('sheet-search'),
  map: $('sheet-map'),
  menu: $('sheet-menu'),
};

function openSheet(name) {
  const sheet = sheets[name];
  if (!sheet || sheet.open) return;
  if (name === 'source') {
    linkError.hidden = true;
    renderRecents();
  }
  if (typeof sheet.showModal === 'function') sheet.showModal();
  else sheet.setAttribute('open', '');
  if (name === 'search') searchInput.focus();
}

function closeSheets() {
  for (const sheet of Object.values(sheets)) {
    if (!sheet.open) continue;
    if (typeof sheet.close === 'function') sheet.close();
    else sheet.removeAttribute('open');
  }
}

for (const opener of document.querySelectorAll('[data-open]')) {
  opener.addEventListener('click', () => openSheet(opener.dataset.open));
}
for (const sheet of Object.values(sheets)) {
  // A tap on the dimmed area outside the sheet lands on the <dialog> itself.
  sheet.addEventListener('click', (event) => {
    if (event.target === sheet) closeSheets();
  });
  for (const closer of sheet.querySelectorAll('[data-close]')) {
    closer.addEventListener('click', closeSheets);
  }
}

// ── Map ───────────────────────────────────────────────────────────────────

let mapView = null;
let lastFix = null; // { lat, lng, accuracy, heading, speed, altitude, moving }
let followMode = 'off'; // 'off' | 'north' | 'heading'
let watchId = null;
let locationWanted = false;

function setStatus(text) {
  mapStatus.textContent = text ?? '';
  mapStatus.hidden = !text;
}

/** The map type that is drawn. */
function activeMapType() {
  return settings.mapType;
}

/** What there is to say about where the phone is: nothing once it is found in the city. */
function locationStatus() {
  if (lastFix) return inRiyadh(lastFix) ? null : 'You are outside Riyadh. The map covers Riyadh only.';
  return locationWanted ? 'Finding your location…' : null;
}

async function applyMapType() {
  if (!mapView) return;
  const shown = await mapView.setType(activeMapType());
  if (shown) setStatus(locationStatus());
  labelFollow();
  updateSignals();
}

/** Say what the follow button does now. The view that does not turn is isometric in the 3D city, north up elsewhere. */
function labelFollow() {
  const still = activeMapType() === 'city' ? 'the isometric view' : 'north up';
  let label = 'Keep the map on me';
  if (followMode === 'heading') label = `Following you, the way you travel is up. Tap for ${still}.`;
  else if (followMode === 'north') label = `Following you, ${still}. Tap to turn the map the way you travel.`;
  followBtn.setAttribute('aria-label', label);
  followBtn.title = label;
}

function setFollow(mode) {
  followMode = mode;
  if (mode !== 'off') {
    settings.follow = mode;
    saveSettings();
  }
  followBtn.dataset.mode = mode === 'off' ? settings.follow : mode;
  followBtn.setAttribute('aria-pressed', String(mode !== 'off'));
  labelFollow();
  if (mapView) mapView.setFollowMode(mode);
}

// ── Speed, speed limit, road name, weather ────────────────────────────────

let limitKmh = null;
let limitSeenAt = 0;
let roadCheckedAt = 0;
let roadKnownAt = null; // where the road name was last found

function renderSpeed() {
  const speed = formatSpeed(lastFix ? lastFix.speed : null, settings.unit);
  speedValue.textContent = speed.value;
  speedUnit.textContent = speed.unit;

  const limit = settings.roadInfo ? formatSpeedLimit(limitKmh, settings.unit) : '';
  limitEl.textContent = limit;
  limitEl.hidden = limit === '' || speedEl.hidden;
  if (limit !== '') limitEl.setAttribute('aria-label', `Speed limit ${limit} ${speed.unit}`);
  speedEl.classList.toggle('over', limit !== '' && isOverLimit(lastFix ? lastFix.speed : null, limitKmh));
}

function updateRoadInfo() {
  if (!mapView || !lastFix || !settings.roadInfo) {
    roadEl.hidden = true;
    limitKmh = null;
    renderSpeed();
    return;
  }
  const now = Date.now();
  if (now - roadCheckedAt < 900) return;
  const fix = lastFix;
  // Standing still on a road that is already named: nothing new to find out for a while.
  if (roadKnownAt && now - roadCheckedAt < 10000 && distanceMeters(roadKnownAt, fix) < 3) return;
  roadCheckedAt = now;

  const heading = fix.moving ? fix.heading : null;

  // The name comes from the map data already on screen.
  const road = mapView.roadAt(fix, heading);
  roadKnownAt = road ? { lat: fix.lat, lng: fix.lng } : null;
  if (road) {
    roadName.textContent = road.title;
    roadName.hidden = road.title === '';
    roadRef.textContent = road.ref;
    roadRef.hidden = road.ref === '';
    roadEl.hidden = false;
  } else {
    roadEl.hidden = true;
  }

  // The limit comes from OpenStreetMap, for the area around you.
  speedLimitsNear(fix).then((roads) => {
    const match = nearestRoad(roads, fix, heading, 25);
    if (match) {
      limitKmh = match.road.limit;
      limitSeenAt = Date.now();
    } else if (Date.now() - limitSeenAt > 6000) {
      limitKmh = null; // a short gap (a junction, a GPS wobble) keeps the last sign
    }
    renderSpeed();
  });
}

function renderWeather(summary) {
  if (!summary || !settings.weather) {
    weatherEl.hidden = true;
    return;
  }
  const degrees = settings.unit === 'mph' ? Math.round((summary.temperature * 9) / 5 + 32) : summary.temperature;
  weatherEl.textContent = `${degrees}°${summary.text ? ` ${summary.text}` : ''}`;
  weatherEl.hidden = false;
}

/**
 * Find out where OpenStreetMap marks traffic signals in the city, for the 3D city's junctions. (One
 * question for the whole of Riyadh, kept for a week: see riyadhSignals(). Until the answer is in, and
 * if it never comes, the city has signals where its main roads cross.)
 */
function updateSignals() {
  if (!mapView || !settings.traffic || activeMapType() !== 'city') return;
  riyadhSignals((known) => mapView?.setSignalMarks(known));
}

let weatherShown = null;

function updateWeather() {
  if (!settings.weather) {
    renderWeather(null);
    // (With the weather off, the sky over the 3D city is clear.)
    mapView?.setWeather(null);
    mapView?.setCloudField(null);
    return;
  }
  // The weather where you are in the city; until that is known, or away from it, the weather over the middle of it.
  const here = lastFix && inRiyadh(lastFix) ? lastFix : RIYADH.centre;
  weatherAt(here).then((summary) => {
    weatherShown = summary;
    renderWeather(summary);
    // (The sky over the 3D city has as much cloud as the weather says, drifting the way its wind blows.)
    if (summary) mapView?.setWeather(summary);
  });
  // And the clouds place by place round the city, with the winds at their heights: where they really are.
  cloudFieldAround(here).then((field) => {
    if (field && settings.weather) mapView?.setCloudField(field);
  });
}

// The weather is asked after again every few minutes, whether or not one moves (the services keep what
// they had until they have something newer), and as soon as the app is looked at again.
const WEATHER_EVERY_MS = 5 * 60 * 1000;
setInterval(() => {
  if (!document.hidden) updateWeather();
}, WEATHER_EVERY_MS);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) updateWeather();
});

// ── Live location ─────────────────────────────────────────────────────────

function showLocationPrompt(text, buttonLabel) {
  locPromptText.textContent = text;
  locButtonLabel.textContent = buttonLabel;
  locPrompt.hidden = false;
}

let followedYet = false; // whether the map has gone to the phone's position once

function onPosition(position) {
  if (!mapView) return;
  const { latitude, longitude, accuracy, heading, speed, altitude } = position.coords;
  lastFix = {
    lat: latitude,
    lng: longitude,
    accuracy: typeof accuracy === 'number' && Number.isFinite(accuracy) ? accuracy : 0,
    heading: typeof heading === 'number' && Number.isFinite(heading) ? heading : null,
    speed: typeof speed === 'number' && Number.isFinite(speed) ? speed : null,
    altitude: typeof altitude === 'number' && Number.isFinite(altitude) ? altitude : null,
    moving: typeof speed === 'number' && speed > 0.8,
  };

  // The map keeps to Riyadh. Away from the city there is nothing to follow you on: it stays where it is, and says so.
  const here = inRiyadh(lastFix);
  if (here && !followedYet) {
    // The first time the phone is found in the city, the map goes to it.
    followedYet = true;
    setFollow(settings.follow);
  } else if (!here && followMode !== 'off') {
    setFollow('off');
  }
  mapView.setPosition(lastFix);

  setStatus(locationStatus());
  locPrompt.hidden = true;
  followBtn.hidden = !here;
  speedEl.hidden = false;
  renderSpeed();
  updateRoadInfo();
  updateWeather();
  if (shownPlace) renderPlace();
}

function onPositionError(error) {
  if (error.code === error.PERMISSION_DENIED) {
    locationWanted = false;
    store.set('locationOn', false);
    stopWatching();
    setStatus(null);
    showLocationPrompt(
      'Location is turned off for this app. Allow it in your phone or browser settings, then try again.',
      'Try again',
    );
    return;
  }
  if (lastFix === null) setStatus('Still looking for a GPS signal…');
}

function stopWatching() {
  if (watchId === null) return;
  navigator.geolocation.clearWatch(watchId);
  watchId = null;
}

/** Listen for position updates only while the map is actually on screen. */
function syncLocationWatch() {
  if (!mapView || !('geolocation' in navigator)) return;
  const visible = settings.layout !== 'video' && document.visibilityState === 'visible';
  if (locationWanted && visible) {
    if (watchId !== null) return;
    if (lastFix === null) setStatus('Finding your location…');
    watchId = navigator.geolocation.watchPosition(onPosition, onPositionError, {
      enableHighAccuracy: true,
      maximumAge: 2000,
      timeout: 30000,
    });
  } else {
    stopWatching();
  }
}

function turnLocationOn() {
  locationWanted = true;
  store.set('locationOn', true);
  locPrompt.hidden = true;
  syncLocationWatch();
}

// ── Place details ─────────────────────────────────────────────────────────

let shownPlace = null; // the place in the card, plus what has been found out about it
let placeRequest = null;

const isApple = /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent);

function mapsLink(place) {
  const point = `${place.lat.toFixed(6)},${place.lng.toFixed(6)}`;
  return isApple
    ? `https://maps.apple.com/?daddr=${point}&dirflg=d`
    : `https://www.google.com/maps/dir/?api=1&destination=${point}&travelmode=driving`;
}

function renderPlace() {
  const place = shownPlace;
  if (!place) {
    placeEl.hidden = true;
    return;
  }

  placeTitle.textContent = place.title;
  placeAlt.textContent = place.alt;
  placeAlt.hidden = !place.alt;

  const facts = [place.kind];
  if (place.route) {
    facts.push(`${formatDistance(place.route.distance, settings.unit)} by road`, formatDuration(place.route.duration));
  } else if (lastFix && !place.me) {
    facts.push(`${formatDistance(distanceMeters(lastFix, place), settings.unit)} away`);
  }
  if (place.detail) facts.push(place.detail);
  placeKindEl.textContent = facts.filter(Boolean).join(' · ');

  placeRows.replaceChildren();
  for (const row of place.rows) {
    const label = document.createElement('dt');
    label.textContent = row.label;
    const value = document.createElement('dd');
    if (row.href) {
      const link = document.createElement('a');
      link.href = row.href;
      link.textContent = row.value;
      if (!row.href.startsWith('tel:')) {
        link.target = '_blank';
        link.rel = 'noopener';
      }
      value.append(link);
    } else {
      value.textContent = row.value;
    }
    placeRows.append(label, value);
  }
  placeRows.hidden = place.rows.length === 0;

  placeNote.textContent = place.note;
  placeNote.hidden = !place.note;

  placeActions.hidden = Boolean(place.me);
  placeRouteBtn.textContent = place.route ? 'Clear route' : 'Show route';
  placeMaps.href = mapsLink(place);
  placeEl.hidden = false;
}

/** Show a place in the card and look up what more is known about it. */
async function showPlace(place, { fly = false } = {}) {
  if (!mapView) return;
  if (placeRequest) placeRequest.abort();
  placeRequest = new AbortController();
  const { signal } = placeRequest;

  const shown = { alt: '', kind: '', detail: '', rows: [], note: '', route: null, osm: null, ...place };
  shownPlace = shown;
  mapView.setRoute(null);
  mapView.setPin(shown.me ? null : shown);
  if (fly) {
    setFollow('off');
    mapView.flyTo(shown);
  }
  if (shown.osm || shown.lookup) shown.note = 'Looking up details…';
  renderPlace();

  try {
    if (shown.osm) {
      const tags = await placeDetails(shown.osm, { signal });
      if (shownPlace !== shown) return;
      shown.rows = [...shown.rows, ...describeTags(tags)];
      if (!shown.alt && tags) {
        const names = displayName(tags);
        if (names.alt && names.alt !== shown.title) shown.alt = names.alt;
      }
    } else if (shown.lookup) {
      const near = await placeAt(shown, { signal });
      if (shownPlace !== shown) return;
      if (near) shown.detail = `Near ${[near.title, near.detail].filter(Boolean).join(', ')}`;
    }
    shown.note = '';
  } catch {
    if (signal.aborted || shownPlace !== shown) return;
    shown.note = "More details aren't available right now.";
  }
  renderPlace();
}

function closePlace() {
  if (placeRequest) placeRequest.abort();
  shownPlace = null;
  if (mapView) {
    mapView.setPin(null);
    mapView.setRoute(null);
  }
  renderPlace();
}

/** The aircraft in the sky, in words: the live ones by name, nearest first; and the typical ones, and why. */
function aircraftWords(sky) {
  const height = (metres) => (settings.unit === 'mph' ? `${(Math.round((metres * 3.28084) / 100) * 100).toLocaleString('en-US')} ft` : `${(Math.round(metres / 100) * 100).toLocaleString('en-US')} m`);
  const away = (metres) => formatDistance(metres, settings.unit);
  const usual = "the airport's usual landings and take-offs for this hour";
  if (sky.flights === 'live') {
    const doing = (plane) => (plane.climb < -1 ? 'coming down' : plane.climb > 1 ? 'climbing' : 'level');
    const list = sky.named.slice(0, 4).map((plane) => `${plane.callsign || 'one'} ${doing(plane)} at ${height(plane.alt)}, ${away(plane.far)} off`);
    const more = sky.named.length > 4 ? `, and ${sky.named.length - 4} more` : '';
    const added = sky.typical > 0 ? `; with ${usual}, drawn as typical, as no receiver hears the airport` : '';
    return `${sky.live} live just now (${sky.source}): ${list.join('; ')}${more}${added}`;
  }
  const feed = aircraftFeed();
  const why = {
    none: 'the live feed hears no aircraft round the city just now',
    spent: "the live feed's questions for today are used up",
    failed: 'the live feed does not answer just now',
  }[feed.heard] ?? 'no live positions yet';
  return `${usual[0].toUpperCase()}${usual.slice(1)}, and the airliners that usually pass over (${why})`;
}

function showWhereIAm() {
  if (!lastFix) return;
  const rows = [{ label: 'Position', value: `${lastFix.lat.toFixed(5)}, ${lastFix.lng.toFixed(5)}` }];
  if (lastFix.accuracy > 0) rows.push({ label: 'Accuracy', value: `within ${formatDistance(lastFix.accuracy, settings.unit)}` });
  if (lastFix.altitude !== null) {
    const height = settings.unit === 'mph' ? `${Math.round(lastFix.altitude * 3.28084)} ft` : `${Math.round(lastFix.altitude)} m`;
    rows.push({ label: 'Altitude', value: height });
  }
  if (weatherShown && settings.weather) rows.push({ label: 'Weather', value: weatherEl.textContent });
  // What the aircraft overhead are: the real ones, or the airport's usual traffic at this hour.
  const sky = mapView?.skyCounts();
  // The clouds, where they come from; and by night, the stars and planets as they stand this minute.
  if (sky && settings.weather) {
    const percent = (share) => `${Math.round((share ?? 0) * 100)}%`;
    const overhead = `low ${percent(sky.cover?.low)}, middle ${percent(sky.cover?.mid)}, high ${percent(sky.cover?.high)} overhead`;
    const when = sky.field ? new Date(sky.field.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null;
    rows.push({ label: 'Clouds', value: sky.field ? `${overhead}; live from ${sky.field.readings} readings round the city at ${when} (Open-Meteo)` : overhead });
  }
  if (sky?.tonight && sky.stars > 0) {
    const named = sky.tonight.brightest.length ? `; brightest ${sky.tonight.brightest.join(', ')}` : '';
    rows.push({ label: 'Stars', value: `${sky.tonight.stars} showing${named}` });
    if (sky.tonight.planets.length) rows.push({ label: 'Planets', value: sky.tonight.planets.join(', ') });
  }
  if (sky?.flights) rows.push({ label: 'Aircraft', value: aircraftWords(sky) });
  showPlace({ title: 'You are here', lat: lastFix.lat, lng: lastFix.lng, rows, me: true, lookup: true });
}

placeRouteBtn.addEventListener('click', async () => {
  const place = shownPlace;
  if (!place || !mapView) return;
  if (place.route) {
    place.route = null;
    place.note = '';
    mapView.setRoute(null);
    renderPlace();
    return;
  }
  if (!lastFix) {
    place.note = 'Turn on your location first, so the route has a start.';
    renderPlace();
    return;
  }
  place.note = 'Finding the route…';
  renderPlace();
  try {
    const route = await drivingRoute(lastFix, place);
    if (shownPlace !== place) return;
    if (!route) throw new Error('no route');
    place.route = route;
    place.note = '';
    mapView.setRoute(route.coordinates);
    setFollow('off');
    mapView.showRoute();
  } catch {
    if (shownPlace !== place) return;
    place.note = "Couldn't find a route right now.";
  }
  renderPlace();
});

$('placeClose').addEventListener('click', closePlace);

// ── Search ────────────────────────────────────────────────────────────────

let searchRequest = null;
let searchTimer = null;

function setSearchNote(text) {
  searchNote.textContent = text ?? '';
  searchNote.hidden = !text;
}

async function runSearch() {
  clearTimeout(searchTimer);
  const text = searchInput.value.trim();
  if (searchRequest) searchRequest.abort();
  if (text.length < 2) {
    searchResults.replaceChildren();
    setSearchNote(null);
    return;
  }
  searchRequest = new AbortController();
  const { signal } = searchRequest;
  setSearchNote('Searching…');

  let places;
  try {
    places = await searchPlaces(text, lastFix ?? (mapView ? mapView.center() : null), { signal });
  } catch {
    if (signal.aborted) return;
    searchResults.replaceChildren();
    setSearchNote("Search isn't available right now. Check your connection and try again.");
    return;
  }
  if (signal.aborted) return;

  searchResults.replaceChildren();
  for (const place of places) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'result';
    const title = document.createElement('span');
    title.className = 'result-title';
    title.dir = 'auto';
    title.textContent = place.title;
    const detail = document.createElement('span');
    detail.className = 'result-detail';
    detail.dir = 'auto';
    detail.textContent = [place.kind, place.detail].filter(Boolean).join(' · ');
    button.append(title, detail);
    button.addEventListener('click', () => {
      closeSheets();
      showPlace(place, { fly: true });
    });
    const item = document.createElement('li');
    item.append(button);
    searchResults.append(item);
  }
  setSearchNote(places.length === 0 ? 'No places found. Try another name or spelling.' : null);
}

searchForm.addEventListener('submit', (event) => {
  event.preventDefault();
  runSearch();
});
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(runSearch, 450);
});

// ── Map options ───────────────────────────────────────────────────────────

const optRoad = $('optRoad');
const optWeather = $('optWeather');
const optTraffic = $('optTraffic');
const optPhoto = $('optPhoto');
const optSharp = $('optSharp');
const optDetail = $('optDetail');
const placeToggles = $('placeToggles');

for (const category of PLACE_CATEGORIES) {
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.value = category.id;
  input.addEventListener('change', () => {
    const chosen = [...placeToggles.querySelectorAll('input:checked')].map((box) => box.value);
    settings.places = cleanCategories(chosen);
    saveSettings();
    if (mapView) mapView.setCategories(settings.places);
  });
  const dot = document.createElement('i');
  dot.style.background = category.color;
  const text = document.createElement('span');
  text.append(dot, category.label);
  const label = document.createElement('label');
  label.append(input, text);
  placeToggles.append(label);
}

for (const radio of document.querySelectorAll('input[name="mapType"]')) {
  radio.addEventListener('change', () => {
    if (!radio.checked) return;
    settings.mapType = radio.value;
    saveSettings();
    applyMapType();
  });
}

optRoad.addEventListener('change', () => {
  settings.roadInfo = optRoad.checked;
  saveSettings();
  roadCheckedAt = 0;
  roadKnownAt = null;
  updateRoadInfo();
});

optWeather.addEventListener('change', () => {
  settings.weather = optWeather.checked;
  saveSettings();
  updateWeather();
});

optTraffic.addEventListener('change', () => {
  settings.traffic = optTraffic.checked;
  saveSettings();
  if (mapView) mapView.setLife(settings.traffic);
  updateSignals();
});

optPhoto.addEventListener('change', () => {
  settings.photo = optPhoto.checked;
  saveSettings();
  if (mapView) mapView.setPhoto(settings.photo);
});

optSharp.addEventListener('change', () => {
  settings.sharp = optSharp.checked;
  saveSettings();
  if (mapView) mapView.setSharp(settings.sharp);
});

optDetail.addEventListener('change', () => {
  settings.detail = optDetail.checked;
  saveSettings();
  if (mapView) mapView.setDetail(settings.detail);
});

for (const radio of document.querySelectorAll('input[name="light"]')) {
  radio.addEventListener('change', () => {
    if (!radio.checked) return;
    settings.light = radio.value;
    saveSettings();
    if (mapView) mapView.setLightMode(settings.light);
  });
}

function initMap() {
  // (A view kept from before the map kept to Riyadh may lie anywhere: only one in the city is gone back to.)
  const saved = store.get('mapView', null);
  const hasSaved =
    saved && [saved.lat, saved.lng, saved.zoom].every((n) => typeof n === 'number' && Number.isFinite(n)) && inRiyadh(saved);

  try {
    mapView = new MapView(mapEl, {
      view: hasSaved ? saved : null,
      handlers: {
        onUserPan: () => setFollow('off'),
        onViewChange: (view) => store.set('mapView', view),
        onPlaceTap: (place) => showPlace(place),
        onLongPress: (point) => showPlace({ title: 'Dropped pin', lat: point.lat, lng: point.lng, lookup: true }),
        onMeTap: showWhereIAm,
        onStyleError: () => setStatus("The map couldn't load. Check your connection."),
      },
    });
  } catch {
    mapView = null;
    setStatus("This browser can't draw the map.");
    return;
  }
  mapView.setCategories(settings.places);
  mapView.setLife(settings.traffic);
  mapView.setPhoto(settings.photo);
  mapView.setSharp(settings.sharp);
  mapView.setUnit(settings.unit);
  mapView.setDetail(settings.detail);
  mapView.setLightMode(settings.light);
  applyMapType();
  updateWeather();
  updateSignals();

  followBtn.addEventListener('click', () => {
    if (!lastFix) return;
    if (followMode === 'off') setFollow(settings.follow);
    else setFollow(followMode === 'north' ? 'heading' : 'north');
  });

  speedEl.addEventListener('click', () => {
    settings.unit = settings.unit === 'kmh' ? 'mph' : 'kmh';
    saveSettings();
    applyUnit();
  });

  locButton.addEventListener('click', turnLocationOn);

  if (!('geolocation' in navigator)) {
    setStatus("This browser can't share your location.");
    return;
  }

  // Start on our own only if that will not surprise anyone with a permission prompt.
  const startQuietly = () => {
    locationWanted = true;
    syncLocationWatch();
  };
  const ask = () => showLocationPrompt('See where you are on the map.', 'Show my location');

  if (store.get('locationOn', false) === true) {
    startQuietly();
  } else if (navigator.permissions && typeof navigator.permissions.query === 'function') {
    navigator.permissions
      .query({ name: 'geolocation' })
      .then((status) => (status.state === 'granted' ? startQuietly() : ask()))
      .catch(ask);
  } else {
    ask();
  }
}

// ── Keep the screen on ────────────────────────────────────────────────────

const canWakeLock = 'wakeLock' in navigator;
let wakeLock = null;
let wakeLockBusy = false;

async function syncWakeLock() {
  if (!canWakeLock || wakeLockBusy) return;
  const want = settings.keepAwake && document.visibilityState === 'visible';
  wakeLockBusy = true;
  try {
    if (want && !wakeLock) {
      const lock = await navigator.wakeLock.request('screen');
      lock.addEventListener('release', () => {
        if (wakeLock === lock) wakeLock = null;
      });
      wakeLock = lock;
    } else if (!want && wakeLock) {
      const lock = wakeLock;
      wakeLock = null;
      await lock.release();
    }
  } catch {
    // Refused (low battery, or the browser wants a tap first). The next tap tries again.
  } finally {
    wakeLockBusy = false;
  }
}

document.addEventListener('visibilitychange', () => {
  syncWakeLock();
  syncLocationWatch();
});
// Some browsers only grant the wake lock after the first touch.
document.addEventListener('pointerdown', () => syncWakeLock(), { passive: true });

// ── Settings sheet ────────────────────────────────────────────────────────

const optAwake = $('optAwake');
const optSwap = $('optSwap');

function syncForms() {
  optAwake.checked = canWakeLock && settings.keepAwake;
  optSwap.checked = settings.swap;
  optRoad.checked = settings.roadInfo;
  optWeather.checked = settings.weather;
  optTraffic.checked = settings.traffic;
  optPhoto.checked = settings.photo;
  optSharp.checked = settings.sharp;
  optDetail.checked = settings.detail;
  for (const radio of document.querySelectorAll('input[name="unit"]')) {
    radio.checked = radio.value === settings.unit;
  }
  for (const radio of document.querySelectorAll('input[name="light"]')) {
    radio.checked = radio.value === settings.light;
  }
  for (const radio of document.querySelectorAll('input[name="mapType"]')) {
    radio.checked = radio.value === settings.mapType;
  }
  for (const box of placeToggles.querySelectorAll('input')) {
    box.checked = settings.places.includes(box.value);
  }
}

/** Everything on screen that depends on km/h or mph. */
function applyUnit() {
  if (mapView) mapView.setUnit(settings.unit);
  syncForms();
  renderSpeed();
  renderWeather(weatherShown);
  if (shownPlace) renderPlace();
}

if (!canWakeLock) {
  optAwake.disabled = true;
  $('awakeNote').textContent = "This browser can't keep the screen on. Turn off Auto-Lock in the phone's settings instead.";
}

optAwake.addEventListener('change', () => {
  settings.keepAwake = optAwake.checked;
  saveSettings();
  syncWakeLock();
});

optSwap.addEventListener('change', () => {
  settings.swap = optSwap.checked;
  saveSettings();
  applyLayout();
});

for (const radio of document.querySelectorAll('input[name="unit"]')) {
  radio.addEventListener('change', () => {
    if (!radio.checked) return;
    settings.unit = radio.value;
    saveSettings();
    applyUnit();
  });
}

// ── Start ─────────────────────────────────────────────────────────────────

const installed =
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
$('installHint').hidden = installed;
$('version').textContent = VERSION;

syncForms();
renderSpeed();
applyLayout(); // before the map is made, so it starts at its real size
initMap();
syncWakeLock();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // No offline start, nothing else is affected.
    });
  });
}
