// 2D queries, contact events and sensors. Run: node test/2d-query.test.js

import assert from 'node:assert/strict';
import { World2D } from '../src/2d/bearing2d.js';
import { suite, test } from './test.js';

suite('2d query');

const DT = 1 / 60, T = 16;
const near = (a, b, tolerance, what = '') => assert.ok(Math.abs(a - b) <= tolerance, `${what} ${a}, expected ${b}`);
const steps = (world, n) => { for (let i = 0; i < n; i++) world.step(DT); };

let seed = 4242;
const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const between = (a, b) => a + (b - a) * rand();

/** Whether a point is inside a body, from its options alone. */
function inside(desc, x, y) {
  const dx = x - desc.position[0], dy = y - desc.position[1], c = Math.cos(desc.angle), s = Math.sin(desc.angle);
  const lx = c * dx + s * dy, ly = c * dy - s * dx;
  if (desc.shape === 'circle') return lx * lx + ly * ly <= desc.radius * desc.radius;
  if (desc.shape === 'capsule') {
    const L = desc.height / 2 - desc.radius, q = Math.max(-L, Math.min(L, ly));
    return lx * lx + (ly - q) ** 2 <= desc.radius * desc.radius;
  }
  if (desc.shape === 'box') return Math.abs(lx) <= desc.size[0] / 2 && Math.abs(ly) <= desc.size[1] / 2;
  const v = desc.vertices;
  for (let k = 0; k < v.length; k += 2) {
    const j = (k + 2) % v.length;
    if ((v[j] - v[k]) * (ly - v[k + 1]) - (v[j + 1] - v[k + 1]) * (lx - v[k]) < 0) return false;
  }
  return true;
}

test('a ray meets every shape where marching along it first finds the inside', () => {
  const world = new World2D({ gravity: [0, 0] });
  const shapes = [{ size: [40, 24] }, { shape: 'circle', radius: 18 }, { shape: 'capsule', radius: 10, height: 50 }, { shape: 'polygon', vertices: [-15, -15, 25, -5, 10, 22, -20, 8] }];
  let hits = 0;
  for (let i = 0; i < 2000; i++) {
    const shape = shapes[i % 4];
    const body = world.addBody({ ...shape, position: [between(-20, 20), between(-20, 20)], angle: between(-3, 3) });
    const desc = world.bodyOf(body), from = [between(-120, 120), between(-120, 120)], a = Math.atan2(-from[1], -from[0]) + between(-0.5, 0.5), d = [Math.cos(a), Math.sin(a)];
    let marched = -1;
    for (let t = 0; t < 300; t += 0.05) if (inside(desc, from[0] + d[0] * t, from[1] + d[1] * t)) { marched = t; break; }
    const hit = world.raycast(from, d);
    if (marched < 0) assert.equal(hit, null, `ray ${i} hit what marching missed`);
    else if (marched > 0.1) {
      // A grazing ray can slip between marching's samples, so a hit marching missed is let be above.
      assert.ok(hit, `ray ${i} missed what marching hit at ${marched}`);
      near(hit.distance, marched, 0.06, `ray ${i}`);
      assert.equal(hit.body.id, body.id);
      assert.ok(hit.normal[0] * d[0] + hit.normal[1] * d[1] <= 1e-9, `ray ${i}'s normal points away from the ray's origin`);
      near(Math.hypot(...hit.normal), 1, 1e-9);
      hits++;
    }
    world.remove(body);
  }
  assert.ok(hits > 300, `only ${hits} hits`);
});

test('a ray starting inside hits at 0, with its normal back along it; maxDistance, mask and ignore filter', () => {
  const world = new World2D({ gravity: [0, 0] });
  const a = world.addBody({ size: [20, 20], layers: 2 }), b = world.addBody({ size: [20, 20], position: [100, 0] });
  const inside_ = world.raycast([0, 0], [1, 0]);
  assert.deepEqual([inside_.distance, inside_.normal], [0, [-1, -0]]);
  assert.equal(world.raycast([-100, 0], [1, 0]).body.id, a.id);
  assert.equal(world.raycast([-100, 0], [1, 0], { ignore: a }).body.id, b.id);
  assert.equal(world.raycast([-100, 0], [1, 0], { ignore: [a, b] }), null);
  assert.equal(world.raycast([-100, 0], [1, 0], { mask: 1 }).body.id, b.id);
  assert.equal(world.raycast([-100, 0], [1, 0], { maxDistance: 50 }), null);
  assert.deepEqual(world.raycastAll([-100, 0], [1, 0]).map((h) => h.body.id), [a.id, b.id]);
  near(world.raycast([-100, 0], [2, 0]).distance, 90, 1e-9, 'direction scaled to unit');
});

