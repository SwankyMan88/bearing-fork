// Character bodies: moved at the velocity the game gives them, as kinematic
// bodies are, but colliding as a person walking does. The 3D character's method
// (character.js), which says why at length; here is what it does:
//
//   out      pushed out of anything it overlaps
//   slid     its own motion, cast and slid along what it meets: walls take
//            away the part into them; walkable ground, no steeper than
//            maxSlope, turns it to follow the slope at the same speed across;
//            a low obstacle is stepped up onto, if no taller than stepHeight
//   snapped  back down onto the ground, by up to stepHeight, going down
//            slopes and stairs
//   grounded what is under it, for world.groundOf()
//   carried  moved with what it stood on, by that body's velocity at its feet
//
// It is then put where it found it can go, before the solve, and stands there
// through the step as an unmoving obstacle. Afterwards its velocity reads what
// it did of its own accord. Gravity acts on it only in the air, and up is
// against gravity. On tiles, a game wants `stepHeight` of a tile: the default
// follows the body's size, a ninth of its height.
//
// Nothing here reads input, and the game's velocity is all it is told.

import { Core } from './collide2d.js';
import { PIXEL } from './contact2d.js';
import { deepest, sweep } from './query2d.js';

export const CHARACTER = 3;   // World2D's type code
const DYNAMIC = 0;

/** Casts a move takes: in 2D two lines leave nothing to move along, so a third finds it clear. */
const SLIDES = 4;
/** Push-outs at the start of a move, for the same reason. */
const PUSHES = 4;

// Scratch: a step's characters move one at a time, and nothing re-enters this.
const hit = new Float64Array(5), deep = new Float64Array(3), fall = new Float64Array(5);
const up = new Float64Array(2), pos = new Float64Array(2), rest = new Float64Array(2), vel = new Float64Array(2), face = new Float64Array(2);
const probe = new Core([0, 0], 1);
let tolerance = 0, slopeCos = 0, core = null, cosine = 1, sine = 0, self = 0, asked = null, riding = -1;

const dot = (a, b) => a[0] * b[0] + a[1] * b[1];

/** What blocks it: what it would collide with, but not a sensor or itself. */
const blocks = (o) => {
  const w = asked;
  if (o === self || o === riding || w._sensor[o] === 1) return false;
  if ((w._layers[self] & w._mask[o]) === 0 || (w._layers[o] & w._mask[self]) === 0) return false;
  return w._group[self] === 0 || w._group[self] !== w._group[o];
};

const cast = (dx, dy, length, into = hit) => sweep(asked, core, pos[0], pos[1], cosine, sine, dx, dy, length, tolerance, blocks, into);

/** Every character in the world, before the step. */
export function walk(world, dt) {
  const list = world._awakeList, n = world._awakeCount, type = world._type;
  const g = world._gravity, gl = Math.sqrt(g[0] * g[0] + g[1] * g[1]);
  // Up is against gravity; with none, up the screen.
  if (gl > 0) { up[0] = -g[0] / gl; up[1] = -g[1] / gl; } else { up[0] = 0; up[1] = -1; }
  for (let i = 0; i < n; i++) if (type[list[i]] === CHARACTER) move(world, list[i], dt);
  asked = null; core = null;
}

/** After the step: each character's velocity is what it did of its own accord. */
export function settle(world) {
  const list = world._awakeList, n = world._awakeCount, type = world._type, v = world._velocity, own = world._walk;
  for (let i = 0; i < n; i++) {
    const s = list[i];
    if (type[s] === CHARACTER) { v[2 * s] = own[2 * s]; v[2 * s + 1] = own[2 * s + 1]; }
  }
}

