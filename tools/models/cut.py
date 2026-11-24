#!/usr/bin/env python3
"""Cut a piece off a model: cut.py <in.glb> <out.glb> <x from> <x until>

Keeps the triangles that lie wholly between the two places along its length (x), and closes each cut end with
a flat wall in the colour the model has there. For a plain GLB of one mesh with one picture (see glb.mjs).
"""
import io
import json
import struct
import sys

import numpy as np
from PIL import Image


def read(path):
    data = open(path, 'rb').read()
    length = struct.unpack_from('<I', data, 12)[0]
    doc = json.loads(data[20:20 + length])
    start = 20 + length + 8

    def view(index):
        one = doc['bufferViews'][index]
        offset = start + one.get('byteOffset', 0)
        return data[offset:offset + one['byteLength']]

    def accessor(index, kind, size):
        one = doc['accessors'][index]
        return np.frombuffer(view(one['bufferView']), dtype=kind, count=one['count'] * size, offset=one.get('byteOffset', 0)).reshape(-1, size).copy()

    primitive = doc['meshes'][0]['primitives'][0]
    positions = accessor(primitive['attributes']['POSITION'], np.float32, 3)
    uvs = accessor(primitive['attributes']['TEXCOORD_0'], np.float32, 2)
    kind = {5125: np.uint32, 5123: np.uint16, 5121: np.uint8}[doc['accessors'][primitive['indices']]['componentType']]
    indices = accessor(primitive['indices'], kind, 1).reshape(-1, 3).astype(np.uint32)
    image = doc['images'][0]
    return positions, uvs, indices, bytes(view(image['bufferView'])), image['mimeType']


def write(path, positions, uvs, indices, image, mime):
    def pad(blob):
        return blob + b'\0' * ((4 - len(blob) % 4) % 4)

    parts = [pad(indices.astype(np.uint32).tobytes()), pad(positions.astype(np.float32).tobytes()), pad(uvs.astype(np.float32).tobytes()), pad(image)]
    views = []
    offset = 0
    for part in parts:
        views.append({'buffer': 0, 'byteOffset': offset, 'byteLength': len(part)})
        offset += len(part)
    doc = {
        'asset': {'version': '2.0', 'generator': 'cut.py'},
        'scene': 0,
        'scenes': [{'nodes': [0]}],
        'nodes': [{'mesh': 0}],
        'meshes': [{'primitives': [{'attributes': {'POSITION': 1, 'TEXCOORD_0': 2}, 'indices': 0, 'mode': 4, 'material': 0}]}],
        'materials': [{'pbrMetallicRoughness': {'baseColorTexture': {'index': 0}, 'roughnessFactor': 1, 'metallicFactor': 0}, 'doubleSided': True}],
        'textures': [{'source': 0}],
        'images': [{'bufferView': 3, 'mimeType': mime}],
        'accessors': [
            {'bufferView': 0, 'componentType': 5125, 'count': int(indices.size), 'type': 'SCALAR'},
            {'bufferView': 1, 'componentType': 5126, 'count': len(positions), 'type': 'VEC3', 'min': positions.min(axis=0).tolist(), 'max': positions.max(axis=0).tolist()},
            {'bufferView': 2, 'componentType': 5126, 'count': len(uvs), 'type': 'VEC2'},
        ],
        'bufferViews': views,
        'buffers': [{'byteLength': offset}],
    }
    text = json.dumps(doc).encode()
    text += b' ' * ((4 - len(text) % 4) % 4)
    blob = b''.join(parts)
    out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(text) + 8 + len(blob)) + struct.pack('<II', len(text), 0x4E4F534A) + text + struct.pack('<II', len(blob), 0x004E4942) + blob
    open(path, 'wb').write(out)


def clip(triangles, at, keep_above):
    """Cut triangles (each three corners of [x, y, z, u, v]) at x = at; keep the side told. Returns the kept triangles and the corners made on the cut."""
    kept = []
    made = []
    for triangle in triangles:
        inside = [(corner[0] >= at) == keep_above or corner[0] == at for corner in triangle]
        if all(inside):
            kept.append(triangle)
            continue
        if not any(inside):
            continue
        shape = []
        for i in range(3):
            here, there = triangle[i], triangle[(i + 1) % 3]
            if inside[i]:
                shape.append(here)
            if inside[i] != inside[(i + 1) % 3]:
                t = (at - here[0]) / (there[0] - here[0])
                crossing = here + (there - here) * t
                crossing[0] = at
                shape.append(crossing)
                made.append(crossing)
        for i in range(1, len(shape) - 1):
            kept.append(np.array([shape[0], shape[i], shape[i + 1]]))
    return kept, made


def main(source, out, low, high):
    positions, uvs, indices, image, mime = read(source)
    picture = np.asarray(Image.open(io.BytesIO(image)).convert('RGB')).astype(np.float32)
    corners = np.hstack([positions, uvs]).astype(np.float64)
    triangles = [corners[triangle] for triangle in indices]
    for at, keep_above, wanted in ((low, True, low > -1e8), (high, False, high < 1e8)):
        if not wanted:
            continue
        triangles, made = clip(triangles, at, keep_above)
        if len(made) < 6:
            continue
        # The wall that closes the end: a fan over the outline the cut left, in the colour most of the model has there.
        made = np.array(made)
        spots = made[:, 3:5]
        texels = picture[np.clip((spots[:, 1] * (picture.shape[0] - 1)).astype(int), 0, picture.shape[0] - 1), np.clip((spots[:, 0] * (picture.shape[1] - 1)).astype(int), 0, picture.shape[1] - 1)]
        chosen = spots[np.argsort(texels.sum(axis=1))[int(len(texels) * 0.7)]]  # a wall's colour, not a window's
        middle = np.array([at, (made[:, 1].min() + made[:, 1].max()) / 2, (made[:, 2].min() + made[:, 2].max()) / 2])
        order = np.argsort(np.arctan2(made[:, 2] - middle[2], made[:, 1] - middle[1]))
        ring = made[order]
        hub = np.concatenate([middle, chosen])
        for i in range(len(ring)):
            a = np.concatenate([ring[i][:3], chosen])
            b = np.concatenate([ring[(i + 1) % len(ring)][:3], chosen])
            if np.linalg.norm(a[:3] - b[:3]) > 1e-9:
                triangles.append(np.array([hub, a, b]))
        print(f'closed the end at x = {at:.3f}: {len(ring)} corners round it, y {made[:, 1].min():.3f} to {made[:, 1].max():.3f}, z {made[:, 2].min():.3f} to {made[:, 2].max():.3f}')
    flat = np.array(triangles).reshape(-1, 5)
    # (Corners that are the same in place and on the picture are written once.)
    unique, inverse = np.unique(np.round(flat, 6), axis=0, return_inverse=True)
    write(out, unique[:, :3].astype(np.float32), unique[:, 3:5].astype(np.float32), inverse.reshape(-1, 3).astype(np.uint32), image, mime)
    print(out, len(triangles), 'triangles,', len(unique), 'corners')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], float(sys.argv[3]), float(sys.argv[4]))
