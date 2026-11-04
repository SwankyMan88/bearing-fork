// 2D bodies: what they weigh and how they move, against the exact sums.
// Run: node test/2d.test.js

import assert from 'node:assert/strict';
import { World2D, Body2D } from '../src/2d/bearing2d.js';
import { convexHull } from '../src/2d/shapes2d.js';
import { suite, test } from './test.js';

suite('2d');

const DT = 1 / 60;
const near = (a, b, tolerance, what = '') => assert.ok(Math.abs(a - b) <= tolerance, `${what} ${a}, expected ${b}`);

/** Area, centre and second moment of a region, by sampling a fine grid: an independent check on the sums. */
function sampled(inside, x0, x1, y0, y1, n = 1600) {
  const dx = (x1 - x0) / n, dy = (y1 - y0) / n, cell = dx * dy;
  let area = 0, mx = 0, my = 0, r2 = 0;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = x0 + (i + 0.5) * dx, y = y0 + (j + 0.5) * dy;
    if (!inside(x, y)) continue;
    area += cell; mx += x * cell; my += y * cell; r2 += (x * x + y * y) * cell;
  }
  const cx = mx / area, cy = my / area;
  return { area, cx, cy, moment: r2 - area * (cx * cx + cy * cy) };
}

test('a box, a circle and a capsule weigh and turn as the sums and a sampled grid say', () => {
  const world = new World2D();
  const box = world.addBody({ size: [30, 10], density: 2 });
  assert.equal(box.mass, 600);
  near(box.inertia, 600 * (900 + 100) / 12, 1e-9);
  const ball = world.addBody({ shape: 'circle', radius: 8, density: 0.5 });
  near(ball.mass, 0.5 * Math.PI * 64, 1e-9);
  near(ball.inertia, ball.mass * 64 / 2, 1e-9);
  const pill = world.addBody({ shape: 'capsule', radius: 5, height: 30, density: 1 });
  const L = 10;
  const s = sampled((x, y) => (Math.abs(y) <= L && Math.abs(x) <= 5) || x * x + (Math.abs(y) - L) ** 2 <= 25, -6, 6, -16, 16);
  near(pill.mass, s.area, s.area * 2e-3, 'capsule area');
  near(pill.inertia, s.moment, s.moment * 3e-3, 'capsule moment');
  assert.equal(world.addBody({ mass: 7 }).mass, 7);
  assert.equal(world.addBody({}).mass, 1000, 'a 1 m box, at 100 px to the metre, as 3D\'s default');
  assert.equal(world.addBody({ inertia: 5 }).inertia, 5);
});

test('a polygon is its convex hull, and its centre and moment match a sampled grid', () => {
  assert.deepEqual(convexHull([0, 0, 4, 0, 4, 4, 0, 4, 2, 2, 2, 0, 0, 0]), [0, 0, 4, 0, 4, 4, 0, 4], 'inside and on-edge points go, and repeats');
  assert.equal(convexHull([0, 0, 1, 1, 2, 2]), null, 'three on a line span nothing');
  const world = new World2D();
  const vertices = [0, 0, 60, 10, 40, 50, 5, 30];
  const body = world.addBody({ shape: 'polygon', vertices, density: 1, position: [100, 200] });
  const hull = world.bodyOf(body).vertices;
  const inside = (x, y) => {
    for (let k = 0; k < hull.length; k += 2) {
      const ax = hull[k], ay = hull[k + 1], bx = hull[(k + 2) % hull.length], by = hull[(k + 3) % hull.length];
      if ((bx - ax) * (y - ay) - (by - ay) * (x - ax) < 0) return false;
    }
    return true;
  };
  const s = sampled(inside, -1, 61, -1, 51);
  near(body.mass, s.area, s.area * 2e-3, 'area');
  near(body.inertia, s.moment, s.moment * 3e-3, 'moment');
  near(body.worldCenterOfMass[0], 100 + s.cx, 0.05, 'centre x');
  near(body.worldCenterOfMass[1], 200 + s.cy, 0.05, 'centre y');
  assert.deepEqual(body.position, [100, 200], 'its origin is where it was put');
});

