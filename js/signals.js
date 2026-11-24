// The traffic signals at Riyadh's junctions: where they stand, how they are run, and what they look like.
//
// What is known of Riyadh's signals, and from where:
//
//  - How they are run. One approach at a time: "most major intersections are regulated by traffic signals
//    employing split phasing that corresponds to the number of intersection approaches" (Al-Ghamdi, on
//    Riyadh's intersections), and signals in the Kingdom are "completely split phased", for that is the
//    easiest for the traffic police who work them (Hanson, on Olaya Street and King Fahd Road). So here:
//    every side of a junction has its own green (a road, and whatever comes in beside it heading the
//    same way), with everything else at red, and the sides take it in turn.
//  - The lights. Green, then the green flashes three times, then yellow, then red: the flashing was
//    brought in with the cameras that catch those who run a red light, when the counters of seconds were
//    taken off the signals (Okaz). A study of junctions in the Kingdom that have both found drivers
//    stopping early for it, for fear of the fine; how many do is not known, and here it is one in
//    eight. No red-and-yellow before the green.
//  - How long. Long: cycles of 77 and 148 seconds were measured in one part of the city, and a junction
//    of four approaches timed by the usual Saudi design came to five and a half minutes. At 350 of the
//    busiest junctions the times follow the traffic (the city's own control system); here they follow
//    the size of the road.
//  - Turning right at a red light is allowed, from the lane by the kerb and after a full stop, unless a
//    sign forbids it (the Traffic Law, as the traffic police explain it).
//  - Where. OpenStreetMap marks traffic signals, and once the app has been told of them they are used
//    (see riyadhSignals() in services.js). Besides, and for as long as nothing has been told: at every
//    crossing on the level of two main roads. Riyadh's main roads have a median that is open only where
//    there is a junction, so where the map lets one main road's traffic drive across another's, there
//    is one.
//  - What they look like is the least certain: no photograph could be had while this was written. Posts,
//    arms over the road and gantries are what Riyadh's contractors put up, and its road signs warn of
//    signals both upright and lying flat. So: a post by the kerb at the stop line with an arm out over
//    the lanes, heads lying flat on the arm and standing upright on the post, and where there is a
//    median an upright head there too. Black heads on black boards. They are drawn larger than life,
//    or from the height the city is looked at from they could not be made out at all.
//
// What is made up: which approach is green at which moment. The signals here run by the app's own clock,
// not by the real ones': nothing on this screen says what a real signal is showing.
//
// Nothing here touches the browser. Places are in the scene's metres, east and north of its origin.

import { faceLight, heightAlong, pointAlong } from './life.js';

const TAU = Math.PI * 2;

/** The roads a signal is put on, and how great each is. */
const GREATNESS = { tertiary: 1, secondary: 2, primary: 3, trunk: 4 };
const SAME_JUNCTION_METERS = 60; // signalled crossings this close together are run as one junction
const NEIGHBOUR_LINK_METERS = 45; // and so is a junction joined to one of them by a link no longer than this (the opening in a median)
const MARK_REACH_METERS = 45; // a signal the map marks stands for the crossings within this of it
const INSIDE_METERS = 70; // traffic that has come through a part of the junction within this far is inside it already
const SIDE_SPAN_DEGREES = 60; // what comes in heading within this of each other comes from one side, and goes together
const THROUGH_STRAIGHT = 0.7; // straight on: within 45 degrees
const CROSSING_SINE = 0.5; // two streams cross if they meet at 30 degrees or more
const CROSSING_DEEP_METERS = 3; // the zebra crossing in front of the stop line (as drawMarks() paints it)

/** The times of a signal, in seconds: how long the green flashes at its end, the yellow, and the pause with every approach at red. */
export const SIGNAL_TIMES = { flash: 3, yellow: 3, clear: 2 };

/** How long an approach has green, by its lanes and the greatness of its road: 18 to 42 seconds, the flashing included. */
export function greenSeconds(lanes, rank = 1) {
  return Math.min(Math.max(12 + 6 * lanes + (rank >= 3 ? 4 : 0), 18), 42);
}

