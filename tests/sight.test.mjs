import assert from 'node:assert/strict';
import { test } from 'node:test';

import { sunPosition } from '../js/lib.js';
import { footprintGrid, groundLevels, heightsFromShadows, passSuns, pavedGrid, photoGrid, shadowEvidence, shadowOf, tilesFor, treesInPhoto, worldPixel } from '../js/sight.js';

const ORIGIN = { lng: 46.67, lat: 24.7 };
const ZOOM = 17;
const HALF = 240; // metres from the middle to the edge of the test ground
const near = (a, b, by) => Math.abs(a - b) <= by;

const SAND = [200, 185, 160];
const SHADE = [52, 54, 60];
const ROOF = [228, 224, 216];
const TREE = [38, 72, 34];
const LAWN = [120, 172, 92];
const TARMAC = [92, 94, 98];

const rect = (x, y, width, depth) => [[x, y], [x + width, y], [x + width, y + depth], [x, y + depth], [x, y]];
/** True when the line from (x, y) back to (x - dx, y - dy) touches the box: the point is in the box's swept shadow. */
function sweptBy(box, x, y, dx, dy) {
  let from = 0;
  let to = 1;
  for (const [start, delta, low, high] of [[x, -dx, box.x, box.x + box.width], [y, -dy, box.y, box.y + box.depth]]) {
    if (Math.abs(delta) < 1e-9) {
      if (start < low || start > high) return false;
    } else {
      const a = (low - start) / delta;
      const b = (high - start) / delta;
      from = Math.max(from, Math.min(a, b));
      to = Math.min(to, Math.max(a, b));
    }
  }
  return from <= to;
}

/** Paint a made-up satellite photo: sand, buildings with shadows, and whatever else is asked for. */
function paint({ boxes = [], bearing = 0, perMeter = 1, trees = [], lawns = [], roads = [], shadows = true }) {
  const [originX, originY] = worldPixel(ORIGIN.lng, ORIGIN.lat, ZOOM);
  const scale = (256 * 2 ** ZOOM) / (40075016.686 * Math.cos((ORIGIN.lat * Math.PI) / 180));
  const east = Math.sin((bearing * Math.PI) / 180);
  const north = Math.cos((bearing * Math.PI) / 180);
  const tiles = new Map();
  const degrees = (meters) => meters / 111320;
  const box = { west: ORIGIN.lng - degrees(HALF) / Math.cos((ORIGIN.lat * Math.PI) / 180), east: ORIGIN.lng + degrees(HALF) / Math.cos((ORIGIN.lat * Math.PI) / 180), south: ORIGIN.lat - degrees(HALF), north: ORIGIN.lat + degrees(HALF) };
  for (const tile of tilesFor(box, ZOOM)) {
    const data = new Uint8ClampedArray(256 * 256 * 4);
    for (let j = 0; j < 256; j += 1) {
      for (let i = 0; i < 256; i += 1) {
        const x = (tile.x * 256 + i + 0.5 - originX) / scale;
        const y = (originY - (tile.y * 256 + j + 0.5)) / scale;
        let colour = SAND;
        if (roads.some((road) => x >= road.x && x <= road.x + road.width && y >= road.y && y <= road.y + road.depth)) colour = TARMAC;
        if (lawns.some((lawn) => x >= lawn.x && x <= lawn.x + lawn.width && y >= lawn.y && y <= lawn.y + lawn.depth)) colour = LAWN;
        if (trees.some((tree) => Math.hypot(x - tree.x, y - tree.y) <= tree.r)) colour = TREE;
        if (shadows && boxes.some((b) => sweptBy(b, x, y, (east * b.height) / perMeter, (north * b.height) / perMeter))) colour = colour === TARMAC ? [34, 35, 40] : SHADE;
        if (boxes.some((b) => x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.depth)) colour = ROOF;
        data.set([colour[0], colour[1], colour[2], 255], (j * 256 + i) * 4);
      }
    }
    tiles.set(`${tile.x}/${tile.y}`, { width: 256, height: 256, data });
  }
  return photoGrid(tiles, ZOOM, ORIGIN, HALF);
}

