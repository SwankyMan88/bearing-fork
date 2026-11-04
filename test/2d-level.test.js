// 2D level geometry: tilemaps, chains and compounds.
// Run: node test/2d-level.test.js

import assert from 'node:assert/strict';
import { World2D } from '../src/2d/bearing2d.js';
import { suite, test } from './test.js';

suite('2d level');

const DT = 1 / 60, T = 16;
const near = (a, b, tolerance, what = '') => assert.ok(Math.abs(a - b) <= tolerance, `${what} ${a}, expected ${b}`);
const steps = (world, n) => { for (let i = 0; i < n; i++) world.step(DT); };

/** A map solid from row `ground` down, with solid columns at both ends. */
function level(world, columns = 200, rows = 60, ground = 30) {
  const tiles = new Uint32Array(columns * rows);
  for (let r = ground; r < rows; r++) tiles.fill(1, r * columns, (r + 1) * columns);
  for (let r = 0; r < rows; r++) { tiles[r * columns] = 1; tiles[r * columns + columns - 1] = 1; }
  return world.addBody({ shape: 'tilemap', tileSize: [T, T], columns, rows, tiles });
}

test('a body slides over a hundred tile seams and catches on none of them', () => {
  const shapes = [{ size: [30, 20] }, { shape: 'circle', radius: 10 }, { shape: 'capsule', radius: 6, height: 28, angle: Math.PI / 2 }, { shape: 'polygon', vertices: [-15, -8, 15, -8, 15, 8, -15, 8] }];
  for (const shape of shapes) {
    const world = new World2D();
    level(world);
    const body = world.addBody({ ...shape, position: [100, 480 - (shape.radius && !shape.height ? 10 : shape.height ? 6 : shape.size ? 10 : 8)], friction: 0, velocity: [800, 0] });
    steps(world, 20);
    let bump = 0, turn = 0;
    const angle = body.angle;
    for (let i = 0; i < 100; i++) {
      world.step(DT);
      bump = Math.max(bump, Math.abs(body.velocity[1]));
      if (shape.shape !== 'circle') turn = Math.max(turn, Math.abs(body.angle - angle));
    }
    assert.ok(body.position[0] > 100 + 100 * T, `${shape.shape ?? 'box'} went ${body.position[0]}`);
    near(body.velocity[0], 800, 1e-6, `${shape.shape ?? 'box'} speed`);
    assert.ok(bump < 1e-3, `${shape.shape ?? 'box'} bumped at ${bump} px/s`);
    assert.ok(turn < 1e-6, `${shape.shape ?? 'box'} tipped ${turn} rad`);
  }
});

test('a map holds up what rests on it, and friction on it is friction', () => {
  const world = new World2D();
  level(world);
  const box = world.addBody({ size: [30, 30], position: [320, 465], velocity: [300, 0] });
  steps(world, 300);
  near(box.position[1], 465, 0.05, 'rest');
  near(box.position[0], 320 + 300 * 300 / (2 * 0.5 * 980), 3, 'stopped at v²/2μg');
  assert.ok(box.asleep);
});

test('tiles stop what is thrown at them, from every side, however fast', () => {
  const world = new World2D({ gravity: [0, 0] });
  const columns = 40, rows = 40, tiles = new Uint32Array(columns * rows);
  for (let r = 18; r < 22; r++) for (let c = 18; c < 22; c++) tiles[r * columns + c] = 1;   // a 64 px block at 288..352
  world.addBody({ shape: 'tilemap', tileSize: [T, T], columns, rows, tiles });
  const thrown = [[[320, 40], [0, 4000]], [[320, 600], [0, -4000]], [[40, 320], [4000, 0]], [[600, 320], [-4000, 0]]];
  for (const [position, velocity] of thrown) {
    const shard = world.addBody({ shape: 'polygon', vertices: [-2, -2, 2, -2, 0, 3], position, velocity });
    steps(world, 40);
    const [x, y] = shard.position;
    assert.ok(x < 286.1 || x > 353.9 || y < 286.1 || y > 353.9, `a shard got into the block at ${x}, ${y}`);
    world.remove(shard);
  }
});

