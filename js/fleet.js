// The vehicles on Riyadh's streets: what kinds there are, how many of each, what colour, and at what hours.
//
// What is known, and from where:
//
//  - What is bought. Saudi Arabia buys small and middle-sized saloons first of all: in 2024 the Toyota
//    Yaris saloon, the Hyundai Accent and the Toyota Camry led the market, with the Hyundai Elantra, the
//    Toyota Corolla, the Nissan Sunny, the Kia Pegas and the Suzuki Dzire among the ten best sellers,
//    and so were two pick-ups, the Toyota Hilux and the Isuzu D-Max. In 2025 the Accent led. Toyota
//    sells nearly three vehicles in ten, Hyundai and Kia together more than two. Of the SUVs the Toyota
//    RAV4 and the Land Cruiser sell best. (Best Selling Cars Blog and Just Auto, for 2024 and 2025.)
//  - Of what shape. The counts differ: of new cars in 2025, 43.7% SUVs and 34.5% saloons by one count;
//    in February 2025, 52% saloons, 30% SUVs, 7% pick-ups and 5% hatchbacks by another; and of used
//    cars 48% saloons. What is on the road is some ten years of sales: saloons first, SUVs next.
//  - Of what colour. White above all: about six cars in ten, with silver and grey two in ten and black
//    one in ten, by a Saudi dealers' guide (Saudi Auto), which gives no count behind it.
//  - Taxis are green: the Transport General Authority's identity for them, "a specified shade of green"
//    for the country's flag, begun at Riyadh's airport and carried on from there; before it they were
//    white. A taxi carries a light on its roof that says so.
//  - The patrol cars of Public Security are black and white (since 2015); those of the traffic police
//    white with green; an ambulance white with red.
//  - Lorries are kept out of Riyadh by day: on working days (Sunday to Thursday) from 6 in the morning
//    until 9 at night, and at the weekend from 5 in the afternoon until 9, by the timetable of Riyadh's
//    traffic police. The lorries that serve the city (water, concrete, refuse) may come, but not in the
//    rush hours, 6 to 9 and 3 to 6. So the heavy lorries are a sight of the night.
//  - Motorbikes with a box behind: the riders of the delivery apps, of whom there are more every year.
//
// What is not known is made up to fit: the exact shares, which no register publishes; the shade of the
// taxis' green; which parts of a patrol car are black and which white. And each kind stands for many
// makes: nothing here is drawn after any one car, and none carries a badge or a name.
//
// Nothing here touches the browser.

/** Glass, tyres and the other things a vehicle is made of besides its own paint: [red, green, blue]. */
export const GLASS = [48, 62, 82];
export const TYRE = [30, 31, 35];
export const MATERIALS = {
  glass: GLASS,
  tyre: TYRE,
  dark: [46, 48, 54], // a chassis, the bed of a pick-up
  sign: [246, 204, 62], // the light on a taxi's roof
  red: [214, 44, 40], // the lamps on the roof of a patrol car or an ambulance
  blue: [48, 92, 214],
  rider: [58, 62, 74],
  helmet: [226, 228, 230],
};