/** A number from 0 to 1 that is always the same for the same text. */
function unitOf(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

/** Whether a way lies on the ground at a distance along it: not in a tunnel, a cutting or on a bridge. */
const onGround = (way, at) => !way.hidden && Math.abs(heightAlong(way, at)) < 1;

/** The roads that meet at a junction, each as it leaves it. */
function armsAt(network, key) {
  const arms = [];
  for (const join of network.joins.get(key) ?? []) {
    const way = network.ways[join.way];
    if (!way || way.rail) continue;
    const spot = pointAlong(way, join.atStart ? 0 : way.length);
    const sign = join.atStart ? 1 : -1;
    arms.push({
      index: join.way,
      way,
      atStart: join.atStart,
      x: spot[0],
      y: spot[1],
      east: spot[2] * sign,
      north: spot[3] * sign,
      // Whether traffic can come to the junction along it, and whether it can leave by it.
      arrives: join.atStart ? way.oneway !== 1 : way.oneway !== -1,
      leaves: join.atStart ? way.oneway !== -1 : way.oneway !== 1,
      ground: onGround(way, join.atStart ? 0 : way.length),
      rank: GREATNESS[way.class] ?? 0,
    });
  }
  return arms;
}

/**
 * Whether two streams of traffic cross at a junction: two roads' traffic each driving straight on, into
 * different roads, at an angle to each other. (Where one stream only joins another there is nothing to
 * signal: a slip road, a roundabout, a side street that can only turn into the carriageway it meets.
 * What the map calls a slip road counts like any other, though: round Riyadh's interchanges the roads
 * beside the great roads are drawn as such, and they cross the streets at signals.)
 * Returns { crossing: whether any two do, main: whether two main roads do (both secondary or greater),
 * worthy: whether a main road and at least a collector do }.
 */
function streamsAt(arms) {
  const coming = [];
  for (const arm of arms) {
    if (!arm.arrives || !arm.ground) continue;
    let through = null;
    let most = THROUGH_STRAIGHT;
    for (const other of arms) {
      if (other === arm || !other.leaves || !other.ground) continue;
      const straight = -(arm.east * other.east + arm.north * other.north);
      if (straight > most) {
        most = straight;
        through = other;
      }
    }
    if (through) coming.push({ arm, through });
  }
  const found = { crossing: false, worthy: false, main: false };
  for (let i = 0; i < coming.length; i += 1) {
    for (let j = i + 1; j < coming.length; j += 1) {
      const [a, b] = [coming[i], coming[j]];
      if (a.through === b.through) continue; // the one joins the other
      if (Math.abs(a.arm.east * b.arm.north - a.arm.north * b.arm.east) < CROSSING_SINE) continue; // one street, or a fork in it
      const streets = [a.arm, b.arm, a.through, b.through];
      if (streets.some((arm) => arm.rank === 0 && arm.way.class !== 'minor')) continue; // a driveway, a lane in a car park
      const [first, second] = [Math.min(a.arm.rank, a.through.rank), Math.min(b.arm.rank, b.through.rank)];
      if (Math.max(first, second) >= 1) found.crossing = true;
      if (Math.min(first, second) >= 1 && Math.max(first, second) >= 2) found.worthy = true;
      if (Math.min(first, second) >= 2) found.main = true;
    }
  }
  return found;
}

/**
 * The traffic signals of a network.
 *
 * network: as buildNetwork() gives it. marks: what the map says of where signals are: { points: [[x, y],
 * …] in the scene's metres, within: (x, y) => whether a place lies in the area the marks are known for },
 * or null if nothing is known. A junction has signals if a mark stands at it; or if two main roads
 * (secondary or greater) cross there on the level; or, where no marks are known, if a main road and a
 * collector do.
 *
 * Returns {
 *   junctions: [{ id, x, y, reach (metres: how far from its middle its stop lines lie), cycle (seconds),
 *     offset (seconds), approaches, marked }],
 *   approaches: [{ junction, way (its index), forward, stop (metres along the way: the stop line), x, y,
 *     east, north (the way its traffic drives, at the line), left, right (the edges of its lanes, in
 *     metres to the right of the way's middle as its traffic sees it), lanes, rank, from (seconds into
 *     the cycle at which its green begins), green (seconds) }],
 *   posts: [{ x, y, tall, arm: [x, y] or null (where its arm ends), east, north }],
 *   heads: [{ approach, x, y, z, flat (lying on its side, on an arm) }],
 *   byWay: Map of way * 2 + (1 if forward) → approach,
 *   state(approach, seconds): 'green' | 'flash' | 'yellow' | 'red',
 *   untilRed(approach, seconds): how many seconds are left until its red,
 * }
 */
export function signalsOf(network, { marks = null } = {}) {
  const ways = network.ways;
  // Every junction where three roads or more meet on the ground, and what crosses there.
  const nodes = new Map();
  for (const key of network.joins.keys()) {
    if ((network.joins.get(key)?.length ?? 0) < 3) continue;
    const arms = armsAt(network, key);
    if (arms.filter((arm) => arm.ground).length < 3) continue;
    nodes.set(key, { key, x: arms[0].x, y: arms[0].y, arms, ...streamsAt(arms), chosen: false, marked: false, group: null });
  }

  // Which of them have signals.
  const cellOf = (x, y, size) => `${Math.floor(x / size)},${Math.floor(y / size)}`;
  if (marks?.points?.length > 0) {
    const cells = new Map();
    for (const node of nodes.values()) {
      const cell = cellOf(node.x, node.y, MARK_REACH_METERS);
      if (!cells.has(cell)) cells.set(cell, []);
      cells.get(cell).push(node);
    }
    for (const [x, y] of marks.points) {
      const near = [];
      for (let dx = -1; dx <= 1; dx += 1) {
        for (let dy = -1; dy <= 1; dy += 1) {
          for (const node of cells.get(cellOf(x + dx * MARK_REACH_METERS, y + dy * MARK_REACH_METERS, MARK_REACH_METERS)) ?? []) {
            const far = Math.hypot(node.x - x, node.y - y);
            if (far <= MARK_REACH_METERS) near.push({ node, far });
          }
        }
      }
      const crossings = near.filter(({ node }) => node.crossing);
      if (crossings.length > 0) {
        for (const { node } of crossings) node.chosen = node.marked = true;
      } else {
        // (A signal where no two streams cross: where a main road ends on another. The nearest meeting of three main roads.)
        const tee = near.filter(({ node, far }) => far <= 30 && node.arms.filter((arm) => arm.ground && arm.rank >= 1).length >= 3).sort((a, b) => a.far - b.far)[0];
        if (tee) tee.node.chosen = tee.node.marked = true;
      }
    }
  }
  for (const node of nodes.values()) {
    if (node.chosen) continue;
    const known = Boolean(marks?.within?.(node.x, node.y));
    if (node.main || (node.worthy && !known)) node.chosen = true;
  }

  // Those that lie close together are one junction: the four corners where two roads with medians cross.
  const chosen = [...nodes.values()].filter((node) => node.chosen);
  const leader = (node) => {
    let top = node;
    while (top.group) top = top.group;
    return top;
  };
  const cells = new Map();
  for (const node of chosen) {
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (const other of cells.get(cellOf(node.x + dx * SAME_JUNCTION_METERS, node.y + dy * SAME_JUNCTION_METERS, SAME_JUNCTION_METERS)) ?? []) {
          if (Math.hypot(other.x - node.x, other.y - node.y) > SAME_JUNCTION_METERS) continue;
          const [a, b] = [leader(node), leader(other)];
          if (a !== b) b.group = a;
        }
      }
    }
    const cell = cellOf(node.x, node.y, SAME_JUNCTION_METERS);
    if (!cells.has(cell)) cells.set(cell, []);
    cells.get(cell).push(node);
  }
  const groups = new Map();
  for (const node of chosen) {
    const top = leader(node);
    if (!groups.has(top)) groups.set(top, { members: new Map(), marked: false });
    groups.get(top).members.set(node.key, node);
    if (node.marked) groups.get(top).marked = true;
  }
  // And so is the far side of an opening in a median: a meeting of main roads a short link away.
  const taken = new Set(chosen.map((node) => node.key));
  for (const group of groups.values()) {
    for (const node of [...group.members.values()]) {
      for (const arm of node.arms) {
        if (!arm.ground || arm.rank < 1 || arm.way.length > NEIGHBOUR_LINK_METERS) continue;
        const far = nodes.get(arm.way.ends[arm.atStart ? 1 : 0]);
        if (!far || taken.has(far.key) || far.arms.filter((other) => other.ground && other.rank >= 1).length < 3) continue;
        taken.add(far.key);
        group.members.set(far.key, far);
      }
    }
  }

  const squeeze = Math.cos(((network.origin?.lat ?? 0) * Math.PI) / 180) * 111320;
  const signals = { junctions: [], approaches: [], posts: [], heads: [], byWay: new Map(), state: signalState, untilRed };
  for (const group of groups.values()) {
    const members = group.members;
    // Its approaches: every main road that brings traffic in from outside.
    const approaches = [];
    // (Whether what comes along a way towards one of its ends has come through the junction a little way
    // back: then it is inside already, and has had its stop line. The map cuts the links between two
    // carriageways into pieces, so a link inside a junction need not run from one part of it straight to
    // the next.)
    const fromInside = (index, forward, left, hops) => {
      const way = ways[index];
      const back = way.ends[forward ? 0 : 1];
      if (members.has(back)) return true;
      if (hops === 0 || left <= way.length) return false;
      for (const join of network.joins.get(back) ?? []) {
        const feeder = ways[join.way];
        if (join.way === index || feeder.rail) continue;
        // (Traffic comes to here along it forwards if it ends here, backwards if it begins here: where it may.)
        const forwards = !join.atStart;
        if (feeder.oneway === (forwards ? -1 : 1)) continue;
        if (fromInside(join.way, forwards, left - way.length, hops - 1)) return true;
      }
      return false;
    };
    for (const node of members.values()) {
      const widest = Math.max(...node.arms.filter((arm) => arm.ground).map((arm) => Math.min(arm.way.width, 16)));
      for (const arm of node.arms) {
        if (!arm.ground || arm.rank < 1 || !arm.arrives) continue;
        if (fromInside(arm.index, !arm.atStart, INSIDE_METERS, 4)) continue; // a link inside the junction
        // The stop line: clear of the crossing road and of the zebra crossing in front of it. Where the last
        // stretch of road before the junction is too short for that, the line is on the stretch before it.
        let index = arm.index;
        let forward = !arm.atStart;
        let back = widest / 2 + 1.5 + CROSSING_DEEP_METERS + 1;
        for (let hop = 0; hop < 3 && ways[index].length < back + 2; hop += 1) {
          const way = ways[index];
          const before = (network.joins.get(way.ends[forward ? 0 : 1]) ?? []).filter((join) => join.way !== index && !ways[join.way].rail);
          if (before.length !== 1) break;
          const prior = ways[before[0].way];
          const priorForward = !before[0].atStart;
          if (prior.oneway === (priorForward ? -1 : 1) || prior.class !== way.class || !onGround(prior, priorForward ? prior.length : 0)) break;
          back -= way.length;
          index = before[0].way;
          forward = priorForward;
        }
        const way = ways[index];
        const fromEnd = Math.min(back, Math.max(way.length - 0.5, 0));
        const stop = forward ? way.length - fromEnd : fromEnd;
        const spot = pointAlong(way, stop);
        const sign = forward ? 1 : -1;
        const key = index * 2 + (forward ? 1 : 0);
        if (signals.byWay.has(key) || approaches.some((other) => other.key === key)) continue;
        approaches.push({
          key,
          junction: null,
          way: index,
          forward,
          stop,
          x: spot[0],
          y: spot[1],
          east: spot[2] * sign,
          north: spot[3] * sign,
          // (A road with traffic both ways gives each way its right-hand half.)
          left: way.oneway !== 0 ? -way.width / 2 : 0,
          right: way.width / 2,
          lanes: way.lanes,
          rank: arm.rank,
          from: 0,
          green: 0,
        });
      }
    }
    if (approaches.length < 2) continue;
    // Each side of the junction has its own green: all that comes in heading one way (a road, and the
    // service road beside it) goes together, and the sides take it in turn, round the junction. What
    // heads more than sixty degrees apart never goes together: it would cross.
    const bearing = (approach) => ((Math.atan2(approach.east, approach.north) * 180) / Math.PI + 360) % 360;
    approaches.sort((a, b) => b.rank - a.rank || b.lanes - a.lanes || bearing(a) - bearing(b));
    const greatest = approaches[0];
    const round = [...approaches].sort((a, b) => bearing(a) - bearing(b));
    // (Counted round from the widest gap between two headings, so that no side is cut in two.)
    let start = 0;
    let widest = -1;
    for (let i = 0; i < round.length; i += 1) {
      const gap = (bearing(round[i]) - bearing(round[(i - 1 + round.length) % round.length]) + 360) % 360;
      if (gap > widest) {
        widest = gap;
        start = i;
      }
    }
    const sides = [];
    for (let k = 0; k < round.length; k += 1) {
      const approach = round[(start + k) % round.length];
      const side = sides[sides.length - 1];
      if (side && (bearing(approach) - bearing(side[0]) + 360) % 360 <= SIDE_SPAN_DEGREES) side.push(approach);
      else sides.push([approach]);
    }
    if (sides.length < 2) continue; // nothing to take turns with
    // (The side of the greatest road has its green first.)
    const lead = sides.findIndex((side) => side.includes(greatest));
    const phases = sides.map((_, i) => ({ approaches: sides[(lead + i) % sides.length] }));
    let x = 0;
    let y = 0;
    for (const node of members.values()) {
      x += node.x / members.size;
      y += node.y / members.size;
    }
    const place = network.origin ? `${(network.origin.lng + x / squeeze).toFixed(4)},${(network.origin.lat + y / 111320).toFixed(4)}` : `${Math.round(x / 10)},${Math.round(y / 10)}`;
    // (How far it reaches from its middle: to the farthest of its stop lines, and of the meetings of roads inside it.)
    let reach = 0;
    for (const approach of approaches) reach = Math.max(reach, Math.hypot(approach.x - x, approach.y - y));
    for (const node of members.values()) reach = Math.max(reach, Math.hypot(node.x - x, node.y - y));
    const junction = { id: place, x, y, reach, cycle: 0, offset: 0, approaches, marked: group.marked };
    let at = 0;
    for (const phase of phases) {
      const green = Math.max(...phase.approaches.map((approach) => greenSeconds(approach.lanes, approach.rank)));
      for (const approach of phase.approaches) {
        approach.junction = junction;
        approach.from = at;
        approach.green = green;
      }
      at += green + SIGNAL_TIMES.yellow + SIGNAL_TIMES.clear;
    }
    junction.cycle = at;
    // (Each junction keeps its own time: no two change together, and one is where it was in its cycle
    // however often the streets round it are read again.)
    junction.offset = unitOf(place) * at;
    signals.junctions.push(junction);
    for (const approach of approaches) {
      signals.approaches.push(approach);
      signals.byWay.set(approach.key, approach);
      furnish(signals, approach);
    }
  }
  return signals;
}

