// Reading the satellite photo under the 3D city: how tall the buildings are,
// from the shadows they cast in it, and where trees stand, from their green.
//
// The map data seldom says how tall an ordinary building is. The photo does,
// roughly: a shadow is as long as the building is tall, divided by the tangent
// of the sun's height when the photo was taken. All of this is an estimate.
//
// Nothing here touches the browser. Places are in metres east and north of an
// origin; the photo is looked at through a grid of 1 m squares.

const EARTH_AROUND_METERS = 40075016.686;
const TILE_PIXELS = 256;

/** Where a place falls in the world-wide picture at a zoom level, in pixels: [x, y]. */
export function worldPixel(lng, lat, zoom) {
  const size = TILE_PIXELS * 2 ** zoom;
  const latitude = (lat * Math.PI) / 180;
  return [((lng + 180) / 360) * size, ((1 - Math.asinh(Math.tan(latitude)) / Math.PI) / 2) * size];
}

/** The photo tiles that cover a box { west, south, east, north } at a zoom level: [{ x, y }]. */
export function tilesFor(box, zoom) {
  const [left, top] = worldPixel(box.west, box.north, zoom);
  const [right, bottom] = worldPixel(box.east, box.south, zoom);
  const tiles = [];
  for (let y = Math.floor(top / TILE_PIXELS); y <= Math.floor(bottom / TILE_PIXELS); y += 1) {
    for (let x = Math.floor(left / TILE_PIXELS); x <= Math.floor(right / TILE_PIXELS); x += 1) tiles.push({ x, y });
  }
  return tiles;
}

/**
 * Lay photo tiles out as a grid of 1 m squares around an origin.
 *
 * tiles: Map of "x/y" → { width, height, data } (pixels as red, green, blue, alpha)
 * Returns { size, half, light, green, seen }: for every square its brightness
 * (0–255), how much greener it is than it is red and blue, and whether the
 * photo covers it. Square (0, 0) is the south-west corner.
 */
export function photoGrid(tiles, zoom, origin, half) {
  const size = half * 2;
  const light = new Uint8Array(size * size);
  const green = new Int16Array(size * size);
  const seen = new Uint8Array(size * size);
  const [originX, originY] = worldPixel(origin.lng, origin.lat, zoom);
  const perMeter = (TILE_PIXELS * 2 ** zoom) / (EARTH_AROUND_METERS * Math.cos((origin.lat * Math.PI) / 180));

  let tileKey = '';
  let tile = null;
  for (let row = 0; row < size; row += 1) {
    const worldY = originY - (row - half + 0.5) * perMeter; // north is up on the ground, down in the picture
    const tileY = Math.floor(worldY / TILE_PIXELS);
    for (let column = 0; column < size; column += 1) {
      const worldX = originX + (column - half + 0.5) * perMeter;
      const tileX = Math.floor(worldX / TILE_PIXELS);
      const key = `${tileX}/${tileY}`;
      if (key !== tileKey) {
        tileKey = key;
        tile = tiles.get(key) ?? null;
      }
      if (!tile) continue;
      const px = Math.min(Math.floor(((worldX - tileX * TILE_PIXELS) * tile.width) / TILE_PIXELS), tile.width - 1);
      const py = Math.min(Math.floor(((worldY - tileY * TILE_PIXELS) * tile.height) / TILE_PIXELS), tile.height - 1);
      const at = (py * tile.width + px) * 4;
      const r = tile.data[at];
      const g = tile.data[at + 1];
      const b = tile.data[at + 2];
      const index = row * size + column;
      light[index] = (r * 2126 + g * 7152 + b * 722) / 10000;
      green[index] = 2 * g - r - b;
      seen[index] = 1;
    }
  }
  return { size, half, light, green, seen };
}

/**
 * Mark which building stands on each 1 m square.
 * buildings: [{ ring: [[x, y], …] }] in metres. Returns a Uint16Array: 0 for
 * open ground, otherwise the building's place in the list plus one.
 */
