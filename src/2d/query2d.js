// Asking the world what is where: rays, shape casts and overlap tests.
//
// A ray is tested against one core at a time in the core's own frame, where a
// polygon's sides are the same numbers whichever way it is turned. A tilemap is
// walked cell by cell along the ray (Amanatides and Woo's grid walk), so a long
// ray over a huge map costs the cells it crosses. Solid: a ray that starts
// inside something hits it at 0, its normal back along the ray.
//
// A shape cast is conservative advancement, as impact.js is in 3D. Two convex
// shapes apart have a separating line between their nearest points, and the
// moving one can't touch the other before it reaches that line, so it is
// moved there, safely, and asked again. A few rounds close in on the hit.
//
// Sensors are skipped: a bullet's ray shouldn't stop at an invisible trigger.

import { raycast } from '../tree.js';
import { Manifold2, collide } from './collide2d.js';
import { Chain, Tilemap, touchChain, touchTiles } from './level2d.js';

/** Rounds of a cast before it gives up: 3D's (impact.js), each closing most of what is left. */
const ROUNDS = 32;

// What the last ray test found: its normal, world space.
let hitX = 0, hitY = 0;

const wanted = (world, s, mask, ignore) => (world._layers[s] & mask) !== 0 && world._sensor[s] === 0 && !ignore.includes(s);

/** Ray from local (ox, oy), unit direction local (dx, dy), against a core: t, and its local normal in hitX/Y; -1 for none. */
function rayCore(core, ox, oy, dx, dy, maxT) {
  const n = core.n, r = core.radius, x = core.x, y = core.y;
  if (n >= 3) {
    let near = 0, far = maxT, side = -1;
    for (let k = 0; k < n; k++) {
      const nx = core.nx[k], ny = core.ny[k], num = nx * (x[k] - ox) + ny * (y[k] - oy), den = nx * dx + ny * dy;
      if (den === 0) {
        if (num < 0) return -1;
      } else if (den < 0) {
        const t = num / den;
        if (t > near) { near = t; side = k; }
      } else {
        const t = num / den;
        if (t < far) far = t;
      }
      if (near > far) return -1;
    }
    if (side < 0) { hitX = -dx; hitY = -dy; return 0; }
    hitX = core.nx[side]; hitY = core.ny[side];
    return near;
  }
  if (n === 1) return rayCircle(x[0], y[0], r, ox, oy, dx, dy, maxT);
  // A capsule: its two long sides, and a circle at each end.
  const ax = x[0], ay = y[0], bx = x[1], by = y[1], ex = bx - ax, ey = by - ay, len = Math.sqrt(ex * ex + ey * ey), ux = ex / len, uy = ey / len;
  const along = (ox - ax) * ux + (oy - ay) * uy, clamp = along < 0 ? 0 : along > len ? len : along;
  const qx = ax + ux * clamp - ox, qy = ay + uy * clamp - oy;
  if (qx * qx + qy * qy <= r * r) { hitX = -dx; hitY = -dy; return 0; }
  let best = -1, bestX = 0, bestY = 0;
  for (let k = 0; k < 2; k++) {
    const nx = (k === 0 ? 1 : -1) * uy, ny = (k === 0 ? -1 : 1) * ux, den = nx * dx + ny * dy;
    if (den >= 0) continue;
    const t = (nx * (ax + nx * r - ox) + ny * (ay + ny * r - oy)) / den;
    if (t < 0 || t > maxT) continue;
    const s = (ox + dx * t - ax) * ux + (oy + dy * t - ay) * uy;
    if (s >= 0 && s <= len && (best < 0 || t < best)) { best = t; bestX = nx; bestY = ny; }
  }
  for (let k = 0; k < 2; k++) {
    const t = rayCircle(x[k], y[k], r, ox, oy, dx, dy, maxT);
    if (t >= 0 && (best < 0 || t < best)) { best = t; bestX = hitX; bestY = hitY; }
  }
  hitX = bestX; hitY = bestY;
  return best;
}