test('a compound adds its parts: an L balances where the sums and the sample say', () => {
  const world = new World2D();
  const ell = world.addBody({ shape: 'compound', density: 1, parts: [{ size: [12, 4], position: [6, 2] }, { size: [4, 8], position: [2, 8] }] });
  const s = sampled((x, y) => (x >= 0 && x <= 12 && y >= 0 && y <= 4) || (x >= 0 && x <= 4 && y >= 4 && y <= 12), -1, 13, -1, 13);
  near(ell.mass, 80, 1e-9);
  near(ell.worldCenterOfMass[0], s.cx, 0.02);
  near(ell.worldCenterOfMass[1], s.cy, 0.02);
  near(ell.inertia, s.moment, s.moment * 3e-3);
  // A part turned a quarter turn is the same shape as one written that way, and a denser part pulls the centre.
  const turned = world.addBody({ shape: 'compound', density: 1, parts: [{ size: [4, 12], position: [6, 2], angle: Math.PI / 2 }, { size: [4, 8], position: [2, 8] }] });
  near(turned.mass, ell.mass, 1e-9);
  near(turned.inertia, ell.inertia, 1e-9);
  const heavy = world.addBody({ shape: 'compound', parts: [{ size: [10, 10], position: [-10, 0], density: 3 }, { size: [10, 10], position: [10, 0], density: 1 }] });
  near(heavy.worldCenterOfMass[0], -5, 1e-9);
  // Scaled to a mass given, with the same centre.
  const given = world.addBody({ shape: 'compound', mass: 8, parts: [{ size: [12, 4], position: [6, 2] }, { size: [4, 8], position: [2, 8] }] });
  assert.equal(given.mass, 8);
  near(given.worldCenterOfMass[0], ell.worldCenterOfMass[0], 1e-12);
});

test('a body falls and flies by the exact sum of its substeps', () => {
  const world = new World2D();
  const ball = world.addBody({ shape: 'circle', position: [0, 0], velocity: [120, -300] });
  for (let s = 0; s < 60; s++) world.step(DT);
  const n = 480, h = DT / 8, g = 980;
  near(ball.position[1], -300 * n * h + g * h * h * n * (n + 1) / 2, 1e-8, 'y');
  near(ball.position[0], 120 * n * h, 1e-9, 'x');
  near(ball.velocity[1], -300 + g * n * h, 1e-9, 'vy');
  const float = world.addBody({ gravityScale: 0, position: [5, 5] });
  world.step(DT);
  assert.deepEqual(float.position, [5, 5]);
});

test('a body turns by the exact sum of its substeps, its angle unwrapped, and clockwise on screen', () => {
  const world = new World2D({ gravity: [0, 0] });
  const wheel = world.addBody({ angularVelocity: 6 });
  for (let s = 0; s < 240; s++) world.step(DT);
  const h = DT / 8, turn = 2 * Math.atan(6 * h / 2) * 8 * 240;
  near(wheel.angle, turn, 1e-9, 'angle');
  assert.ok(wheel.angle > 2 * Math.PI, 'past a whole turn, not wrapped');
  near(wheel.angle, 24, 24 / 80000 * 1.2, 'within the documented short turn');
  const t = world.transforms, p = world.previous, o = wheel.slot * 3;
  near(t[o + 2], wheel.angle, 1e-5);
  near(t[o + 2] - p[o + 2], 0.1, 1e-5, 'previous is one step back, the short way');
  // A positive angle takes +x toward +y: down the screen, clockwise.
  const arm = world.addBody({ shape: 'compound', parts: [{ size: [10, 10] }, { size: [100, 2], position: [50, 0] }], angle: Math.PI / 2 });
  const [x, y] = arm.worldCenterOfMass;
  near(x, 0, 1e-9); assert.ok(y > 0);
});

test('the spin cap holds a body other than a circle to half a turn a step', () => {
  const world = new World2D({ gravity: [0, 0] });
  const box = world.addBody({ angularVelocity: 1000 }), ball = world.addBody({ shape: 'circle', angularVelocity: 1000 });
  world.step(DT);
  near(box.angularVelocity, Math.PI * 60, 1e-9);
  assert.equal(ball.angularVelocity, 1000);
});

