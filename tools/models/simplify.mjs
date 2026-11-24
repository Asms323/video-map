// node simplify.mjs <in.glb> <out.glb> <triangles wanted>
// Fewer triangles for the same shape (meshoptimizer): the corners stay where they are, so the picture still fits.
import { MeshoptSimplifier } from 'meshoptimizer';
import { keepTriangles, readGlb, writeGlb } from './glb.mjs';

const [source, out, wanted] = process.argv.slice(2);
await MeshoptSimplifier.ready;
const mesh = readGlb(source);
const target = Math.min(Number(wanted) * 3, mesh.indices.length);
const [indices, error] = MeshoptSimplifier.simplify(mesh.indices, mesh.positions, 3, target - (target % 3), 0.02, []);
const slim = keepTriangles({ ...mesh, indices: Uint32Array.from(indices) }, () => true);
writeGlb(out, slim);
console.log(out, slim.indices.length / 3, 'triangles,', slim.positions.length / 3, 'corners; error', error.toFixed(5));
