// Boulevard World, in Hittin: the lagoon, the Sphere and the pyramids.
//
// Boulevard World is the fairground of the Riyadh Season, opened in November
// 2022 beside Boulevard City: quarters built after a score of countries round
// a lagoon that Guinness has down as the largest man-made one in the world
// (12.19 hectares). The street map has almost nothing of it: a name, a few
// outlines, no water. What is built here was taken from the satellite photo
// the app itself shows (Esri World Imagery) and from what is published of the
// place:
//   - the lagoon's shore was traced from the photo, its main basin and the arm
//     to its south-east (8.5 hectares of open water; the rest of the 12.19 is
//     canals and inlets too narrow to trace);
//   - the Sphere stands on the lagoon's north shore: 35 m tall and covered in
//     screens (so its makers say). Its place and the round terraces it stands
//     on are from the photo;
//   - east of it, in the Egyptian quarter, stand two pyramids: where they
//     stand and how wide is from the photo; how tall is a guess from the
//     shadows they throw.
// NOT SHOWN IN THE APP YET. Nothing here is on the list of landmarks (see
// landmarks.js): the shapes below were drawn from the photo from above alone,
// and are laid by until clear photographs of the place as it stands this
// season have been looked at. Only the lagoon's shore is used so far, to keep
// the app from standing trees on the water (the photo shows it dark green,
// as it shows a tree). The quarters themselves, the cable car to Boulevard
// City and the rest are not built at all.
//
// Nothing here touches the browser. Places are [lng, lat].

const METERS_PER_DEGREE = 111320;
const TAU = Math.PI * 2;

/** The point everything here is measured from: metres east and north of it. */
export const BOULEVARD_WORLD = [46.60113, 24.77662];