test('forces last a step; off the centre they turn it; static and kinematic bodies ignore them', () => {
  const world = new World2D({ gravity: [0, 0] });
  const box = world.addBody({ size: [10, 10], mass: 2, inertia: 4, position: [0, 0] });
  box.applyForce([120, 0], [0, 5]);   // pushing +x at +y of the centre turns it -z: anticlockwise on screen
  world.step(DT);
  near(box.velocity[0], 120 / 2 * DT, 1e-12);
  near(box.angularVelocity, -5 * 120 / 4 * DT, 1e-12);
  const v = box.velocity[0];
  world.step(DT);
  assert.equal(box.velocity[0], v, 'a force lasts one step');
  box.setAngularVelocity(0).setVelocity(0, 0).applyImpulse([4, 0], [0, 5]);
  assert.equal(box.velocity[0], 2);
  assert.equal(box.angularVelocity, -5);
  box.setAngularVelocity(0).applyTorque(60);
  world.step(DT);
  near(box.angularVelocity, 60 / 4 * DT, 1e-12);
  box.setAngularVelocity(0).applyAngularImpulse(8);
  assert.equal(box.angularVelocity, 2);
  for (const type of ['static', 'kinematic']) {
    const other = world.addBody({ type });
    other.applyForce([9, 9]).applyTorque(9).applyImpulse([9, 9]).applyAngularImpulse(9);
    world.step(DT);
    assert.deepEqual([...other.position, other.angle], [0, 0, 0]);
  }
  // A kinematic body goes as told, ignoring gravity; a static body has nothing to tell it.
  const falling = new World2D();
  const lift = falling.addBody({ type: 'kinematic', velocity: [0, -60] });
  const post = falling.addBody({ type: 'static', position: [10, 10] });
  falling.step(1);
  near(lift.position[1], -60, 1e-9);
  assert.deepEqual(post.position, [10, 10]);
});

test('locks hold: lockPosition on its axes, lockRotation against everything', () => {
  const world = new World2D();
  const rail = world.addBody({ lockPosition: [false, true], velocity: [60, 500], position: [0, 7] });
  assert.deepEqual(rail.velocity, [60, 0]);
  rail.applyImpulse([0, 5000]);
  assert.equal(rail.velocity[1], 0);
  world.step(DT);
  assert.equal(rail.position[1], 7);
  near(rail.position[0], 1, 1e-9);
  const stiff = world.addBody({ lockRotation: true, angularVelocity: 3 });
  stiff.setAngularVelocity(5).applyTorque(100).applyAngularImpulse(100).applyImpulse([1, 1], [50, 50]);
  world.step(DT);
  assert.equal(stiff.angle, 0);
  assert.equal(stiff.angularVelocity, 0);
  world.remove(rail);
  assert.equal(world._lockMoveCount, 0);
});

test('moveTo lands on the pose to rounding, the short way round, an off-centre compound too', () => {
  for (const substeps of [1, 8]) {
    const world = new World2D({ substeps });
    const plate = world.addBody({ type: 'kinematic' });
    const arm = world.addBody({ type: 'kinematic', shape: 'compound', parts: [{ size: [10, 10] }, { shape: 'circle', radius: 20, position: [60, 0], density: 1 }], position: [50, 50] });
    for (const body of [plate, arm]) {
      body.moveTo([10, -20], 2.5, DT);
      world.step(DT);
      near(body.position[0], 10, 1e-9); near(body.position[1], -20, 1e-9);
      near(body.angle, 2.5, 1e-9);
      body.moveTo([10, -20], 2.5 - 2 * Math.PI + 0.1, DT);
      world.step(DT);
      near(body.angle, 2.6, 1e-9, 'the short way round');
      body.moveTo([0, 0], null, DT);
      world.step(DT);
      near(body.position[0], 0, 1e-9);
      near(body.angle, 2.6, 1e-9);
    }
  }
});