// Vehicles as stacks of boxes. Each box: [from, to, share, bottom, top, material, lean, aside]. from and
// to are how far along the vehicle the box runs (0 its rear, 1 its front), share how much of the width
// it takes, bottom and top its height in metres. material: 'body' (the vehicle's own paint), 'cargo'
// (its second colour: a load, a tank, the white doors of a patrol car) or one of MATERIALS. lean, for a
// cabin or a tank: how far its rear, its front and its sides draw in towards the top (as parts of the
// vehicle's length and of the box's width): that gives a cabin its sloping windscreen, and such a cabin
// is glass all round under a roof in the body's paint. aside: how far off the middle the box stands, as
// a part of half the width (-1 the left edge, 1 the right). lamps, for what a vehicle carries besides
// its headlights and tail lights: [along (0 rear to 1 front), aside, height in metres, colour].
export const SHAPES = {
  // A small or middle-sized saloon: the Accent, the Yaris, the Elantra, the Corolla, the Sunny.
  car: { length: 4.5, width: 1.8, boxes: [[0.04, 0.96, 0.94, 0.02, 0.3, 'tyre'], [0, 1, 1, 0.26, 0.84, 'body'], [0.2, 0.8, 0.92, 0.84, 1.42, 'glass', [0.1, 0.15, 0.16]]] },
  // A large saloon: the Camry, the Sonata, the Taurus.
  sedan: { length: 4.9, width: 1.85, boxes: [[0.04, 0.96, 0.94, 0.02, 0.31, 'tyre'], [0, 1, 1, 0.26, 0.86, 'body'], [0.19, 0.78, 0.92, 0.86, 1.45, 'glass', [0.11, 0.16, 0.16]]] },
  // A small hatchback.
  hatch: { length: 3.8, width: 1.68, boxes: [[0.05, 0.95, 0.94, 0.02, 0.29, 'tyre'], [0, 1, 1, 0.25, 0.86, 'body'], [0.03, 0.74, 0.92, 0.86, 1.5, 'glass', [0.06, 0.17, 0.14]]] },
  // A middle-sized SUV: the RAV4, the Tucson, the many new ones from China.
  crossover: { length: 4.55, width: 1.85, boxes: [[0.04, 0.96, 0.95, 0.02, 0.34, 'tyre'], [0, 1, 1, 0.29, 0.98, 'body'], [0.03, 0.77, 0.92, 0.98, 1.67, 'glass', [0.07, 0.16, 0.12]]] },
  // A large one, high and square: the Land Cruiser, the Patrol, the Tahoe, the Yukon.
  suv: { length: 5.1, width: 2.0, boxes: [[0.04, 0.96, 0.95, 0.02, 0.4, 'tyre'], [0, 1, 1, 0.34, 1.1, 'body'], [0.02, 0.77, 0.93, 1.1, 1.92, 'glass', [0.03, 0.12, 0.08]]] },
  // A pick-up with a double cab and an open bed behind it: the Hilux, the D-Max.
  pickup: { length: 5.3, width: 1.85, boxes: [[0.04, 0.96, 0.95, 0.02, 0.38, 'tyre'], [0, 1, 1, 0.34, 1.02, 'body'], [0.4, 0.8, 0.93, 1.02, 1.8, 'glass', [0.03, 0.13, 0.1]], [0.03, 0.385, 0.84, 1.0, 1.035, 'dark']] },
  // A van or a minibus: the HiAce.
  van: { length: 5.3, width: 2.0, boxes: [[0, 1, 1, 0.3, 1.15, 'body'], [0.02, 0.9, 0.94, 1.15, 1.95, 'body'], [0.72, 0.93, 0.95, 1.2, 1.8, 'glass']] },
  // A light lorry with a box body behind its cab: what Riyadh calls a Dyna.
  light: { length: 6.4, width: 2.1, boxes: [[0.02, 0.98, 0.86, 0.12, 0.8, 'dark'], [0, 0.7, 1, 0.8, 2.75, 'cargo'], [0.74, 1, 0.92, 0.45, 2.15, 'body'], [0.88, 1, 0.93, 1.3, 1.9, 'glass']] },
  // A tanker: the lorry that brings a house its water.
  tanker: { length: 8.2, width: 2.5, boxes: [[0.02, 0.98, 0.84, 0.15, 1.0, 'dark'], [0.03, 0.72, 0.88, 1.0, 2.8, 'cargo', [0.04, 0.04, 0.5]], [0.2, 0.55, 0.14, 2.8, 2.9, 'dark'], [0.76, 1, 0.94, 0.5, 2.7, 'body'], [0.9, 1, 0.95, 1.55, 2.35, 'glass']] },
  // A heavy lorry.
  truck: { length: 9, width: 2.5, boxes: [[0, 0.74, 1, 0.9, 3.4, 'cargo'], [0.78, 1, 0.96, 0.5, 2.6, 'body'], [0.9, 1.0, 0.97, 1.5, 2.3, 'glass']] },
  bus: { length: 12, width: 2.55, boxes: [[0, 1, 1, 0.35, 1.3, 'body'], [0.01, 0.99, 0.97, 1.3, 2.5, 'glass'], [0, 1, 1, 2.5, 3.1, 'body']] },
  coach: { length: 20, width: 2.9, boxes: [[0, 1, 1, 0.5, 1.6, 'body'], [0.02, 0.98, 0.97, 1.6, 2.9, 'glass'], [0, 1, 1, 2.9, 3.6, 'body'], [0.08, 0.92, 0.42, 3.6, 3.9, 'cargo']] },
  // A taxi: a large saloon in the taxis' green, with its light on the roof.
  taxi: {
    length: 4.9,
    width: 1.85,
    boxes: [[0.04, 0.96, 0.94, 0.02, 0.31, 'tyre'], [0, 1, 1, 0.26, 0.86, 'body'], [0.19, 0.78, 0.92, 0.86, 1.45, 'glass', [0.11, 0.16, 0.16]], [0.43, 0.53, 0.32, 1.45, 1.6, 'sign']],
    lamps: [[0.48, 0, 1.62, MATERIALS.sign]],
  },
  // A patrol car: its doors in its second colour, and a bar of lamps across its roof, red and blue.
  police: {
    length: 4.9,
    width: 1.86,
    boxes: [
      [0.04, 0.96, 0.94, 0.02, 0.31, 'tyre'],
      [0, 1, 1, 0.26, 0.86, 'body'],
      [0.3, 0.68, 1.03, 0.31, 0.845, 'cargo'],
      [0.19, 0.78, 0.92, 0.86, 1.45, 'glass', [0.11, 0.16, 0.16]],
      [0.44, 0.5, 0.26, 1.45, 1.57, 'red', null, -0.5],
      [0.44, 0.5, 0.26, 1.45, 1.57, 'blue', null, 0.5],
    ],
    lamps: [[0.47, -0.5, 1.6, MATERIALS.red], [0.47, 0.5, 1.6, MATERIALS.blue]],
  },
  // An ambulance: a white van with a band of its second colour along it, and a lamp on its roof.
  ambulance: {
    length: 5.6,
    width: 2.05,
    boxes: [[0, 1, 1, 0.3, 1.2, 'body'], [0.02, 0.9, 0.95, 1.2, 2.3, 'body'], [0.05, 0.88, 0.975, 1.32, 1.52, 'cargo'], [0.72, 0.93, 0.96, 1.6, 2.1, 'glass'], [0.62, 0.68, 0.5, 2.3, 2.42, 'red']],
    lamps: [[0.64, 0, 2.45, MATERIALS.red]],
  },
  // A motorbike with its rider, and a box behind him: an order on its way.
  bike: { length: 1.95, width: 0.78, boxes: [[0.02, 0.98, 0.2, 0.02, 0.6, 'tyre'], [0.22, 0.78, 0.44, 0.42, 0.86, 'body'], [0.36, 0.62, 0.62, 0.86, 1.5, 'rider'], [0.44, 0.58, 0.36, 1.5, 1.76, 'helmet'], [0, 0.26, 0.74, 0.86, 1.4, 'cargo']] },
};