/** A small town: four rows of five blocks, 16 m by 12 m, 40 m apart, with their heights. */
function town(heightOf) {
  const boxes = [];
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 5; column += 1) {
      boxes.push({ x: -100 + column * 40, y: -80 + row * 40, width: 16, depth: 12, height: heightOf(row, column) });
    }
  }
  return boxes;
}
const asBuildings = (boxes, known = () => null) => boxes.map((b, index) => ({ ring: rect(b.x, b.y, b.width, b.depth), known: known(b, index) }));
/** The sun that throws shadows along a bearing, so many metres of shadow per metre of height. */
const sunFor = (bearing, perMeter) => ({ azimuth: (bearing + 180) % 360, altitude: (Math.atan(perMeter) * 180) / Math.PI });

test('worldPixel and tilesFor place the photo tiles', () => {
  assert.deepEqual(worldPixel(-180, 0, 0).map(Math.round), [0, 128]);
  assert.deepEqual(worldPixel(0, 0, 1), [256, 256]);
  const [x, y] = worldPixel(ORIGIN.lng, ORIGIN.lat, ZOOM);
  assert.ok(x > 0 && y > 0 && x < 256 * 2 ** ZOOM && y < (256 * 2 ** ZOOM) / 2, 'north of the equator is in the upper half');
  // A box smaller than a tile sits in one tile; a wide one in a row of them.
  const tiny = tilesFor({ west: 46.67, east: 46.6701, south: 24.7, north: 24.7001 }, ZOOM);
  assert.equal(tiny.length, 1);
  assert.deepEqual(tiny[0], { x: Math.floor(x / 256), y: Math.floor(y / 256) });
  const wide = tilesFor({ west: 46.66, east: 46.68, south: 24.7, north: 24.7001 }, ZOOM);
  assert.ok(wide.length >= 7 && wide.every((tile) => tile.y === wide[0].y));
});

test('photoGrid lays the photo out north-up in metre squares', () => {
  // One white building-sized patch north-east of the middle, on sand.
  const grid = paint({ boxes: [{ x: 60, y: 100, width: 20, depth: 10, height: 0 }], shadows: false });
  assert.equal(grid.size, HALF * 2);
  const at = (x, y) => grid.light[Math.floor(y + HALF) * grid.size + Math.floor(x + HALF)];
  assert.ok(at(70, 105) > 215, 'the roof is where it was painted');
  assert.ok(near(at(-70, -105), 187, 3) && near(at(70, 90), 187, 3), 'and sand everywhere else');
  assert.ok(grid.seen.every((value) => value === 1));
  // Where no tile was supplied the grid says so.
  const empty = photoGrid(new Map(), ZOOM, ORIGIN, 10);
  assert.ok(empty.seen.every((value) => value === 0));
});

test('footprintGrid marks the squares each building stands on', () => {
  const owner = footprintGrid([{ ring: rect(0, 0, 10, 6) }, { ring: rect(-30, -20, 4, 4) }, { ring: rect(HALF - 5, 0, 50, 3) }], HALF);
  const count = (id) => owner.reduce((sum, value) => sum + (value === id ? 1 : 0), 0);
  assert.equal(count(1), 60);
  assert.equal(count(2), 16);
  assert.equal(count(3), 15, 'a building half off the grid is cut at the edge');
  assert.equal(owner[(0 + HALF) * (HALF * 2) + (0 + HALF)], 1);
  assert.equal(owner[(10 + HALF) * (HALF * 2) + HALF], 0);
});

test('the direction and length of shadows are read from the photo', () => {
  const boxes = town(() => 9);
  // Shadows fall to the north-west, 9 m of building throwing 6 m of shadow.
  const grid = paint({ boxes, bearing: 320, perMeter: 1.5 });
  const buildings = asBuildings(boxes);
  const owner = footprintGrid(buildings, HALF);
  const levels = groundLevels(grid, owner, buildings);
  assert.ok(levels.shade < 70 && levels.sunlit > 170 && levels.dark < levels.bright);

  // The true direction accounts for far more dark ground than any other.
  const evidence = (bearing) => shadowEvidence(grid, owner, levels, buildings, bearing);
  assert.ok(evidence(320) > evidence(40) * 2 && evidence(320) > evidence(220) * 5 && evidence(320) > evidence(270) * 1.2, [320, 40, 220, 270].map(evidence).join(' '));

  // Along the true direction the first block's shadow is 6 m long.
  const along = (degrees) => [Math.sin((degrees * Math.PI) / 180), Math.cos((degrees * Math.PI) / 180)];
  const shadow = shadowOf(grid, owner, levels, buildings[0], ...along(320));
  assert.ok(near(shadow.length, 6, 1.2), `length ${shadow.length}`);
  assert.ok(shadow.area > 100, `area ${shadow.area}`);
  // Out of the sunny south and east walls there is no shadow to follow.
  assert.equal(shadowOf(grid, owner, levels, buildings[0], ...along(140)), null);
  // A wrong direction accounts for less dark ground than the right one.
  assert.ok((shadowOf(grid, owner, levels, buildings[0], ...along(30))?.area ?? 0) < shadow.area * 0.7);
});