/** What an approach's signal shows at a time: 'green', 'flash' (the green, flashing at its end), 'yellow' or 'red'. */
export function signalState(approach, seconds) {
  const { cycle, offset } = approach.junction;
  const into = ((((seconds - offset - approach.from) % cycle) + cycle) % cycle);
  if (into < approach.green - SIGNAL_TIMES.flash) return 'green';
  if (into < approach.green) return 'flash';
  if (into < approach.green + SIGNAL_TIMES.yellow) return 'yellow';
  return 'red';
}

/** How many seconds are left until an approach's signal turns red: 0 while it is red. */
export function untilRed(approach, seconds) {
  const { cycle, offset } = approach.junction;
  const into = ((((seconds - offset - approach.from) % cycle) + cycle) % cycle);
  return Math.max(approach.green + SIGNAL_TIMES.yellow - into, 0);
}

/** Which lamp of an approach's signal is lit at a time: 0 the red, 1 the yellow, 2 the green; -1 for none (the green, between two flashes). */
export function lampOf(approach, seconds) {
  const { cycle, offset } = approach.junction;
  const into = ((((seconds - offset - approach.from) % cycle) + cycle) % cycle);
  if (into < approach.green - SIGNAL_TIMES.flash) return 2;
  // (Three flashes: lit for the first half of each of its last three seconds.)
  if (into < approach.green) return (approach.green - into) % 1 > 0.5 ? 2 : -1;
  if (into < approach.green + SIGNAL_TIMES.yellow) return 1;
  return 0;
}

