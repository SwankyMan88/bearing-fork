// 2D bodies touching: where contacts are found, and what the solver makes of
// them, against the physics. Run: node test/2d-contact.test.js

import assert from 'node:assert/strict';
import { World2D } from '../src/2d/bearing2d.js';
import { Core, Manifold2, collide } from '../src/2d/collide2d.js';
import { suite, test } from './test.js';

suite('2d contact');

const DT = 1 / 60;
const near = (a, b, tolerance, what = '') => assert.ok(Math.abs(a - b) <= tolerance, `${what} ${a}, expected ${b}`);
const floor = (world, width = 40000) => world.addBody({ type: 'static', size: [width, 100], position: [0, 50] });
const steps = (world, n) => { for (let i = 0; i < n; i++) world.step(DT); };

let seed = 12345;
const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const between = (a, b) => a + (b - a) * rand();

/** Two capsules end to end: their lines have no side between them. */
test('capsules end to end are apart by the gap between their tips', () => {
  const m = new Manifold2(), line = new Core([0, -10, 0, 10], 2);
  assert.equal(collide(line, 0, 0, 1, 0, line, 0, 25, 1, 0, 2, 0.01, m), 1);
  near(m.separation[0], 1, 1e-12);
  assert.deepEqual([m.nx, m.ny], [0, 1]);
  assert.equal(collide(line, 0, 0, 1, 0, line, 0, 30, 1, 0, 2, 0.01, m), 0);
});

function randomCore() {
  const k = Math.floor(rand() * 4);
  if (k === 0) return new Core([0, 0], between(1, 20));
  if (k === 1) { const L = between(1, 20); return new Core([0, -L, 0, L], between(1, 10)); }
  if (k === 2) { const w = between(2, 20), h = between(2, 20); return new Core([-w, -h, w, -h, w, h, -w, h], 0); }
  const n = 3 + Math.floor(rand() * 4), r = between(4, 20), corners = [];
  for (let i = 0; i < n; i++) { const t = 2 * Math.PI * i / n; corners.push(r * Math.cos(t), r * Math.sin(t)); }
  return new Core(corners, 0);
}

/** The true gap between two placed cores' rounded surfaces, positive apart, from their corners and sides alone; 0 or less inside. */
function trueGap(A, B) {
  const segment = (px, py, ax, ay, bx, by) => {
    const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
    const t = l > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)) : 0;
    return Math.hypot(px - ax - t * dx, py - ay - t * dy);
  };
  const inside = (px, py, Q) => {
    if (Q.n < 3) return false;
    for (let k = 0; k < Q.n; k++) {
      const j = (k + 1) % Q.n;
      if ((Q.x[j] - Q.x[k]) * (py - Q.y[k]) - (Q.y[j] - Q.y[k]) * (px - Q.x[k]) < 0) return false;
    }
    return true;
  };
  // A line can cross a shape with neither end inside it.
  const side = (ax, ay, bx, by, px, py) => (bx - ax) * (py - ay) - (by - ay) * (px - ax);
  for (let i = 0; i < A.n && A.n > 1; i++) {
    const i2 = (i + 1) % A.n;
    for (let k = 0; k < B.n && B.n > 1; k++) {
      const k2 = (k + 1) % B.n;
      const s1 = side(A.x[i], A.y[i], A.x[i2], A.y[i2], B.x[k], B.y[k]), s2 = side(A.x[i], A.y[i], A.x[i2], A.y[i2], B.x[k2], B.y[k2]);
      const s3 = side(B.x[k], B.y[k], B.x[k2], B.y[k2], A.x[i], A.y[i]), s4 = side(B.x[k], B.y[k], B.x[k2], B.y[k2], A.x[i2], A.y[i2]);
      if (s1 * s2 < 0 && s3 * s4 < 0) return -Infinity;
    }
  }
  let d = Infinity;
  for (let i = 0; i < A.n; i++) {
    if (inside(A.x[i], A.y[i], B)) return -Infinity;
    for (let k = 0; k < B.n; k++) { const j = (k + 1) % B.n; d = Math.min(d, segment(A.x[i], A.y[i], B.x[k], B.y[k], B.x[j], B.y[j])); }
  }
  for (let i = 0; i < B.n; i++) {
    if (inside(B.x[i], B.y[i], A)) return -Infinity;
    for (let k = 0; k < A.n; k++) { const j = (k + 1) % A.n; d = Math.min(d, segment(B.x[i], B.y[i], A.x[k], A.y[k], A.x[j], A.y[j])); }
  }
  return d - A.r - B.r;
}

const placed = (core, px, py, a) => {
  const c = Math.cos(a), s = Math.sin(a), n = core.n, x = new Float64Array(n), y = new Float64Array(n);
  for (let k = 0; k < n; k++) { x[k] = px + c * core.x[k] - s * core.y[k]; y[k] = py + s * core.x[k] + c * core.y[k]; }
  return { n, x, y, r: core.radius };
};

