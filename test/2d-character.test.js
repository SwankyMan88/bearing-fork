// 2D character bodies: walking on tiles, slopes and what moves.
// Run: node test/2d-character.test.js

import assert from 'node:assert/strict';
import { World2D } from '../src/2d/bearing2d.js';
import { suite, test } from './test.js';

suite('2d character');

const DT = 1 / 60, T = 16, R = 7, H = 44;
const near = (a, b, tolerance, what = '') => assert.ok(Math.abs(a - b) <= tolerance, `${what} ${a}, expected ${b}`);
const person = (world, at, o = {}) => world.addBody({ type: 'character', shape: 'capsule', radius: R, height: H, position: at, ...o });

/** A map of `rows` x `columns`, solid from row 30 down, ends walled. `edit(tiles, set)` draws more. */
function level(world, edit, columns = 100, rows = 40) {
  const tiles = new Uint32Array(columns * rows), set = (c, r, id = 1) => { tiles[r * columns + c] = id; };
  for (let r = 30; r < rows; r++) for (let c = 0; c < columns; c++) set(c, r);
  for (let r = 0; r < rows; r++) { set(0, r); set(columns - 1, r); }
  edit?.(set);
  return world.addBody({ shape: 'tilemap', tileSize: [T, T], columns, rows, tiles });
}
const FLOOR = 30 * T;
const walkFor = (world, hero, vx, steps) => {
  for (let i = 0; i < steps; i++) { hero.setVelocity(vx, hero.velocity[1]); world.step(DT); }
};

test('it stands on tiles, walks over their seams at the speed it is given, and groundOf says on what', () => {
  const world = new World2D();
  const map = level(world);
  const hero = person(world, [100, FLOOR - H / 2 - 10]);
  world.step(DT);
  assert.equal(world.groundOf(hero), null, 'in the air');
  for (let i = 0; i < 30; i++) world.step(DT);
  near(hero.position[1], FLOOR - H / 2, 0.2, 'stood');
  const ground = world.groundOf(hero);
  assert.equal(ground.body.id, map.id);
  assert.deepEqual(ground.normal.map((x) => x + 0), [0, -1]);
  const x = hero.position[0];
  walkFor(world, hero, 200, 60);
  near(hero.position[0], x + 200, 0.5, 'walked');
  near(hero.position[1], FLOOR - H / 2, 0.2, 'level');
  near(hero.velocity[0], 200, 1e-9);
  assert.equal(hero.asleep, false);
});

test('it stops at a wall, keeping what runs along it, and falls and lands', () => {
  const world = new World2D();
  level(world, (set) => { for (let r = 10; r < 30; r++) set(40, r); });
  const hero = person(world, [500, FLOOR - H / 2]);
  world.step(DT);
  walkFor(world, hero, 300, 120);
  near(hero.position[0] + R, 40 * T, 0.2, 'stopped at the wall');
  near(hero.velocity[0], 0, 1e-6, 'its own speed into it is gone');
  // A jump: up, and down again, and it lands.
  hero.setVelocity(0, -400);
  world.step(DT);
  assert.equal(world.groundOf(hero), null, 'off the ground');
  assert.equal(hero.velocity[1], -400, 'gravity starts once it is in the air');
  let top = Infinity;
  for (let i = 0; i < 90; i++) { hero.setVelocity(0, hero.velocity[1]); world.step(DT); top = Math.min(top, hero.position[1]); }
  near(FLOOR - H / 2 - top, 400 * 400 / (2 * 980), 8, 'rose v²/2g');
  near(hero.position[1], FLOOR - H / 2, 0.2, 'landed');
  assert.ok(world.groundOf(hero));
  assert.equal(hero.velocity[1], 0);
});