// Paint, as [red, green, blue].
const WHITE = [240, 240, 236];
const PEARL = [236, 233, 222];
const SILVER = [200, 203, 207];
const GREY = [128, 132, 138];
const DARK_GREY = [86, 90, 96];
const BLACK = [34, 36, 40];
const BEIGE = [198, 184, 156];
const GOLD = [186, 160, 112];
const DARK_BLUE = [36, 58, 110];
const MAROON = [112, 30, 38];
const RED = [176, 36, 40];
const BROWN = [104, 78, 60];
const LIGHT_BLUE = [128, 168, 204];
const YELLOW = [232, 190, 48];
const ORANGE = [222, 122, 40];
const GREEN = [44, 122, 74];
const ALUMINIUM = [196, 200, 204];
/**
 * The taxis' green. (That they are green, "a specified shade" chosen to recall the green of the country's
 * flag, is the Transport General Authority's rule; the shade itself is not told anywhere that could be
 * read, and this is a guess at it: lighter than the flag's.)
 */
export const TAXI_GREEN = [52, 148, 94];
const PATROL_BLACK = [26, 28, 32];
const TRAFFIC_GREEN = [0, 122, 74];
const AMBULANCE_RED = [206, 40, 40];

// How many of each colour, out of a hundred: for cars (six in ten white, two silver or grey, one black),
// for the big 4x4s (more of them black, pearl and gold), for pick-ups and vans (working vehicles: white).
const PAINTS = {
  car: [[58, WHITE], [4, PEARL], [11, SILVER], [6, GREY], [3, DARK_GREY], [9, BLACK], [3, BEIGE], [2, DARK_BLUE], [1.5, MAROON], [1, RED], [1, BROWN], [0.5, LIGHT_BLUE]],
  suv: [[44, WHITE], [10, PEARL], [20, BLACK], [7, SILVER], [6, GREY], [3, DARK_GREY], [4, BEIGE], [3, GOLD], [1.5, MAROON], [1.5, DARK_BLUE]],
  pickup: [[76, WHITE], [8, SILVER], [3, GREY], [4, BEIGE], [2, GOLD], [3, RED], [2, DARK_BLUE], [2, BLACK]],
  van: [[84, WHITE], [8, SILVER], [4, GREY], [2, BEIGE], [2, BLACK]],
  cab: [[86, WHITE], [5, DARK_BLUE], [3, YELLOW], [3, RED], [3, GREY]],
  heavy: [[40, WHITE], [16, RED], [12, DARK_BLUE], [10, YELLOW], [8, ORANGE], [6, GREEN], [8, GREY]],
  load: [[40, [232, 232, 228]], [18, [208, 210, 212]], [12, ALUMINIUM], [14, [52, 96, 160]], [5, GREEN], [5, YELLOW], [6, [170, 92, 54]]],
  tank: [[45, [234, 234, 230]], [30, ALUMINIUM], [15, [150, 186, 214]], [10, [164, 196, 168]]],
  bike: [[40, BLACK], [20, RED], [15, WHITE], [10, DARK_BLUE], [15, YELLOW]],
  box: [[30, YELLOW], [25, RED], [12, ORANGE], [12, GREEN], [11, BLACK], [10, WHITE]],
  taxi: [[1, TAXI_GREEN]],
  white: [[1, WHITE]],
};