export function footprintGrid(buildings, half) {
  const size = half * 2;
  const owner = new Uint16Array(size * size);
  const crossings = [];
  buildings.forEach((building, index) => {
    const ring = building.ring;
    let low = Infinity;
    let high = -Infinity;
    for (const [, y] of ring) {
      low = Math.min(low, y);
      high = Math.max(high, y);
    }
    const firstRow = Math.max(Math.floor(low + half), 0);
    const lastRow = Math.min(Math.floor(high + half), size - 1);
    for (let row = firstRow; row <= lastRow; row += 1) {
      // Where the middle line of this row of squares crosses the outline.
      const y = row - half + 0.5;
      crossings.length = 0;
      for (let i = 1; i < ring.length; i += 1) {
        const [x0, y0] = ring[i - 1];
        const [x1, y1] = ring[i];
        if (y0 <= y === y1 <= y) continue;
        crossings.push(x0 + ((y - y0) * (x1 - x0)) / (y1 - y0));
      }
      crossings.sort((a, b) => a - b);
      for (let i = 0; i + 1 < crossings.length; i += 2) {
        const from = Math.max(Math.round(crossings[i] + half), 0);
        const to = Math.min(Math.round(crossings[i + 1] + half), size);
        for (let column = from; column < to; column += 1) owner[row * size + column] = index + 1;
      }
    }
  });
  return owner;
}

/**
 * How dark shade is and how bright open ground is in this photo:
 * { shade, sunlit, dark, bright }, or null when no shadows can be told apart.
 * Only the ground within a few metres of the buildings is looked at: that is
 * where their shadows are, whatever the rest of the district looks like.
 */
export function groundLevels(grid, owner, buildings) {
  const { size, half } = grid;
  const band = 5;
  const counts = new Uint32Array(256);
  let total = 0;
  for (const building of buildings) {
    let west = Infinity;
    let east = -Infinity;
    let south = Infinity;
    let north = -Infinity;
    for (const [x, y] of building.ring) {
      west = Math.min(west, x);
      east = Math.max(east, x);
      south = Math.min(south, y);
      north = Math.max(north, y);
    }
    const lastRow = Math.min(Math.floor(north + half) + band, size - 1);
    const lastColumn = Math.min(Math.floor(east + half) + band, size - 1);
    for (let row = Math.max(Math.floor(south + half) - band, 0); row <= lastRow; row += 1) {
      for (let column = Math.max(Math.floor(west + half) - band, 0); column <= lastColumn; column += 1) {
        const index = row * size + column;
        if (owner[index] === 0 && grid.seen[index]) {
          counts[grid.light[index]] += 1;
          total += 1;
        }
      }
    }
  }
  if (total < 400) return null;
  const level = (share) => {
    let passed = 0;
    for (let value = 0; value < 256; value += 1) {
      passed += counts[value];
      if (passed >= total * share) return value;
    }
    return 255;
  };
  const shade = level(0.08);
  const sunlit = level(0.7);
  if (sunlit - shade < 30) return null; // a flat, shadowless photo: overcast, or too coarse
  return { shade, sunlit, dark: shade + 0.4 * (sunlit - shade), bright: shade + 0.62 * (sunlit - shade) };
}

const quantile = (values, share) => {
  if (values.length === 0) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.min(Math.floor(sorted.length * share), sorted.length - 1)];
};

/** Points a metre apart along the walls of an outline that face a direction: [[x, y], …]. */
function wallPoints(ring, east, north) {
  let turning = 0;
  for (let i = 1; i < ring.length; i += 1) turning += ring[i - 1][0] * ring[i][1] - ring[i][0] * ring[i - 1][1];
  const outdoors = turning > 0 ? 1 : -1;
  const points = [];
  for (let i = 1; i < ring.length; i += 1) {
    const [x0, y0] = ring[i - 1];
    const [x1, y1] = ring[i];
    const length = Math.hypot(x1 - x0, y1 - y0);
    if (length < 2) continue;
    // The wall's outdoor side must look towards the direction, not just graze it.
    const facing = (((y1 - y0) * east - (x1 - x0) * north) * outdoors) / length;
    if (facing < 0.25) continue;
    const count = Math.min(Math.max(Math.round(length), 2), 60);
    for (let k = 0; k < count; k += 1) {
      const t = (k + 0.5) / count;
      points.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]);
    }
  }
  return points;
}

