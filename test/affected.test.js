// What a change is checked by (.github/affected.js). Run: node test/affected.test.js
//
// The plan as CI makes it needs git; this is its arithmetic: the import graph,
// folders read whole, the suites read from `npm test`, and what runs when in doubt.

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

import { reaches, holds, suitesOf, plan } from '../.github/affected.js';

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

test('a file reaches what it imports and loads by URL, all the way down', () => {
  const files = {
    'test/x.test.js': "import { a } from '../src/a.js';\nconst w = new URL('../src/w.js', import.meta.url);",
    'src/a.js': "export { b } from './b.js';\nimport('./lazy.js');",
    'src/b.js': '',
    'src/lazy.js': "import { a } from './a.js';",
    'src/w.js': '',
  };
  const set = reaches('test/x.test.js', (f) => files[f]);
  assert.deepEqual([...set].sort(), ['src/a.js', 'src/b.js', 'src/lazy.js', 'src/w.js', 'test/x.test.js']);
});

test('a URL to a folder reaches every file under it', () => {
  const set = reaches('test/m.test.js', () => "const root = new URL('../src/', import.meta.url);");
  assert.ok(holds(set, 'src/core/math.js'));
  assert.ok(!holds(set, 'docs/API.md'));
  assert.ok(!holds(reaches('test/m.test.js', () => "import '../src/a.js';"), 'src/ab.js'), 'a file is not a folder');
});

test("each suite runs with the flags `npm test` gives it", () => {
  const script = 'node test/a.test.js && node --allow-natives-syntax test/b.test.js && node --expose-gc test/c.test.js';
  assert.deepEqual(suitesOf(script), [
    { suite: 'test/a.test.js', command: 'node test/a.test.js' },
    { suite: 'test/b.test.js', command: 'node --allow-natives-syntax test/b.test.js' },
    { suite: 'test/c.test.js', command: 'node --expose-gc test/c.test.js' },
  ]);
});

test('every suite in test/ is one `npm test` runs, so CI can choose it', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const named = suitesOf(pkg.scripts.test).map((s) => s.suite).sort();
  const files = readdirSync(new URL('.', import.meta.url)).filter((f) => f.endsWith('.test.js')).map((f) => `test/${f}`).sort();
  assert.deepEqual(named, files);
});

test('with no base to compare with, everything runs', () => {
  const p = plan('0000000000000000000000000000000000000000', 'HEAD');
  assert.ok(p.node.length > 10 && p.types === true);
});

console.log(`\n${passed} checks passed\n`);