test('a ray over a tilemap stops at the first solid cell, on the side it came from, and on a chain', () => {
  const world = new World2D({ gravity: [0, 0] });
  const tiles = new Uint32Array(40 * 40);
  tiles[10 * 40 + 20] = 1;   // cell (20, 10): x 320..336, y 160..176
  const map = world.addBody({ shape: 'tilemap', tileSize: [T, T], columns: 40, rows: 40, tiles });
  const down = world.raycast([328, 10], [0, 1]);
  assert.deepEqual([down.body.id, down.distance, ...down.normal.map((x) => x + 0)], [map.id, 150, 0, -1]);
  const across = world.raycast([900, 168], [-1, 0]);
  assert.deepEqual([across.distance, ...across.normal.map((x) => x + 0)], [900 - 336, 1, 0]);
  const slant = world.raycast([200, 100], [120 + 8, 68]);
  assert.ok(slant, 'a slanted ray missed the cell');
  near(slant.point[0], 320, 1e-9, 'it enters by the left side');
  near(slant.point[1], 163.75, 1e-9);
  assert.equal(world.raycast([0, 0], [-1, 0]), null, 'away from the map');
  assert.equal(world.raycast([328, 200], [0, 1]), null);
  world.setTile(map, 20, 10, 0);
  assert.equal(world.raycast([328, 10], [0, 1]), null, 'mined');
  const other = new World2D({ gravity: [0, 0] });
  other.addBody({ shape: 'chain', vertices: [-100, 0, 100, 0] });
  const from = other.raycast([0, 50], [0, -1]), top = other.raycast([0, -50], [0, 1]);
  assert.deepEqual([from.distance, top.distance], [50, 50]);
  assert.deepEqual([...from.normal].map((x) => x + 0), [0, 1], 'from behind too, facing the ray');
});

test('a shape cast stops touching what a body would meet there, and overlap finds what a shape covers', () => {
  const world = new World2D({ gravity: [0, 0] });
  const wall = world.addBody({ type: 'static', size: [20, 400], position: [100, 0] });
  const hit = world.shapeCast({ size: [20, 20] }, [0, 0], [1, 0]);
  assert.equal(hit.body.id, wall.id);
  near(hit.distance, 80, 0.2, 'box');
  assert.deepEqual(hit.normal.map(Math.round).map((x) => x + 0), [-1, 0]);
  near(world.shapeCast({ shape: 'circle', radius: 10 }, [0, 30], [1, 0]).distance, 80, 0.2, 'circle');
  near(world.shapeCast({ shape: 'capsule', radius: 5, height: 40 }, [0, 0], [1, 0], { angle: Math.PI / 2 }).distance, 70, 0.2, 'capsule on its side');
  near(world.shapeCast({ size: [20, 20] }, [0, 0], [3, 3]).distance, Math.SQRT2 * 80, 0.3, 'at a slant');
  assert.equal(world.shapeCast({ size: [20, 20] }, [0, 0], [-1, 0]), null);
  assert.equal(world.shapeCast({ size: [20, 20] }, [0, 0], [1, 0], { maxDistance: 50 }), null);
  assert.equal(world.shapeCast({ size: [20, 20] }, [0, 0], [1, 0], { ignore: wall }), null);
  assert.deepEqual(world.overlap({ size: [20, 20] }, [95, 0]).map((b) => b.id), [wall.id]);
  assert.deepEqual(world.overlap({ size: [20, 20] }, [50, 0]), []);
  // Into a tilemap's floor from above, across seams.
  const tiled = new World2D({ gravity: [0, 0] });
  const tiles = new Uint32Array(40 * 40);
  tiles.fill(1, 40 * 20);
  tiled.addBody({ shape: 'tilemap', tileSize: [T, T], columns: 40, rows: 40, tiles });
  near(tiled.shapeCast({ size: [30, 10] }, [300, 100], [0, 1]).distance, 320 - 105, 0.2, 'onto tiles');
  assert.equal(tiled.overlap({ size: [10, 10] }, [300, 300]).length, 0, 'clear of the tiles');
  assert.equal(tiled.overlap({ size: [10, 10] }, [300, 318]).length, 1, 'on them');
});