test('mining under a sleeping body wakes it and it drops; a tile laid under one holds it', () => {
  const world = new World2D();
  const map = level(world);
  const box = world.addBody({ size: [14, 14], position: [168, 473] });
  for (let i = 0; i < 180 && !box.asleep; i++) world.step(DT);
  assert.ok(box.asleep, 'it never slept');
  assert.equal(world.tileAt(map, 10, 30), 1);
  world.setTile(map, 10, 30, 0);
  assert.equal(world.tileAt(map, 10, 30), 0);
  assert.equal(box.asleep, false, 'mining left it asleep');
  steps(world, 60);
  near(box.position[1], 489, 0.1, 'in the hole');
  // A body far from the cell sleeps on.
  const far = world.addBody({ size: [14, 14], position: [1000, 473] });
  for (let i = 0; i < 180 && !far.asleep; i++) world.step(DT);
  world.setTile(map, 30, 30, 0);
  assert.equal(far.asleep, true, 'a body far off was woken');
  world.setTile(map, 30, 30, 5);
  assert.equal(world.tileAt(map, 30, 30), 5);
});

test('a map costs what is near a body, not its size: 20 million tiles step like 100', () => {
  const time = (columns, rows) => {
    const world = new World2D({ sleeping: false });
    const tiles = new Uint32Array(columns * rows);
    for (let r = 20; r < rows; r++) tiles.fill(1, r * columns, (r + 1) * columns);
    world.addBody({ shape: 'tilemap', tileSize: [T, T], columns, rows, tiles });
    for (let k = 0; k < 20; k++) world.addBody({ size: [10, 10], position: [100 + k * 12, 300] });
    steps(world, 60);
    const start = performance.now();
    steps(world, 200);
    return performance.now() - start;
  };
  time(10, 40);
  const small = time(100, 40), big = time(8400, 2400);
  assert.ok(big < small * 4 + 5, `${small} ms on 100 by 40, ${big} on 8400 by 2400`);
});

test('a body pressed past a floor line is pushed back out the way it came', () => {
  const world = new World2D();
  level(world);
  const shard = world.addBody({ size: [8, 8], position: [320, 483] });   // its centre 3 px under the floor line
  steps(world, 120);
  near(shard.position[1], 476, 0.1, 'back on the floor');
});

test('off the end of a map is empty, as a tilemap draws', () => {
  const world = new World2D();
  world.addBody({ shape: 'tilemap', tileSize: [T, T], columns: 4, rows: 1, tiles: [1, 1, 1, 1] });
  const off = world.addBody({ size: [8, 8], position: [100, -20] });
  const on = world.addBody({ size: [8, 8], position: [30, -20] });
  steps(world, 120);
  assert.ok(off.position[1] > 100);
  near(on.position[1], -4, 0.1);
});

test('a compound rests as its shape does, turned onto its long side, on tiles and on bodies', () => {
  const world = new World2D();
  level(world);
  const ell = world.addBody({ shape: 'compound', position: [300, 400], parts: [{ size: [24, 8], position: [12, 4] }, { size: [8, 16], position: [4, 16] }], angle: 0.5 });
  const other = world.addBody({ shape: 'compound', position: [500, 400], parts: [{ size: [24, 8], position: [12, 4] }, { shape: 'circle', radius: 6, position: [18, 12] }], angle: 2 });
  steps(world, 300);
  for (const b of [ell, other]) {
    assert.ok(b.worldCenterOfMass[1] < 480 && b.worldCenterOfMass[1] > 455, `at ${b.worldCenterOfMass}`);
    near(Math.hypot(...b.velocity), 0, 1e-3, 'still');
  }
  // Two compounds and a box stacked: parts touch parts.
  const pile = new World2D();
  level(pile);
  const low = pile.addBody({ shape: 'compound', position: [300, 440], parts: [{ size: [40, 10], position: [0, 15] }, { size: [10, 30], position: [-15, 0] }, { size: [10, 30], position: [15, 0] }] });
  const lid = pile.addBody({ size: [20, 6], position: [300, 400] });
  steps(pile, 200);
  // It fell in between the walls of the U, onto its floor.
  near(lid.position[0], 300, 1, 'x');
  assert.ok(lid.position[1] > low.worldCenterOfMass[1] - 25 && lid.position[1] < 480, `the lid at ${lid.position[1]}`);
  assert.ok(lid.position[1] > 440, `the lid rests on the U's floor, not its rim: ${lid.position[1]}`);
});

