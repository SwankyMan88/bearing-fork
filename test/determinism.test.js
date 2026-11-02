// The same bits on every machine: a world of everything, stepped 10 s, hashed,
// against the hash this file stores. CI runs it on Node (V8) and on Bun
// (JavaScriptCore), so a second engine's arithmetic is held to the same bits.
// Run: node test/determinism.test.js, or bun ./test/determinism.test.js
//
// It also holds every change that claims "same bits": one that moves a single
// bit of any body fails here. A change that means to move them stores the new
// hash, which the failure prints, and says so in its commit.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { suite, test } from './test.js';
import { mixed } from './scenes.js';

suite('determinism');

const HASH = '8ba8e0f14c1a6cd6586f8476c1112a01c296555bcee6d122b013aff6e67bff5f';

test('a world of everything steps to the stored bits', () => {
  const { world } = mixed({ workers: 0 });
  // Placed through the setters that turn an angle into a rotation, so Bearing's
  // own sine and cosine are in the hash too, not only the step's.
  world.addBody({ position: [2, 6, -6] }).setEuler(0.7, -1.1, 2.3);
  world.addBody({ shape: 'capsule', position: [-2, 7, -6] }).setAxisAngle([1, 2, 3], 4.5);
  const hash = createHash('sha256');
  const bytes = (a) => hash.update(new Uint8Array(a.buffer, a.byteOffset, a.byteLength));
  for (let n = 1; n <= 600; n++) {
    world.step(1 / 60);
    bytes(world.transforms);
    // The full state, not only the float32 transforms, every second and at the end.
    if (n % 60 === 0) for (const column of [world._position, world._rotation, world._velocity, world._angular]) bytes(column);
  }
  world.destroy();
  const got = hash.digest('hex');
  assert.equal(got, HASH, `the bits changed: if that is meant, store ${got} as HASH`);
});