function rayCircle(cx, cy, r, ox, oy, dx, dy, maxT) {
  const fx = ox - cx, fy = oy - cy, c = fx * fx + fy * fy - r * r;
  if (c <= 0) { hitX = -dx; hitY = -dy; return 0; }
  const b = fx * dx + fy * dy;
  if (b > 0) return -1;
  const disc = b * b - c;
  if (disc < 0) return -1;
  const t = -b - Math.sqrt(disc);
  if (t > maxT) return -1;
  hitX = (fx + dx * t) / r; hitY = (fy + dy * t) / r;
  return t;
}

/** Ray against a tilemap with its top-left at (mx, my): the first solid cell, by its face. */
function rayTiles(map, mx, my, ox, oy, dx, dy, maxT) {
  const tw = map.tw, th = map.th;
  let x = ox - mx, y = oy - my, t = 0;
  // From outside, on to the map's edge first: a long way off costs nothing.
  const W = map.columns * tw, H = map.rows * th;
  if (x < 0 || y < 0 || x >= W || y >= H) {
    let near = 0, far = maxT;
    const slab = (o, d, size) => {
      if (d === 0) { if (o < 0 || o >= size) far = -1; return; }
      let a = (0 - o) / d, b = (size - o) / d;
      if (a > b) { const c = a; a = b; b = c; }
      if (a > near) near = a;
      if (b < far) far = b;
    };
    slab(x, dx, W); slab(y, dy, H);
    if (near > far) return -1;
    t = near; x += dx * t; y += dy * t;
  }
  let c = Math.floor(x / tw), r = Math.floor(y / th);
  if (c >= map.columns) c = map.columns - 1;
  if (r >= map.rows) r = map.rows - 1;
  if (c < 0) c = 0;
  if (r < 0) r = 0;
  const stepC = dx > 0 ? 1 : -1, stepR = dy > 0 ? 1 : -1;
  const eachX = dx !== 0 ? tw / Math.abs(dx) : Infinity, eachY = dy !== 0 ? th / Math.abs(dy) : Infinity;
  let nextX = dx !== 0 ? t + ((dx > 0 ? (c + 1) * tw : c * tw) - x) / dx : Infinity;
  let nextY = dy !== 0 ? t + ((dy > 0 ? (r + 1) * th : r * th) - y) / dy : Infinity;
  let faceX = -dx, faceY = -dy;
  for (;;) {
    if (map.solid(c, r)) { hitX = faceX; hitY = faceY; return t; }
    if (nextX < nextY) {
      t = nextX; nextX += eachX; c += stepC; faceX = -stepC; faceY = 0;
    } else {
      t = nextY; nextY += eachY; r += stepR; faceX = 0; faceY = -stepR;
    }
    if (t > maxT || c < 0 || r < 0 || c >= map.columns || r >= map.rows) return -1;
  }
}

/** Ray against a chain's lines, either side: a ray is asking what is there. */
function rayChain(chain, px, py, ox, oy, dx, dy, maxT) {
  const v = chain.points;
  let best = -1;
  for (let k = 0; k + 1 < chain.n; k++) {
    const x1 = px + v[2 * k], y1 = py + v[2 * k + 1], ex = v[2 * k + 2] - v[2 * k], ey = v[2 * k + 3] - v[2 * k + 1];
    const den = dx * ey - dy * ex;
    if (den === 0) continue;
    const t = ((x1 - ox) * ey - (y1 - oy) * ex) / den, s = ((x1 - ox) * dy - (y1 - oy) * dx) / den;
    if (t >= 0 && t <= maxT && s >= 0 && s <= 1 && (best < 0 || t < best)) {
      best = t;
      const nx = chain.nx[k], ny = chain.ny[k], back = nx * dx + ny * dy > 0 ? -1 : 1;
      hitX = nx * back; hitY = ny * back;
    }
  }
  return best;
}