test('a shadow whose end is behind the next building cannot be measured', () => {
  // Two blocks 3 m apart; the first one's 10 m shadow lands on the second.
  const boxes = [{ x: 0, y: 0, width: 16, depth: 12, height: 14 }, { x: 0, y: 15, width: 16, depth: 12, height: 14 }, ...town(() => 9)];
  const grid = paint({ boxes, bearing: 0, perMeter: 1.4 });
  const buildings = asBuildings(boxes);
  const owner = footprintGrid(buildings, HALF);
  const levels = groundLevels(grid, owner, buildings);
  assert.equal(shadowOf(grid, owner, levels, buildings[0], 0, 1), null);
  assert.ok(near(shadowOf(grid, owner, levels, buildings[1], 0, 1).length, 10, 1.2));
});

test('heights come out of the shadows, given where the sun stood', () => {
  // Low houses, and a row of taller blocks.
  const boxes = town((row, column) => (row === 2 ? 18 : column === 4 ? 12 : 8));
  const grid = paint({ boxes, bearing: 325, perMeter: 1.4 });
  const result = heightsFromShadows(grid, asBuildings(boxes), [sunFor(325, 1.4)]);
  assert.ok(result, 'the photo is usable');
  assert.ok(near(result.bearing, 325, 1e-9) && near(result.perMeter, 1.4, 1e-9));
  assert.equal(result.heights.length, boxes.length);
  assert.ok(result.measured >= 16, `${result.measured} measured`);
  const low = [];
  const tall = [];
  boxes.forEach((box, index) => {
    const height = result.heights[index];
    assert.ok(height !== null && height >= 3 && height <= 40);
    assert.equal(height * 2, Math.round(height * 2), 'to the half metre');
    (box.height === 18 ? tall : box.height === 8 ? low : []).push(height);
  });
  const mean = (values) => values.reduce((a, b) => a + b, 0) / values.length;
  assert.ok(near(mean(low), 8, 1.5), `low houses came out at ${mean(low).toFixed(1)} m`);
  assert.ok(near(mean(tall), 18, 2.5), `tall blocks came out at ${mean(tall).toFixed(1)} m`);
});

test('of the two times a satellite may have passed, the one the shadows agree with is used', () => {
  const boxes = town(() => 10);
  const morning = { azimuth: 140, altitude: 50 };
  const afternoon = { azimuth: 220, altitude: 50 };
  const perMeter = Math.tan((50 * Math.PI) / 180);
  const early = heightsFromShadows(paint({ boxes, bearing: 320, perMeter }), asBuildings(boxes), [morning, afternoon]);
  assert.equal(early.bearing, 320);
  const late = heightsFromShadows(paint({ boxes, bearing: 40, perMeter }), asBuildings(boxes), [morning, afternoon]);
  assert.equal(late.bearing, 40);
  for (const result of [early, late]) {
    const heights = result.heights.filter((height) => height !== null);
    assert.ok(near(heights.reduce((a, b) => a + b, 0) / heights.length, 10, 1.8), heights.join(' '));
  }
  // A sun too low to follow, or no candidate at all: no reading.
  assert.equal(heightsFromShadows(paint({ boxes, bearing: 320, perMeter }), asBuildings(boxes), [{ azimuth: 140, altitude: 8 }]), null);
  assert.equal(heightsFromShadows(paint({ boxes, bearing: 320, perMeter }), asBuildings(boxes), []), null);
});

