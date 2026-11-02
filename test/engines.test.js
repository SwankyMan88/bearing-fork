// docs/ENGINES.md's examples run, and put each engine's objects where
// Bearing's bodies are.
// Run: node test/engines.test.js
//
// The examples are each engine's own code, and no engine is a dependency, so
// each runs against stand-ins: objects with only the members its example
// calls, named as the engine names them (mesh.position.set, entity.setRotation,
// app.ticker.add, ...). That checks the copying -- the fixed step, the blend
// and moved() -- not the engines, whose own docs are the authority on them.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { World } from '../src/bearing.js';
import { suite, test } from './test.js';

suite('engines');

const DOC = readFileSync(new URL('../docs/ENGINES.md', import.meta.url), 'utf8');
const blocks = [...DOC.matchAll(/```js\n([^]*?)```/g)].map((m) => m[1]);
const [shared, ...examples] = blocks;
const named = new Map(examples.map((code) => [code.match(/function (run\w+)/)[1], code]));

test('the page has the shared helpers and one example for each engine', () => {
  assert.match(shared, /function advance\(/);
  assert.match(shared, /function blend\(/);
  assert.deepEqual([...named.keys()], ['runThree', 'runBabylon', 'runPlayCanvas', 'runPixi', 'runWinding']);
});

/** An engine's example as a function, with its own copy of the shared helpers: each keeps its own fixed-step clock. */
function load(name) {
  return new Function(`${shared}\n${named.get(name)}\nreturn ${name};`)();
}

/**
 * A floor with no scene object (its slot is skipped), a box turned 0.5 rad
 * about y dropped from 2 m, and a ball dropped beside it: something to move,
 * then to rest and sleep.
 */
function scene() {
  const world = new World({ workers: 0 });
  world.addBody({ type: 'static', size: [20, 1, 20], position: [0, -0.5, 0] });
  const box = world.addBody({ position: [0, 2, 0] }).setAxisAngle([0, 1, 0], 0.5);
  const ball = world.addBody({ shape: 'sphere', position: [2, 1.5, 1] });
  return { world, bodies: [box, ball] };
}

let calls = 0;
const v3 = () => ({ x: NaN, y: NaN, z: NaN, set(x, y, z) { calls++; Object.assign(this, { x, y, z }); } });
const q4 = () => ({ x: NaN, y: NaN, z: NaN, w: NaN, set(x, y, z, w) { calls++; Object.assign(this, { x, y, z, w }); } });

/**
 * Each engine: its stand-ins, how to run one frame of `seconds`, and where an
 * object says it is, [x, y, z, qx, qy, qz, qw] (Pixi: [x px, y px, rotation]).
 */
const ENGINES = {
  runThree: () => {
    const meshes = [], renderer = { loop: null, setAnimationLoop(fn) { this.loop = fn; }, render() {} };
    let time = 1000;
    return {
      objects: meshes, make: () => ({ position: v3(), quaternion: q4() }),
      start: (world, run) => run(world, meshes, renderer, {}, {}),
      frame: (seconds) => { renderer.loop(time); time += seconds * 1000; },
      read: (m) => [m.position.x, m.position.y, m.position.z, m.quaternion.x, m.quaternion.y, m.quaternion.z, m.quaternion.w],
    };
  },
  runBabylon: () => {
    const meshes = [], engine = { loop: null, ms: 0, runRenderLoop(fn) { this.loop = fn; }, getDeltaTime() { return this.ms; } };
    return {
      objects: meshes, make: () => ({ position: v3(), rotationQuaternion: q4() }),
      start: (world, run) => run(world, meshes, engine, { useRightHandedSystem: true, render() {} }),
      frame: (seconds) => { engine.ms = seconds * 1000; engine.loop(); },
      read: (m) => [m.position.x, m.position.y, m.position.z, m.rotationQuaternion.x, m.rotationQuaternion.y, m.rotationQuaternion.z, m.rotationQuaternion.w],
    };
  },
  runPlayCanvas: () => {
    const entities = [], app = { update: null, on(name, fn) { assert.equal(name, 'update'); this.update = fn; } };
    return {
      objects: entities,
      make: () => ({
        p: [NaN, NaN, NaN], q: [NaN, NaN, NaN, NaN],
        setPosition(x, y, z) { calls++; this.p = [x, y, z]; },
        setRotation(x, y, z, w) { calls++; this.q = [x, y, z, w]; },
      }),
      start: (world, run) => run(world, entities, app),
      frame: (seconds) => app.update(seconds),
      read: (e) => [...e.p, ...e.q],
    };
  },
  runPixi: () => {
    const sprites = [], app = { ticker: { fn: null, add(fn) { this.fn = fn; } } };
    return {
      objects: sprites,
      make: () => ({ position: { x: NaN, y: NaN, set(x, y) { calls++; this.x = x; this.y = y; } }, rotation: NaN }),
      start: (world, run) => run(world, sprites, app),
      frame: (seconds) => app.ticker.fn({ deltaMS: seconds * 1000 }),
      read: (s) => [s.position.x, s.position.y, s.rotation],
    };
  },
  runWinding: () => {
    // Winding's own fixed step: update at 1/60 s, as often as the frame's time allows, then frame(alpha).
    const nodes = [], engine = { hooks: null, owed: 0, run(scene, camera, hooks) { this.hooks = hooks; } };
    return {
      objects: nodes,
      make: () => ({
        p: [NaN, NaN, NaN], q: [NaN, NaN, NaN, NaN],
        setPosition(x, y, z) { calls++; this.p = [x, y, z]; return this; },
        setRotation(q) { calls++; this.q = [q[0], q[1], q[2], q[3]]; return this; },
      }),
      start: (world, run) => run(world, nodes, engine, {}, {}),
      frame: (seconds) => {
        engine.owed += seconds;
        while (engine.owed >= 1 / 60) { engine.hooks.update(1 / 60); engine.owed -= 1 / 60; }
        engine.hooks.frame(engine.owed * 60);
      },
      read: (n) => [...n.p, ...n.q],
    };
  },
};

/** Where the body in `slot` should be drawn, as the engine's object reads, from the world's own arrays at `alpha`. */
function expected(name, world, slot, alpha) {
  const t = world.transforms, p = world.previous, o = slot * 7;
  const out = [0, 1, 2].map((k) => p[o + k] + (t[o + k] - p[o + k]) * alpha);
  const dot = [3, 4, 5, 6].reduce((sum, k) => sum + p[o + k] * t[o + k], 0), s = dot < 0 ? -1 : 1;
  const q = [3, 4, 5, 6].map((k) => s * p[o + k] + (t[o + k] - s * p[o + k]) * alpha);
  const l = Math.hypot(...q);
  const [qx, qy, qz, qw] = q.map((x) => x / l);
  if (name === 'runPixi') return [out[0] * 50, out[2] * 50, Math.atan2(2 * (qx * qz - qw * qy), 1 - 2 * (qy * qy + qz * qz))];
  return [...out, qx, qy, qz, qw];
}

function close(actual, wanted, tolerance, what) {
  assert.equal(actual.length, wanted.length, what);
  for (let k = 0; k < wanted.length; k++) {
    assert.ok(Math.abs(actual[k] - wanted[k]) <= tolerance, `${what}: [${actual}] against [${wanted}]`);
  }
}

for (const name of Object.keys(ENGINES)) {
  test(`${name}: each object follows its body between steps, then rests where it rests, and nothing is copied once all sleep`, () => {
    const { world, bodies } = scene();
    const engine = ENGINES[name]();
    for (const body of bodies) engine.objects[body.slot] = engine.make();
    const run = load(name);
    engine.start(world, run);
    // Frames of 1/47 s against steps of 1/60: in the first second no frame ends
    // within 1/2820 s of a step, so where a frame falls between two steps is
    // never a question of rounding.
    const FRAME = 1 / 47;
    let elapsed = 0, between = 0;
    while (elapsed < 0.6) {
      engine.frame(FRAME);
      elapsed += FRAME;
      // Mid-fall, each object sits where the blend of the world's last two steps puts it:
      // alpha is how far the frame's time is past the last step, in steps.
      const steps = world.stepCount, alpha = name === 'runThree'
        ? (elapsed - FRAME - steps / 60) * 60   // Three's first frame steps nothing, so its clock runs a frame behind
        : (elapsed - steps / 60) * 60;
      if (alpha > 0.05 && alpha < 0.95) between++;
      for (const body of bodies) {
        close(engine.read(engine.objects[body.slot]), expected(name, world, body.slot, alpha), 1e-6,
          `${name} at ${elapsed.toFixed(2)} s, body ${body.id}`);
      }
    }
    assert.ok(between > 10, `only ${between} frames fell between two steps`);
    assert.ok(world.stepCount >= 30, `${world.stepCount} steps in 0.6 s`);
    // To rest, and asleep: every object where its body is, the box still turned 0.5 rad about y.
    // Within 0.1 mm, not exactly: a body is last drawn in the frame after the last step it moved
    // in, part of the way through that step's last, sub-pixel motion.
    for (let n = 0; n < 300 && !bodies.every((b) => b.asleep); n++) engine.frame(FRAME);
    assert.ok(bodies.every((b) => b.asleep), 'the scene never slept');
    engine.frame(FRAME);
    for (const body of bodies) close(engine.read(engine.objects[body.slot]), expected(name, world, body.slot, 1), name === 'runPixi' ? 5e-3 : 1e-4, `${name} at rest, body ${body.id}`);
    if (name === 'runPixi') assert.ok(Math.abs(engine.read(engine.objects[bodies[0].slot])[2] + 0.5) < 1e-3, 'the box seen from above is turned 0.5 rad, clockwise on screen being positive');
    // Asleep, nothing moved, so nothing is copied.
    calls = 0;
    for (let n = 0; n < 5; n++) engine.frame(FRAME);
    assert.equal(calls, 0, `${calls} copies with everything asleep`);
  });
}