/** A ray against slot s, whatever it is: t, its world normal in hitX/Y, or -1. */
function rayBody(world, s, ox, oy, dx, dy, maxT) {
  const level = world._level[s], p = world._position, s2 = 2 * s;
  if (level instanceof Tilemap) return rayTiles(level, world._mapX(s), world._mapY(s), ox, oy, dx, dy, maxT);
  if (level instanceof Chain) return rayChain(level, p[s2], p[s2 + 1], ox, oy, dx, dy, maxT);
  const c = world._rotation[s2], z = world._rotation[s2 + 1], ex = ox - p[s2], ey = oy - p[s2 + 1];
  const lx = c * ex + z * ey, ly = c * ey - z * ex, ux = c * dx + z * dy, uy = c * dy - z * dx;
  let best = -1, bx = 0, by = 0, reach = maxT;
  for (const core of world._cores[s]) {
    const t = rayCore(core, lx, ly, ux, uy, reach);
    if (t >= 0 && (best < 0 || t < best)) { best = t; bx = hitX; by = hitY; reach = t; }
  }
  if (best >= 0) { hitX = c * bx - z * by; hitY = z * bx + c * by; }
  return best;
}

/** Calls hit(slot, t, nx, ny) for bodies the ray meets; `nearest`: only ever nearer ones after the first. */
export function ray(world, ox, oy, dx, dy, maxT, mask, ignore, hit, nearest) {
  const visit = (s) => {
    if (!wanted(world, s, mask, ignore)) return maxT;
    const t = rayBody(world, s, ox, oy, dx, dy, maxT);
    if (t < 0) return maxT;
    hit(s, t, hitX, hitY);
    if (nearest) maxT = t;
    return maxT;
  };
  for (const tree of world._broad.trees) raycast(tree, ox, oy, 0, dx, dy, 0, maxT, 0, 0, 0, visit);
}

// A cast's state, for its emit: a query isn't re-entered.
const found = new Manifold2();
let overlapping = false, deepening = false, deepS = 0, deepX = 0, deepY = 0, cLeft = 0;
const ROUNDING = 1 / 262144;   // 2^-18
let cDx = 0, cDy = 0, cTolerance = 0, cTime = Infinity, cHit = false, cNx = 0, cNy = 0, cPx = 0, cPy = 0;

/** One manifold's say on the cast: touching and going in, a hit; else how soon it could be. */
function weigh(m) {
  if (deepening) {
    for (let k = 0; k < m.count; k++) if (m.separation[k] < deepS) { deepS = m.separation[k]; deepX = m.nx; deepY = m.ny; }
    return;
  }
  const speed = cDx * m.nx + cDy * m.ny;
  for (let k = 0; k < m.count; k++) {
    const s = m.separation[k];
    if (s <= cTolerance) {
      // Touching and going in, or just asked whether it overlaps. At the start
      // of a cast, as in 3D: stopped only if the whole move could take it further
      // in than it is, or than touching, by more than rounding, 2^-26 of its
      // size (tolerance is 2^-8 of it), so a move along a surface or round a
      // tile's corner, tilted into it by rounding, isn't stopped.
      const going = speed > 0 && (cLeft === 0 || speed * cLeft > (s > 0 ? s : 0) + cTolerance * ROUNDING);
      if (going || overlapping || s < -cTolerance) { if (!cHit || s < 0) { cHit = true; cNx = m.nx; cNy = m.ny; cPx = m.x[k]; cPy = m.y[k]; } }
    } else if (speed > 0) {
      const t = (s - cTolerance * 0.5) / speed;
      if (t < cTime) cTime = t;
    }
  }
}

function weighAll(world, s, core, x, y, c, z, margin) {
  const level = world._level[s], p = world._position, s2 = 2 * s;
  if (level instanceof Tilemap) {
    touchTiles(level, world._mapX(s), world._mapY(s), core, x, y, c, z, x + c * core.ox - z * core.oy, y + z * core.ox + c * core.oy, core.reach + margin, margin, cTolerance, 0, weigh);
  } else if (level instanceof Chain) {
    touchChain(level, p[s2], p[s2 + 1], core, x, y, c, z, x + c * core.ox - z * core.oy, y + z * core.ox + c * core.oy, core.reach + margin, margin, cTolerance, 0, weigh);
  } else {
    const r = world._rotation, list = world._cores[s];
    for (let k = 0; k < list.length; k++) {
      if (collide(core, x, y, c, z, list[k], p[s2], p[s2 + 1], r[s2], r[s2 + 1], margin, cTolerance, found) > 0) weigh(found);
    }
  }
}