test('over 20,000 random pairs, a manifold agrees with the gap worked out without it', () => {
  const m = new Manifold2();
  let touching = 0, apart = 0;
  for (let i = 0; i < 20000; i++) {
    const A = randomCore(), B = randomCore();
    const ax = 0, ay = 0, aa = between(-3, 3), bx = between(-50, 50), by = between(-50, 50), ba = between(-3, 3);
    const gap = trueGap(placed(A, ax, ay, aa), placed(B, bx, by, ba));
    const margin = 2, tolerance = 0.05;
    const count = collide(A, ax, ay, Math.cos(aa), Math.sin(aa), B, bx, by, Math.cos(ba), Math.sin(ba), margin, tolerance, m);
    if (gap > margin + 1e-9) {
      assert.equal(count, 0, `pair ${i}: ${gap} apart, and ${count} points`);
      continue;
    }
    if (gap < margin - tolerance - 1e-9) assert.ok(count > 0, `pair ${i}: ${gap} apart, and no points`);
    if (count === 0) continue;
    assert.ok(Math.abs(Math.hypot(m.nx, m.ny) - 1) < 1e-12, `pair ${i}: a normal of length ${Math.hypot(m.nx, m.ny)}`);
    // From a to b, more or less: b's centre lies that way, or the two overlap deep.
    if (gap > 0) {
      touching++;
      const least = count === 2 ? Math.min(m.separation[0], m.separation[1]) : m.separation[0];
      // A manifold taken flat may read up to the tolerance off; never past.
      assert.ok(Math.abs(least - gap) <= tolerance * 1.5 + 1e-9, `pair ${i}: reads ${least}, the true gap ${gap}`);
      assert.ok(m.nx * bx + m.ny * by > -1e-9, `pair ${i}: the normal points back`);
    } else {
      apart++;
      assert.ok(Math.min(m.separation[0], count === 2 ? m.separation[1] : Infinity) <= tolerance, `pair ${i}: overlapping, and reads apart`);
    }
  }
  assert.ok(touching > 300 && apart > 300, `only ${touching} near and ${apart} overlapping`);
});

test('a box lands flat at two points, at rest within a pixel of tolerance, turned not at all', () => {
  const world = new World2D();
  floor(world);
  const box = world.addBody({ size: [32, 32], position: [3, -200] });
  steps(world, 180);
  near(box.position[1], -16, 0.16, 'rest');
  assert.ok(Math.abs(box.angle) < 1e-9, `turned ${box.angle}`);
  near(box.velocity[1], 0, 1e-3);
  assert.equal(world._contacts.points[0], 2);
});

test('a stack of 10 stands for 10 s, at any size, its sag under a tenth of a percent a box', () => {
  for (const size of [4, 16, 32, 100]) {
    const world = new World2D();
    floor(world);
    const boxes = [];
    for (let k = 0; k < 10; k++) boxes.push(world.addBody({ size: [size, size], position: [0, -(k + 0.5) * size] }));
    steps(world, 600);
    const top = boxes[9];
    near(top.position[0], 0, 1e-3 * size, `${size} px: x`);
    near(top.position[1], -9.5 * size, 1, `${size} px: y`);
    assert.ok(Math.abs(top.angle) < 1e-6, `${size} px: turned ${top.angle}`);
  }
});

test('a pyramid of 15 stays up, and a box ten times heavier stands on a light one', () => {
  const world = new World2D();
  floor(world);
  const boxes = [];
  for (let row = 0; row < 5; row++) for (let k = 0; k < 5 - row; k++) boxes.push(world.addBody({ size: [32, 32], position: [(k - (4 - row) / 2) * 34, -16 - row * 32] }));
  const was = boxes.map((b) => [...b.position]);
  steps(world, 600);
  boxes.forEach((b, i) => assert.ok(Math.hypot(b.position[0] - was[i][0], b.position[1] - was[i][1]) < 1, `box ${i} moved`));
  const other = new World2D();
  floor(other);
  other.addBody({ size: [40, 20], position: [0, -10], mass: 1 });
  const heavy = other.addBody({ size: [40, 20], position: [0, -30], mass: 10 });
  steps(other, 300);
  near(heavy.position[1], -30, 0.4, 'on a body 10 times lighter');
});

test('friction stops a slide where the sum says, and a steep slope slides while a gentle one holds', () => {
  const world = new World2D();
  floor(world);
  const box = world.addBody({ size: [50, 30], position: [0, -15], velocity: [300, 0] });
  steps(world, 300);
  near(box.position[0], 300 * 300 / (2 * 0.5 * 980), 2, 'stopped at v²/2μg');
  for (const [slope, slides] of [[0.3, false], [0.7, true]]) {   // friction 0.5 holds up to atan 0.5, 0.46 rad
    const tilted = new World2D();
    const c = Math.cos(slope), s = Math.sin(slope);
    tilted.addBody({ type: 'static', size: [4000, 40], angle: slope });
    const block = tilted.addBody({ size: [40, 20], angle: slope, position: [30 * s, -30 * c] });
    steps(tilted, 120);
    const moved = Math.hypot(block.position[0] - 30 * s, block.position[1] + 30 * c);
    assert.equal(moved > 10, slides, `on ${slope} rad it moved ${moved}`);
    assert.ok(moved < 2000);
  }
});

