// What is built around the map's own buildings from other things the map
// knows: the footbridges and entrance pavilions of metro stations, and the
// shop fronts of chain stores in their house colours.
//
// Like the landmarks, everything is made of slabs: an outline with a bottom,
// a top and a colour, which the map draws as a block. Nothing here touches
// the browser. Positions are [lng, lat]; sizes are metres.

const METERS_PER_DEGREE = 111320;

/** A flat patch of ground to measure in: metres east and north of a place. */
function ground(origin) {
  const squeeze = Math.max(Math.cos((origin[1] * Math.PI) / 180), 0.01) * METERS_PER_DEGREE;
  return {
    to: ([lng, lat]) => [(lng - origin[0]) * squeeze, (lat - origin[1]) * METERS_PER_DEGREE],
    from: ([x, y]) => [origin[0] + x / squeeze, origin[1] + y / METERS_PER_DEGREE],
  };
}

/**
 * The smallest box around an outline, turned to fit it: its middle (x, y),
 * the direction of its long side (east, north) and half its length and width.
 */
export function boxAround(ring) {
  let best = null;
  for (let i = 1; i < ring.length; i += 1) {
    const dx = ring[i][0] - ring[i - 1][0];
    const dy = ring[i][1] - ring[i - 1][1];
    const wall = Math.hypot(dx, dy);
    if (wall < 0.5) continue;
    const east = dx / wall;
    const north = dy / wall;
    let low = Infinity;
    let high = -Infinity;
    let lowAcross = Infinity;
    let highAcross = -Infinity;
    for (const [x, y] of ring) {
      const along = x * east + y * north;
      const across = -x * north + y * east;
      low = Math.min(low, along);
      high = Math.max(high, along);
      lowAcross = Math.min(lowAcross, across);
      highAcross = Math.max(highAcross, across);
    }
    const area = (high - low) * (highAcross - lowAcross);
    if (!best || area < best.area) best = { area, east, north, low, high, lowAcross, highAcross };
  }
  if (!best) return null;
  const along = (best.low + best.high) / 2;
  const across = (best.lowAcross + best.highAcross) / 2;
  const box = {
    x: along * best.east - across * best.north,
    y: along * best.north + across * best.east,
    east: best.east,
    north: best.north,
    halfLength: (best.high - best.low) / 2,
    halfWidth: (best.highAcross - best.lowAcross) / 2,
  };
  if (box.halfWidth > box.halfLength) {
    // The long side first.
    [box.halfLength, box.halfWidth] = [box.halfWidth, box.halfLength];
    [box.east, box.north] = [-box.north, box.east];
  }
  return box;
}

/** The four corners of a rectangle: its middle, the direction of its length, and its half sizes. */
function rectangle(x, y, east, north, halfLength, halfWidth) {
  const corner = (along, across) => [x + east * along - north * across, y + north * along + east * across];
  return [corner(-halfLength, -halfWidth), corner(halfLength, -halfWidth), corner(halfLength, halfWidth), corner(-halfLength, halfWidth)];
}

/** One slab as map data: its outline (metres on a patch of ground), where it starts and ends, and its colour. */
function slab(patch, outline, base, top, paint, kind) {
  const ring = outline.map(patch.from);
  ring.push(ring[0]);
  return { type: 'Feature', properties: { kind, b: base, t: top, c: paint }, geometry: { type: 'Polygon', coordinates: [ring] } };
}

function inside(ring, x, y) {
  let hit = false;
  for (let i = 1; i < ring.length; i += 1) {
    const [x0, y0] = ring[i - 1];
    const [x1, y1] = ring[i];
    if (y0 > y !== y1 > y && x < x0 + ((y - y0) * (x1 - x0)) / (y1 - y0)) hit = !hit;
  }
  return hit;
}

// ── Metro stations ────────────────────────────────────────────────────────

// The Riyadh Metro's own colours: screens of pale gold metal, glass, grey roofs.
export const STATION_GOLD = '#c9ad78';
const STATION_GLASS = '#9db4c6';
const STATION_ROOF = '#d9dcde';
const STATION_CONCRETE = '#d6d1c6';
const STATION_SIGN = '#22324d';

