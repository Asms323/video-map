// Riyadh's districts, and what each is like.
//
// The city is a grid of great roads two kilometres apart, and each square of
// it is a district with a name. They were built at different times and for
// different people, and it shows: the old centre round the Masmak is dense
// and worn, Al Malaz is the leafy garden suburb of the 1950s, Al Olaya is
// glass and offices, the north is new white villas behind their walls, the
// east is the beige stone of the 1980s and 90s, the south plainer and
// cheaper, and there are whole districts of sheds and workshops. Where each
// district lies comes from the open map (see districts-data.js); what kind
// of place it is, was looked up district by district; and what each kind
// looks like is set down here, to be drawn by.
//
// Nothing here touches the browser. Places are [lng, lat].

import { DISTRICT_AREAS, DISTRICT_SPOTS } from './districts-data.js';

/**
 * What each kind of district looks like.
 *
 * walls: the colours its buildings are painted or clad in, where a
 *   building's own colour is not known.
 * led: whether its side streets have the new white lamps; if not, they are
 *   still lit by the amber of sodium lamps, which is what gives the older
 *   parts of the city their colour from the air by night.
 * fenced: the share of its houses that stand behind a wall of their own, as
 *   a villa in Riyadh does: a wall taller than a man right round the plot.
 * fence: the colour of those walls.
 */
export const CHARACTERS = {
  // The old centre and the quarters that grew round it: concrete of the 1950s to 70s, worn and close-built.
  old: { walls: ['#e4dccb', '#d9d2c2', '#cfc8b8', '#e8e1d3', '#d6cfc4', '#c9c2b4', '#ded3bd'], led: false, fenced: 0.1, fence: '#d8d0c0' },
  // What is left of, or built in the manner of, the mud-brick towns: Ad Diriyah, the square by the Masmak.
  heritage: { walls: ['#c9a678', '#bf9a6a', '#d1b083', '#b88f5e', '#caa878'], led: false, fenced: 0.35, fence: '#c4a070' },
  // Al Malaz and the ministries: the planned city of the 1950s and 60s, villas in gardens, grown leafy.
  midcentury: { walls: ['#efeae0', '#e9e2d2', '#f2efe8', '#e3dccb', '#ead9c4', '#e6e3da'], led: false, fenced: 0.7, fence: '#e6dfd0' },
  // Al Olaya and As Sulaymaniyah: offices, hotels and shops along the great roads.
  centre: { walls: ['#dfe2e4', '#d4d9dd', '#e8e6e0', '#cfd6dc', '#e1dcd2', '#c8d0d6'], led: true, fenced: 0.25, fence: '#e4e0d6' },
  // The financial district: towers of glass.
  business: { walls: ['#cfd8de', '#c2cdd6', '#d9dfe3'], led: true, fenced: 0, fence: '#dddddd' },
  // The Diplomatic Quarter: embassies in gardens, built in the colour of the escarpment it stands on.
  diplomatic: { walls: ['#e2cfa9', '#dcc79f', '#e8d7b5', '#d6c096', '#e4d2b0'], led: true, fenced: 0.6, fence: '#dcc9a2' },
  // The universities: long buildings all of one sand colour.
  campus: { walls: ['#e3d6bd', '#dccfb4', '#e8dcc6'], led: true, fenced: 0, fence: '#e0d4bc' },
  // The established districts north of the centre: large villas in pale stone, palms grown tall.
  villa: { walls: ['#efe9dc', '#e6dcc8', '#f1ede4', '#e0d4bc', '#eae3d3', '#dccfb6'], led: true, fenced: 0.9, fence: '#e9e2d2' },
  // The new north: white and grey villas with dark trim, on wide streets with new lamps.
  north: { walls: ['#f2f1ed', '#e9e7e2', '#dcdad5', '#f4f2ec', '#cfcdc8', '#e3ded4', '#bdb9b2'], led: true, fenced: 0.9, fence: '#eeece6' },
  // The east: the villas of the 1980s and 90s, clad in the beige limestone called Riyadh stone.
  east: { walls: ['#e6d8ba', '#e0d0ae', '#ead9bd', '#dccba6', '#e9ddc5', '#d9c9a8'], led: false, fenced: 0.9, fence: '#e2d4b6' },
  // The south and west: plainer houses and small blocks of flats, plastered and painted cream.
  south: { walls: ['#ebdfc0', '#e6d9b8', '#efe5cc', '#e2d4b0', '#ead8b4', '#ddd0b2'], led: false, fenced: 0.8, fence: '#e6dabc' },
  // Workshops, warehouses and factories: sheds of sheet metal and block.
  industrial: { walls: ['#d5d8da', '#c9ced2', '#dfe0dc', '#bfc7cd', '#d8d2c4'], led: false, fenced: 0.3, fence: '#cfcfca' },
  // Along Wadi Hanifa: farms and palm groves behind long walls.
  wadi: { walls: ['#e6dcc6', '#e0d4ba', '#ece3d0'], led: false, fenced: 0.6, fence: '#ddd0b4' },
  // A park in the making, and the open ground at the city's edges.
  park: { walls: ['#e9e4d8', '#e2dccd'], led: true, fenced: 0, fence: '#e0dacb' },
  open: { walls: ['#ece6d8', '#e4dccb', '#efeae0'], led: false, fenced: 0.5, fence: '#e2dac8' },
};