test('a chain is one-sided, holds what lands on its front, and its joints catch nothing', () => {
  // Flat, and cut into a hundred lines: not one seam.
  const flat = new World2D();
  const points = [];
  for (let k = 0; k <= 100; k++) points.push(k * 20 - 100, 0);
  flat.addBody({ shape: 'chain', vertices: points });
  const box = flat.addBody({ size: [30, 20], position: [0, -10], friction: 0, velocity: [800, 0] });
  let bump = 0;
  for (let i = 0; i < 100; i++) { flat.step(DT); bump = Math.max(bump, Math.abs(box.velocity[1])); }
  assert.ok(box.position[0] > 1000 && bump < 0.1, `went ${box.position[0]}, bumped ${bump}`);
  // Drawn left to right it faces up; a body rising from under it passes.
  const one = new World2D();
  one.addBody({ shape: 'chain', vertices: [-200, 0, 200, 0] });
  const riser = one.addBody({ size: [10, 10], position: [0, 40], velocity: [0, -900], gravityScale: 0 });
  const faller = one.addBody({ size: [10, 10], position: [60, -40] });
  steps(one, 60);
  assert.ok(riser.position[1] < -100, `it stopped at ${riser.position[1]}`);
  near(faller.position[1], -5, 0.1, 'landed on its front');
  // A valley holds a ball; over a ridge a ball rolls on.
  const hills = new World2D();
  hills.addBody({ shape: 'chain', vertices: [-300, -100, 0, 0, 300, -100] });
  const ball = hills.addBody({ shape: 'circle', radius: 10, position: [-200, -60], friction: 0.5 });
  steps(hills, 900);
  near(ball.position[0], 0, 2, 'in the valley');
  const ridge = new World2D();
  ridge.addBody({ shape: 'chain', vertices: [-400, 100, 0, 0, 400, 100] });
  const roller = ridge.addBody({ shape: 'circle', radius: 10, position: [-300, 55], velocity: [420, 0], friction: 0 });
  steps(ridge, 90);
  assert.ok(roller.position[0] > 50, `it stopped short of the ridge at ${roller.position[0]}`);
  assert.ok(roller.position[1] < 120, 'through the chain');
});

test('a cast beside a wall one tile thick is not stopped by the far side of the wall', () => {
  // The cast's reach takes in the wall's far line, whose closed side it stands on.
  const world = new World2D();
  const tiles = new Uint32Array(40 * 40);
  for (let r = 0; r < 40; r++) tiles[r * 40 + 20] = 1;
  world.addBody({ shape: 'tilemap', tileSize: [16, 16], columns: 40, rows: 40, tiles });
  assert.equal(world.shapeCast({ shape: 'capsule', radius: 7, height: 44 }, [313, 320], [0, -1], { maxDistance: 60 }), null);
});

test('a thousand shards rained on a map land and stay on it, and sleep', () => {
  const world = new World2D();
  level(world, 300);
  const shards = [];
  for (let i = 0; i < 1000; i++) {
    const o = { position: [1000 + (i % 40) * 12, 300 - Math.floor(i / 40) * 12], angle: i * 0.37 };
    shards.push(world.addBody(i % 2 ? { ...o, shape: 'polygon', vertices: [0, 0, 8, 1, 6, 7, 1, 5] } : { ...o, shape: 'compound', parts: [{ size: [8, 3], position: [4, 1.5] }, { size: [3, 6], position: [1.5, 6] }] }));
  }
  steps(world, 900);
  for (const s of shards) assert.ok(s.worldCenterOfMass[1] < 481, `a shard sank to ${s.worldCenterOfMass}`);
  let awake = shards.filter((s) => !s.asleep).length;
  for (let i = 0; i < 1800 && awake > 0; i++) { world.step(DT); if (i % 60 === 0) awake = shards.filter((s) => !s.asleep).length; }
  assert.equal(awake, 0, `${awake} of 1,000 still awake after 45 s`);
});