/**
 * The kinds of vehicle: for each, the colours of its body ("paint") and of its second colour ("cargo":
 * a load, a tank; the same as its body where nothing is said), and how fast it drives, as parts of what
 * the road allows: [the slowest, the fastest].
 */
export const KINDS = {
  car: { paint: 'car', pace: [0.85, 1.2] },
  sedan: { paint: 'car', pace: [0.9, 1.2] },
  hatch: { paint: 'car', pace: [0.85, 1.15] },
  crossover: { paint: 'car', pace: [0.85, 1.2] },
  suv: { paint: 'suv', pace: [0.9, 1.25] },
  pickup: { paint: 'pickup', pace: [0.85, 1.15] },
  van: { paint: 'van', pace: [0.85, 1.1] },
  taxi: { paint: 'taxi', pace: [0.85, 1.15] },
  light: { paint: 'cab', cargo: 'load', pace: [0.8, 0.95] },
  tanker: { paint: 'cab', cargo: 'tank', pace: [0.72, 0.85] },
  truck: { paint: 'heavy', cargo: 'load', pace: [0.8, 0.8] },
  bike: { paint: 'bike', cargo: 'box', pace: [0.9, 1.2] },
  ambulance: { paint: 'white', pace: [0.95, 1.2] },
  police: { pace: [0.8, 1.05] },
};

// How many of each kind in a hundred vehicles on the move, where nothing else is said of the hour or
// the road. (Saloons 43 with the taxis among them, SUVs 29, pick-ups 8, vans 4.5, hatchbacks 4.)
const MOVING = { car: 27, sedan: 16, hatch: 4, crossover: 17, suv: 12, pickup: 8, van: 4.5, taxi: 4, light: 3.2, bike: 3, tanker: 1.4, police: 0.5, ambulance: 0.15, truck: 9 };
// And of those standing at a kerb or in a car park: no lorries, and few of what works all day.
const PARKED = { car: 30, sedan: 17, hatch: 5, crossover: 18, suv: 14, pickup: 10, van: 5, taxi: 1 };

const WORKING_DAYS = new Set([0, 1, 2, 3, 4]); // Sunday to Thursday

/**
 * Whether heavy lorries may be on Riyadh's roads at an hour (0 to 24) of a day (0 Sunday to 6
 * Saturday): not from 6 in the morning until 9 at night on working days, nor from 5 in the afternoon
 * until 9 at the weekend.
 */