// The middle of the old town, by the Masmak: ground that no district claims is judged by how it lies from here.
const OLD_TOWN = [46.713, 24.631];
const METERS_PER_DEGREE = 111320;

let made = null;

/** The table, as it is needed for looking places up: every ring with the box round it, the smallest areas first. */
function table() {
  if (made) return made;
  const areas = DISTRICT_AREAS.map(([name, ar, kind, wide, rings]) => {
    const all = rings.map((flat) => {
      const ring = [];
      for (let i = 0; i < flat.length; i += 2) ring.push([46 + flat[i] / 1e4, 24 + flat[i + 1] / 1e4]);
      return ring;
    });
    const lngs = all.flat().map((corner) => corner[0]);
    const lats = all.flat().map((corner) => corner[1]);
    const box = [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)];
    return { name, ar, kind, wide: wide === 1, rings: all, box, size: (box[2] - box[0]) * (box[3] - box[1]) };
  });
  // (A wide area that holds other districts is asked only when none of them has the place.)
  areas.sort((a, b) => Number(a.wide) - Number(b.wide) || a.size - b.size);
  const spots = DISTRICT_SPOTS.map(([name, ar, kind, east, north]) => ({ name, ar, kind, at: [46 + east / 1e4, 24 + north / 1e4] }));
  made = { areas, spots };
  return made;
}

function inRing(ring, lng, lat) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[j];
    if (y0 > lat !== y1 > lat && lng < x0 + ((lat - y0) * (x1 - x0)) / (y1 - y0)) inside = !inside;
  }
  return inside;
}

/**
 * What kind of place a spot of ground is when no district's name settles
 * it: the old town within a few kilometres of the Masmak; beyond that the
 * new north, the east, the south, or the open ground to the west.
 */
export function kindByPlace(lng, lat) {
  const squeeze = Math.cos((lat * Math.PI) / 180) * METERS_PER_DEGREE;
  if (Math.hypot((lng - OLD_TOWN[0]) * squeeze, (lat - OLD_TOWN[1]) * METERS_PER_DEGREE) < 3200) return 'old';
  if (lat > 24.76) return 'north';
  if (lng > 46.76) return 'east';
  if (lat < 24.62) return 'south';
  if (lng < 46.6) return 'open';
  return 'villa';
}

/**
 * The district a place lies in: { name, ar, kind }. The smallest area that
 * holds it; failing that the district whose place on the map is nearest,
 * within a kilometre and a half; failing that a wide area that holds it;
 * and where there is none of these, { name: null, ar: null, kind } by where
 * it lies. A district whose kind no name settles is judged the same way.
 */
export function districtAt(lng, lat) {
  const { areas, spots } = table();
  const found = (one) => ({ name: one.name, ar: one.ar, kind: one.kind ?? kindByPlace(lng, lat) });
  let wide = null;
  for (const area of areas) {
    if (lng < area.box[0] || lng > area.box[2] || lat < area.box[1] || lat > area.box[3]) continue;
    if (!area.rings.some((ring) => inRing(ring, lng, lat))) continue;
    if (!area.wide) return found(area);
    wide = wide ?? area;
  }
  const squeeze = Math.cos((lat * Math.PI) / 180) * METERS_PER_DEGREE;
  let nearest = null;
  let least = 1500;
  for (const spot of spots) {
    const far = Math.hypot((spot.at[0] - lng) * squeeze, (spot.at[1] - lat) * METERS_PER_DEGREE);
    if (far < least) {
      least = far;
      nearest = spot;
    }
  }
  if (nearest) return found(nearest);
  if (wide) return found(wide);
  return { name: null, ar: null, kind: kindByPlace(lng, lat) };
}

/** What the district at a place looks like: one of CHARACTERS. */
export function characterAt(lng, lat) {
  return CHARACTERS[districtAt(lng, lat).kind] ?? CHARACTERS.villa;
}

/** How many districts the table holds: { areas, spots }. */
export function districtCount() {
  const { areas, spots } = table();
  return { areas: areas.length, spots: spots.length };
}