test('events: begin, end, the speed it met at, a removed body ending its touches', () => {
  const world = new World2D();
  const floor = world.addBody({ type: 'static', size: [2000, 100], position: [0, 50] });
  const ball = world.addBody({ shape: 'circle', radius: 16, position: [0, -300], restitution: 0.5 });
  let begin = null, end = null;
  for (let i = 0; i < 120 && !end; i++) {
    world.step(DT);
    for (const e of world.contacts(ball)) { if (e.type === 'begin') begin ??= e; if (e.type === 'end') end = e; }
  }
  assert.equal(begin.b.id, floor.id);
  near(begin.speed, Math.sqrt(2 * 980 * 284), 30, 'speed');
  assert.deepEqual(begin.normal.map((x) => x + 0), [0, 1], 'from the ball to the floor');
  near(begin.point[1], 0, 0.5);
  assert.ok(end, 'it bounced off');
  assert.deepEqual(world.touching(ball), []);
  const crate = world.addBody({ size: [40, 40], position: [300, -20] }), lid = world.addBody({ size: [40, 40], position: [300, -60] });
  steps(world, 60);
  assert.deepEqual(world.touching(crate).map((b) => b.id).sort(), [floor.id, lid.id].sort());
  world.remove(crate);
  assert.deepEqual(world.contacts(crate), [], 'nothing until the step');
  world.step(DT);
  const ends = world.contacts(crate).map((e) => [e.type, e.a.alive, e.b.id].join());
  assert.deepEqual(ends.sort(), [`end,false,${floor.id}`, `end,false,${lid.id}`].sort());
});

test('impacts: hit again while touching, once, and pressing gives none', () => {
  const world = new World2D();
  world.addBody({ type: 'static', size: [2000, 100], position: [0, 50] });
  const low = world.addBody({ size: [40, 40], position: [0, -20] }), top = world.addBody({ size: [40, 40], position: [0, -60] });
  steps(world, 60);
  assert.deepEqual(world.contacts(), []);
  top.setVelocity(0, 300);
  world.step(DT);
  const [struck] = world.contacts(top);
  assert.equal(struck.type, 'impact');
  near(struck.speed, 300, 5);
  for (let i = 0; i < 120; i++) { world.step(DT); assert.deepEqual(world.contacts().filter((e) => e.type === 'impact'), []); }
  // On a tilemap: the floor and the wall are one body, and the wall still reports.
  const tiled = new World2D();
  const tiles = new Uint32Array(40 * 40);
  tiles.fill(1, 40 * 20);
  for (let r = 0; r < 40; r++) tiles[r * 40 + 30] = 1;
  const map = tiled.addBody({ shape: 'tilemap', tileSize: [T, T], columns: 40, rows: 40, tiles });
  const box = tiled.addBody({ size: [30, 30], position: [200, 305], friction: 0 });
  steps(tiled, 20);
  box.setVelocity(800, 0);
  const seen = [];
  for (let i = 0; i < 40; i++) { tiled.step(DT); seen.push(...tiled.contacts(box)); }
  assert.deepEqual(seen.map((e) => [e.type, e.b.id]), [['impact', map.id]]);
  near(seen[0].speed, 800, 1, 'met the wall at');
  assert.deepEqual(seen[0].normal.map((x) => x + 0), [1, 0]);
  void low;
});

test('sensors see what passes and push nothing; queries pass through them; they wake nothing', () => {
  const free = new World2D();
  const runner = free.addBody({ size: [20, 20], position: [-300, 0], velocity: [600, -200] });
  const zoned = new World2D();
  const zone = zoned.addBody({ type: 'static', size: [100, 100], sensor: true });
  const same = zoned.addBody({ size: [20, 20], position: [-300, 0], velocity: [600, -200] });
  const seen = [];
  for (let i = 0; i < 90; i++) {
    free.step(DT); zoned.step(DT);
    for (const e of zoned.contacts(zone)) seen.push(e.type);
    assert.deepEqual(same.position, runner.position, 'the sensor changed its path');
  }
  assert.deepEqual(seen, ['begin', 'end']);
  assert.equal(zoned.raycast([-200, 0], [1, 0]), null, 'a ray stopped at a sensor');
  // A sleeping pile under a sweeping sensor sleeps on, and is seen.
  const world = new World2D();
  world.addBody({ type: 'static', size: [2000, 100], position: [0, 50] });
  const box = world.addBody({ size: [40, 40], position: [0, -20] });
  for (let i = 0; i < 180 && !box.asleep; i++) world.step(DT);
  assert.ok(box.asleep);
  const sweep = world.addBody({ type: 'kinematic', size: [40, 80], position: [-200, -20], velocity: [300, 0], sensor: true });
  const entered = [];
  for (let i = 0; i < 60; i++) { world.step(DT); for (const e of world.contacts(sweep)) if (e.type === 'begin') entered.push(e.b.id); }
  assert.ok(entered.includes(box.id));
  assert.equal(box.asleep, true, 'a sensor woke it');
  assert.equal(world._sensorPasses > 0, true);
});

test('off means off: nothing changing, no events; no sensors, no sensor pass', () => {
  const world = new World2D({ sleeping: false });
  world.addBody({ type: 'static', size: [2000, 100], position: [0, 50] });
  for (let k = 0; k < 5; k++) world.addBody({ size: [40, 40], position: [0, -20 - 40 * k] });
  steps(world, 60);
  for (let i = 0; i < 120; i++) {
    world.step(DT);
    assert.equal(world._events.count, 0);
  }
  assert.equal(world._sensorPasses, 0);
});