// ── What they look like ───────────────────────────────────────────────────

// The heads are drawn so many times life size (see above).
const LARGER = 1.7;
const LENS_RADIUS = 0.15 * LARGER;
const LENS_APART = 0.37 * LARGER;
const HEAD_HALF_WIDE = 0.22 * LARGER;
const HEAD_HALF_LONG = LENS_APART + 0.2 * LARGER;
const HEAD_HALF_DEEP = 0.14 * LARGER;
const BOARD_MARGIN = 0.2 * LARGER;
const ARM_UP_METERS = 6.6;
const POST_HEAD_UP_METERS = 3.6;
const POST_HALF = 0.13;
const POST_FROM_KERB_METERS = 0.9;
const MEDIAN_POST_FROM_METERS = 9; // a carriageway this wide has a second post, on its median
const STOP_LINE_HALF_METERS = 0.25;
const STOP_LINE_UP_METERS = 0.17;

const POST_PAINT = [152, 156, 162];
const HEAD_PAINT = [28, 30, 33];
const BOARD_PAINT = [20, 22, 24];
const LINE_PAINT = [240, 240, 236];
/** The lamps: red, yellow, green. Unlit, and lit. */
const DARK = [[74, 22, 20], [78, 64, 20], [18, 60, 36]];
export const LIT = [[255, 52, 44], [255, 198, 44], [44, 238, 124]];