const WALKWAY_FLOOR_METERS = 5.6; // clear of the traffic underneath
const WALKWAY_TOP_METERS = 8.6;
const WALKWAY_REACH_METERS = 110; // an entrance further to the side of its station than this is not joined to it by a bridge
const WALKWAY_BEYOND_METERS = 90; // nor one further past its end than this

/**
 * What stands around metro stations.
 *
 * stations: the outlines of the station buildings above ground, [[lng, lat], …] each.
 * entrances: where the map marks a way in, [lng, lat] each.
 * facing(position): the direction of the street at a place as [east, north], or null.
 *
 * A station in the middle of a road is reached over the traffic: from each
 * entrance beside the road a covered footbridge crosses to the station, or to
 * the middle of the road and along it to the station's end, with a stair
 * tower at its foot. An entrance with no station building near it leads
 * down to a station under the ground, and gets a glass pavilion.
 * Returns the slabs, as map features.
 */
export function stationExtras(stations, entrances, facing = () => null) {
  const features = [];
  const joined = new Set();
  for (const outline of stations) {
    if (!Array.isArray(outline) || outline.length < 4) continue;
    const patch = ground(outline[0]);
    const ring = outline.map(patch.to);
    const box = boxAround(ring);
    if (!box) continue;
    // A covered walkway from one point to another, on piers where it is long.
    const walkway = (from, to) => {
      const span = Math.hypot(to[0] - from[0], to[1] - from[1]);
      if (span < 1) return;
      const east = (to[0] - from[0]) / span;
      const north = (to[1] - from[1]) / span;
      const middle = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
      features.push(slab(patch, rectangle(middle[0], middle[1], east, north, span / 2, 1.8), WALKWAY_FLOOR_METERS, WALKWAY_TOP_METERS, STATION_GOLD, 'walkway'));
      features.push(slab(patch, rectangle(middle[0], middle[1], east, north, span / 2 + 0.3, 2.3), WALKWAY_TOP_METERS, WALKWAY_TOP_METERS + 0.3, STATION_ROOF, 'walkway'));
      for (let at = 22; at < span - 12; at += 22) {
        features.push(slab(patch, rectangle(from[0] + east * at, from[1] + north * at, east, north, 0.5, 0.9), 0, WALKWAY_FLOOR_METERS, STATION_CONCRETE, 'walkway'));
      }
    };
    const onAxis = (along, across) => [box.x + box.east * along - box.north * across, box.y + box.north * along + box.east * across];
    const spurs = new Set(); // the walkways that run on from an end of the station, so two entrances share one
    entrances.forEach((entrance, index) => {
      const [x, y] = patch.to(entrance);
      const along = (x - box.x) * box.east + (y - box.y) * box.north;
      const across = -(x - box.x) * box.north + (y - box.y) * box.east;
      const beside = Math.abs(across) - box.halfWidth;
      const beyond = Math.abs(along) - box.halfLength;
      if (beyond > WALKWAY_BEYOND_METERS || beside > WALKWAY_REACH_METERS) return;
      if (beside < 5 && beyond < 5) {
        joined.add(index); // a door in the station's own wall, or right at it
        return;
      }
      if (beside < 5) return; // in line with the station but away from it: a way in of its own
      joined.add(index);
      if (beyond <= -3) {
        // Level with the station: the bridge leaves its long side square on.
        walkway(onAxis(along, Math.sign(across) * (box.halfWidth - 0.5)), [x, y]);
      } else {
        // Past its end: the bridge crosses the road to the middle, and a walkway runs on from there to the station.
        const end = Math.sign(along) * (box.halfLength - 0.5);
        const reach = Math.sign(along) * Math.max(Math.abs(along), box.halfLength + 4);
        walkway(onAxis(reach, 0), [x, y]);
        const spur = `${Math.sign(along)}:${Math.round(Math.abs(reach) / 6)}`;
        if (!spurs.has(spur)) {
          spurs.add(spur);
          walkway(onAxis(end, 0), onAxis(reach + Math.sign(along) * 1.8, 0));
        }
      }
      // The stair tower at the pavement end: glass, under a roof of its own.
      const [east, north] = [box.east, box.north];
      features.push(slab(patch, rectangle(x, y, east, north, 2.8, 2.8), 0, WALKWAY_TOP_METERS, STATION_GLASS, 'stairs'));
      features.push(slab(patch, rectangle(x, y, east, north, 3.3, 3.3), WALKWAY_TOP_METERS, WALKWAY_TOP_METERS + 0.4, STATION_GOLD, 'stairs'));
    });
  }

  entrances.forEach((entrance, index) => {
    if (joined.has(index)) return;
    const patch = ground(entrance);
    const [east, north] = facing(entrance) ?? [1, 0];
    // A glass box under a wide flat roof, and the sign on its post.
    features.push(slab(patch, rectangle(0, 0, east, north, 3.4, 2.1), 0, 3.3, STATION_GLASS, 'pavilion'));
    features.push(slab(patch, rectangle(0, 0, east, north, 4.4, 3), 3.3, 3.7, STATION_GOLD, 'pavilion'));
    features.push(slab(patch, rectangle(east * 5.4, north * 5.4, east, north, 0.35, 0.35), 0, 5.2, STATION_SIGN, 'sign'));
    features.push(slab(patch, rectangle(east * 5.4, north * 5.4, east, north, 0.7, 0.7), 5.2, 6.4, STATION_GOLD, 'sign'));
  });
  return features;
}

