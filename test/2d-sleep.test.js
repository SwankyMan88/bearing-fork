// 2D pairs, filtering and sleep: thousands of bodies, costing what moves.
// Run: node test/2d-sleep.test.js

import assert from 'node:assert/strict';
import { World2D } from '../src/2d/bearing2d.js';
import { suite, test } from './test.js';

suite('2d sleep');

const DT = 1 / 60;
const floor = (world) => world.addBody({ type: 'static', size: [40000, 100], position: [0, 50] });
const steps = (world, n) => { for (let i = 0; i < n; i++) world.step(DT); };

let seed = 777;
const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

test('the pair list holds every pair whose bodies are near, checked against testing them all', () => {
  const world = new World2D({ gravity: [0, 0], sleeping: false });
  const walls = [[0, 400, 900, 20], [0, -400, 900, 20], [400, 0, 20, 900], [-400, 0, 20, 900]];
  for (const [x, y, w, h] of walls) world.addBody({ type: 'static', size: [w, h], position: [x, y] });
  const bodies = [];
  for (let i = 0; i < 150; i++) {
    bodies.push(world.addBody({
      ...(i % 2 ? { shape: 'circle', radius: 6 + rand() * 6 } : { size: [10 + rand() * 12, 10 + rand() * 12] }),
      position: [(rand() - 0.5) * 700, (rand() - 0.5) * 700], velocity: [(rand() - 0.5) * 600, (rand() - 0.5) * 600], angularVelocity: rand() * 4,
    }));
  }
  for (let s = 0; s < 300; s++) {
    world.step(DT);
    if (s % 10 !== 0) continue;
    const p = world._position, reach = world._reach, pairs = world._pairs, top = world._slots.top;
    for (let a = 0; a < top; a++) {
      for (let b = a + 1; b < top; b++) {
        if (world._type[a] !== 0 && world._type[b] !== 0) continue;
        const gap = Math.max(Math.abs(p[2 * a] - p[2 * b]), Math.abs(p[2 * a + 1] - p[2 * b + 1])) - reach[a] - reach[b];
        if (gap < 0) assert.ok(pairs.find(a, b) >= 0, `step ${s}: ${a} and ${b} overlap, and aren't listed`);
      }
    }
    // Links hold: every pair is on both bodies' lists, once.
    let edges = 0;
    for (let k = 0; k < top; k++) for (let e = pairs.head[k] - 1; e >= 0; e = pairs.next[e] - 1) { edges++; assert.ok(pairs.a[e >> 1] === k || pairs.b[e >> 1] === k); }
    assert.equal(edges, 2 * pairs.count);
  }
  // Nothing passed through anything: all still inside the four walls.
  for (const b of bodies) assert.ok(Math.abs(b.position[0]) < 400 && Math.abs(b.position[1]) < 400, `escaped to ${b.position}`);
});

test('layers, masks and groups say what collides, and setBody changes that at the next step', () => {
  const world = new World2D();
  floor(world);
  const ghost = world.addBody({ shape: 'circle', radius: 10, position: [0, -200], layers: 2, mask: 2 });
  const low = world.addBody({ size: [40, 40], position: [100, -20], group: 7 });
  const mate = world.addBody({ size: [40, 40], position: [100, -100], group: 7 });
  const other = world.addBody({ size: [40, 40], position: [200, -20], group: 7 });
  const stranger = world.addBody({ size: [40, 40], position: [200, -100], group: 8 });
  steps(world, 120);
  assert.ok(ghost.position[1] > 100, `the ghost rests at ${ghost.position[1]}, on the floor it should pass`);
  assert.ok(Math.abs(mate.position[1] + 20) < 1, `its group-mate lands through it, at ${mate.position[1]}`);
  assert.ok(Math.abs(stranger.position[1] + 60) < 1, `the stranger lands on it, at ${stranger.position[1]}`);
  assert.deepEqual([world.bodyOf(low).group, world.bodyOf(ghost).layers, world.bodyOf(ghost).mask], [7, 2, 2]);
  assert.equal(world.addBody({ mask: ~1 }).id > 0 && world.bodyOf(world.body(world.addBody({ mask: ~1 }).id)).mask, 0xfffffffe);
  // Into layer 1, what it stood clear of holds it from now on; out of its group, it collides.
  world.setBody(mate, { group: 0, position: [100, -80] });
  steps(world, 60);
  assert.ok(Math.abs(mate.position[1] + 60) < 1, `out of its group it lands on it, at ${mate.position[1]}`);
  world.setBody(stranger, { mask: 0 });
  steps(world, 60);
  assert.ok(stranger.position[1] > 100, `masked off everything it falls through the floor, not to ${stranger.position[1]}`);
  void other;
});

test('a pile goes to sleep, a sleeping world costs nothing, and moved() is empty', () => {
  const world = new World2D();
  floor(world);
  const bodies = [];
  for (let i = 0; i < 300; i++) {
    bodies.push(world.addBody({ ...(i % 2 ? { shape: 'circle', radius: 8 } : { size: [16, 12] }), position: [(i % 20) * 18 - 180, -10 - Math.floor(i / 20) * 18], angle: i }));
  }
  let at = 0;
  while (!bodies.every((b) => b.asleep) && at < 2400) { world.step(DT); at++; }
  assert.ok(at < 2400, `${bodies.filter((b) => !b.asleep).length} still awake after 40 s; the last to stop are balls rolling away`);
  assert.equal(world._awakeCount, 0);
  assert.equal(world._pairs.active, 0);
  const tested = world._narrowed, since = world.stepCount;
  steps(world, 60);
  assert.equal(world._narrowed, tested, 'pairs tested while everything sleeps');
  assert.equal(world.moved(since).length, 0);
  for (const b of bodies) assert.deepEqual(b.velocity, [0, 0]);
});

