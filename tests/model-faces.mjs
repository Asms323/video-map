// For the tests of the models: a mesh read back as triangles.

import { OWN_NUMBERS, STUFFS } from '../js/models.js';

/** The triangles of a mesh, each with all that was put down for it. */
export function facesOf(mesh) {
  const faces = [];
  for (let n = 0; n < mesh.count; n += 3) {
    const corner = (k) => Array.from(mesh.positions.subarray((n + k) * 3, (n + k) * 3 + 3));
    const style = mesh.tints[n * 4 + 3];
    faces.push({
      corners: [corner(0), corner(1), corner(2)],
      normal: Array.from(mesh.normals.subarray(n * 4, n * 4 + 3)),
      normals: [0, 1, 2].map((k) => Array.from(mesh.normals.subarray((n + k) * 4, (n + k) * 4 + 3))),
      mirror: mesh.normals[n * 4 + 3],
      floors: mesh.edges[n * 4 + 3],
      along: [0, 1, 2].map((k) => mesh.surfaces[(n + k) * 4]),
      up: [0, 1, 2].map((k) => mesh.surfaces[(n + k) * 4 + 1]),
      storey: mesh.surfaces[n * 4 + 2],
      bay: mesh.surfaces[n * 4 + 3],
      edges: [0, 1, 2].map((k) => Array.from(mesh.edges.subarray((n + k) * 4, (n + k) * 4 + 3))),
      colour: `#${[0, 1, 2].map((k) => mesh.tints[n * 4 + k].toString(16).padStart(2, '0')).join('')}`,
      kind: STUFFS[Math.floor(style / OWN_NUMBERS)],
      own: style % OWN_NUMBERS,
      light: `#${[0, 1, 2].map((k) => mesh.lights[n * 4 + k].toString(16).padStart(2, '0')).join('')}`,
      glow: mesh.lights[n * 4 + 3] / 255,
      lit: mesh.more[n * 4] / 255,
      fins: mesh.more[n * 4 + 1] / 255,
      ridge: mesh.more[n * 4 + 2] / 255,
      open: Math.round(mesh.more[n * 4 + 3] / 85) % 2 === 1,
      changing: Math.round(mesh.more[n * 4 + 3] / 85) >= 2,
    });
  }
  return faces;
}