export function lorriesAllowed(hour, day) {
  return WORKING_DAYS.has(day) ? hour < 6 || hour >= 21 : hour < 17 || hour >= 21;
}

/** Whether the lorries that serve the city (water tankers among them) may be: not in the rush hours of a working day, 6 to 9 and 3 to 6. */
export function serviceLorriesAllowed(hour, day) {
  return !WORKING_DAYS.has(day) || !((hour >= 6 && hour < 9) || (hour >= 15 && hour < 18));
}

/** Whether a kind of vehicle may be on the road at an hour of a day. */
export function allowedNow(type, hour, day) {
  if (type === 'truck') return lorriesAllowed(hour, day);
  if (type === 'tanker') return serviceLorriesAllowed(hour, day);
  return true;
}

/** One of a list of [weight, thing], by a number from 0 to 1. */
function weighted(list, roll) {
  let total = 0;
  for (const [weight] of list) total += weight;
  let upTo = 0;
  for (const [weight, thing] of list) {
    upTo += weight;
    if (roll * total < upTo) return thing;
  }
  return list[list.length - 1][1];
}

/**
 * How many of each kind there are among the vehicles on the move, on a road with so many lanes each
 * way, at an hour of a day: { kind: share }, not adding up to anything in particular. Heavy lorries
 * only when they are allowed, and on the wide roads; tankers not in the rush hours; more motorbikes
 * with orders at lunch and from supper into the night, and hardly any before breakfast; more taxis among
 * what little moves in the small hours.
 */
export function movingShares({ lanes = 1, hour = 12, day = 1 } = {}) {
  const shares = { ...MOVING };
  const wide = lanes >= 2;
  shares.truck = lorriesAllowed(hour, day) ? (wide ? MOVING.truck : 1) : 0;
  shares.tanker = serviceLorriesAllowed(hour, day) ? MOVING.tanker : 0;
  shares.light = MOVING.light * (wide ? 1.3 : 0.6);
  shares.bike = MOVING.bike * ((hour >= 12 && hour < 15) || hour >= 19 || hour < 1 ? 1.8 : hour >= 2 && hour < 8 ? 0.3 : 1);
  if (hour < 5) shares.taxi = MOVING.taxi * 1.5;
  return shares;
}

/** The paint of a vehicle of a kind, and its second colour, by two numbers from 0 to 1. */
export function paintsOf(type, roll, second = roll) {
  if (type === 'police') {
    // Two in three are the patrols of Public Security, black with white doors; the rest the traffic police, white with green.
    return roll < 0.66 ? { paint: PATROL_BLACK, cargo: WHITE } : { paint: WHITE, cargo: TRAFFIC_GREEN };
  }
  if (type === 'ambulance') return { paint: WHITE, cargo: AMBULANCE_RED };
  const kind = KINDS[type] ?? KINDS.car;
  const paint = weighted(PAINTS[kind.paint], roll);
  return { paint, cargo: kind.cargo ? weighted(PAINTS[kind.cargo], second) : paint };
}

/**
 * A vehicle to set on the road: { type, paint, cargo, pace }. random: a function giving numbers from 0
 * to 1 (it is asked four times, whatever comes of it). lanes, hour, day: see movingShares(). pace: how
 * fast it means to drive, as a part of what the road allows.
 */
export function chooseVehicle(random, where = {}) {
  const shares = movingShares(where);
  const type = weighted(Object.entries(shares).map(([kind, share]) => [share, kind]), random());
  const { paint, cargo } = paintsOf(type, random(), random());
  const [slow, fast] = KINDS[type].pace;
  return { type, paint, cargo, pace: slow + (fast - slow) * random() };
}

/**
 * A vehicle standing parked: { type, paint, cargo }, by two numbers from 0 to 1 (which kind, and which
 * colour). room: how long a place it has, in metres: nothing longer is parked in it.
 */
export function chooseParked(kind, colour, room = 6) {
  const fits = Object.entries(PARKED).filter(([type]) => SHAPES[type].length <= room).map(([type, share]) => [share, type]);
  const type = weighted(fits, kind);
  return { type, ...paintsOf(type, colour) };
}