/** Stand an approach's posts and hang its heads: a post by the kerb with an arm over the lanes, and on a wide carriageway one on the median. */
function furnish(signals, approach) {
  const { x, y, east, north } = approach;
  // To the right of its traffic.
  const [rx, ry] = [north, -east];
  const wide = approach.right - approach.left;
  const kerb = approach.right + POST_FROM_KERB_METERS;
  const reach = Math.min(Math.max(wide * 0.78, 3), 13.5);
  const post = { x: x + rx * kerb, y: y + ry * kerb, tall: ARM_UP_METERS + 0.4, arm: [x + rx * (kerb - reach), y + ry * (kerb - reach)], east, north };
  signals.posts.push(post);
  // On the arm: one head lying flat for every two lanes; on the post: one upright.
  const hung = approach.lanes >= 3 ? 2 : 1;
  for (let k = 0; k < hung; k += 1) {
    const out = hung === 1 ? reach * 0.72 : reach * (0.46 + 0.46 * k);
    signals.heads.push({ approach, x: x + rx * (kerb - out) - east * 0.3, y: y + ry * (kerb - out) - north * 0.3, z: ARM_UP_METERS, flat: true });
  }
  signals.heads.push({ approach, x: post.x - east * 0.35, y: post.y - north * 0.35, z: POST_HEAD_UP_METERS, flat: false });
  if (approach.left < 0 && wide >= MEDIAN_POST_FROM_METERS) {
    const median = approach.left - POST_FROM_KERB_METERS;
    const second = { x: x + rx * median, y: y + ry * median, tall: POST_HEAD_UP_METERS + HEAD_HALF_LONG + 0.2, arm: null, east, north };
    signals.posts.push(second);
    signals.heads.push({ approach, x: second.x - east * 0.35, y: second.y - north * 0.35, z: POST_HEAD_UP_METERS, flat: false });
  }
}