export { ground as groundPatch, rectangle as rectangleOn, slab as slabOn, inside as insideRing };

// ── Chain stores ──────────────────────────────────────────────────────────
//
// A chain's branches look alike: the same colours on the same band over the
// door, wherever they are. The map knows where the branches are (their names)
// and what the buildings' outlines are; the chains' house colours are listed
// here. A branch is then dressed in them: a free-standing one all round, one
// that is part of a larger building with a shop front on the wall it is at,
// and a fuel station as a canopy over its pumps.
//
// Only colours and the shape of a shop front are used. Logos are not drawn.

const SHOP_GLASS = '#7f96a8';
const SHOP_WALL = '#f2efe8';
const SHOP_ROOF = '#e4e1d9';
const SIGN_POST = '#4b525c';

/**
 * The chains: what they are called on the map (in Latin and in Arabic
 * letters, lower case, without spaces), what kind of place a branch is, the
 * colour of its band and the colour that goes with it.
 *
 * kind: 'food' and 'cafe' (a small building of its own, or a shop front),
 * 'market' (a large hall), 'shop', 'bank' (a shop front, or a small building),
 * 'fuel' (a canopy over the pumps).
 */
export const BRANDS = [
  // Fast food.
  { id: 'mcdonalds', names: ['mcdonald', 'ماكدونالدز', 'ماكدونالد'], kind: 'food', band: '#db0007', accent: '#ffbc0d' },
  { id: 'kfc', names: ['kfc', 'kentucky', 'كنتاكي'], kind: 'food', band: '#e4002b', accent: '#ffffff', classes: ['fast_food', 'restaurant'] },
  { id: 'burger-king', names: ['burgerking', 'برجركنج', 'برغركنغ'], kind: 'food', band: '#ff8732', accent: '#f5ebdc' },
  { id: 'pizza-hut', names: ['pizzahut', 'بيتزاهت'], kind: 'food', band: '#e21017', accent: '#ffffff' },
  { id: 'hardees', names: ['hardee', 'هارديز'], kind: 'food', band: '#ce142a', accent: '#ffc72d' },
  { id: 'subway', names: ['subway', 'صبواي'], kind: 'food', band: '#009743', accent: '#f2b700', classes: ['fast_food', 'restaurant'] },
  { id: 'dominos', names: ['domino', 'دومينوز'], kind: 'food', band: '#006391', accent: '#e21837', classes: ['fast_food', 'restaurant'] },
  { id: 'papa-johns', names: ['papajohn', 'باباجونز'], kind: 'food', band: '#2d5d2a', accent: '#ff0000' },
  { id: 'wendys', names: ['wendys', 'وينديز'], kind: 'food', band: '#db163a', accent: '#029cd4', classes: ['fast_food', 'restaurant'] },
  { id: 'little-caesars', names: ['littlecaesar', 'ليتلسيزر'], kind: 'food', band: '#e66200', accent: '#ffffff' },
  { id: 'popeyes', names: ['popeyes', 'بوبايز'], kind: 'food', band: '#ff7c00', accent: '#f5f1ee' },
  { id: 'texas-chicken', names: ['texaschicken', 'دجاجتكساس'], kind: 'food', band: '#9a3324', accent: '#f8b02d' },
  { id: 'albaik', names: ['albaik', 'البيك'], kind: 'food', band: '#ce3737', accent: '#f8e931', classes: ['fast_food', 'restaurant'] },
  { id: 'kudu', names: ['kudu', 'كودو'], kind: 'food', band: '#1b6fb3', accent: '#f6b417', classes: ['fast_food', 'restaurant'] },
  { id: 'herfy', names: ['herfy', 'هرفي'], kind: 'food', band: '#0065ae', accent: '#ffd24d', classes: ['fast_food', 'restaurant'] },
  { id: 'maestro', names: ['maestropizza', 'مايستروبيتزا'], kind: 'food', band: '#005142', accent: '#fcfcf0' },
  { id: 'shawarmer', names: ['shawarmer', 'شاورمر'], kind: 'food', band: '#532d10', accent: '#a27709' },
  { id: 'krispy-kreme', names: ['krispykrem', 'كرسبيكريم'], kind: 'food', band: '#0b6a38', accent: '#c8102e' },
  { id: 'baskin-robbins', names: ['baskinrobbins', 'باسكنروبنز'], kind: 'food', band: '#f04da3', accent: '#ffffff' },
  { id: 'cinnabon', names: ['cinnabon', 'سينابون'], kind: 'food', band: '#071d49', accent: '#2bd5c4' },
  // Coffee.
  { id: 'starbucks', names: ['starbucks', 'ستاربكس'], kind: 'cafe', band: '#00754a', accent: '#d4e9e2' },
  { id: 'dunkin', names: ['dunkin', 'دانكن'], kind: 'cafe', band: '#ef6a00', accent: '#c63663' },
  { id: 'tim-hortons', names: ['timhortons', 'تيمهورتنز', 'تيمهورتونز'], kind: 'cafe', band: '#c8102e', accent: '#ffffff' },
  { id: 'costa', names: ['costa', 'كوستا'], kind: 'cafe', band: '#6d1f37', accent: '#f3e9dc', classes: ['cafe'] },
  { id: 'barns', names: ['barns', 'بارنز'], kind: 'cafe', band: '#65320f', accent: '#bd6d2b', classes: ['cafe'] },
  { id: 'half-million', names: ['halfmillion', 'هافمليون'], kind: 'cafe', band: '#84c6b2', accent: '#1d1d1b' },
  { id: 'dr-cafe', names: ['drcafe', 'دكيف'], kind: 'cafe', band: '#71580b', accent: '#218838', classes: ['cafe'] },
  // Supermarkets and other large halls.
  { id: 'panda', names: ['panda', 'بنده'], kind: 'market', band: '#6a8038', accent: '#ffffff', classes: ['grocery'] },
  { id: 'danube', names: ['danube', 'الدانوب'], kind: 'market', band: '#75c803', accent: '#ffffff', classes: ['grocery'] },
  { id: 'tamimi', names: ['tamimi', 'التميمي'], kind: 'market', band: '#66a428', accent: '#ffffff', classes: ['grocery'] },
  { id: 'carrefour', names: ['carrefour', 'كارفور'], kind: 'market', band: '#0e5aa7', accent: '#e1000f', classes: ['grocery'] },
  { id: 'lulu', names: ['lulu', 'لولو'], kind: 'market', band: '#2da54b', accent: '#d71920', classes: ['grocery'] },
  { id: 'ikea', names: ['ikea', 'ايكيا'], kind: 'market', band: '#ffda1a', wall: '#0051ba' },
  { id: 'extra', names: ['extra', 'اكسترا'], whole: true, kind: 'market', band: '#0065a4', accent: '#ffd200' },
  { id: 'jarir', names: ['jarirbookstore', 'مكتبةجرير'], kind: 'market', band: '#e20714', accent: '#ffffff' },
  { id: 'saco', names: ['saco', 'ساكو'], whole: true, kind: 'market', band: '#191970', accent: '#ffffff' },
  // Fuel.
  { id: 'aldrees', names: ['aldrees', 'الدريس'], kind: 'fuel', band: '#00a5e5', accent: '#001b66', classes: ['fuel'] },
  { id: 'sasco', names: ['sasco', 'ساسكو'], kind: 'fuel', band: '#0088a7', accent: '#ffffff', classes: ['fuel'] },
  { id: 'petromin', names: ['petromin', 'بترومين'], kind: 'fuel', band: '#d2353f', accent: '#ffffff', classes: ['fuel'] },
  // Banks, phone shops and pharmacies.
  { id: 'alrajhi', names: ['alrajhi', 'الراجحي'], kind: 'bank', band: '#221bff', accent: '#00b2ff', classes: ['bank'] },
  { id: 'snb', names: ['saudinationalbank', 'البنكالاهليالسعودي', 'البنكالأهليالسعودي'], kind: 'bank', band: '#1c693c', accent: '#91c44d', classes: ['bank'] },
  { id: 'riyad-bank', names: ['riyadbank', 'بنكالرياض'], kind: 'bank', band: '#382e7f', accent: '#ffffff', classes: ['bank'] },
  { id: 'alinma', names: ['alinma', 'الانماء', 'الإنماء'], kind: 'bank', band: '#002134', accent: '#cd907e', classes: ['bank'] },
  { id: 'sab', names: ['sabb', 'saudiawwalbank', 'البنكالسعوديالاول', 'البنكالسعوديالأول'], kind: 'bank', band: '#e20613', accent: '#ffffff', classes: ['bank'] },
  { id: 'anb', names: ['arabnationalbank', 'البنكالعربيالوطني'], kind: 'bank', band: '#007ec9', accent: '#ffffff', classes: ['bank'] },
  { id: 'stc', names: ['stc'], whole: true, kind: 'shop', band: '#4f008c', accent: '#bf60fe', classes: ['shop'] },
  { id: 'mobily', names: ['mobily', 'موبايلي'], kind: 'shop', band: '#000050', accent: '#4bf5ff', classes: ['shop'] },
  { id: 'nahdi', names: ['nahdi', 'النهدي'], kind: 'shop', band: '#00a79d', accent: '#ffffff', classes: ['pharmacy'] },
  { id: 'aldawaa', names: ['aldawaa', 'الدواء'], kind: 'shop', band: '#002544', accent: '#ffe78d', classes: ['pharmacy'] },
];