/**
 * Follow a building's shadow in a direction. The walls on that side are slid
 * outwards half a metre at a time, and the ground under them is read: dark
 * while they are in the shadow, bright once they are past its end.
 *
 * Returns { length, area }: how far the shadow reaches in metres, and how much
 * dark ground it accounts for. Null when there is no shadow that way, or its
 * end is hidden behind other buildings. (east, north) is the direction, one
 * metre long.
 */
export function shadowOf(grid, owner, levels, building, east, north, most = 45) {
  const { size, half, light, seen } = grid;
  const points = wallPoints(building.ring, east, north);
  if (points.length < 4) return null;
  const span = levels.sunlit - levels.shade;
  const rise = Math.max(16, span * 0.22); // this much brighter than the shade was, and the shadow is ending
  /** The mean brightness of the ground under the walls slid out by a distance, or null when it is mostly roofs. */
  const under = (distance) => {
    let sum = 0;
    let count = 0;
    for (const [x, y] of points) {
      const column = Math.floor(x + east * distance + half);
      const row = Math.floor(y + north * distance + half);
      if (column < 0 || row < 0 || column >= size || row >= size) continue;
      const index = row * size + column;
      if (!seen[index] || owner[index] !== 0) continue; // a roof is not ground
      sum += light[index];
      count += 1;
    }
    return count < points.length * 0.5 ? null : { mean: sum / count, count };
  };

  let darkest = 255;
  let inShade = false;
  let area = 0;
  for (let distance = 1; distance <= most; distance += 0.5) {
    const here = under(distance);
    // Mostly on other buildings: the shadow climbs their walls and its end cannot be seen.
    if (!here) return null;
    if (!inShade) {
      // The outline in the map and the wall in the photo rarely agree to the metre: allow the shadow a late start.
      if (here.mean < levels.dark) inShade = true;
      else if (distance >= 3.5) return null;
    } else if (here.mean > darkest + rise) {
      // The edge of a shadow is a blur a pixel or two wide: its end is the middle of the climb back to brightness.
      let last = here.mean;
      let top = distance;
      for (let further = distance + 0.5; further <= distance + 3; further += 0.5) {
        const next = under(further);
        if (!next || next.mean - last < 2) break;
        last = next.mean;
        top = further;
      }
      return { length: (distance - 0.5 + top) / 2, area };
    }
    if (inShade) {
      darkest = Math.min(darkest, here.mean);
      area += (here.count * 0.5 * Math.max(levels.sunlit - here.mean, 0)) / span;
    }
  }
  return null;
}

/**
 * How much dark ground the buildings' shadows account for if they fall along a
 * compass bearing. Of two candidate directions, the true one accounts for more.
 */
export function shadowEvidence(grid, owner, levels, buildings, bearing) {
  const east = Math.sin((bearing * Math.PI) / 180);
  const north = Math.cos((bearing * Math.PI) / 180);
  // A sample of the buildings is enough, and keeps this quick.
  const stride = Math.max(Math.floor(buildings.length / 300), 1);
  let sum = 0;
  for (let i = 0; i < buildings.length; i += stride) sum += shadowOf(grid, owner, levels, buildings[i], east, north)?.area ?? 0;
  return sum;
}

/**
 * Where the sun stood when a photo satellite passed over, for each of the two
 * times of day such satellites keep to: about an hour and a half before midday
 * by the sun, and as long after. sunAt(date) gives { azimuth, altitude } for
 * the place; day is the date of the photo (the time in it is ignored); lng is
 * the place's longitude. Returns [morning, afternoon].
 */
export function passSuns(sunAt, day, lng) {
  const midday = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 12) - (lng / 15) * 3600000;
  return [-1.5, 1.5].map((hours) => sunAt(new Date(midday + hours * 3600000)));
}

/**
 * Estimate building heights from the photo.
 *
 * buildings: [{ ring, known }] with known = the recorded height in metres, or
 * null. suns: the candidate positions of the sun when the photo was taken, as
 * [{ azimuth, altitude }] (see passSuns); the one the shadows agree with is used.
 *
 * Returns { bearing, perMeter, heights, measured } where heights has a number
 * of metres or null for every building, or null when the photo shows no usable
 * shadows.
 */
