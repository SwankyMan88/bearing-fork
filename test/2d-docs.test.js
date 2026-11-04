// The 2D reference, held to what the 3D one is: every public call has an entry,
// every link lands, every example runs, and every error, word for word, both
// ways round. Run: node test/2d-docs.test.js

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { World2D, Body2D } from '../src/2d/bearing2d.js';
import * as module from '../src/2d/bearing2d.js';
import { suite, test, thrown } from './test.js';

suite('2d docs');

const API = readFileSync(new URL('../docs/API-2D.md', import.meta.url), 'utf8');
const TYPES = readFileSync(new URL('../src/2d/bearing2d.d.ts', import.meta.url), 'utf8');
const anchors = new Set([...API.matchAll(/<a id="([^"]+)"><\/a>/g)].map((m) => m[1]));

const publicNames = (Class) => Object.getOwnPropertyNames(Class.prototype).filter((n) => n !== 'constructor' && !n.startsWith('_'));

test('the module exports World2D and Body2D, and nothing else', () => {
  assert.deepEqual(Object.keys(module).sort(), ['Body2D', 'World2D']);
});

test('every public method and getter has an entry, and every entry a thing it documents', () => {
  const expected = ['world', ...publicNames(World2D).map((n) => `world-${n.toLowerCase()}`), ...publicNames(Body2D).map((n) => `body-${n.toLowerCase()}`)];
  const entries = [...API.matchAll(/<a id="((?:world|body)-[^"]+|world)"><\/a>\s*\n###/g)].map((m) => m[1]);
  assert.deepEqual([...expected].sort(), [...entries].sort());
});

test('every type the module exports is named in its declarations, and every call too', () => {
  for (const name of publicNames(World2D)) assert.ok(TYPES.includes(name), `${name} is not in the declarations`);
  for (const name of publicNames(Body2D)) assert.ok(TYPES.includes(name), `${name} is not in the declarations`);
});

test('every link lands, and the index lists every entry and section', () => {
  for (const m of API.matchAll(/\]\(#([^)]+)\)/g)) assert.ok(anchors.has(m[1]), `no anchor ${m[1]}`);
  const start = API.indexOf('\n## Index'), index = API.slice(start, API.indexOf('\n## ', start + 1));
  for (const m of API.matchAll(/<a id="([^"]+)"><\/a>\s*\n##/g)) assert.ok(index.includes(`(#${m[1]})`), `the index has no ${m[1]}`);
});

test('every entry has its heading, its text, and an example', () => {
  for (const m of API.matchAll(/<a id="([^"]+)"><\/a>\n(###[^]*?)(?=\n<a id=|$)/g)) {
    const lines = m[2].split('\n');
    assert.ok(lines[2].length > 0, `${m[1]} has no text`);
    assert.ok(m[2].includes('```js'), `${m[1]} has no example`);
  }
});

test('every example runs, against the real module', () => {
  const PREAMBLE = `
    const world = new World2D();
    const ball = world.addBody({ shape: 'circle', radius: 16, position: [0, 40] });
    const crate = world.addBody({ position: [200, 50] });
  `;
  const all = [...API.matchAll(/```js\n([^]*?)```/g)].map((m) => m[1]);
  assert.ok(all.length > 30, `found ${all.length} examples`);
  for (const code of all) {
    const body = code.split('\n').filter((line) => !line.startsWith('import ')).join('\n');
    // A first line making its own `world` shadows the preamble's, in a block of its own.
    new Function('World2D', 'console', `${PREAMBLE}{${body}}`)(World2D, { log() {} });
  }
});

/** anchor -> the message patterns its Throws line lists. */
const documented = new Map();
for (const m of API.matchAll(/<a id="([^"]+)"><\/a>\n###[^]*?(?=\n<a id=|$)/g)) {
  const line = m[0].split('\n').find((l) => l.startsWith('Throws:'));
  if (!line) continue;
  documented.set(m[1], [...line.matchAll(/`([^`]+)`/g)].map(([, text]) => {
    const parts = text.split(/…|<[^>]+>/).map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    return { text, regex: new RegExp(`^${parts.join('.+')}$`), hit: false };
  }));
}

const fresh = () => { const world = new World2D(); return { world, body: world.addBody() }; };
const dead = () => { const f = fresh(); f.world.remove(f.body); return f; };
const gone = () => { const f = fresh(); f.world.destroy(); return f; };

const OPTIONS = 'type, shape, size, radius, height, vertices, parts, density, mass, inertia, centerOfMass, friction, restitution, damping, angularDamping, gravityScale, layers, mask, group, lockRotation, lockPosition, position, angle, velocity, angularVelocity';

const bodyCases = (call, run) => {
  const e = `world-${call.toLowerCase()}`;
  return [
    [e, run({ tpye: 'static' }), `${call}: unknown option 'tpye' (did you mean 'type'?)`],
    [e, run({ banana: 1 }), `${call}: unknown option 'banana' (the options are ${OPTIONS})`],
    [e, run({ type: 'character' }), `${call}: type must be 'dynamic', 'static' or 'kinematic', got 'character'`],
    [e, run({ shape: 'sphere' }), `${call}: shape must be 'box', 'circle', 'capsule', 'polygon' or 'compound', got 'sphere'`],
    [e, run({ radius: 1 }), `${call}: a box has no radius`],
    [e, run({ size: [1, 0] }), `${call}: size must be 2 positive numbers, got 1,0`],
    [e, run({ shape: 'circle', radius: -1 }), `${call}: radius must be a positive number, got -1`],
    [e, run({ shape: 'capsule', height: 0 }), `${call}: height must be a positive number, got 0`],
    [e, run({ shape: 'capsule', radius: 5, height: 8 }), `${call}: height must be at least twice radius (10), got 8`],
    [e, run({ shape: 'polygon', vertices: [1, 2, 3] }), `${call}: vertices must be finite numbers, two to a vertex, got 1,2,3`],
    [e, run({ shape: 'polygon', vertices: [0, 0, 1, 1, 2, 2] }), `${call}: vertices must span an area (3 points not on one line), got 0,0,1,1,2,2`],
    [e, run({ shape: 'compound', parts: [] }), `${call}: parts must be a list of one or more parts, got an empty array`],
    [e, run({ mass: 1, density: 1 }), `${call}: give mass or density, not both`],
    [e, run({ mass: 0 }), `${call}: mass must be a positive number, got 0`],
    [e, run({ density: Infinity }), `${call}: density must be a positive number, got Infinity`],
    [e, run({ inertia: 0 }), `${call}: inertia must be a positive number, or null to follow the shape, got 0`],
    [e, run({ centerOfMass: [1] }), `${call}: centerOfMass must be 2 finite numbers, got 1`],
    [e, run({ friction: -1 }), `${call}: friction must be 0 or more, got -1`],
    [e, run({ restitution: 2 }), `${call}: restitution must be from 0 to 1, got 2`],
    [e, run({ damping: NaN }), `${call}: damping must be 0 or more, got NaN`],
    [e, run({ angularDamping: -1 }), `${call}: angularDamping must be 0 or more, got -1`],
    [e, run({ gravityScale: '1' }), `${call}: gravityScale must be a finite number, got '1'`],
    [e, run({ layers: 0.5 }), `${call}: layers must be a whole number that fits in 32 bits, got 0.5`],
    [e, run({ mask: 2 ** 32 }), `${call}: mask must be a whole number that fits in 32 bits, got 4294967296`],
    [e, run({ group: -1 }), `${call}: group must be a whole number, 0 or more, got -1`],
    [e, run({ lockRotation: 1 }), `${call}: lockRotation must be true or false, got 1`],
    [e, run({ lockPosition: [true] }), `${call}: lockPosition must be 2 true or false values, got true`],
    [e, run({ position: [0, NaN] }), `${call}: position must be 2 finite numbers, got 0,NaN`],
    [e, run({ angle: Infinity }), `${call}: angle must be a finite number, got Infinity`],
    [e, run({ type: 'static', velocity: [1, 1] }), `${call}: a static body has no velocity`],
    [e, run({ type: 'static', angularVelocity: 1 }), `${call}: a static body has no angularVelocity`],
    [e, run({ velocity: 3 }), `${call}: velocity must be 2 finite numbers, got 3`],
    [e, run({ angularVelocity: 'x' }), `${call}: angularVelocity must be a finite number, got 'x'`],
  ];
};

const addParts = (parts) => () => fresh().world.addBody({ shape: 'compound', parts });
const CASES = [
  ['world', () => new World2D(3), 'World2D: options must be an object, got 3'],
  ['world', () => new World2D({ gravty: [0, 0] }), "World2D: unknown option 'gravty' (did you mean 'gravity'?)"],
  ['world', () => new World2D({ banana: 1 }), "World2D: unknown option 'banana' (the options are gravity, substeps, sleeping)"],
  ['world', () => new World2D({ gravity: [0, 0, 0] }), 'World2D: gravity must be 2 finite numbers, got 0,0,0'],
  ['world', () => new World2D({ substeps: 0 }), 'World2D: substeps must be a whole number, 1 or more, got 0'],
  ['world', () => new World2D({ sleeping: 1 }), 'World2D: sleeping must be true or false, got 1'],
  ['world-sleeping', () => gone().world.sleeping, 'world.sleeping: this world was destroyed'],
  ['world-sleeping', () => { fresh().world.sleeping = 1; }, 'world.sleeping must be true or false, got 1'],
  ['world-moved', () => gone().world.moved(0), 'moved: this world was destroyed'],
  ['world-moved', () => fresh().world.moved(-1), 'moved: since must be a whole number, 0 or more, got -1'],
  ['world-gravity', () => gone().world.gravity, 'world.gravity: this world was destroyed'],
  ['world-gravity', () => { fresh().world.gravity = [1]; }, 'world.gravity must be 2 finite numbers, got 1'],
  ['world-substeps', () => gone().world.substeps, 'world.substeps: this world was destroyed'],
  ['world-substeps', () => { fresh().world.substeps = 1.5; }, 'world.substeps must be a whole number, 1 or more, got 1.5'],
  ...['bodyCount', 'stepCount', 'transforms', 'previous'].flatMap((p) => [
    [`world-${p.toLowerCase()}`, () => gone().world[p], `world.${p}: this world was destroyed`],
    [`world-${p.toLowerCase()}`, () => { fresh().world[p] = 1; }, `world.${p} is read only`],
  ]),
  ['world-addbody', () => gone().world.addBody(), 'addBody: this world was destroyed'],
  ['world-addbody', () => fresh().world.addBody(3), 'addBody: options must be an object, got 3'],
  ['world-addbody', () => { const { world } = fresh(); world._slots.limit = 1; world.addBody(); }, 'addBody: a world holds at most 16777216 bodies (the slot field of an id is 24 bits)'],
  ...bodyCases('addBody', (o) => () => fresh().world.addBody(o)),
  ['world-addbody', addParts([3]), 'addBody: parts[0] must be an object, got 3'],
  ['world-addbody', addParts([{ sise: [1, 1] }]), "addBody: parts[0]: unknown option 'sise' (did you mean 'size'?)"],
  ['world-addbody', addParts([{ banana: 1 }]), "addBody: parts[0]: unknown option 'banana' (the options are shape, size, radius, height, vertices, position, angle, density)"],
  ['world-addbody', addParts([{ shape: 'compound' }]), "addBody: parts[0].shape must be 'box', 'circle', 'capsule' or 'polygon', got 'compound'"],
  ['world-addbody', addParts([{ radius: 1 }]), 'addBody: parts[0]: a box has no radius'],
  ['world-addbody', addParts([{ size: [0, 1] }]), 'addBody: parts[0].size must be 2 positive numbers, got 0,1'],
  ['world-addbody', addParts([{ shape: 'circle', radius: 0 }]), 'addBody: parts[0].radius must be a positive number, got 0'],
  ['world-addbody', addParts([{ shape: 'capsule', height: 0 }]), 'addBody: parts[0].height must be a positive number, got 0'],
  ['world-addbody', addParts([{ shape: 'capsule', radius: 5, height: 8 }]), 'addBody: parts[0].height must be at least twice radius (10), got 8'],
  ['world-addbody', addParts([{ shape: 'polygon', vertices: [1] }]), 'addBody: parts[0].vertices must be finite numbers, two to a vertex, got 1'],
  ['world-addbody', addParts([{ shape: 'polygon', vertices: [0, 0, 1, 0, 2, 0] }]), 'addBody: parts[0].vertices must span an area (3 points not on one line), got 0,0,1,0,2,0'],
  ['world-addbody', addParts([{ position: 1 }]), 'addBody: parts[0].position must be 2 finite numbers, got 1'],
  ['world-addbody', addParts([{ angle: NaN }]), 'addBody: parts[0].angle must be a finite number, got NaN'],
  ['world-addbody', addParts([{ density: 0 }]), 'addBody: parts[0].density must be a positive number, got 0'],
  ['world-setbody', () => gone().world.setBody(gone().body, {}), 'setBody: this world was destroyed'],
  ['world-setbody', () => fresh().world.setBody(3, {}), 'setBody: body must be a Body2D, got 3'],
  ['world-setbody', () => fresh().world.setBody(fresh().body, {}), 'setBody: body belongs to another world'],
  ['world-setbody', () => { const { world, body } = dead(); world.setBody(body, {}); }, 'setBody: body was removed'],
  ['world-setbody', () => { const { world, body } = fresh(); world.setBody(body, 3); }, 'setBody: changes must be an object, got 3'],
  ...bodyCases('setBody', (o) => () => { const { world, body } = fresh(); world.setBody(body, o); }),
  ['world-bodyof', () => gone().world.bodyOf(gone().body), 'bodyOf: this world was destroyed'],
  ['world-bodyof', () => fresh().world.bodyOf({}), 'bodyOf: body must be a Body2D, got an object'],
  ['world-bodyof', () => fresh().world.bodyOf(fresh().body), 'bodyOf: body belongs to another world'],
  ['world-bodyof', () => { const { world, body } = dead(); world.bodyOf(body); }, 'bodyOf: body was removed'],
  ['world-remove', () => gone().world.remove(gone().body), 'remove: this world was destroyed'],
  ['world-remove', () => fresh().world.remove(3), 'remove: handle must be a Body2D, got 3'],
  ['world-remove', () => fresh().world.remove(fresh().body), 'remove: handle belongs to another world'],
  ['world-body', () => gone().world.body(0), 'body: this world was destroyed'],
  ['world-body', () => fresh().world.body(-1), 'body: id must be a whole number from 0 to 9007199254740991, got -1'],
  ['world-step', () => gone().world.step(1), 'step: this world was destroyed'],
  ['world-step', () => fresh().world.step(0), 'step: dt must be a positive number of seconds, got 0'],
  ['body-asleep', () => gone().body.asleep, 'body.asleep: this world was destroyed'],
  ['body-asleep', () => dead().body.asleep, 'body.asleep: this body was removed'],
  ['body-asleep', () => { fresh().body.asleep = true; }, 'body.asleep is read only'],
  ...['id', 'slot', 'world', 'alive'].map((p) => [`body-${p}`, () => { fresh().body[p] = 1; }, `body.${p} is read only`]),
  ...[['mass', 'setBody(body, { mass })'], ['inertia', 'setBody(body, { inertia })'], ['position', 'setPosition(x, y)'],
    ['angle', 'setAngle(radians)'], ['worldCenterOfMass', 'setBody(body, { centerOfMass })'], ['velocity', 'setVelocity(x, y)'],
    ['angularVelocity', 'setAngularVelocity(radians)']].flatMap(([p, hint]) => [
    [`body-${p.toLowerCase()}`, () => gone().body[p], `body.${p}: this world was destroyed`],
    [`body-${p.toLowerCase()}`, () => dead().body[p], `body.${p}: this body was removed`],
    [`body-${p.toLowerCase()}`, () => { fresh().body[p] = 1; }, `body.${p} is read only; use ${hint}`],
  ]),
  ...[['setPosition', [0, 0]], ['setAngle', [0]], ['setVelocity', [0, 0]], ['setAngularVelocity', [0]], ['moveTo', [[0, 0], null, 1]],
    ['applyForce', [[0, 0]]], ['applyTorque', [0]], ['applyImpulse', [[0, 0]]], ['applyAngularImpulse', [0]]].flatMap(([m, args]) => [
    [`body-${m.toLowerCase()}`, () => gone().body[m](...args), `${m}: this world was destroyed`],
    [`body-${m.toLowerCase()}`, () => dead().body[m](...args), `${m}: this body was removed`],
  ]),
  ['body-setposition', () => fresh().body.setPosition(1, NaN), 'setPosition: x and y must be finite numbers, got 1,NaN'],
  ['body-setangle', () => fresh().body.setAngle('1'), "setAngle: radians must be a finite number, got '1'"],
  ['body-setvelocity', () => fresh().body.setVelocity(1), 'setVelocity: x and y must be finite numbers, got 1,undefined'],
  ['body-setvelocity', () => new World2D().addBody({ type: 'static' }).setVelocity(1, 0), 'setVelocity: a static body has no velocity'],
  ['body-setangularvelocity', () => fresh().body.setAngularVelocity(NaN), 'setAngularVelocity: radians must be a finite number, got NaN'],
  ['body-setangularvelocity', () => new World2D().addBody({ type: 'static' }).setAngularVelocity(1), 'setAngularVelocity: a static body has no angularVelocity'],
  ['body-moveto', () => fresh().body.moveTo([0], null, 1), 'moveTo: position must be 2 finite numbers, got 0'],
  ['body-moveto', () => fresh().body.moveTo([0, 0], NaN, 1), 'moveTo: angle must be a finite number, got NaN'],
  ['body-moveto', () => fresh().body.moveTo([0, 0], 0, 0), 'moveTo: dt must be a positive number, got 0'],
  ['body-moveto', () => new World2D().addBody({ type: 'static' }).moveTo([0, 0], 0, 1), 'moveTo: a static body has no velocity'],
  ['body-applyforce', () => fresh().body.applyForce([1]), 'applyForce: force must be 2 finite numbers, got 1'],
  ['body-applyforce', () => fresh().body.applyForce([1, 1], 3), 'applyForce: point must be 2 finite numbers, got 3'],
  ['body-applytorque', () => fresh().body.applyTorque('1'), "applyTorque: torque must be a finite number, got '1'"],
  ['body-applyimpulse', () => fresh().body.applyImpulse(1), 'applyImpulse: impulse must be 2 finite numbers, got 1'],
  ['body-applyimpulse', () => fresh().body.applyImpulse([1, 1], [1]), 'applyImpulse: point must be 2 finite numbers, got 1'],
  ['body-applyangularimpulse', () => fresh().body.applyAngularImpulse(NaN), 'applyAngularImpulse: impulse must be a finite number, got NaN'],
  ['body-destroy', () => gone().body.destroy(), 'destroy: this world was destroyed'],
];

test('every case throws exactly its message, and that message is listed in its entry', () => {
  for (const [entry, run, message] of CASES) {
    assert.equal(thrown(run), message);
    const patterns = documented.get(entry);
    assert.ok(patterns, `no Throws line in ${entry}`);
    const found = patterns.filter((p) => p.regex.test(message));
    assert.ok(found.length > 0, `${entry} doesn't list: ${message}`);
    for (const p of found) p.hit = true;
  }
});

test('every message listed is thrown by some case', () => {
  for (const [entry, patterns] of documented) {
    for (const p of patterns) assert.ok(p.hit, `${entry} lists one no case throws: ${p.text}`);
  }
});

test('a call that throws changes nothing', () => {
  const { world, body } = fresh();
  body.setPosition(3, 4).setVelocity(1, 2);
  const before = JSON.stringify(world.bodyOf(body));
  assert.throws(() => world.setBody(body, { position: [9, 9], velocity: [9, 9], mass: -1 }));
  assert.throws(() => body.setVelocity(1, NaN));
  assert.throws(() => body.moveTo([1, 1], 0, -1));
  assert.equal(JSON.stringify(world.bodyOf(body)), before);
});