test('it climbs a step no taller than stepHeight, by tile, and a taller one stops it', () => {
  const stair = (set) => { set(30, 29); set(31, 29); set(31, 28); set(40, 29); set(40, 28); };
  const world = new World2D();
  level(world, stair);
  const hero = person(world, [400, FLOOR - H / 2], { stepHeight: T });
  world.step(DT);
  let top = Infinity;
  for (let i = 0; i < 160; i++) { hero.setVelocity(150, hero.velocity[1]); world.step(DT); top = Math.min(top, hero.position[1]); }
  near(top, FLOOR - H / 2 - 2 * T, 0.2, 'up two steps of a tile');
  near(hero.position[0] + R, 40 * T, 0.2, 'down again, and stopped by two tiles');
  // A box, as in most tile games: exactly a tile is a step, flat foot and all.
  const flat = new World2D();
  level(flat, stair);
  const block = flat.addBody({ type: 'character', size: [14, H], position: [400, FLOOR - H / 2], stepHeight: T });
  flat.step(DT);
  walkFor(flat, block, 150, 44);
  near(block.position[1], FLOOR - H / 2 - 2 * T, 0.2, 'a box up two tiles');
  // The default, a ninth of its height, is less than a tile: blocked.
  const low = new World2D();
  level(low, stair);
  const short = person(low, [400, FLOOR - H / 2]);
  low.step(DT);
  walkFor(low, short, 150, 80);
  near(short.position[0] + R, 30 * T, 0.5, 'blocked by a tile');
});

test('it walks up a slope to maxSlope at the speed across, down it without leaving it, and not up a steeper one', () => {
  const slope = (rise) => {
    const world = new World2D();
    world.addBody({ shape: 'chain', vertices: [-1000, 0, 0, 0, 1000, -1000 * rise, 3000, -1000 * rise] });
    return world;
  };
  const gentle = slope(0.5), hero = person(gentle, [-100, -H / 2]);
  gentle.step(DT);
  walkFor(gentle, hero, 200, 90);
  near(hero.position[0], -100 + 300, 2, 'across, at its speed');
  assert.ok(hero.position[1] < -H / 2 - 50, `it didn't climb: ${hero.position[1]}`);
  const n = gentle.groundOf(hero).normal;
  near(Math.abs(n[1]), 2 / Math.sqrt(5), 1e-6, 'on the slope');
  const y = hero.position[1];
  let air = 0;
  for (let i = 0; i < 45; i++) { hero.setVelocity(-200, hero.velocity[1]); gentle.step(DT); if (!gentle.groundOf(hero)) air++; }
  assert.equal(air, 0, 'it left the ground going down');
  assert.ok(hero.position[1] > y + 50);
  const steep = slope(2), stuck = person(steep, [-60, -H / 2]);
  steep.step(DT);
  walkFor(steep, stuck, 200, 120);
  assert.ok(stuck.position[1] > -H / 2 - 40, `it climbed a 63° slope to ${stuck.position[1]}`);
});

test('mined out from under it, it falls; it rides what it stands on; it pushes, given a pushForce', () => {
  const world = new World2D();
  const map = level(world);
  const hero = person(world, [168, FLOOR - H / 2]);
  world.step(DT);
  world.setTile(map, 10, 30, 0);
  world.setTile(map, 9, 30, 0);
  world.setTile(map, 11, 30, 0);
  for (let i = 0; i < 30; i++) world.step(DT);
  near(hero.position[1], FLOOR + T - H / 2, 0.3, 'in the hole');
  const lift = world.addBody({ type: 'kinematic', size: [80, 10], position: [600, FLOOR - 5], velocity: [100, -30] });
  const rider = person(world, [600, FLOOR - 10 - H / 2 - 1]);
  for (let i = 0; i < 5; i++) world.step(DT);
  assert.equal(world.groundOf(rider).body.id, lift.id);
  const across = rider.position[0] - lift.position[0];
  for (let i = 0; i < 60; i++) world.step(DT);
  near(rider.position[0] - lift.position[0], across, 1e-6, 'carried across');
  near(rider.position[1], lift.position[1] - 5 - H / 2, 0.2, 'carried up');
  // Walking at a crate.
  const crateAt = (pushForce) => {
    const w = new World2D();
    level(w);
    const crate = w.addBody({ size: [32, 32], position: [300, FLOOR - 16], mass: 20 });
    const c = person(w, [200, FLOOR - H / 2], { pushForce });
    w.step(DT);
    walkFor(w, c, 200, 120);
    return crate.position[0] - 300;
  };
  assert.equal(crateAt(0), 0);
  assert.ok(crateAt(200000) > 50, 'it pushed nothing');
});

