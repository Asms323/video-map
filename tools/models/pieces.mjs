// node pieces.mjs <file.glb>: the pieces the mesh falls into, largest first.
import { pieces, readGlb } from './glb.mjs';

const mesh = readGlb(process.argv[2]);
const { list } = pieces(mesh);
const sorted = list.map((piece, n) => ({ n, ...piece })).sort((a, b) => b.area - a.area);
console.log(list.length, 'pieces;', mesh.indices.length / 3, 'triangles');
for (const piece of sorted.slice(0, 25)) console.log(String(piece.n).padStart(4), String(piece.triangles).padStart(6), 'tri  area', piece.area.toFixed(4), ' x', piece.min[0].toFixed(2), piece.max[0].toFixed(2), ' y', piece.min[1].toFixed(2), piece.max[1].toFixed(2), ' z', piece.min[2].toFixed(2), piece.max[2].toFixed(2));
