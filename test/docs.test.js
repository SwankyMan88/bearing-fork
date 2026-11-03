// The API reference is complete, every link in it and the README and docs goes
// somewhere, and every example in the reference, the README and the
// side-by-side's Bearing program runs (docs/ENGINES.md's are run by
// test/engines.test.js).
// Run: node test/docs.test.js
//
// Written by hand, docs/API.md drifts the moment a method is added without an
// entry, an entry is renamed out from under a link, or an example stops
// matching the code. So what it must cover is read from the code itself --
// every public method and getter of every exported class -- and each example
// is run against the real package.

import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { World, Body, Joint, readGlb } from '../src/bearing.js';
import * as bearing from '../src/bearing.js';
import { suite, test } from './test.js';

suite('docs');

const API = readFileSync(new URL('../docs/API.md', import.meta.url), 'utf8');
const README = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
// docs/ENGINES.md's examples are run by test/engines.test.js, against stand-ins for each engine;
// here only its links are checked.
const SIDE = readFileSync(new URL('../docs/SIDE-BY-SIDE.md', import.meta.url), 'utf8');
const ENGINES = readFileSync(new URL('../docs/ENGINES.md', import.meta.url), 'utf8');
const anchors = new Set([...API.matchAll(/<a id="([^"]+)"><\/a>/g)].map((m) => m[1]));

/** Every public method and getter a class's instances have, as `prefix-name` anchors. Underscored names are internal. */
function surface(prefix, cls) {
  return Object.getOwnPropertyNames(cls.prototype)
    .filter((name) => name !== 'constructor' && !name.startsWith('_'))
    .map((name) => `${prefix}-${name.toLowerCase()}`);
}

/** A class's own static methods, as `prefix-name` anchors: World.load. */
function statics(prefix, cls) {
  return Object.getOwnPropertyNames(cls)
    .filter((name) => !['length', 'name', 'prototype'].includes(name) && !name.startsWith('_'))
    .map((name) => `${prefix}-${name.toLowerCase()}`);
}

const expected = ['world', 'readglb', ...surface('world', World), ...statics('world', World), ...surface('body', Body), ...surface('joint', Joint)];

test('the package exports World, Body, Joint and readGlb, and nothing else', () => {
  assert.deepEqual(Object.keys(bearing).sort(), ['Body', 'Joint', 'World', 'readGlb']);
});

test('every public method and getter has an entry', () => {
  const missing = expected.filter((id) => !anchors.has(id));
  assert.deepEqual(missing, [], `no entry for: ${missing.join(', ')}`);
});

test('every type the package exports is named in the reference', () => {
  const types = readFileSync(new URL('../src/bearing.d.ts', import.meta.url), 'utf8');
  const names = [...types.matchAll(/^export (?:type|interface) (\w+)/gm)].map((m) => m[1]);
  const missing = names.filter((name) => !API.includes(`\`${name}\``));
  assert.deepEqual(missing, [], `not named in docs/API.md: ${missing.join(', ')}`);
});

test('every entry is for something that exists', () => {
  const entries = [...API.matchAll(/<a id="((?:world|body|joint)-[^"]+|world|readglb)"><\/a>\s*\n###/g)].map((m) => m[1]);
  const stale = entries.filter((id) => !expected.includes(id));
  assert.deepEqual(stale, [], `entries for nothing: ${stale.join(', ')}`);
});

test('every link to an entry lands on one', () => {
  const inPage = [...API.matchAll(/\]\(#([^)]+)\)/g)].map((m) => m[1]);
  const fromReadme = [...README.matchAll(/\]\(docs\/API\.md#([^)]+)\)/g)].map((m) => m[1]);
  const fromDocs = [...`${SIDE}${ENGINES}`.matchAll(/\]\(API\.md#([^)]+)\)/g)].map((m) => m[1]);
  const broken = [...new Set([...inPage, ...fromReadme, ...fromDocs])].filter((id) => !anchors.has(id));
  assert.deepEqual(broken, [], `links to nothing: ${broken.join(', ')}`);
});

test('every link from the README and the docs to a file finds it, and every link to a README heading lands on one', () => {
  const local = /\]\(((?!https?:|#)[^)#]+)(?:#[^)]*)?\)/g;
  const files = [
    ...[...README.matchAll(local)].map((m) => new URL(`../${m[1]}`, import.meta.url)),
    ...[...`${API}${SIDE}${ENGINES}`.matchAll(local)].map((m) => new URL(`../docs/${m[1]}`, import.meta.url)),
  ];
  const missing = files.filter((url) => !existsSync(url)).map((url) => url.pathname);
  assert.deepEqual(missing, [], `links to nothing: ${missing.join(', ')}`);
  // GitHub's heading ids: lower case, punctuation dropped, spaces to hyphens.
  const headings = new Set([...README.matchAll(/^#+ (.+)$/gm)].map((m) => m[1].toLowerCase().replace(/[^\w\- ]/g, '').replace(/ /g, '-')));
  const toReadme = [...README.matchAll(/\]\(#([^)]+)\)/g), ...`${SIDE}${ENGINES}`.matchAll(/\]\(\.\.\/README\.md#([^)]+)\)/g)].map((m) => m[1]);
  const lost = toReadme.filter((id) => !headings.has(id));
  assert.deepEqual(lost, [], `README headings that aren't there: ${lost.join(', ')}`);
});

test("the side-by-side's Bearing program runs as printed, and its box ends at rest on the floor", () => {
  const programs = examples(SIDE);
  // One for each engine; only Bearing's can run here, since the others need their engines
  // (they are run, as printed, in a browser page that loads each one).
  assert.deepEqual(programs.map((code) => code.match(/from '([^']+)'/)[1]),
    ['bearing-physics', '@dimforge/rapier3d-simd-compat', 'cannon-es', 'jolt-physics']);
  // The line count table counts what is printed.
  const counted = SIDE.match(/^\| Lines, blank lines excluded \|(.+)\|$/m)[1].split('|').map(Number);
  assert.deepEqual(counted, programs.map((code) => code.split('\n').filter((line) => line.trim()).length));
  const printed = [];
  const body = programs[0].split('\n').filter((line) => !line.startsWith('import ')).join('\n');
  new Function('World', 'console', body)(World, { log: (...args) => printed.push(args) });
  assert.equal(printed.length, 1);
  const [[[x, y, z]]] = printed;
  // On its face, its centre half a metre up, within a contact's tolerance (5 mm for a 1 m box).
  assert.ok(Math.abs(y - 0.5) < 0.005, `the box ended at y = ${y}`);
  // Knocked along +x by the ball, and no other way.
  assert.ok(x > 0 && Math.abs(z) < 1e-9, `the box ended at [${x}, ${y}, ${z}]`);
});

test('the index lists every entry and section', () => {
  const start = API.indexOf('\n## Index');
  const end = API.indexOf('\n## ', start + 1);
  const index = API.slice(start, end);
  const listed = new Set([...index.matchAll(/\]\(#([^)]+)\)/g)].map((m) => m[1]));
  const entries = [...API.matchAll(/<a id="([^"]+)"><\/a>\s*\n###/g)].map((m) => m[1]);
  const missing = entries.filter((id) => !listed.has(id));
  assert.deepEqual(missing, [], `not in the index: ${missing.join(', ')}`);
});

test('every entry has its parts in order: heading, text, Throws if it throws, example', () => {
  for (const m of API.matchAll(/<a id="([^"]+)"><\/a>\n(###[^]*?)(?=\n<a id=|$)/g)) {
    const [, id, body] = m;
    assert.match(body, /^### `[^`]+`( → `[^`]+`)?\n\n\S/, `${id}: heading, then a sentence`);
    assert.match(body, /```js\n/, `${id}: an example`);
    const throws = body.indexOf('\nThrows:'), example = body.indexOf('```js');
    if (throws >= 0) assert.ok(throws < example, `${id}: Throws comes before the example`);
  }
});

/**
 * Every ```js block runs, against the real package. Each gets the same
 * starting world, so an example can use `ball` or `crate` without making
 * them, and each runs in a fresh block, so one can't spoil the next. Import
 * lines are dropped: World and readGlb are passed in, and levelBytes is a
 * small .glb, a floor and a flight of stairs, for readGlb's examples.
 */
const PREAMBLE = `
  const world = new World();
  const levelBytes = makeLevel();
  const ball = world.addBody({ shape: 'sphere', radius: 0.5, position: [0, 4, 0] });
  const crate = world.addBody({ position: [2, 0.5, 0] });
  const player = world.addBody({ shape: 'capsule', radius: 0.3, height: 1.8, mass: 80 });
  const bodies = [ball, crate];
`;
const quiet = { log() {} };

/** A .glb of two nodes, 'floor' and 'stairs', each one triangle: enough for an example to read. */
function makeLevel() {
  const corners = new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 1]);
  let text = JSON.stringify({
    asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0, 1] }],
    nodes: [{ name: 'floor', mesh: 0 }, { name: 'stairs', mesh: 0, translation: [0, 1, 0] }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' }],
    bufferViews: [{ buffer: 0, byteLength: 36 }], buffers: [{ byteLength: 36 }],
  });
  while (text.length % 4) text += ' ';
  const j = new TextEncoder().encode(text), out = new Uint8Array(20 + j.length + 8 + 36), v = new DataView(out.buffer);
  v.setUint32(0, 0x46546c67, true); v.setUint32(4, 2, true); v.setUint32(8, out.length, true);
  v.setUint32(12, j.length, true); v.setUint32(16, 0x4e4f534a, true); out.set(j, 20);
  v.setUint32(20 + j.length, 36, true); v.setUint32(24 + j.length, 0x004e4942, true);
  out.set(new Uint8Array(corners.buffer), 28 + j.length);
  return out;
}

function examples(markdown) {
  return [...markdown.matchAll(/```js\n([^]*?)```/g)].map((m) => m[1]);
}

test('every example in the API reference and the README runs', () => {
  const all = [...examples(API), ...examples(README)];
  // At least one per entry, or the pattern above has stopped finding them.
  assert.ok(all.length >= expected.length, `found ${all.length} examples`);
  for (const code of all) {
    const body = code.split('\n').filter((line) => !line.startsWith('import ')).join('\n');
    try {
      new Function('World', 'readGlb', 'makeLevel', 'console', `${PREAMBLE}\n{\n${body}\n}`)(World, readGlb, makeLevel, quiet);
    } catch (e) {
      assert.fail(`this example throws ${e.message}:\n${code}`);
    }
  }
});