export function heightsFromShadows(grid, buildings, suns) {
  if (buildings.length < 8) return null;
  const owner = footprintGrid(buildings, grid.half);
  const levels = groundLevels(grid, owner, buildings);
  if (!levels) return null;

  let sun = null;
  let most = 0;
  for (const candidate of suns) {
    if (!(candidate.altitude > 12)) continue; // shadows too long to follow
    const evidence = shadowEvidence(grid, owner, levels, buildings, (candidate.azimuth + 180) % 360);
    if (evidence > most) {
      most = evidence;
      sun = candidate;
    }
  }
  if (!sun) return null;
  const bearing = (sun.azimuth + 180) % 360;
  const perMeter = Math.tan((sun.altitude * Math.PI) / 180); // metres of height for each metre of shadow
  const east = Math.sin((bearing * Math.PI) / 180);
  const north = Math.cos((bearing * Math.PI) / 180);

  let measured = 0;
  const raw = buildings.map((building) => {
    const length = shadowOf(grid, owner, levels, building, east, north)?.length ?? null;
    if (length === null) return null;
    measured += 1;
    return length * perMeter;
  });
  return { bearing, perMeter, measured, heights: settled(buildings, raw) };
}

/**
 * Settle the estimates. A measured building keeps its own. One that could not
 * be measured, most often because its shadow lands on the building next door,
 * is taken to be about as tall as the measured ones within 120 m of it: a
 * little above their middle, because a shadow cut short reads low.
 */
