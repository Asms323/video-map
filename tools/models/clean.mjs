// node clean.mjs <in.glb> <out.glb> [radius] [floor] [axisX axisZ] [radius below the floor]
// (floor: a height below which everything goes; or, with a radius below the floor, below which only what is within that radius stays.)
// Keep what belongs to the thing itself: the triangles within a distance of its upright middle line (and above a
// height, if one is given); what floats beside it is dropped. Then stand it on the ground with its middle line at 0.
import { keepTriangles, pieces, readGlb, writeGlb } from './glb.mjs';

const [source, out, radiusText, floorText, axisX, axisZ, skirtText] = process.argv.slice(2);
const skirt = skirtText === undefined ? null : Number(skirtText);
let mesh = readGlb(source);
const { of, list } = pieces(mesh);
const main = list.reduce((best, piece, n) => (piece.area > list[best].area ? n : best), 0);
const { positions, indices } = mesh;
let axis;
if (axisX === 'box') axis = [(list[main].min[0] + list[main].max[0]) / 2, (list[main].min[2] + list[main].max[2]) / 2]; // the middle of its box
else if (axisX === 'crown') {
  // The middle of the box its highest part lies in (what is above 85% of its height): for a thing with a flat head.
  const from = list[main].min[1] + (list[main].max[1] - list[main].min[1]) * 0.85;
  const box = [Infinity, -Infinity, Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    if (positions[i + 1] < from) continue;
    box[0] = Math.min(box[0], positions[i]);
    box[1] = Math.max(box[1], positions[i]);
    box[2] = Math.min(box[2], positions[i + 2]);
    box[3] = Math.max(box[3], positions[i + 2]);
  }
  axis = [(box[0] + box[1]) / 2, (box[2] + box[3]) / 2];
}
else if (axisX !== undefined && axisX !== 'auto') axis = [Number(axisX), Number(axisZ)];
else {
  const corners = new Set();
  for (let t = 0; t < indices.length; t += 3) if (of[t / 3] === main) for (let k = 0; k < 3; k += 1) corners.add(indices[t + k]);
  const sorted = [...corners].sort((a, b) => positions[b * 3 + 1] - positions[a * 3 + 1]);
  const top = sorted.slice(0, Math.max(Math.round(sorted.length * 0.005), 5));
  axis = [top.reduce((sum, i) => sum + positions[i * 3], 0) / top.length, top.reduce((sum, i) => sum + positions[i * 3 + 2], 0) / top.length];
}
const radius = Number(radiusText ?? 9);
const floor = floorText === undefined || floorText === 'none' ? -Infinity : Number(floorText);
const smallest = Math.max(list[main].triangles * 0.002, 12);
mesh = keepTriangles(mesh, (t) => {
  if (list[of[t]].triangles < smallest) return false; // specks
  for (let k = 0; k < 3; k += 1) {
    const i = indices[t * 3 + k];
    const far = Math.max(Math.abs(positions[i * 3] - axis[0]), Math.abs(positions[i * 3 + 2] - axis[1]));
    if (Math.hypot(positions[i * 3] - axis[0], positions[i * 3 + 2] - axis[1]) > radius) return false;
    if (positions[i * 3 + 1] < floor && (skirt === null || far > skirt)) return false;
  }
  return true;
});
// (What the cut left hanging loose goes too.)
const after = pieces(mesh);
const kept = after.list.reduce((best, piece, n) => (piece.area > after.list[best].area ? n : best), 0);
mesh = keepTriangles(mesh, (t) => after.list[after.of[t]].area > after.list[kept].area * 0.01);
let low = Infinity;
let high = -Infinity;
for (let i = 1; i < mesh.positions.length; i += 3) {
  low = Math.min(low, mesh.positions[i]);
  high = Math.max(high, mesh.positions[i]);
}
for (let i = 0; i < mesh.positions.length; i += 3) {
  mesh.positions[i] -= axis[0];
  mesh.positions[i + 1] -= low;
  mesh.positions[i + 2] -= axis[1];
}
writeGlb(out, mesh);
console.log(out, mesh.indices.length / 3, 'triangles,', mesh.positions.length / 3, 'corners; axis', axis.map((v) => v.toFixed(3)).join(' '), 'tall', (high - low).toFixed(3));