test('add, set, read and remove: bodyOf round-trips, ids stay dead, storage comes back', () => {
  const world = new World2D();
  const shard = world.addBody({ shape: 'polygon', vertices: [0, 0, 6, 1, 4, 5], position: [320, 96], angle: 0.3, friction: 0.2, velocity: [1, 2], angularVelocity: 3 });
  const copy = world.addBody(world.bodyOf(shard));
  const a = world.bodyOf(copy), b = world.bodyOf(shard);
  near(a.position[0], b.position[0], 1e-12); near(a.position[1], b.position[1], 1e-12);
  assert.deepEqual({ ...a, position: null }, { ...b, position: null });
  assert.ok(shard instanceof Body2D);
  assert.equal(world.body(shard.id).id, shard.id);
  // A compound and a capsule too, and the options that read null.
  const ell = world.addBody({ shape: 'compound', parts: [{ size: [12, 4], position: [6, 2] }, { shape: 'circle', radius: 2, density: 3 }] });
  assert.deepEqual(world.bodyOf(world.addBody(world.bodyOf(ell))).parts, world.bodyOf(ell).parts);
  const pill = world.addBody({ shape: 'capsule', radius: 5, height: 20, type: 'static' });
  const read = world.bodyOf(pill);
  assert.deepEqual([read.radius, read.height, read.inertia, read.centerOfMass, 'velocity' in read, 'size' in read], [5, 20, null, null, false, false]);
  // A new shape brings its own mass; moved, the origin stays where it is told.
  const crate = world.addBody({ position: [50, 60], centerOfMass: [10, 0] });
  near(crate.worldCenterOfMass[0], 60, 1e-12);
  world.setBody(crate, { shape: 'circle', radius: 10, centerOfMass: null });
  near(crate.mass, 0.1 * Math.PI * 100, 1e-9);
  assert.deepEqual(crate.position, [50, 60]);
  world.setBody(crate, { type: 'static' });
  assert.deepEqual(crate.velocity, [0, 0]);
  world.step(DT);
  assert.deepEqual(crate.position, [50, 60]);
  // Teleported, previous goes with it.
  shard.setPosition(5, 6).setAngle(1);
  const t = world.previous, o = shard.slot * 3;
  assert.deepEqual([t[o], t[o + 1], t[o + 2]], [5, 6, 1]);
  // Removed, the handle is dead, its slot is reused under a new id, and a burst leaves nothing.
  const { id, slot } = shard;
  world.remove(shard);
  world.remove(shard);
  assert.equal(shard.alive, false);
  const next = world.addBody();
  assert.equal(next.slot, slot);
  assert.notEqual(next.id, id);
  assert.throws(() => shard.position, /this body was removed/);
  const quiet = new World2D();
  for (let round = 0; round < 3; round++) {
    const bodies = [];
    for (let k = 0; k < 2000; k++) bodies.push(quiet.addBody({ shape: 'circle', radius: 1, position: [k * 5, 0], gravityScale: 0 }));
    quiet.step(DT);
    for (const b of bodies) b.destroy();
    assert.equal(quiet._slots.capacity, 0, 'storage back to nothing');
    assert.equal(quiet.bodyCount, 0);
  }
});

test('off means off: a world of static bodies moves nothing, and destroy lets go', () => {
  const world = new World2D();
  for (let k = 0; k < 100; k++) world.addBody({ type: 'static', position: [k, 0] });
  assert.equal(world._awakeCount, 0);
  world.step(DT);
  assert.equal(world.stepCount, 1);
  world.destroy();
  world.destroy();
  assert.throws(() => world.step(DT), /^Error: step: this world was destroyed$/);
  assert.equal(world._transforms.length, 0);
});

test('nothing in the step makes an array or a view', () => {
  const world = new World2D();
  for (let k = 0; k < 50; k++) world.addBody({ position: [k, 0], angularVelocity: 1, lockPosition: [false, k % 2 === 0] });
  const made = [];
  const sub = Float64Array.prototype.subarray, slice = Float64Array.prototype.slice;
  Float64Array.prototype.subarray = function (...a) { made.push('subarray'); return sub.apply(this, a); };
  Float64Array.prototype.slice = function (...a) { made.push('slice'); return slice.apply(this, a); };
  try {
    world.bodyCount;
    for (let s = 0; s < 10; s++) world.step(DT);
  } finally {
    Float64Array.prototype.subarray = sub;
    Float64Array.prototype.slice = slice;
  }
  assert.deepEqual(made, []);
});
