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
import { World2D } from '../src/2d/bearing2d.js';

suite('determinism');

const HASH = '8ba8e0f14c1a6cd6586f8476c1112a01c296555bcee6d122b013aff6e67bff5f';
const HASH_2D = '9f78f80605d08cc77f303c3e6074c06cf7f7b3af24d6dd5462a25ca1c5fae441';

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

test('a 2D world steps to its stored bits', () => {
  // Every shape, spun, pushed, damped, locked and driven, placed through the
  // calls that take an angle, so Bearing's own sine and cosine are in the hash.
  const world = new World2D();
  const tiles = new Uint32Array(70 * 40);
  for (let r = 0; r < 40; r++) { tiles[r * 70] = 1; tiles[r * 70 + 69] = 1; if (r % 3 === 0) tiles[r * 70 + 2 * r] = 1; }
  tiles.fill(1, 70 * 36);
  const map = world.addBody({ shape: 'tilemap', tileSize: [16, 16], columns: 70, rows: 40, tiles, position: [-560, -300] });
  world.addBody({ shape: 'chain', vertices: [-500, 280, -200, 240, 0, 270, 300, 230, 500, 280] });
  const bodies = [];
  for (let k = 0; k < 40; k++) {
    if (k === 20) world.addBody({ type: 'static', size: [120, 200], position: [0, 100], sensor: true });
    const common = { position: [k * 37.5 - 400, -k * 11.25], angle: k * 0.7, restitution: k % 4 === 0 ? 0.6 : 0, velocity: [k - 20, -3 * k], angularVelocity: 0.3 * k - 6, damping: k % 3 === 0 ? 0.2 : 0, angularDamping: k % 5 === 0 ? 0.1 : 0, lockPosition: [k % 7 === 0, false] };
    const shape = k % 5;
    bodies.push(world.addBody(
      shape === 0 ? { ...common, size: [20 + k, 10] }
        : shape === 1 ? { ...common, shape: 'circle', radius: 6 + k * 0.25 }
          : shape === 2 ? { ...common, shape: 'capsule', radius: 5, height: 30 }
            : shape === 3 ? { ...common, shape: 'polygon', vertices: [0, 0, 16, 2, 11, 13, 3, 9] }
              : { ...common, shape: 'compound', parts: [{ size: [12, 4], position: [6, 2], angle: 0.4 }, { shape: 'circle', radius: 3, position: [2, 8], density: 0.4 }] },
    ));
  }
  const lift = world.addBody({ type: 'kinematic', size: [80, 8] });
  const hero = world.addBody({ type: 'character', shape: 'capsule', radius: 7, height: 44, position: [-300, -100], stepHeight: 16, pushForce: 3000 });
  const hash = createHash('sha256');
  const bytes = (a) => hash.update(new Uint8Array(a.buffer, a.byteOffset, a.byteLength));
  for (let n = 1; n <= 600; n++) {
    bodies[n % 40].applyForce([300, -200], [n, n]);
    if (n % 7 === 0) bodies[n % 40].applyTorque(900);
    if (n % 50 === 0) bodies[n % 40].setAngle(n * 0.123);
    if (n % 90 === 0) world.setTile(map, 10 + n / 90, 36, 0);
    lift.moveTo([n * 0.5, n * 0.25], n * 0.01, 1 / 60);
    hero.setVelocity(n % 200 < 120 ? 170 : -90, n % 75 === 0 ? -380 : hero.velocity[1]);
    world.step(1 / 60);
    bytes(world.transforms);
    if (n % 60 === 0) for (const column of [world._position, world._rotation, world._angle, world._velocity, world._angular]) bytes(column);
  }
  world.destroy();
  const got = hash.digest('hex');
  assert.equal(got, HASH_2D, `the 2D bits changed: if that is meant, store ${got} as HASH_2D`);
});