/** Where a lamp of a head is: [x, y, z]. which: 0 the red, 1 the yellow, 2 the green. (Upright: the red on top. Lying flat: the red on the driver's left.) */
export function lampPlace(head, which) {
  const { east, north } = head.approach;
  // (The lenses are on the face that looks at the traffic coming.)
  const [fx, fy] = [head.x - east * (HEAD_HALF_DEEP + 0.03), head.y - north * (HEAD_HALF_DEEP + 0.03)];
  if (!head.flat) return [fx, fy, head.z + (1 - which) * LENS_APART];
  return [fx + north * (which - 1) * LENS_APART, fy - east * (which - 1) * LENS_APART, head.z];
}

/** A lens: six-sided, facing the traffic that comes along (east, north). */
function lens(mesh, at, east, north, colour, radius = LENS_RADIUS) {
  mesh.room(18);
  const [rx, ry] = [north, -east];
  for (let k = 0; k < 6; k += 1) {
    const [a, b] = [(k / 6) * TAU, ((k + 1) / 6) * TAU];
    mesh.corner(at[0], at[1], at[2], colour[0], colour[1], colour[2], 1);
    mesh.corner(at[0] + rx * Math.cos(a) * radius, at[1] + ry * Math.cos(a) * radius, at[2] + Math.sin(a) * radius, colour[0], colour[1], colour[2], 1);
    mesh.corner(at[0] + rx * Math.cos(b) * radius, at[1] + ry * Math.cos(b) * radius, at[2] + Math.sin(b) * radius, colour[0], colour[1], colour[2], 1);
  }
}