// The lagoon's shore: corners in tenths of a metre east and north of that point, east first. Traced
// from the satellite photo at about half a metre a spot, and thinned to within two metres of the trace.
const LAGOON = [
  [
    -1720, 1284, -1769, 1213, -1775, 1132, -1812, 1110, -1785, 1104, -1769, 1051, -1688, 1029, -1693, 974, -1748, 947, -1715, 909, -1656, 909, -1644, 855,
    -1558, 844, -1541, 774, -1638, 687, -1704, 687, -1741, 849, -1920, 855, -1932, 909, -1980, 921, -2023, 1002, -2023, 936, -2105, 936, -2122, 834,
    -2073, 817, -2089, 730, -2040, 692, -2002, 557, -2094, 535, -2110, 633, -2176, 660, -2186, 719, -2225, 719, -2241, 768, -2289, 715, -2305, 606,
    -2344, 594, -2349, 509, -2305, 503, -2300, 475, -2186, 509, -2181, 465, -2002, 470, -1991, 345, -1959, 389, -1834, 400, -1753, 367, -1650, 237,
    -1612, 226, -1585, 124, -1612, 80, -1698, 42, -1709, 4, -1823, -50, -1828, -94, -1867, -105, -1904, -169, -2159, -159, -2213, -18, -2289, 31,
    -2387, 26, -2397, 101, -2479, 124, -2355, -56, -2289, -413, -2186, -409, -2122, -360, -2105, -278, -2057, -273, -1975, -381, -1964, -456, -2046, -473,
    -2073, -430, -2073, -468, -2143, -473, -2186, -543, -2110, -571, -2105, -539, -2051, -533, -2046, -566, -1920, -571, -1856, -490, -1801, -490, -1677, -581,
    -1661, -652, -1736, -766, -1693, -989, -1569, -1000, -1563, -945, -1433, -934, -1411, -896, -1243, -885, -1161, -815, -1167, -734, -1092, -734, -1016, -836,
    -1032, -907, -1167, -923, -1221, -983, -1211, -1085, -1243, -1102, -1200, -1108, -1195, -1189, -1216, -1232, -1281, -1232, -1281, -1276, -1324, -1281, -1281, -1314,
    -1281, -1498, -1340, -1503, -1308, -1525, -1308, -1590, -1362, -1606, -1340, -1639, -1287, -1629, -1270, -1580, -1184, -1580, -1140, -1623, -1108, -1580, -1053, -1580,
    -945, -1623, -907, -1557, -853, -1557, -837, -1612, -734, -1617, -631, -1308, -668, -1292, -668, -1232, -533, -1189, -528, -1216, -489, -1183, -397, -1194,
    -370, -1482, -430, -1580, -397, -1780, -495, -1899, -533, -2051, -511, -2089, -376, -2105, -349, -1954, -278, -1964, -289, -1916, -338, -1910, -354, -1818,
    -310, -1807, -283, -1737, -299, -1661, -262, -1650, -257, -1585, -299, -1574, -299, -1493, -246, -1487, -218, -1351, -143, -1346, -115, -1389, -18, -1389,
    -28, -1276, 75, -1276, 53, -1406, 85, -1417, 85, -1455, 264, -1438, 383, -1536, 438, -1769, 492, -1845, 513, -2035, 605, -2056, 655, -2160,
    725, -2160, 736, -2192, 839, -2132, 790, -2035, 649, -2003, 655, -1872, 709, -1856, 687, -1829, 687, -1585, 742, -1580, 758, -1525, 834, -1465,
    980, -1433, 985, -1389, 1034, -1378, 1040, -1308, 1169, -1287, 1186, -1157, 1142, -1140, 1089, -983, 887, -972, 866, -885, 790, -885, 720, -815,
    595, -793, 584, -820, 492, -826, 433, -783, 410, -668, 465, -636, 400, -543, 400, -462, 454, -424, 449, -354, 481, -322, 443, -311,
    438, -267, 389, -262, 378, -154, 438, -99, 470, 20, 622, 58, 828, 188, 991, 188, 997, 134, 1110, 96, 1132, 31, 1295, 26,
    1295, 69, 1348, 107, 1371, 243, 1403, 258, 1446, 416, 1338, 460, 1284, 584, 1251, 590, 1251, 671, 1208, 692, 1164, 844, 1169, 942,
    1142, 947, 1137, 1078, 1181, 1083, 1142, 1104, 1142, 1202, 1089, 1213, 1077, 1251, 991, 1257, 947, 1202, 887, 1202, 882, 1223, 665, 1197,
    622, 1295, 639, 1478, 416, 1457, 199, 1506, 172, 1550, 91, 1582, 64, 1658, 15, 1663, 4, 1728, -28, 1707, -299, 1718, -386, 1766,
    -397, 1804, -446, 1804, -462, 1848, -446, 1555, -478, 1512, -560, 1501, -571, 1457, -652, 1484, -576, 1110, -625, 1066, -695, 1066, -674, 958,
    -576, 861, -571, 649, -652, 535, -690, 530, -695, 481, -793, 481, -798, 449, -853, 449, -869, 551, -950, 600, -1010, 730, -1016, 849,
    -961, 904, -1021, 1017, -1042, 1017, -1042, 947, -1167, 849, -1379, 861, -1466, 942, -1466, 1002, -1563, 1029, -1574, 1142, -1661, 1180, -1688, 1267,
  ],
  [
    1625, -322, 1582, -365, 1603, -424, 1511, -511, 1419, -734, 1295, -745, 1192, -663, 1192, -745, 1229, -755, 1229, -874, 1181, -885, 1186, -956,
    1219, -977, 1256, -1102, 1343, -1140, 1348, -1097, 1441, -1102, 1446, -1059, 1543, -1070, 1614, -1129, 1603, -1064, 1630, -1015, 1772, -1032, 1864, -1091,
    1875, -1168, 1772, -1178, 1722, -1243, 1761, -1265, 1761, -1314, 1804, -1314, 1809, -1346, 1864, -1363, 1875, -1438, 2021, -1493, 2021, -1552, 1988, -1557,
    2004, -1710, 1945, -1763, 1907, -1943, 1875, -1964, 1869, -2148, 1815, -2160, 1782, -2246, 1820, -2246, 1825, -2290, 1859, -2235, 1956, -2252, 1972, -2387,
    2270, -2501, 2346, -2496, 2389, -2545, 2492, -2534, 2531, -2382, 2563, -2377, 2563, -2317, 2596, -2284, 2596, -2171, 2509, -2175, 2504, -2137, 2352, -2116,
    2314, -2067, 2173, -2046, 2151, -1959, 2124, -1948, 2135, -1769, 2200, -1753, 2200, -1714, 2151, -1710, 2151, -1666, 2200, -1661, 2217, -1704, 2260, -1590,
    2205, -1482, 2205, -1406, 2292, -1314, 2260, -1253, 2194, -1232, 2205, -1102, 2260, -1085, 2254, -1026, 2302, -1015, 2330, -917, 2428, -902, 2352, -879,
    2352, -798, 2320, -793, 2297, -734, 2167, -706, 2157, -625, 2205, -533, 2130, -566, 2097, -673, 1961, -673, 1928, -614, 1923, -500, 1842, -528,
    1739, -316,
  ],
];