test('passSuns gives the sun an hour and a half either side of midday', () => {
  // Riyadh on 8 December, the day one of its photos was taken.
  const [morning, afternoon] = passSuns((date) => sunPosition(date, 24.7, 46.67), new Date(Date.UTC(2025, 11, 8, 17, 30)), 46.67);
  assert.ok(morning.azimuth > 145 && morning.azimuth < 165, `morning sun at ${morning.azimuth}`);
  assert.ok(afternoon.azimuth > 195 && afternoon.azimuth < 215, `afternoon sun at ${afternoon.azimuth}`);
  assert.ok(near(morning.altitude, 38, 3) && near(afternoon.altitude, 38, 3));
  // In June the same passes have the sun far higher.
  assert.ok(passSuns((date) => sunPosition(date, 24.7, 46.67), new Date(Date.UTC(2025, 5, 21)), 46.67)[0].altitude > 65);
});

test('a building that cannot be measured is taken to be about as tall as those around it', () => {
  // The first block's shadow lands on the block 3 m behind it; the town around is 9 m tall.
  const boxes = [{ x: 0, y: 100, width: 16, depth: 12, height: 9 }, { x: 0, y: 115, width: 16, depth: 12, height: 9 }, ...town(() => 9)];
  const result = heightsFromShadows(paint({ boxes, bearing: 0, perMeter: 1.4 }), asBuildings(boxes), [sunFor(0, 1.4)]);
  assert.equal(result.measured, boxes.length - 1);
  assert.ok(near(result.heights[0], 9, 2), `filled in at ${result.heights[0]} m`);
  // With nothing measured nearby there is nothing to go by.
  const lonely = [{ x: 0, y: 0, width: 16, depth: 12, height: 9 }, { x: 0, y: 15, width: 16, depth: 12, height: 9 }, ...town(() => 9).map((box) => ({ ...box, x: box.x + 60, y: box.y - 140 })).slice(0, 8)];
  const far = heightsFromShadows(paint({ boxes: lonely, bearing: 0, perMeter: 1.4 }), asBuildings(lonely), [sunFor(0, 1.4)]);
  assert.equal(far.heights[0], null);
});

test('a photo without shadows gives no heights', () => {
  const boxes = town(() => 9);
  assert.equal(heightsFromShadows(paint({ boxes, shadows: false }), asBuildings(boxes), [sunFor(320, 1.5)]), null);
  assert.equal(heightsFromShadows(paint({ boxes: boxes.slice(0, 3), bearing: 320, perMeter: 1.5 }), asBuildings(boxes.slice(0, 3)), [sunFor(320, 1.5)]), null, 'too few buildings to trust');
  assert.equal(groundLevels(photoGrid(new Map(), ZOOM, ORIGIN, 20), new Uint16Array(1600), [{ ring: rect(0, 0, 5, 5) }]), null);
});

test('a shadow that ends on a dark road is still measured', () => {
  // A road runs along the north side of the blocks; their 7 m shadows end on it.
  const boxes = town(() => 9.8);
  const roads = [0, 1, 2, 3].map((row) => ({ x: -200, y: -80 + row * 40 + 14, width: 400, depth: 20 }));
  const grid = paint({ boxes, bearing: 350, perMeter: 1.4, roads });
  const result = heightsFromShadows(grid, asBuildings(boxes), [sunFor(350, 1.4)]);
  assert.ok(result);
  const heights = result.heights.filter((height) => height !== null);
  assert.ok(near(heights.reduce((a, b) => a + b, 0) / heights.length, 9.8, 3), `around ${heights.join(' ')}`);
});

test('treesInPhoto finds dark green crowns on open ground', () => {
  const boxes = town(() => 8).slice(0, 8);
  const trees = [{ x: 150, y: 150, r: 3 }, { x: 150, y: 120, r: 2 }, { x: -180, y: 100, r: 3.5 }, { x: 0, y: 190, r: 2.5 }];
  const lawns = [{ x: 100, y: -200, width: 80, depth: 60 }];
  const grid = paint({ boxes, bearing: 320, perMeter: 1.5, trees, lawns });
  const owner = footprintGrid(asBuildings(boxes), HALF);
  const found = treesInPhoto(grid, owner);
  assert.equal(found.length, trees.length, JSON.stringify(found));
  for (const tree of trees) {
    const match = found.find((other) => Math.hypot(other.x - tree.x, other.y - tree.y) < 2.5);
    assert.ok(match, `tree at ${tree.x}, ${tree.y}`);
    assert.ok(near(match.radius, tree.r, 1.5), `crown ${match.radius} for ${tree.r}`);
  }
  // Bright lawns, shadows and roofs are not trees; and the list can be cut short.
  assert.ok(found.every((tree) => !(tree.x > 100 && tree.x < 180 && tree.y < -140)));
  assert.equal(treesInPhoto(grid, owner, 2).length, 2);
});