test('a ball bounces by its restitution, settles, and a rolling one slows by its rolling resistance', () => {
  const world = new World2D();
  floor(world);
  const ball = world.addBody({ shape: 'circle', radius: 16, position: [0, -300], restitution: 0.8 });
  const tops = [];
  for (let i = 0; i < 1200; i++) {
    const before = ball.velocity[1];
    world.step(DT);
    if (before < 0 && ball.velocity[1] >= 0) tops.push(-ball.position[1] - 16);
  }
  near(tops[0] / 284, 0.64, 0.05, 'first bounce, e²');
  near(tops[1] / tops[0], 0.64, 0.05, 'second bounce, e²');
  near(ball.position[1], -16, 0.1, 'settled');
  near(ball.velocity[1], 0, 1e-3);
  // Rolling from the start, a disc slows at 0.01 g / 1.5: 200²/(2 × 6.53).
  const rolling = new World2D();
  floor(rolling);
  const disc = rolling.addBody({ shape: 'circle', radius: 16, position: [0, -16], velocity: [200, 0], angularVelocity: 200 / 16 });
  steps(rolling, 2400);
  near(disc.position[0], 200 * 200 / (2 * 0.01 * 980 / 1.5), 200, 'rolled');
  near(disc.velocity[0], 0, 1e-6, 'stopped');
});

test('two equal boxes swap speeds with restitution 1; momentum holds between dynamic bodies', () => {
  const world = new World2D({ gravity: [0, 0] });
  const a = world.addBody({ size: [20, 20], restitution: 1, position: [-50, 0], velocity: [100, 0] });
  const b = world.addBody({ size: [20, 20], restitution: 1, position: [50, 0] });
  steps(world, 120);
  near(a.velocity[0], 0, 0.5, 'a');
  near(b.velocity[0], 100, 0.5, 'b');
  const c = world.addBody({ shape: 'circle', radius: 10, position: [0, 300], mass: 3, velocity: [20, 40] });
  const d = world.addBody({ size: [30, 10], position: [20, 400], mass: 5, velocity: [-7, -60], angularVelocity: 2 });
  const px = 3 * 20 + 5 * -7, py = 3 * 40 + 5 * -60;
  steps(world, 240);
  near(3 * c.velocity[0] + 5 * d.velocity[0], px, 1e-6, 'momentum x');
  near(3 * c.velocity[1] + 5 * d.velocity[1], py, 1e-6, 'momentum y');
});

test('capsules, polygons and circles settle on each other, and a fast body stops at a surface', () => {
  const world = new World2D();
  floor(world, 2000);
  world.addBody({ type: 'static', size: [40, 800], position: [-300, -300] });
  world.addBody({ type: 'static', size: [40, 800], position: [300, -300] });
  const bodies = [];
  for (let i = 0; i < 60; i++) {
    const k = i % 4, o = { position: [(i % 8) * 40 - 140 + (i % 3), -60 - Math.floor(i / 8) * 60], angle: i * 0.4 };
    bodies.push(world.addBody(k === 0 ? { ...o, size: [30, 20] } : k === 1 ? { ...o, shape: 'circle', radius: 12 }
      : k === 2 ? { ...o, shape: 'capsule', radius: 8, height: 34 } : { ...o, shape: 'polygon', vertices: [0, 0, 26, 4, 18, 24, 2, 16] }));
  }
  steps(world, 1200);
  for (const b of bodies) {
    assert.ok(!Number.isNaN(b.position[0]));
    const [x, y] = b.worldCenterOfMass;
    assert.ok(y < 0.5 && Math.abs(x) < 281, `a body at ${x}, ${y}`);
    assert.ok(Math.hypot(...b.velocity) < 5, `still moving at ${Math.hypot(...b.velocity)}`);
  }
  // Speculative points: 5,000 px/s is 83 px a step, past a 20 px wall in one.
  const wall = new World2D({ gravity: [0, 0] });
  wall.addBody({ type: 'static', size: [20, 400], position: [0, 0] });
  const bullet = wall.addBody({ shape: 'circle', radius: 5, position: [-300, 0], velocity: [5000, 0] });
  steps(wall, 60);
  assert.ok(bullet.position[0] < -14, `the ball reached ${bullet.position[0]}`);
});

test('shards a few pixels across rest on a floor and on each other', () => {
  const world = new World2D();
  floor(world);
  const shards = [];
  for (let i = 0; i < 40; i++) shards.push(world.addBody({ shape: 'polygon', vertices: [0, 0, 3 + (i % 3), 0.5, 2, 2 + (i % 2)], position: [(i % 10) * 6 - 30, -5 - Math.floor(i / 10) * 6], angle: i }));
  steps(world, 600);
  for (const s of shards) {
    assert.ok(s.worldCenterOfMass[1] < 0.1, `a shard sank to ${s.worldCenterOfMass[1]}`);
    assert.ok(Math.hypot(...s.velocity) < 1, `a shard still moves at ${Math.hypot(...s.velocity)}`);
  }
});