const WATER = '#5aa3b4'; // the lagoon by day: the blue-green of a shallow lined pool
const WATER_BY_NIGHT = '#1d4a5c'; // and by night, with the lights of its shores in it
const SPHERE = [37.3, 199.9]; // where the Sphere stands, east and north
const SPHERE_RADIUS = 17.5; // 35 m tall
const SPHERE_STANDS_METERS = 3.6; // on the top of its terraces
const SPHERE_BY_DAY = ['#2f4f78', '#35598a', '#2b4870']; // its screens by day: lit, but pale in the sun
const SPHERE_BY_NIGHT = ['#4fd8ff', '#7a6bff', '#ff5fc0', '#ffb347', '#59f0c0']; // and by night: bands of colour
const TERRACE = '#cdc3ae';
const PYRAMIDS = [
  { at: [179.3, 163.1], half: 30, tall: 30 },
  { at: [192.9, 111.5], half: 21, tall: 21 },
];
const PYRAMID_TURN = (-18 * Math.PI) / 180; // the pyramids stand square to the fairground, which lies 18 degrees off north
const PYRAMID_STONE = ['#d9c08a', '#d2b880', '#dcc592'];
const PYRAMID_BY_NIGHT = '#b08f52'; // floodlit from the ground, warm
const FOUNTAIN = [[-106.4, 0.4], [30.2, 72]]; // the line of jets across the lagoon, from its west end to its east

const ringOf = (flat) => {
  const ring = [];
  for (let i = 0; i < flat.length; i += 2) ring.push([flat[i] / 10, flat[i + 1] / 10]);
  return ring;
};
const circle = (radius, sides, [east, north] = [0, 0]) => Array.from({ length: sides }, (_, i) => [east + Math.cos((i / sides) * TAU) * radius, north + Math.sin((i / sides) * TAU) * radius]);

/** The lagoon's two pieces of open water, each a ring of [east, north] in metres from BOULEVARD_WORLD. */
export function lagoonRings() {
  return LAGOON.map(ringOf);
}

/** Whether a place lies on the lagoon's water. */
export function onLagoon(lng, lat) {
  const squeeze = Math.cos((BOULEVARD_WORLD[1] * Math.PI) / 180) * METERS_PER_DEGREE;
  const x = (lng - BOULEVARD_WORLD[0]) * squeeze;
  const y = (lat - BOULEVARD_WORLD[1]) * METERS_PER_DEGREE;
  if (x < -260 || x > 330 || y < -330 || y > 230) return false;
  for (const ring of lagoonRings()) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const [x0, y0] = ring[i];
      const [x1, y1] = ring[j];
      if (y0 > y !== y1 > y && x < x0 + ((y - y0) * (x1 - x0)) / (y1 - y0)) inside = !inside;
    }
    if (inside) return true;
  }
  return false;
}

