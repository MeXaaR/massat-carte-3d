import { readFile, writeFile, copyFile, cp, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import * as THREE from 'three';
// The optional argument points to the original IGN processing application's public/data.
const input = resolve(process.argv[2] || '../05-Maquette-3D/public/data');
const output = resolve('public/data');
const meta = JSON.parse(await readFile(resolve(input, 'metadata.json'), 'utf8'));
const hash = createHash('sha256'); let files = 0;
for (const prefix of ['', ...meta.communes.map(c => `scopes/${c.insee}/`)]) {
  await cp(resolve(input, prefix, 'tiles/vector'), resolve(output, prefix, 'tiles/vector'), { recursive: true });
  const folder = prefix + 'details/';
  const original = JSON.parse(await readFile(resolve(input, folder, 'manifest.json'), 'utf8'));
  const manifest = JSON.parse(await readFile(resolve(output, folder, 'manifest.json'), 'utf8'));
  manifest.buildings = original.buildings;
  for (const chunk of Object.values(manifest.buildings.chunks)) {
    const buffer = await readFile(resolve(input, folder, chunk.file));
    const source = new Float32Array(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.length));
    assert.equal(source.length, chunk.vertices * 6);
    const geometry = new THREE.BufferGeometry(), interleaved = new THREE.InterleavedBuffer(source, 6);
    geometry.setAttribute('position', new THREE.InterleavedBufferAttribute(interleaved, 3, 0));
    geometry.computeVertexNormals();
    const normals = geometry.getAttribute('normal'), packed = new Float32Array(chunk.vertices * 9);
    for (let i = 0; i < chunk.vertices; i++) {
      packed.set(source.subarray(i * 6, i * 6 + 6), i * 9);
      packed.set([normals.getX(i), normals.getY(i), normals.getZ(i)], i * 9 + 6);
    }
    assert(packed.every(Number.isFinite));
    geometry.dispose();
    const result = Buffer.from(packed.buffer); hash.update(result);
    await writeFile(resolve(output, folder, chunk.file), result);
    chunk.bytes = result.length; files++;
  }
  manifest.buildings.stride = 9; manifest.buildings.bytes = manifest.buildings.vertices * 36;
  await writeFile(resolve(output, folder, 'manifest.json'), JSON.stringify(manifest));
}
await copyFile(resolve(input, 'town-centres.json'), resolve(output, 'town-centres.json'));
hash.update(await readFile(resolve(input, 'town-centres.json')));
await writeFile('data-version.json', JSON.stringify({ revision: hash.digest('hex').slice(0, 16) }, null, 2) + '\n');
await mkdir('validation', { recursive: true });
console.log({ buildingChunksConverted: files, normalsPrecomputed: true, vectorScopesUpdated: 8 });