test('pavedGrid marks the ground that roads and tracks take up', () => {
  // A street running east 10 m north of the middle, kept clear 5 m either side, and a short track on a slant.
  const paved = pavedGrid([{ points: [[-300, 10], [0, 10], [300, 10]], half: 5 }, { points: [[100, 100], [130, 140]], half: 2 }, { points: [[0, -100], [50, -100]], half: 0 }, { points: null, half: 3 }], HALF);
  const size = HALF * 2;
  assert.equal(paved.length, size * size);
  const at = (x, y) => paved[Math.floor(y + HALF) * size + Math.floor(x + HALF)];
  // On the street and within 5 m of its middle line: paved. Further off: open ground.
  for (const x of [-239, -100, 0, 150, 239]) {
    assert.equal(at(x, 10), 1, `on the street at ${x}`);
    assert.equal(at(x, 13.9), 1);
    assert.equal(at(x, 6.2), 1);
    assert.equal(at(x, 16.5), 0, `beside the street at ${x}`);
    assert.equal(at(x, 3.5), 0);
  }
  // The track: along it, not off its ends, not far to its side.
  assert.equal(at(115, 120), 1);
  assert.equal(at(116.5, 119), 1);
  assert.equal(at(96, 96), 0);
  assert.equal(at(121, 116), 0);
  // A line with no width takes up no ground.
  assert.equal(at(20, -100), 0);
  let squares = 0;
  for (const value of paved) squares += value;
  assert.ok(near(squares, 480 * 10 + 50 * 4 + Math.PI * 4, 60), `${squares} squares`);
  assert.equal(pavedGrid([], HALF).some((value) => value !== 0), false);
});

test('no tree is found on a road, whatever is green there', () => {
  // A street with a green bus parked on it, trees along its kerb, and two crowns that meet over the middle of a side street.
  const street = { x: -240, y: -6, width: 480, depth: 12 };
  const side = { x: -4, y: 6, width: 8, depth: 200 };
  const trees = [{ x: -120, y: 0, r: 3 }, { x: 60, y: 11, r: 2.5 }, { x: -60, y: -11, r: 2.5 }, { x: -6.5, y: 120, r: 2.6 }, { x: 6.5, y: 120, r: 2.6 }, { x: 150, y: 150, r: 3 }];
  const grid = paint({ trees, roads: [street, side], shadows: false });
  const owner = footprintGrid([], HALF);
  const paved = pavedGrid([{ points: [[-300, 0], [300, 0]], half: 8 }, { points: [[0, 0], [0, 300]], half: 4 }], HALF);
  const found = treesInPhoto(grid, owner, 2500, paved);
  const near2 = (tree) => found.find((other) => Math.hypot(other.x - tree.x, other.y - tree.y) < 3);
  assert.equal(near2(trees[0]), undefined, 'the green thing in the middle of the street is not a tree');
  assert.ok(near2(trees[1]) && near2(trees[2]), 'the trees along the kerb stay');
  assert.ok(near2(trees[5]), 'and so does the tree away from any road');
  // Every tree that is found stands off the paved ground.
  const size = HALF * 2;
  for (const tree of found) assert.equal(paved[Math.floor(tree.y + HALF) * size + Math.floor(tree.x + HALF)], 0, JSON.stringify(tree));
  assert.ok(found.every((tree) => Math.abs(tree.y) > 8 && !(Math.abs(tree.x) < 4 && tree.y > 0)));
  // The two crowns over the side street count as the two trees they are, one on each side.
  assert.ok(found.some((tree) => tree.x < -4 && near(tree.y, 120, 3)) && found.some((tree) => tree.x > 4 && near(tree.y, 120, 3)), JSON.stringify(found));
  // Without the road mask the same photo gives a tree in the street.
  assert.ok(treesInPhoto(grid, owner).some((tree) => Math.hypot(tree.x + 120, tree.y) < 3));
});
