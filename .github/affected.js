// What a change has to be checked by, and nothing else. Winding's .github/affected.js,
// its Node-suite part: Bearing has no GPU suite.
//
//   node .github/affected.js <base> <head>     -> GITHUB_OUTPUT lines: node, types
//
// A SUITE runs when a changed file is in what it imports, or reads through
// new URL(..., import.meta.url), followed all the way down. A URL to a folder
// (math.test.js reads all of src/) reaches every file under it. Each suite runs
// as `npm test` runs it, with the same node flags: the commands are read from
// package.json's test script, so a suite that isn't in `npm test` isn't in CI.
//
// THE TYPES are checked when a declaration file or test/types.ts changed.
//
// WHEN IN DOUBT, EVERYTHING: a change to package.json (but a release's version
// alone), to CI or to this file, a file added or removed anywhere (the docs'
// links name files), or a base git cannot diff against.

import { execFileSync } from 'node:child_process';
import { readFileSync, appendFileSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Changes that are checked by everything there is. */
const EVERYTHING = [/^package\.json$/, /^\.github\/workflows\//, /^\.github\/affected\.js$/];

const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });

/** Every file `file` reaches: its imports and new URL() references, followed down. Paths relative to the root; a folder ends in '/'. */
export function reaches(file, read = (f) => readFileSync(join(ROOT, f), 'utf8'), seen = new Set()) {
  if (seen.has(file)) return seen;
  seen.add(file);
  if (!/\.m?js$/.test(file)) return seen;
  let text;
  try { text = read(file); } catch { return seen; }
  const refs = [
    ...text.matchAll(/\bfrom\s*['"](\.{1,2}\/[^'"]+)['"]/g),
    ...text.matchAll(/\bimport\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g),
    ...text.matchAll(/new URL\(\s*['"](\.{1,2}\/[^'"]*)['"]\s*,\s*import\.meta\.url\s*\)/g),
  ];
  for (const [, ref] of refs) reaches(normalize(join(dirname(file), ref)).replaceAll('\\', '/'), read, seen);
  return seen;
}

/** Whether a set from reaches() holds `file`, itself or in a folder it reads. */
export function holds(set, file) {
  if (set.has(file)) return true;
  for (const f of set) if (f.endsWith('/') && file.startsWith(f)) return true;
  return false;
}

/** The suites of `npm test`, in its order, each as it runs there: [{ suite, command }]. */
export function suitesOf(script) {
  return [...script.matchAll(/node((?:\s+--[\w-]+)*)\s+(test\/[\w.-]+\.test\.js)/g)]
    .map(([command, , suite]) => ({ suite, command: command.replace(/\s+/g, ' ') }));
}

/** The plan for the change base..head. */
export function plan(base, head) {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const suites = suitesOf(pkg.scripts.test);
  const all = { node: suites, types: true };
  let changed, status;
  try {
    if (/^0+$/.test(base)) throw new Error('no base');
    status = git('diff', '--name-status', '--no-renames', base, head).split('\n').filter(Boolean).map((l) => l.split('\t'));
    changed = status.map(([, f]) => f);
  } catch {
    return { ...all, why: ['no base to compare with: everything'] };
  }
  // A release bumps package.json's version and nothing else of it: that runs nothing.
  const versionOnly = (f) => f === 'package.json'
    && git('diff', '-U0', base, head, '--', f).split('\n').filter((l) => /^[+-](?![+-])/.test(l)).every((l) => /"version":/.test(l));
  if (changed.some((f) => EVERYTHING.some((re) => re.test(f)) && !versionOnly(f))) return { ...all, why: ['CI itself changed: everything'] };
  if (status.some(([s]) => s === 'A' || s === 'D')) return { ...all, why: ['a file was added or removed: everything'] };

  const node = suites.filter(({ suite }) => { const set = reaches(suite); return changed.some((f) => holds(set, f)); });
  const types = changed.some((f) => /\.d\.ts$/.test(f) || f === 'test/types.ts');
  return { node, types, why: [`${node.length} of ${suites.length} Node suites`, types ? 'the types' : 'not the types'] };
}

if (process.argv[1] && relative(process.argv[1], fileURLToPath(import.meta.url)) === '') {
  const [base = 'HEAD~1', head = 'HEAD'] = process.argv.slice(2);
  const p = plan(base, head);
  const lines = [`node=${p.node.map((s) => s.command).join(' && ')}`, `types=${p.types}`];
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`);
  console.log(lines.join('\n'));
  for (const reason of p.why) console.log(`# ${reason}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### What this change is checked by\n\n${p.why.map((w) => `- ${w}`).join('\n')}\n`);
  }
}