/** A name as it is compared: lower case, letters and digits only. */
const plain = (text) => String(text ?? '').toLowerCase().replace(/[ً-ْـ]/g, '').replace(/[^a-z0-9ء-ي]+/g, '');

const NAME_KEYS = ['name', 'name:latin', 'name_en', 'name:en', 'name:nonlatin', 'name:ar'];
const known = new Map(); // what has been asked before: the same places come round with every map tile
const KNOWN_AT_MOST = 20000;

/** The chain a place on the map belongs to, going by its names and what kind of place it is; or null. */
export function brandOf(properties) {
  if (!properties) return null;
  let key = properties.class ?? '';
  for (const name of NAME_KEYS) key += `|${properties[name] ?? ''}`;
  if (known.has(key)) return known.get(key);
  let found = null;
  const names = NAME_KEYS.map((name) => plain(properties[name])).filter(Boolean);
  if (names.length > 0) {
    for (const brand of BRANDS) {
      if (brand.classes && !brand.classes.includes(properties.class)) continue;
      if (names.some((name) => brand.names.some((one) => (brand.whole ? name === one : name.includes(one))))) {
        found = brand;
        break;
      }
    }
  }
  if (known.size >= KNOWN_AT_MOST) known.clear();
  known.set(key, found);
  return found;
}