/** A box whose length runs along (east, north): its four sides and its top. */
function box(mesh, x, y, east, north, halfLong, halfWide, low, high, paint, light) {
  const [rx, ry] = [north, -east];
  const at = (along, across, z) => [x + east * along + rx * across, y + north * along + ry * across, z];
  const face = (a, b, c, d, nEast, nNorth, nUp) => {
    const lit = faceLight(light, nEast, nNorth, nUp);
    mesh.face(a, b, c, d, paint[0] * lit, paint[1] * lit, paint[2] * lit, 1);
  };
  face(at(-halfLong, -halfWide, high), at(halfLong, -halfWide, high), at(halfLong, halfWide, high), at(-halfLong, halfWide, high), 0, 0, 1);
  face(at(halfLong, -halfWide, low), at(halfLong, halfWide, low), at(halfLong, halfWide, high), at(halfLong, -halfWide, high), east, north, 0);
  face(at(-halfLong, halfWide, low), at(-halfLong, -halfWide, low), at(-halfLong, -halfWide, high), at(-halfLong, halfWide, high), -east, -north, 0);
  face(at(-halfLong, halfWide, low), at(halfLong, halfWide, low), at(halfLong, halfWide, high), at(-halfLong, halfWide, high), rx, ry, 0);
  face(at(halfLong, -halfWide, low), at(-halfLong, -halfWide, low), at(-halfLong, -halfWide, high), at(halfLong, -halfWide, high), -rx, -ry, 0);
}

/**
 * Fill a mesh with the signals as they stand: the stop line across each approach, the posts and their
 * arms, the heads on their boards, every lamp unlit. (The lamp that is lit is drawn over them: see
 * drawSignalLamps().) light: as lightFrom() gives it. Returns { junctions, approaches, posts, heads }.
 */