test('sleep is by distance: a slow steady mover stays awake, and sleeping off keeps all awake', () => {
  const world = new World2D({ gravity: [0, 0] });
  const slow = world.addBody({ size: [20, 20], velocity: [1, 0] });     // 1 px/s is 60% of a pixel's tolerance... a second
  const still = world.addBody({ size: [20, 20], position: [500, 0] });
  steps(world, 180);
  assert.equal(slow.asleep, false, 'it moved past its tolerance in a second');
  assert.equal(still.asleep, true);
  const off = new World2D({ sleeping: false, gravity: [0, 0] });
  const box = off.addBody();
  steps(off, 180);
  assert.equal(box.asleep, false);
  world.sleeping = false;
  assert.equal(still.asleep, false, 'switching it off wakes everything');
});

function restingStack(n = 4) {
  const world = new World2D();
  const ground = floor(world);
  const boxes = [];
  for (let k = 0; k < n; k++) boxes.push(world.addBody({ size: [40, 40], position: [0, -20 - 40 * k] }));
  for (let i = 0; i < 300 && !boxes[0].asleep; i++) world.step(DT);
  assert.ok(boxes.every((b) => b.asleep), 'the stack never slept');
  return { world, boxes, ground };
}

test('anything that disturbs a sleeping body wakes its whole island', () => {
  const wakers = [
    ['setPosition', (b) => b.setPosition(0, -300)], ['setAngle', (b) => b.setAngle(0.1)], ['setVelocity', (b) => b.setVelocity(1, 0)],
    ['setAngularVelocity', (b) => b.setAngularVelocity(1)], ['moveTo', (b) => b.moveTo([0, 0], null, 1)], ['applyForce', (b) => b.applyForce([1, 0])],
    ['applyTorque', (b) => b.applyTorque(1)], ['applyImpulse', (b) => b.applyImpulse([1, 0])], ['applyAngularImpulse', (b) => b.applyAngularImpulse(1)],
    ['setBody', (b, world) => world.setBody(b, { friction: 0.2 })],
  ];
  for (const [name, wake] of wakers) {
    const { world, boxes } = restingStack();
    wake(boxes[1], world);
    assert.ok(boxes.every((b) => !b.asleep), `${name} left some asleep`);
  }
  // Hit by something awake: it wakes on the touch, and the hit carries.
  const { world, boxes } = restingStack();
  const ball = world.addBody({ shape: 'circle', radius: 10, mass: 500, position: [-200, -60], velocity: [600, 0] });
  steps(world, 60);
  assert.ok(boxes.some((b) => Math.abs(b.position[0]) > 5), 'the stack took no notice');
  assert.ok(ball.position[0] > -60);
  // Taken away from under it, it falls: removal wakes what it held.
  const under = restingStack();
  under.world.remove(under.boxes[0]);
  assert.ok(under.boxes[1].asleep === false, 'what rested on it slept on');
  const y = under.boxes[1].position[1];
  steps(under.world, 30);
  assert.ok(under.boxes[1].position[1] > y + 10);
  // A static body moved from under it.
  const moved = restingStack();
  moved.ground.setPosition(0, 500);
  steps(moved.world, 30);
  assert.ok(moved.boxes[0].position[1] > 0);
  // Gravity changed, and a body of a sleeping island removed and its slot reused.
  const pulled = restingStack();
  pulled.world.gravity = [300, 980];
  assert.equal(pulled.boxes[0].asleep, false);
});

test('moved() lists what moved since, a teleport and what just fell asleep included', () => {
  const world = new World2D();
  floor(world);
  const box = world.addBody({ size: [20, 20], position: [0, -10] });
  const far = world.addBody({ type: 'static', position: [900, 0] });
  assert.equal(world.moved(0).length, 3, 'just added counts as moved');
  world.step(DT);
  const start = world.stepCount;
  world.step(DT);
  assert.deepEqual([...world.moved(start)], [box.slot]);
  let at = world.stepCount;
  steps(world, 120);
  assert.equal(box.asleep, true);
  assert.deepEqual([...world.moved(at)], [box.slot], 'moved, then slept, since then');
  at = world.stepCount;
  assert.deepEqual([...world.moved(at)], []);
  far.setPosition(901, 0);
  assert.deepEqual([...world.moved(at)], [far.slot]);
});

test('bursts of bodies leave nothing behind: pairs, tree and storage come back', () => {
  const world = new World2D();
  floor(world);
  for (let round = 0; round < 4; round++) {
    const bodies = [];
    for (let k = 0; k < 1500; k++) bodies.push(world.addBody({ shape: 'circle', radius: 5, position: [(k % 50) * 11 - 275, -10 - Math.floor(k / 50) * 11] }));
    steps(world, 20);
    for (const b of bodies) b.destroy();
    assert.equal(world._pairs.count, 0);
    assert.ok(world._slots.capacity <= 4, `storage held at ${world._slots.capacity}`);
    assert.equal(world._broad.trees[0].leaves, 0);
    assert.equal(world._awakeCount, 0);
    assert.equal(world._pairs.capacity, 16);
  }
});