/** An outline made a little larger or smaller about its middle: by so many metres at each wall, near enough. */
function swollen(ring, by) {
  let x = 0;
  let y = 0;
  let doubled = 0;
  const count = ring.length - 1;
  for (let i = 0; i < count; i += 1) {
    const cross = ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    doubled += cross;
    x += (ring[i][0] + ring[i + 1][0]) * cross;
    y += (ring[i][1] + ring[i + 1][1]) * cross;
  }
  if (Math.abs(doubled) < 1e-6) return ring.slice(0, count);
  x /= 3 * doubled;
  y /= 3 * doubled;
  const scale = 1 + (2 * by) / Math.sqrt(Math.abs(doubled) / 2);
  return ring.slice(0, count).map(([px, py]) => [x + (px - x) * scale, y + (py - y) * scale]);
}

const areaOf = (ring) => {
  let doubled = 0;
  for (let i = 1; i < ring.length; i += 1) doubled += ring[i - 1][0] * ring[i][1] - ring[i][0] * ring[i - 1][1];
  return Math.abs(doubled) / 2;
};

/** Where on an outline is nearest to a point: the place, how far, and the wall it is on (its direction and its length). */
function nearestWall(ring, x, y) {
  let best = null;
  for (let i = 1; i < ring.length; i += 1) {
    const [x0, y0] = ring[i - 1];
    const dx = ring[i][0] - x0;
    const dy = ring[i][1] - y0;
    const wall = Math.hypot(dx, dy);
    if (wall < 0.5) continue;
    const t = Math.min(Math.max(((x - x0) * dx + (y - y0) * dy) / (wall * wall), 0), 1);
    const px = x0 + dx * t;
    const py = y0 + dy * t;
    const distance = Math.hypot(x - px, y - py);
    if (!best || distance < best.distance) best = { x: px, y: py, distance, east: dx / wall, north: dy / wall, wall, along: t * wall };
  }
  return best;
}

