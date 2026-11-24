// node slices.mjs <file.glb>: across its length (x), how tall it is and how deep (z), slice by slice.
import { readGlb } from './glb.mjs';

const { positions } = readGlb(process.argv[2]);
let min = Infinity;
let max = -Infinity;
for (let i = 0; i < positions.length; i += 3) {
  min = Math.min(min, positions[i]);
  max = Math.max(max, positions[i]);
}
const bins = 25;
const rows = Array.from({ length: bins }, () => ({ top: 0, z0: Infinity, z1: -Infinity, n: 0 }));
for (let i = 0; i < positions.length; i += 3) {
  const bin = Math.min(Math.floor(((positions[i] - min) / (max - min)) * bins), bins - 1);
  const row = rows[bin];
  row.top = Math.max(row.top, positions[i + 1]);
  row.z0 = Math.min(row.z0, positions[i + 2]);
  row.z1 = Math.max(row.z1, positions[i + 2]);
  row.n += 1;
}
rows.forEach((row, bin) => console.log('x', (min + ((bin + 0.5) / bins) * (max - min)).toFixed(3), 'top', row.top.toFixed(3), 'z', row.z0.toFixed(3), row.z1.toFixed(3), 'n', row.n));
