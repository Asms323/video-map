// Make a packed model's footprint wider or narrower for its height: node tools/models/footprint.mjs <models/name.vmm> <times>
//
// A model is as wide for its height as the picture it was made from showed the thing. A picture that reached the
// generator stretched gives a model too wide or too narrow by as much (see generate.py, which until 24 November
// 2026 sent a cut-out as it was: one that was not square was stretched to a square). This brings such a model's
// footprint back about its middle line: <times> is the cut-out's width over its height.
//
// Only the box in the file's head is rewritten: every corner is kept in it as a part of that box (see pack.mjs).
import { readFileSync, writeFileSync } from 'node:fs';

const [file, by] = process.argv.slice(2);
const times = Number(by);
if (!file || !(times > 0)) throw new Error('usage: footprint.mjs <models/name.vmm> <times>');
const data = readFileSync(file);
if (data.toString('latin1', 0, 4) !== 'VMM1') throw new Error(`${file} is not a packed model`);
// The box: least east, north, up; then most east, north, up.
const box = Array.from({ length: 6 }, (_, k) => data.readFloatLE(12 + k * 4));
for (const k of [0, 1, 3, 4]) data.writeFloatLE(box[k] * times, 12 + k * 4);
writeFileSync(file, data);
const now = Array.from({ length: 6 }, (_, k) => data.readFloatLE(12 + k * 4));
console.log(`${file}: for a height of 1 it was ${(box[3] - box[0]).toFixed(3)} by ${(box[4] - box[1]).toFixed(3)}, and is ${(now[3] - now[0]).toFixed(3)} by ${(now[4] - now[1]).toFixed(3)}`);