// How large a building a single branch of each kind can be taken to have to itself, in square metres,
// and how many other shops the map may show in it before it is taken to be shared.
const OWN_BUILDING = { food: 900, cafe: 500, bank: 700, shop: 500, market: 32000 };
const NEIGHBOURS_ALLOWED = { food: 1, cafe: 1, bank: 1, shop: 1, market: 3 };

/**
 * Dress the branches of chain stores.
 *
 * stores: [{ at: [lng, lat], brand }] (see brandOf).
 * buildings: what buildingFootprints() gives: [{ id, height, polygons }].
 * facing(position): the direction of the street at a place as [east, north], or null.
 * others: where the map shows other shops and restaurants, [lng, lat] each. A
 * building with several of them in it is shared, and is not dressed as one chain's.
 *
 * Returns { features, dressed }: the slabs as map features, and the ids of
 * the buildings that are drawn here in full and so are left out elsewhere.
 */
export function storeExtras(stores, buildings, facing = () => null, others = []) {
  const features = [];
  const dressed = new Set();
  if (stores.length === 0) return { features, dressed };
  const patch = ground(stores[0].at);

  // The outlines near a branch, in metres, filed under the squares of ground their boxes cover.
  // (Of the thousands of buildings on the map only those few are measured.)
  const CELL = 80;
  const outlines = [];
  const grid = new Map();
  const wanted = new Set(); // the squares a branch stands in
  for (const store of stores) {
    const [x, y] = patch.to(store.at);
    wanted.add(`${Math.floor(x / CELL)},${Math.floor(y / CELL)}`);
  }
  for (const building of buildings) {
    if (building.id === undefined || building.id === null || building.base > 0) continue;
    for (const polygon of building.polygons) {
      const corners = polygon[0];
      let west = Infinity;
      let east = -Infinity;
      let south = Infinity;
      let north = -Infinity;
      for (let i = 0; i < corners.length; i += 1) {
        const lng = corners[i][0];
        const lat = corners[i][1];
        if (lng < west) west = lng;
        if (lng > east) east = lng;
        if (lat < south) south = lat;
        if (lat > north) north = lat;
      }
      [west, south] = patch.to([west, south]);
      [east, north] = patch.to([east, north]);
      const cells = [];
      let near = false;
      for (let cellX = Math.floor((west - 15) / CELL); cellX <= Math.floor((east + 15) / CELL); cellX += 1) {
        for (let cellY = Math.floor((south - 15) / CELL); cellY <= Math.floor((north + 15) / CELL); cellY += 1) {
          const key = `${cellX},${cellY}`;
          cells.push(key);
          near ||= wanted.has(key);
        }
      }
      if (!near) continue;
      const ring = corners.map(patch.to);
      // (A metro station is filed too, so that a kiosk inside it is known to be inside something: it keeps its own dress.)
      const index = outlines.push({ id: building.id, height: building.height, ring, box: [west, south, east, north], area: areaOf(ring), pieces: building.polygons.length, station: building.kind === 'station' }) - 1;
      for (const key of cells) {
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(index);
      }
    }
  }

  // Which building each branch is in, or stands at.
  const tenants = new Map(); // outline → [{ store, x, y, wall, within }]
  const alone = [];
  for (const store of stores) {
    const [x, y] = patch.to(store.at);
    let home = null;
    for (const index of grid.get(`${Math.floor(x / CELL)},${Math.floor(y / CELL)}`) ?? []) {
      const outline = outlines[index];
      if (x < outline.box[0] - 15 || x > outline.box[2] + 15 || y < outline.box[1] - 15 || y > outline.box[3] + 15) continue;
      const within = inside(outline.ring, x, y);
      const wall = nearestWall(outline.ring, x, y);
      if (!wall || (!within && wall.distance > 14)) continue;
      const score = within ? -1 : wall.distance;
      if (!home || score < home.score) home = { outline, wall, within, score };
    }
    if (!home) {
      alone.push({ store, x, y });
      continue;
    }
    if (home.outline.station) continue;
    if (!tenants.has(home.outline)) tenants.set(home.outline, []);
    tenants.get(home.outline).push({ store, x, y, wall: home.wall, within: home.within });
  }

  // How many other shops the map shows in each of those buildings.
  const neighbours = new Map();
  if (tenants.size > 0) {
    for (const other of others) {
      const [x, y] = patch.to(other);
      for (const index of grid.get(`${Math.floor(x / CELL)},${Math.floor(y / CELL)}`) ?? []) {
        const outline = outlines[index];
        if (!tenants.has(outline) || x < outline.box[0] || x > outline.box[2] || y < outline.box[1] || y > outline.box[3] || !inside(outline.ring, x, y)) continue;
        neighbours.set(outline, (neighbours.get(outline) ?? 0) + 1);
      }
    }
  }

  const add = (outline, base, top, paint, kind) => features.push(slab(patch, outline, base, top, paint, kind));
  const pylon = (x, y, brand, east = 1, north = 0) => {
    add(rectangle(x, y, east, north, 0.3, 0.3), 0, 5.6, SIGN_POST, 'pylon');
    add(rectangle(x, y, east, north, 1.3, 0.3), 5.6, 8.2, brand.band, 'pylon');
    add(rectangle(x, y, east, north, 1.3, 0.3), 8.2, 8.7, brand.accent ?? '#ffffff', 'pylon');
  };
  /** A canopy on four posts with its pumps under it, in a box given by its middle, direction and half sizes. */
  const canopy = (x, y, east, north, halfLength, halfWidth, brand, outline = null) => {
    const roof = outline ?? rectangle(x, y, east, north, halfLength, halfWidth);
    const closed = [...roof, roof[0]];
    add(swollen(closed, 0.3), 5, 5.9, brand.band, 'canopy');
    add(swollen(closed, 0.3), 5.9, 6.15, brand.accent ?? '#ffffff', 'canopy');
    add(swollen(closed, -0.5), 6.15, 6.25, '#f1f1ee', 'canopy');
    for (const [along, across] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const [px, py] = [x + east * along * (halfLength - 1.6) - north * across * (halfWidth - 1.6), y + north * along * (halfLength - 1.6) + east * across * (halfWidth - 1.6)];
      add(rectangle(px, py, east, north, 0.25, 0.25), 0, 5, '#e6e6e2', 'canopy');
    }
    // The pumps, on their islands.
    const rows = Math.max(Math.min(Math.floor(halfLength / 4.5), 4), 1);
    for (let row = 0; row < rows; row += 1) {
      const along = (row - (rows - 1) / 2) * Math.min((halfLength * 2 - 6) / rows, 8);
      add(rectangle(x + east * along, y + north * along, east, north, 0.45, Math.max(halfWidth - 3.2, 1)), 0, 0.2, '#d0cdc4', 'pump');
      for (const across of [-1, 1]) {
        const reach = Math.max(halfWidth - 4.2, 0.8) * across * 0.6;
        add(rectangle(x + east * along - north * reach, y + north * along + east * reach, east, north, 0.3, 0.45), 0.2, 1.75, brand.band, 'pump');
      }
    }
    pylon(x + east * (halfLength + 4), y + north * (halfLength + 4), brand, -north, east);
  };

  for (const [outline, group] of tenants) {
    const closed = outline.ring;
    const fuel = group.find((tenant) => tenant.store.brand.kind === 'fuel');
    if (fuel) {
      // The outline at a fuel station is its canopy, unless it is far too large or too small to be one.
      if (outline.area >= 60 && outline.area <= 1600 && outline.pieces === 1) {
        const box = boxAround(closed);
        if (box) {
          dressed.add(outline.id);
          canopy(box.x, box.y, box.east, box.north, box.halfLength, box.halfWidth, fuel.store.brand, closed.slice(0, -1));
        }
      }
      continue;
    }
    // Does one branch have the building to itself? A market hall does even with a café inside its door.
    const markets = group.filter((tenant) => tenant.store.brand.kind === 'market');
    const owner = markets.length === 1 ? markets[0] : group.length === 1 ? group[0] : null;
    const brand = owner?.store.brand;
    const shared = owner ? (neighbours.get(outline) ?? 0) + group.length - 1 > (NEIGHBOURS_ALLOWED[brand.kind] ?? 1) : true;
    if (owner && !shared && outline.pieces === 1 && outline.area <= (OWN_BUILDING[brand.kind] ?? 500) && outline.area >= 30 && outline.height <= 22) {
      dressed.add(outline.id);
      const height = Math.max(outline.height, 4.6);
      const open = brand.kind === 'food' || brand.kind === 'cafe' || brand.kind === 'bank';
      // Glass at the ground where people walk in; the wall; the chain's band right round the top; the roof inside it.
      if (open) add(closed.slice(0, -1), 0, 3.1, SHOP_GLASS, 'store');
      add(closed.slice(0, -1), open ? 3.1 : 0, height - 1.5, brand.wall ?? SHOP_WALL, 'store');
      if (brand.accent) add(swollen(closed, 0.15), height - 1.9, height - 1.5, brand.accent, 'store');
      add(swollen(closed, 0.3), height - 1.5, height + 0.4, brand.band, 'store');
      add(swollen(closed, -0.9), height + 0.4, height + 0.5, SHOP_ROOF, 'store');
      if (!owner.within && owner.wall.distance > 3) pylon(owner.x, owner.y, brand, owner.wall.east, owner.wall.north);
      // Anyone else in the building has a front on its wall.
      group.splice(group.indexOf(owner), 1);
    }
    // A shop front: glass at the ground, a canopy over it and the chain's band above that, on the wall the branch is at.
    const fronts = [];
    for (const tenant of group) {
      const { wall, store } = tenant;
      if (wall.distance > 22 || wall.wall < 4) continue; // deep inside a mall: no front on the street
      if (fronts.some((front) => Math.hypot(front[0] - wall.x, front[1] - wall.y) < 11)) continue;
      fronts.push([wall.x, wall.y]);
      // Which side of the wall is outdoors.
      let outEast = -wall.north;
      let outNorth = wall.east;
      if (inside(closed, wall.x + outEast * 0.8, wall.y + outNorth * 0.8)) {
        outEast = -outEast;
        outNorth = -outNorth;
      }
      const half = Math.min(4.8, Math.min(wall.along, wall.wall - wall.along) + 1.2, wall.wall / 2 - 0.3);
      if (half < 1.6) continue;
      const at = (out) => [wall.x + outEast * out, wall.y + outNorth * out];
      add(rectangle(...at(0.12), wall.east, wall.north, half - 0.3, 0.14), 0, 3.1, SHOP_GLASS, 'front');
      add(rectangle(...at(0.6), wall.east, wall.north, half, 0.62), 3.1, 3.35, store.brand.accent ?? store.brand.band, 'front');
      add(rectangle(...at(0.3), wall.east, wall.north, half, 0.32), 3.35, 4.85, store.brand.band, 'front');
    }
  }

  // A branch with no building on the map: a fuel station's canopy, or a coffee kiosk.
  for (const { store, x, y } of alone) {
    const [east, north] = facing(store.at) ?? [1, 0];
    if (store.brand.kind === 'fuel') canopy(x, y, east, north, 10, 5.5, store.brand);
    else if (store.brand.kind === 'cafe' || store.brand.kind === 'food') {
      add(rectangle(x, y, east, north, 3.4, 2.1), 0, 2.7, SHOP_GLASS, 'kiosk');
      add(rectangle(x, y, east, north, 3.7, 2.4), 2.7, 3.7, store.brand.band, 'kiosk');
      if (store.brand.accent) add(rectangle(x, y, east, north, 3.55, 2.25), 2.45, 2.7, store.brand.accent, 'kiosk');
      add(rectangle(x, y, east, north, 3.1, 1.8), 3.7, 3.8, SHOP_ROOF, 'kiosk');
    }
  }
  return { features, dressed };
}