/** How far along unit (dx, dy) `core` goes before touching slot s: t, normal into s in cNx/Y, or -1. */
function castBody(world, s, core, x, y, c, z, dx, dy, maxT, tolerance) {
  cDx = dx; cDy = dy; cTolerance = tolerance;
  let t = 0;
  for (let round = 0; round < ROUNDS; round++) {
    cTime = Infinity; cHit = false; cLeft = round === 0 ? maxT : 0;
    weighAll(world, s, core, x + dx * t, y + dy * t, c, z, maxT - t + tolerance);
    if (cHit) return t;
    if (cTime === Infinity) return -1;
    t += cTime;
    if (t > maxT) return -1;
  }
  return t;
}

/**
 * The first thing `core`, moving from (x, y) along unit (dx, dy), touches, for
 * which accept(slot) holds: its slot, with into[0] the distance, into[1..2] the
 * normal from the surface toward the shape, into[3..4] the point; -1 for none.
 */
export function sweep(world, core, x, y, c, z, dx, dy, maxT, tolerance, accept, into) {
  let best = -1, bestT = maxT;
  const x0 = Math.min(x, x + dx * maxT) - core.reach - Math.abs(core.ox) - tolerance, x1 = Math.max(x, x + dx * maxT) + core.reach + Math.abs(core.ox) + tolerance;
  const y0 = Math.min(y, y + dy * maxT) - core.reach - Math.abs(core.oy) - tolerance, y1 = Math.max(y, y + dy * maxT) + core.reach + Math.abs(core.oy) + tolerance;
  const visit = (s) => {
    if (!accept(s)) return;
    const t = castBody(world, s, core, x, y, c, z, dx, dy, bestT, tolerance);
    if (t >= 0 && (best < 0 || t < bestT)) {
      best = s; bestT = t;
      into[0] = t; into[1] = -cNx; into[2] = -cNy; into[3] = cPx; into[4] = cPy;
    }
  };
  for (const tree of world._broad.trees) tree.query(x0, y0, 0, x1, y1, 0, visit);
  return best;
}

/**
 * The deepest `core`, placed at (x, y), is into anything accept(slot) passes:
 * its slot, into[0] how deep, into[1..2] the way out; -1 if clear to within
 * `tolerance`. What a character is pushed out of.
 */
export function deepest(world, core, x, y, c, z, tolerance, accept, into) {
  const r = core.reach + Math.abs(core.ox) + Math.abs(core.oy) + tolerance;
  let best = -1, most = tolerance;
  cDx = 0; cDy = 0; cTolerance = tolerance;
  overlapping = false;
  const visit = (s) => {
    if (!accept(s)) return;
    deepS = Infinity;
    weighAll(world, s, core, x, y, c, z, 0);
    if (-deepS > most) { most = -deepS; best = s; into[0] = most; into[1] = -deepX; into[2] = -deepY; }
  };
  deepening = true;
  for (const tree of world._broad.trees) tree.query(x - r, y - r, 0, x + r, y + r, 0, visit);
  deepening = false;
  return best;
}

/** Every body `core` overlaps or touches, placed at (x, y), for which wanted holds: hit(slot). */
export function overlap(world, core, x, y, c, z, mask, ignore, hit) {
  const r = core.reach + Math.abs(core.ox) + Math.abs(core.oy);
  cDx = 0; cDy = 0; cTolerance = 0;
  const visit = (s) => {
    if (!wanted(world, s, mask, ignore)) return;
    cHit = false; cTime = Infinity;
    weighAll(world, s, core, x, y, c, z, 0);
    if (cHit) hit(s);
  };
  overlapping = true;
  for (const tree of world._broad.trees) tree.query(x - r, y - r, 0, x + r, y + r, 0, visit);
  overlapping = false;
}