function move(world, s, dt) {
  const s2 = 2 * s, p = world._position, v = world._velocity;
  asked = world; self = s; core = world._core[s];
  tolerance = world._size[s] * PIXEL;
  slopeCos = world._slopeCos[s];
  cosine = world._rotation[s2]; sine = world._rotation[s2 + 1];
  const h = world._stepHeight[s];
  pos[0] = p[s2]; pos[1] = p[s2 + 1];

  // Out of anything it overlaps; another character gives way half as much.
  for (let k = 0; k < PUSHES; k++) {
    const o = deepest(world, core, pos[0], pos[1], cosine, sine, tolerance, blocks, deep);
    if (o < 0) break;
    const d = deep[0] * (world._type[o] === CHARACTER ? 0.5 : 1);
    pos[0] += deep[1] * d; pos[1] += deep[2] * d;
  }

  // What it stood on at the end of the last step, if it is still there.
  let ground = -1;
  const id = world._ground[s];
  if (id >= 0) ground = world._slots.slotOf(id);
  const grounded = ground >= 0;

  // Its own motion. Gravity only in the air; on the ground, the ground holds it.
  vel[0] = v[s2]; vel[1] = v[s2 + 1];
  if (!grounded) {
    const g = world._gravity, k = world._gravityScale[s] * dt;
    vel[0] += g[0] * k; vel[1] += g[1] * k;
  }
  const jumping = dot(vel, up) > 0;
  rest[0] = vel[0] * dt; rest[1] = vel[1] * dt;
  // Walking on the ground follows its slope, at the speed asked for across it.
  if (grounded && !jumping) follow(world._groundAt[4 * s + 2], world._groundAt[4 * s + 3]);
  let onGround = grounded, pushed = -1;
  for (let k = 0; k < SLIDES; k++) {
    const len = Math.sqrt(dot(rest, rest));
    if (!(len > 0)) break;
    const dx = rest[0] / len, dy = rest[1] / len, o = cast(dx, dy, len);
    if (o < 0) {
      pos[0] += rest[0]; pos[1] += rest[1];
      break;
    }
    const t = hit[0], left = 1 - t / len;
    pos[0] += dx * t; pos[1] += dy * t;
    rest[0] *= left; rest[1] *= left;
    const nx = hit[1], ny = hit[2], rise = nx * up[0] + ny * up[1];
    if (rise >= slopeCos) {
      // Walkable ground: walking follows it; landing on it stops the fall.
      onGround = true;
      if (!jumping) follow(nx, ny);
      else clip(rest, nx, ny);
      const fallen = dot(vel, up);
      if (fallen < 0) { vel[0] -= up[0] * fallen; vel[1] -= up[1] * fallen; }
    } else {
      // A step it can walk up onto, if it is on the ground and walking.
      if (onGround && !jumping && h > 0 && climb(world, s, h)) continue;
      // A wall, a ceiling, or ground too steep: none of it is climbed, but a
      // dynamic one may be pushed, once a move (character.js, PUSHING).
      if (o !== pushed && world._pushForce[s] > 0 && world._type[o] === DYNAMIC) {
        shove(world, o, nx, ny, world._pushForce[s] * dt);
        pushed = o;
      }
      stop(rest, nx, ny);
      stop(vel, nx, ny);
    }
  }

  // Back down onto the ground it walked off, by up to a step.
  if (grounded && !jumping && under(world, s, 2 * tolerance) < 0) {
    if (cast(-up[0], -up[1], h + 2 * tolerance) >= 0 && stands(world, s, h)) {
      pos[0] -= up[0] * hit[0]; pos[1] -= up[1] * hit[0];
    }
  }

  // What it stands on now, for the next step and for groundOf().
  const found = under(world, s, 2 * tolerance);
  world._ground[s] = found >= 0 ? world._slots.id(found) : -1;
  if (found >= 0) {
    const at = world._groundAt, s4 = 4 * s;
    at[s4] = hit[3]; at[s4 + 1] = hit[4]; at[s4 + 2] = face[0]; at[s4 + 3] = face[1];
    const fallen = dot(vel, up);
    if (fallen < 0) { vel[0] -= up[0] * fallen; vel[1] -= up[1] * fallen; }
  }

  // Carried by what it stood on: that body's velocity where the character
  // stands, after its own motion, cast like any move.
  if (ground >= 0) {
    const g2 = 2 * ground, gv = world._velocity, gw = world._angular[ground], gp = world._position;
    const rx = pos[0] - gp[g2], ry = pos[1] - gp[g2 + 1];
    const cx = (gv[g2] - gw * ry) * dt, cy = (gv[g2 + 1] + gw * rx) * dt, len = Math.sqrt(cx * cx + cy * cy);
    if (len > 0) {
      riding = ground;
      const t = cast(cx / len, cy / len, len) >= 0 ? hit[0] : len;
      riding = -1;
      pos[0] += cx / len * t; pos[1] += cy / len * t;
    }
  }

  // Locked on an axis, it ends where it began along it, however it slid.
  const held = world._lockMove[s];
  if ((held & 1) !== 0) { pos[0] = p[s2]; vel[0] = 0; }
  if ((held & 2) !== 0) { pos[1] = p[s2 + 1]; vel[1] = 0; }

  // Where it found it can go, now, and still through the step.
  p[s2] = pos[0]; p[s2 + 1] = pos[1];
  v[s2] = 0; v[s2 + 1] = 0;
  world._walk[s2] = vel[0]; world._walk[s2 + 1] = vel[1];
}

/** The walkable ground within `reach` below the character into hit; its slot or -1. */
function under(world, s, reach) {
  const o = cast(-up[0], -up[1], reach);
  return o >= 0 && stands(world, s, world._stepHeight[s]) ? o : -1;
}

/** How far the character reaches below its centre, along -up. */
function below() {
  let most = -Infinity;
  for (let k = 0; k < core.n; k++) {
    const x = cosine * core.x[k] - sine * core.y[k], y = sine * core.x[k] + cosine * core.y[k], d = -(x * up[0] + y * up[1]);
    if (d > most) most = d;
  }
  return most + core.radius;
}

/**
 * Whether the contact in hit is ground to stand on, with the ground's normal
 * into `face`: walkable itself, or the lip of walkable ground. A round shape
 * meets the edge of a step steeply, though what it stands on there is the flat
 * tread, so a contact too steep is probed just past it by a pixel-sized ball,
 * as in 3D (character.js stands). hit is a cast along -up.
 */