export function drawSignals(mesh, signals, light = null) {
  mesh.clear();
  if (!signals) return { junctions: 0, approaches: 0, posts: 0, heads: 0 };
  for (const approach of signals.approaches) {
    // The stop line, across its lanes.
    const { x, y, east, north } = approach;
    const [rx, ry] = [north, -east];
    const [from, to] = [approach.left + 0.3, approach.right - 0.3];
    const at = (along, across) => [x + east * along + rx * across, y + north * along + ry * across, STOP_LINE_UP_METERS];
    mesh.face(at(-STOP_LINE_HALF_METERS, from), at(STOP_LINE_HALF_METERS, from), at(STOP_LINE_HALF_METERS, to), at(-STOP_LINE_HALF_METERS, to), LINE_PAINT[0], LINE_PAINT[1], LINE_PAINT[2], 0.92);
  }
  for (const post of signals.posts) {
    box(mesh, post.x, post.y, post.east, post.north, POST_HALF, POST_HALF, 0, post.tall, POST_PAINT, light);
    if (!post.arm) continue;
    // Its arm, out over the lanes.
    const [dx, dy] = [post.arm[0] - post.x, post.arm[1] - post.y];
    const long = Math.hypot(dx, dy) || 1;
    box(mesh, post.x + dx / 2, post.y + dy / 2, dx / long, dy / long, long / 2, 0.09, ARM_UP_METERS - 0.11, ARM_UP_METERS + 0.11, POST_PAINT, light);
  }
  for (const head of signals.heads) {
    const { east, north } = head.approach;
    const [rx, ry] = [north, -east];
    // Its box: upright, or lying flat along the arm. And the board behind it.
    const [halfAcross, halfUp] = head.flat ? [HEAD_HALF_LONG, HEAD_HALF_WIDE] : [HEAD_HALF_WIDE, HEAD_HALF_LONG];
    box(mesh, head.x, head.y, east, north, HEAD_HALF_DEEP, halfAcross, head.z - halfUp, head.z + halfUp, HEAD_PAINT, light);
    const [boardAcross, boardUp] = [halfAcross + BOARD_MARGIN, halfUp + BOARD_MARGIN];
    const board = (across, up) => [head.x + rx * across, head.y + ry * across, head.z + up];
    const shade = faceLight(light, -east, -north, 0);
    mesh.face(board(-boardAcross, -boardUp), board(boardAcross, -boardUp), board(boardAcross, boardUp), board(-boardAcross, boardUp), BOARD_PAINT[0] * shade, BOARD_PAINT[1] * shade, BOARD_PAINT[2] * shade, 1);
    for (let which = 0; which < 3; which += 1) lens(mesh, lampPlace(head, which), east, north, DARK[which]);
  }
  return { junctions: signals.junctions.length, approaches: signals.approaches.length, posts: signals.posts.length, heads: signals.heads.length };
}

/**
 * Fill a mesh with the lamps that are lit at a time, one to a head (none, while a green is between two
 * flashes), and a mesh of points of light with their shine by night. eye: where the picture is seen
 * from, [x, y, z]: a head seen from behind shows no light. Returns how many are lit and seen.
 */
export function drawSignalLamps(mesh, points, signals, seconds, { eye = null } = {}) {
  mesh.clear();
  points?.clear();
  if (!signals) return 0;
  let lit = 0;
  for (const head of signals.heads) {
    const which = lampOf(head.approach, seconds);
    if (which < 0) continue;
    const at = lampPlace(head, which);
    const { east, north } = head.approach;
    if (eye) {
      // (It looks back along its road. Seen from the side, or from behind, its lamp does not show.)
      const [dx, dy] = [eye[0] - at[0], eye[1] - at[1]];
      if (-(dx * east + dy * north) < 0.2 * Math.hypot(dx, dy)) continue;
    }
    // (A touch proud of the unlit lens it is drawn over, and a little larger: a lit lamp looks it.)
    lens(mesh, [at[0] - east * 0.03, at[1] - north * 0.03, at[2]], east, north, LIT[which], LENS_RADIUS * 1.2);
    if (points) {
      points.room(1);
      points.glow(at[0] - east * 0.06, at[1] - north * 0.06, at[2], LIT[which][0], LIT[which][1], LIT[which][2], 1);
    }
    lit += 1;
  }
  return lit;
}