function settled(buildings, raw) {
  const cell = 60;
  const reach = 120;
  const cells = new Map();
  const middles = buildings.map((building) => {
    let x = 0;
    let y = 0;
    const count = building.ring.length - 1;
    for (let i = 0; i < count; i += 1) {
      x += building.ring[i][0];
      y += building.ring[i][1];
    }
    return [x / count, y / count];
  });
  middles.forEach(([x, y], index) => {
    if (raw[index] === null) return;
    const key = `${Math.floor(x / cell)},${Math.floor(y / cell)}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(index);
  });
  const tidy = (height) => Math.round(Math.min(Math.max(height, 3), 40) * 2) / 2;

  return buildings.map((building, index) => {
    if (raw[index] !== null) return tidy(raw[index]);
    const [x, y] = middles[index];
    const around = [];
    for (let dx = -2; dx <= 2; dx += 1) {
      for (let dy = -2; dy <= 2; dy += 1) {
        for (const other of cells.get(`${Math.floor(x / cell) + dx},${Math.floor(y / cell) + dy}`) ?? []) {
          if (Math.hypot(middles[other][0] - x, middles[other][1] - y) <= reach) around.push(raw[other]);
        }
      }
    }
    return around.length >= 4 ? tidy(quantile(around, 0.6)) : null;
  });
}

/**
 * Which squares of the ground are road, track or path: 1 where no tree can
 * stand. The same squares as footprintGrid() and the photo's.
 *
 * roads: [{ points: [[x, y], …], half }] in metres east and north of the
 * middle, half being how far to either side of the line is kept clear.
 */
export function pavedGrid(roads, half) {
  const size = half * 2;
  const paved = new Uint8Array(size * size);
  for (const road of roads) {
    const clear = road.half;
    const points = road.points;
    if (!(clear > 0) || !Array.isArray(points)) continue;
    for (let i = 1; i < points.length; i += 1) {
      const [x0, y0] = points[i - 1];
      const [x1, y1] = points[i];
      if (Math.max(x0, x1) < -half - clear || Math.min(x0, x1) > half + clear || Math.max(y0, y1) < -half - clear || Math.min(y0, y1) > half + clear) continue;
      // A long stretch is done in parts, so only the squares near the line are looked at.
      const parts = Math.max(Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 16), 1);
      for (let part = 0; part < parts; part += 1) {
        const ax = x0 + ((x1 - x0) * part) / parts;
        const ay = y0 + ((y1 - y0) * part) / parts;
        const dx = (x1 - x0) / parts;
        const dy = (y1 - y0) / parts;
        const span = dx * dx + dy * dy || 1;
        const firstRow = Math.max(Math.floor(Math.min(ay, ay + dy) - clear + half), 0);
        const lastRow = Math.min(Math.floor(Math.max(ay, ay + dy) + clear + half), size - 1);
        const firstColumn = Math.max(Math.floor(Math.min(ax, ax + dx) - clear + half), 0);
        const lastColumn = Math.min(Math.floor(Math.max(ax, ax + dx) + clear + half), size - 1);
        for (let row = firstRow; row <= lastRow; row += 1) {
          const py = row - half + 0.5;
          for (let column = firstColumn; column <= lastColumn; column += 1) {
            const px = column - half + 0.5;
            const t = Math.min(Math.max(((px - ax) * dx + (py - ay) * dy) / span, 0), 1);
            if (Math.hypot(px - (ax + dx * t), py - (ay + dy * t)) <= clear) paved[row * size + column] = 1;
          }
        }
      }
    }
  }
  return paved;
}

/**
 * Find trees in the photo: dark green patches on open ground, which is ground
 * that is neither under a building (owner, from footprintGrid) nor road
 * (paved, from pavedGrid; leave out to allow trees anywhere off the buildings).
 * Returns [{ x, y, radius }] in metres, the greenest first, at most `most`.
 */
export function treesInPhoto(grid, owner, most = 2500, paved = null) {
  const { size, half, light, green, seen } = grid;
  const reach = 3; // crowns are told apart when their middles are more than 3 m apart
  // How tree-like each square is, and the running totals that make any block of squares quick to add up.
  const leafy = new Uint8Array(size * size);
  const totals = new Float64Array((size + 1) * (size + 1));
  for (let row = 0; row < size; row += 1) {
    let along = 0;
    for (let column = 0; column < size; column += 1) {
      const index = row * size + column;
      // Leaves are clearly greener than they are red or blue, and neither as bright as a lawn nor as dark
      // as a shadow (shadows in these photos often carry a faint green cast).
      const greener = green[index];
      const bright = light[index];
      if (seen[index] && owner[index] === 0 && !(paved && paved[index]) && greener > 22 && bright > 28 && bright < 125 && greener > bright * 0.3) {
        leafy[index] = Math.min(greener, 80);
      }
      along += leafy[index];
      totals[(row + 1) * (size + 1) + column + 1] = totals[row * (size + 1) + column + 1] + along;
    }
  }
  const block = (row, column, radius) => {
    const top = Math.max(row - radius, 0);
    const bottom = Math.min(row + radius + 1, size);
    const left = Math.max(column - radius, 0);
    const right = Math.min(column + radius + 1, size);
    return totals[bottom * (size + 1) + right] - totals[top * (size + 1) + right] - totals[bottom * (size + 1) + left] + totals[top * (size + 1) + left];
  };
  // The greenness of the 7 m square around each leafy square: highest in the middle of a crown.
  const patch = new Float32Array(size * size);
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      if (leafy[row * size + column]) patch[row * size + column] = block(row, column, reach);
    }
  }

  const trees = [];
  for (let row = reach; row < size - reach; row += 1) {
    for (let column = reach; column < size - reach; column += 1) {
      const index = row * size + column;
      const value = patch[index];
      if (value < 220) continue; // a green square or two is not a tree
      let top = true;
      for (let dy = -reach; dy <= reach && top; dy += 1) {
        for (let dx = -reach; dx <= reach; dx += 1) {
          const near = index + dy * size + dx;
          // On a tie the square further on wins, so one crown is counted once.
          if (patch[near] > value || (patch[near] === value && near > index)) {
            top = false;
            break;
          }
        }
      }
      if (!top) continue;
      // The crown: the leafy squares around the top. Its middle is the tree; its area gives its size.
      let squares = 0;
      let sumX = 0;
      let sumY = 0;
      for (let dy = -4; dy <= 4; dy += 1) {
        for (let dx = -4; dx <= 4; dx += 1) {
          const r = row + dy;
          const c = column + dx;
          if (r < 0 || c < 0 || r >= size || c >= size || dx * dx + dy * dy > 18 || !leafy[r * size + c]) continue;
          squares += 1;
          sumX += c;
          sumY += r;
        }
      }
      // Leaves on both sides of a street have their middle on the street: no tree stands there.
      const middle = Math.round(sumY / squares) * size + Math.round(sumX / squares);
      if (owner[middle] !== 0 || (paved && paved[middle])) continue;
      trees.push({
        x: sumX / squares - half + 0.5,
        y: sumY / squares - half + 0.5,
        radius: Math.min(Math.max(Math.sqrt(squares / Math.PI), 1.3), 4),
        score: value,
      });
    }
  }
  trees.sort((a, b) => b.score - a.score);
  return trees.slice(0, most).map(({ x, y, radius }) => ({ x, y, radius }));
}

// ── The colour of the roofs ───────────────────────────────────────────────

const ROOF_SAMPLES_EACH_WAY = 9;

/**
 * The colour of each building's roof as the photo shows it:
 * [red, green, blue] for each, or null where the photo shows too little.
 *
 * tiles: Map of "x/y" → { width, height, data } as for photoGrid.
 * buildings: [{ ring: [[x, y], …] }] in metres around the origin.
 *
 * The photo is looked at in a few dozen places inside the outline. What is
 * green there (a tree over the roof) is left out. Of the rest, the very
 * brightest places are left out (white plant, glare) and all the darker
 * ones, which are mostly shadow and what stands on the roof: the colour is
 * that of the roof itself where the sun is on it.
 */
export function roofColours(tiles, zoom, origin, buildings) {
  const [originX, originY] = worldPixel(origin.lng, origin.lat, zoom);
  const perMeter = (TILE_PIXELS * 2 ** zoom) / (EARTH_AROUND_METERS * Math.cos((origin.lat * Math.PI) / 180));
  const inside = (ring, x, y) => {
    let hit = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const [x0, y0] = ring[j];
      const [x1, y1] = ring[i];
      if (y0 > y !== y1 > y && x < x0 + ((y - y0) * (x1 - x0)) / (y1 - y0)) hit = !hit;
    }
    return hit;
  };
  return buildings.map(({ ring }) => {
    let west = Infinity;
    let east = -Infinity;
    let south = Infinity;
    let north = -Infinity;
    for (const [x, y] of ring) {
      if (x < west) west = x;
      if (x > east) east = x;
      if (y < south) south = y;
      if (y > north) north = y;
    }
    if (!(east - west > 1 && north - south > 1)) return null;
    const seen = [];
    for (let row = 0; row < ROOF_SAMPLES_EACH_WAY; row += 1) {
      const y = south + ((north - south) * (row + 0.5)) / ROOF_SAMPLES_EACH_WAY;
      for (let column = 0; column < ROOF_SAMPLES_EACH_WAY; column += 1) {
        const x = west + ((east - west) * (column + 0.5)) / ROOF_SAMPLES_EACH_WAY;
        if (!inside(ring, x, y)) continue;
        const worldX = originX + x * perMeter;
        const worldY = originY - y * perMeter; // north is up on the ground, down in the picture
        const tileX = Math.floor(worldX / TILE_PIXELS);
        const tileY = Math.floor(worldY / TILE_PIXELS);
        const tile = tiles.get(`${tileX}/${tileY}`);
        if (!tile) continue;
        const px = Math.min(Math.floor(((worldX - tileX * TILE_PIXELS) * tile.width) / TILE_PIXELS), tile.width - 1);
        const py = Math.min(Math.floor(((worldY - tileY * TILE_PIXELS) * tile.height) / TILE_PIXELS), tile.height - 1);
        const at = (py * tile.width + px) * 4;
        const r = tile.data[at];
        const g = tile.data[at + 1];
        const b = tile.data[at + 2];
        if (2 * g - r - b > 36) continue; // leaves
        seen.push([r * 2126 + g * 7152 + b * 722, r, g, b]);
      }
    }
    if (seen.length < 4) return null;
    seen.sort((a, b) => b[0] - a[0]);
    const from = Math.floor(seen.length * 0.05);
    const kept = seen.slice(from, Math.max(Math.ceil(seen.length * 0.4), from + 2));
    const sum = [0, 0, 0];
    for (const [, r, g, b] of kept) {
      sum[0] += r;
      sum[1] += g;
      sum[2] += b;
    }
    return sum.map((part) => Math.round(part / kept.length));
  });
}