function stands(world, s, h) {
  const nx = hit[1], ny = hit[2], rise = nx * up[0] + ny * up[1];
  if (rise >= slopeCos) { face[0] = nx; face[1] = ny; return true; }
  if (!(rise > 0)) return false;   // a wall or a ceiling has no top to stand on
  const base = pos[0] * up[0] + pos[1] * up[1] - hit[0] - below();
  if (hit[3] * up[0] + hit[4] * up[1] - base > h + tolerance) return false;
  let ax = up[0] * rise - nx, ay = up[1] * rise - ny;
  const al = Math.sqrt(ax * ax + ay * ay);
  if (!(al > 0)) return false;
  ax /= al; ay /= al;
  const px = hit[3], py = hit[4];
  probe.radius = tolerance; probe.reach = tolerance;
  const x = px + 2 * tolerance * (ax + up[0]), y = py + 2 * tolerance * (ay + up[1]);
  if (sweep(world, probe, x, y, 1, 0, -up[0], -up[1], 4 * tolerance, tolerance * 0.25, blocks, fall) < 0) return false;
  if (fall[1] * up[0] + fall[2] * up[1] < slopeCos) return false;
  if (Math.abs((fall[3] - px) * up[0] + (fall[4] - py) * up[1]) > 2 * tolerance) return false;
  face[0] = fall[1]; face[1] = fall[2];
  return true;
}

/**
 * Up onto a step: up by the step height, forward by what is left of the walk,
 * and down onto walkable ground no further than it went up. Moves pos and
 * leaves what is left in rest if it works; changes nothing if it doesn't.
 */
function climb(world, s, h) {
  const rise = dot(rest, up);
  let fx = rest[0] - up[0] * rise, fy = rest[1] - up[1] * rise;
  const len = Math.sqrt(fx * fx + fy * fy);
  if (!(len > 0)) return false;
  fx /= len; fy /= len;
  const x = pos[0], y = pos[1];
  const base = x * up[0] + y * up[1] - below();
  // A little over, or a box stepping up exactly h rises flush with the tread,
  // still touching the wall; where it lands is held to h all the same.
  const over = h + 2 * tolerance, u = cast(up[0], up[1], over) >= 0 ? hit[0] : over;
  if (!(u > tolerance)) return false;
  pos[0] = x + up[0] * u; pos[1] = y + up[1] * u;
  // A step's worth forward at the least: a slow walk reaches the top a little at a time.
  const reach = len > tolerance ? len : tolerance;
  const f = cast(fx, fy, reach) >= 0 ? hit[0] : reach;
  if (!(f > tolerance * 0.5)) return back(x, y);
  pos[0] += fx * f; pos[1] += fy * f;
  if (cast(-up[0], -up[1], u + tolerance) < 0 || !stands(world, s, h) || hit[3] * up[0] + hit[4] * up[1] - base > h + tolerance) return back(x, y);
  pos[0] -= up[0] * hit[0]; pos[1] -= up[1] * hit[0];
  const left = len > f ? len - f : 0;
  rest[0] = fx * left; rest[1] = fy * left;
  return true;
}

function back(x, y) {
  pos[0] = x; pos[1] = y;
  return false;
}

/** The motion in rest, turned to run along ground of unit normal n, at the same speed across it. */
function follow(nx, ny) {
  const rise = dot(rest, up), hx = rest[0] - up[0] * rise, hy = rest[1] - up[1] * rise, nu = nx * up[0] + ny * up[1];
  const k = nu > 0 ? -(hx * nx + hy * ny) / nu : 0;
  rest[0] = hx + up[0] * k; rest[1] = hy + up[1] * k;
}

/** Takes out of a the part into a surface it can't walk on; along a steep slope it rises no more than it was rising. */
function stop(a, nx, ny) {
  const into = a[0] * nx + a[1] * ny;
  if (into >= 0) return;
  const was = Math.max(dot(a, up), 0);
  a[0] -= nx * into; a[1] -= ny * into;
  const gain = dot(a, up) - was;
  if (gain > 0) { a[0] -= up[0] * gain; a[1] -= up[1] * gain; }
}

function clip(a, nx, ny) {
  const into = a[0] * nx + a[1] * ny;
  if (into < 0) { a[0] -= nx * into; a[1] -= ny * into; }
}

/** Pushes dynamic body o, met at hit's point with normal n (out of o), up to `most`: character.js shove. */
function shove(world, o, nx, ny, most) {
  const into = -(vel[0] * nx + vel[1] * ny);
  if (!(into > 0)) return;
  const o2 = 2 * o, p = world._position, v = world._velocity, w = world._angular;
  const rx = hit[3] - p[o2], ry = hit[4] - p[o2 + 1];
  const along = -((v[o2] - w[o] * ry) * nx + (v[o2 + 1] + w[o] * rx) * ny);
  if (!(into > along)) return;
  const lever = -(rx * ny - ry * nx), turns = world._invInertia[o] * lever * lever;
  let j = (into - along) / (world._invMass[o] + turns);
  if (j > most) j = most;
  world._wake(o);
  const im = world._invMass[o];
  v[o2] -= nx * j * im; v[o2 + 1] -= ny * j * im;
  w[o] += world._invInertia[o] * lever * j;
}