test('crates land on it and stand, it blocks what it would collide with, and the same walk gives the same path', () => {
  const world = new World2D();
  level(world);
  const hero = person(world, [320, FLOOR - H / 2], { layers: 2, mask: 3 });
  world.step(DT);
  const crate = world.addBody({ size: [20, 20], position: [320, FLOOR - 150] });
  const ghost = world.addBody({ size: [20, 20], position: [420, FLOOR - 10], layers: 4, mask: 4, gravityScale: 0 });
  for (let i = 0; i < 90; i++) world.step(DT);
  near(crate.position[1], FLOOR - H - 10, 3, 'landed on its head');
  near(hero.position[1], FLOOR - H / 2, 0.2, 'it did not move');
  walkFor(world, hero, 200, 60);
  assert.ok(hero.position[0] > 450, 'a body it does not collide with stopped it');
  void ghost;
  const run = () => {
    const w = new World2D();
    level(w, (set) => { for (let k = 0; k < 6; k++) set(30 + k * 6, 29); });
    const c = person(w, [300, FLOOR - H / 2 - 2], { stepHeight: T });
    const path = [];
    for (let i = 0; i < 300; i++) { c.setVelocity(i % 90 < 60 ? 180 : -60, i % 70 === 0 ? -250 : c.velocity[1]); w.step(DT); path.push(...c.position); }
    return path;
  };
  const a = run(), b = run();
  assert.ok(a.every((x, i) => Object.is(x, b[i])));
});

test('a round foot stands on a ledge past its edge, and with the ground gone it falls', () => {
  const world = new World2D();
  const shelf = world.addBody({ type: 'static', size: [100, 20], position: [0, 10] });
  const hero = person(world, [40, -H / 2]);
  world.step(DT);
  // Walked slowly off the edge, past where the corner alone is too steep to stand on.
  let last = null, x = 0;
  for (let i = 0; i < 90 && world.groundOf(hero); i++) { last = world.groundOf(hero); x = hero.position[0]; hero.setVelocity(30, 0); world.step(DT); }
  assert.equal(last.body.id, shelf.id);
  near(last.normal[1], -1, 1e-6, 'it stood on the tread, not the corner');
  assert.ok(x > 50 + 5 && x < 50 + R + 1, `it left the ground at ${x}`);
  const back = person(world, [0, -H / 2]);
  world.step(DT);
  const y = back.position[1];
  world.setBody(back, { friction: 1 });
  world.step(DT);
  assert.ok(world.groundOf(back), 'setBody took it off the ground');
  assert.equal(back.position[1], y);
  world.remove(shelf);
  for (let i = 0; i < 30; i++) world.step(DT);
  assert.equal(world.groundOf(back), null);
  assert.ok(back.position[1] > y + 100, 'it should have fallen');
});

test('moved() lists it, and it stops counting as a character when it becomes something else', () => {
  const world = new World2D();
  level(world);
  const hero = person(world, [200, FLOOR - H / 2]);
  world.step(DT);
  const since = world.stepCount;
  hero.setVelocity(100, 0);
  world.step(DT);
  assert.ok([...world.moved(since)].includes(hero.slot));
  world.setBody(hero, { type: 'kinematic' });
  assert.equal(world._characterCount, 0);
  world.setBody(hero, { type: 'character' });
  assert.equal(world._characterCount, 1);
});

test('locked on an axis it stays there, and off means off: no characters, no pass', () => {
  const world = new World2D();
  level(world);
  const hero = person(world, [200, FLOOR - H / 2 - 40], { lockPosition: [true, false] });
  walkFor(world, hero, 300, 60);
  assert.equal(hero.position[0], 200);
  near(hero.position[1], FLOOR - H / 2, 0.2);
  assert.equal(world.bodyOf(hero).stepHeight, null);
  assert.deepEqual([world.bodyOf(hero).maxSlope, world.bodyOf(hero).pushForce], [Math.PI / 4, 0]);
  assert.equal(world.groundOf(world.addBody()), null, 'any other body has none');
  world.remove(hero);
  assert.equal(world._characterCount, 0);
});