/** The lagoon as slabs for the map (see landmarks.js): its water, a hand's breadth deep on the ground. */
export function lagoonSlabs() {
  return lagoonRings().map((outline) => ({ outline, base: 0, top: 0.25, paint: WATER, night: WATER_BY_NIGHT, north: true }));
}

/**
 * The Sphere, measured from its own middle: three round terraces, and on them
 * a ball 35 m across, built of rings a couple of metres tall. By day its screens show a deep blue; by
 * night band after band of colour.
 */
export function sphereSlabs() {
  const slabs = [];
  [[34, 0, 1.2], [28, 1.2, 2.4], [22, 2.4, SPHERE_STANDS_METERS]].forEach(([radius, base, top]) => {
    slabs.push({ outline: circle(radius, 40), base, top, paint: TERRACE, north: true });
  });
  const rings = 16;
  for (let i = 0; i < rings; i += 1) {
    const low = (2 * SPHERE_RADIUS * i) / rings;
    const high = (2 * SPHERE_RADIUS * (i + 1)) / rings;
    const middle = (low + high) / 2 - SPHERE_RADIUS;
    const radius = Math.sqrt(Math.max(SPHERE_RADIUS * SPHERE_RADIUS - middle * middle, 1));
    slabs.push({
      outline: circle(radius, 32),
      base: SPHERE_STANDS_METERS + low,
      top: SPHERE_STANDS_METERS + high,
      paint: SPHERE_BY_DAY[i % SPHERE_BY_DAY.length],
      night: SPHERE_BY_NIGHT[Math.floor(i / 3) % SPHERE_BY_NIGHT.length],
      north: true,
    });
  }
  return slabs;
}

/** The two pyramids of the Egyptian quarter, measured from the middle of the larger: courses of stone, each smaller than the one below. */
export function pyramidSlabs() {
  const slabs = [];
  const cos = Math.cos(PYRAMID_TURN);
  const sin = Math.sin(PYRAMID_TURN);
  for (const pyramid of PYRAMIDS) {
    const courses = Math.round(pyramid.tall / 2.5);
    for (let i = 0; i < courses; i += 1) {
      const half = pyramid.half * (1 - i / courses);
      const outline = [[-half, -half], [half, -half], [half, half], [-half, half]].map(([u, v]) => [pyramid.at[0] - PYRAMIDS[0].at[0] + u * cos - v * sin, pyramid.at[1] - PYRAMIDS[0].at[1] + u * sin + v * cos]);
      slabs.push({ outline, base: (pyramid.tall * i) / courses, top: (pyramid.tall * (i + 1)) / courses, paint: PYRAMID_STONE[i % PYRAMID_STONE.length], night: PYRAMID_BY_NIGHT, north: true });
    }
  }
  return slabs;
}

/** Where the jets of the lagoon's fountain stand, in a line across it: [east, north] in metres from BOULEVARD_WORLD. */
export function fountainJets(count = 24) {
  const [[x0, y0], [x1, y1]] = FOUNTAIN;
  return Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1);
    // (The line bows a little to the south, as the photo shows it.)
    const bow = Math.sin(t * Math.PI) * 14;
    return [x0 + (x1 - x0) * t + bow * 0.45, y0 + (y1 - y0) * t - bow];
  });
}

/** Where the Sphere and the pyramids stand, as [lng, lat], and how high: for shadows and for clearing the map's own blocks. */
export function worldMarks() {
  const squeeze = Math.cos((BOULEVARD_WORLD[1] * Math.PI) / 180) * METERS_PER_DEGREE;
  const place = ([east, north]) => [BOULEVARD_WORLD[0] + east / squeeze, BOULEVARD_WORLD[1] + north / METERS_PER_DEGREE];
  return {
    sphere: { at: place(SPHERE), radius: SPHERE_RADIUS, height: SPHERE_STANDS_METERS + 2 * SPHERE_RADIUS },
    pyramids: PYRAMIDS.map((pyramid) => ({ at: place(pyramid.at), half: pyramid.half, height: pyramid.tall })),
  };
}
