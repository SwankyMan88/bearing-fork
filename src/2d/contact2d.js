// The contact solver: bodies push each other apart, and hold.
//
// It is the 3D solver's method, the soft step (contact.js, Box2D 3's), less the
// third axis. A step finds its contacts once, then runs its substeps; each
// substep, velocities change (gravity), the last step's pushes are replayed
// (the warm start, so a stack starts from what held it), a SOLVING pass makes
// every contact stop closing and eases overlaps apart as a spring would, bodies
// move, and a RELAXING pass takes out the speed the spring added, so pushing
// out an overlap doesn't launch anything.
//
// IMPULSES are what the solver works in: a push over a moment, mass times
// change of speed. For each point it asks how fast the two bodies are closing
// there, and what push along the normal would stop that: closing speed times
// the point's effective mass, which is how heavy the pair feels from there,
// being able to turn. Pushes only push, so the running total stays 0 or more.
// Friction is the same along the tangent, its total held to mu times the
// point's normal total: that is what "friction is a cone" comes to in 2D, a
// line of two ends.
//
// TWO POINTS ARE SOLVED TOGETHER. The two points of a flat contact are coupled:
// a push at one changes how fast the other closes. One at a time, the first
// stops the whole fall alone and tips the box (the 3D solver measured that as
// 7.6 mm of creep). So the pair's normal totals are found at once, a 2 by 2
// system where every point also gives a little (a spring's softness, or the
// 2^-20 `COMPLIANCE` every rigid row has, so two points on one line don't make
// it singular), and a push can't be negative, so each case of who pushes is
// tried in turn (Catto, GDC 2009).
//
// PATCHES, as in 3D (contact.js): a contact of one point can't stop a body
// turning about it, so it is taken as a patch PIXEL of the rolling body's size,
// and resists rolling by the push leaning to its edge. So a ball rolls to rest.
// Two points have their spread, and need none.

import { collide, Manifold2 } from './collide2d.js';
import { resized } from '../core/slots.js';

/**
 * A two-hundredth of a body's thinnest size: how far a contact may be off
 * unseen, as in 3D (contact.js, PIXEL). A 32 px box's is 0.16 px.
 */
export const PIXEL = 1 / 200;

// As forest.js: a thousandth of a thousandth of a row's own stiffness.
const COMPLIANCE = 1 / 1048576;

/** A contact's softness over the substep h: contact.js makeSoft. */
export function makeSoft(hertz, zeta, h, out) {
  const omega = 2 * Math.PI * hertz;
  const a1 = 2 * zeta + h * omega, a2 = h * omega * a1, a3 = 1 / (1 + a2);
  out.biasRate = omega / a1;
  out.massScale = a2 * a3;
  out.impulseScale = a3;
  out.give = 1 / a2;
}
export const soft = { biasRate: 0, massScale: 1, impulseScale: 0, give: 0 };

/** What a step's manifolds are, in columns; two numbers a manifold for each point. */
export class Contacts2D {
  constructor() {
    this.count = 0;
    this.capacity = 0;
    this.a = null; this.b = null; this.points = null; this.key = null;
    this.normal = null; this.friction = null; this.restitution = null; this.tolerance = null;
    this.patch = null; this.rollMass = null; this.rollImpulse = null; this.coupling = null; this.gap = null;
    this.id = null; this.ra = null; this.rb = null; this.adjusted = null;
    this.normalImpulse = null; this.tangentImpulse = null; this.maxNormalImpulse = null;
    this.normalMass = null; this.tangentMass = null; this.relativeVelocity = null; this.k = null;
    this._alloc(16);
  }

  _alloc(c) {
    const grow = (name, Type, n) => { this[name] = this[name] ? resized(this[name], n) : new Type(n); };
    grow('a', Int32Array, c); grow('b', Int32Array, c); grow('points', Uint8Array, c); grow('key', Float64Array, c);
    grow('normal', Float64Array, 2 * c); grow('friction', Float64Array, c); grow('restitution', Float64Array, c);
    grow('tolerance', Float64Array, c); grow('patch', Float64Array, c); grow('rollMass', Float64Array, c);
    grow('rollImpulse', Float64Array, c); grow('coupling', Float64Array, c); grow('gap', Float64Array, c);
    grow('id', Int32Array, 2 * c); grow('ra', Float64Array, 4 * c); grow('rb', Float64Array, 4 * c);
    grow('adjusted', Float64Array, 2 * c); grow('normalImpulse', Float64Array, 2 * c);
    grow('tangentImpulse', Float64Array, 2 * c); grow('maxNormalImpulse', Float64Array, 2 * c);
    grow('normalMass', Float64Array, 2 * c); grow('tangentMass', Float64Array, 2 * c);
    grow('relativeVelocity', Float64Array, 2 * c); grow('k', Float64Array, 2 * c);
    this.capacity = c;
  }
}

const found = new Manifold2();

/**
 * Whether slots a and b touch this step, and if so a row in c. `memory` is what
 * the pair pushed with last step, by point name, for the warm start.
 */
export function meet(world, c, a, b, key, dt, memory) {
  const coreA = world._core[a], coreB = world._core[b];
  const size = world._size, sa = size[a], sb = size[b];
  const tolerance = Math.min(sa, sb) * PIXEL;
  const motion = world._motion, margin = tolerance + motion[a] + motion[b];
  const p = world._position, r = world._rotation, a2 = 2 * a, b2 = 2 * b;
  if (collide(coreA, p[a2], p[a2 + 1], r[a2], r[a2 + 1], coreB, p[b2], p[b2 + 1], r[b2], r[b2 + 1], margin, tolerance, found) === 0) return;
  if (c.count === c.capacity) c._alloc(2 * c.capacity);
  const m = c.count++, nx = found.nx, ny = found.ny, m2 = 2 * m, m4 = 4 * m, count = found.count;
  c.a[m] = a; c.b[m] = b; c.points[m] = count; c.key[m] = key;
  c.normal[m2] = nx; c.normal[m2 + 1] = ny;
  // As in 3D: friction's geometric mean, so ice is slippery against anything;
  // restitution's larger, so a bouncy ball bounces off anything.
  c.friction[m] = Math.sqrt(world._friction[a] * world._friction[b]);
  c.restitution[m] = Math.max(world._restitution[a], world._restitution[b]);
  c.tolerance[m] = tolerance;
  const type = world._type, moves = 0;
  c.patch[m] = PIXEL * (type[a] !== moves ? sb : type[b] !== moves ? sa : Math.min(sa, sb));
  c.rollImpulse[m] = memory !== undefined ? memory.roll : 0;
  for (let k = 0; k < 2; k++) {
    const i = m2 + k;
    if (k >= count) { c.normalImpulse[i] = 0; c.tangentImpulse[i] = 0; continue; }
    const id = found.id[k], x = found.x[k], y = found.y[k];
    c.id[i] = id;
    const ax = x - p[a2], ay = y - p[a2 + 1], bx = x - p[b2], by = y - p[b2 + 1], j = m4 + 2 * k;
    c.ra[j] = ax; c.ra[j + 1] = ay; c.rb[j] = bx; c.rb[j + 1] = by;
    // Separation at any later pose: (pb + rb - pa - ra)·n + adjusted.
    c.adjusted[i] = found.separation[k] - ((p[b2] + bx - p[a2] - ax) * nx + (p[b2 + 1] + by - p[a2 + 1] - ay) * ny);
    let n = 0, t = 0;
    if (memory !== undefined) {
      if (memory.id0 === id) { n = memory.n0; t = memory.t0; } else if (memory.id1 === id) { n = memory.n1; t = memory.t1; }
    }
    c.normalImpulse[i] = n; c.tangentImpulse[i] = t;
  }
}

/** Effective masses, what each point closes at, and the coupling, once a step. */
export function prepare(world, c) {
  const im = world._invMass, ii = world._invInertia, v = world._velocity, w = world._angular;
  for (let m = 0; m < c.count; m++) {
    const a = c.a[m], b = c.b[m], m2 = 2 * m, m4 = 4 * m, nx = c.normal[m2], ny = c.normal[m2 + 1], tx = -ny, ty = nx;
    const ima = im[a], imb = im[b], iia = ii[a], iib = ii[b], a2 = 2 * a, b2 = 2 * b, count = c.points[m];
    for (let k = 0; k < count; k++) {
      const i = m2 + k, j = m4 + 2 * k, ax = c.ra[j], ay = c.ra[j + 1], bx = c.rb[j], by = c.rb[j + 1];
      const can = ax * ny - ay * nx, cbn = bx * ny - by * nx, cat = ax * ty - ay * tx, cbt = bx * ty - by * tx;
      const kn = ima + imb + iia * can * can + iib * cbn * cbn, kt = ima + imb + iia * cat * cat + iib * cbt * cbt;
      c.k[i] = kn;
      c.normalMass[i] = kn > 0 ? 1 / kn : 0;
      c.tangentMass[i] = kt > 0 ? 1 / kt : 0;
      c.maxNormalImpulse[i] = 0;
      const dvx = v[b2] - w[b] * by - v[a2] + w[a] * ay, dvy = v[b2 + 1] + w[b] * bx - v[a2 + 1] - w[a] * ax;
      c.relativeVelocity[i] = dvx * nx + dvy * ny;
    }
    if (count === 2) {
      const j = m4, ax0 = c.ra[j], ay0 = c.ra[j + 1], bx0 = c.rb[j], by0 = c.rb[j + 1];
      const ax1 = c.ra[j + 2], ay1 = c.ra[j + 3], bx1 = c.rb[j + 2], by1 = c.rb[j + 3];
      c.coupling[m] = ima + imb + iia * (ax0 * ny - ay0 * nx) * (ax1 * ny - ay1 * nx) + iib * (bx0 * ny - by0 * nx) * (bx1 * ny - by1 * nx);
    } else {
      const spin = iia + iib;
      c.rollMass[m] = spin > 0 ? 1 / spin : 0;
    }
  }
}

/** The last step's pushes again, at each substep's start, so a stack starts from what held it. */
export function warmStart(world, c) {
  const im = world._invMass, ii = world._invInertia, v = world._velocity, w = world._angular;
  for (let m = 0; m < c.count; m++) {
    const a = c.a[m], b = c.b[m], m2 = 2 * m, m4 = 4 * m, nx = c.normal[m2], ny = c.normal[m2 + 1], tx = -ny, ty = nx;
    const ima = im[a], imb = im[b], iia = ii[a], iib = ii[b], a2 = 2 * a, b2 = 2 * b;
    let vax = v[a2], vay = v[a2 + 1], wa = w[a], vbx = v[b2], vby = v[b2 + 1], wb = w[b];
    for (let k = 0; k < c.points[m]; k++) {
      const i = m2 + k, j = m4 + 2 * k, n = c.normalImpulse[i], t = c.tangentImpulse[i];
      const px = n * nx + t * tx, py = n * ny + t * ty;
      vax -= ima * px; vay -= ima * py;
      vbx += imb * px; vby += imb * py;
      wa -= iia * (c.ra[j] * py - c.ra[j + 1] * px);
      wb += iib * (c.rb[j] * py - c.rb[j + 1] * px);
    }
    const roll = c.rollImpulse[m];
    if (roll !== 0) { wa -= iia * roll; wb += iib * roll; }
    v[a2] = vax; v[a2 + 1] = vay; w[a] = wa; v[b2] = vbx; v[b2 + 1] = vby; w[b] = wb;
  }
}

/**
 * One pass. `bias` is true while solving, when an overlap is eased out as a
 * spring would; false when relaxing, which takes out what that added. Either
 * way a point not yet touching may close exactly its gap this substep.
 */
export function solve(world, c, h, bias) {
  const im = world._invMass, ii = world._invInertia, v = world._velocity, w = world._angular;
  const p = world._position, r = world._rotation, start = world._startTurn, shape = world._shape;
  const inv = 1 / h;
  const cA = c.a, cB = c.b, cPoints = c.points, cNormal = c.normal, cRa = c.ra, cRb = c.rb, cAdjusted = c.adjusted;
  const cNormalImpulse = c.normalImpulse, cTangentImpulse = c.tangentImpulse, cMaxNormalImpulse = c.maxNormalImpulse;
  const cNormalMass = c.normalMass, cTangentMass = c.tangentMass, cK = c.k, cFriction = c.friction, cTolerance = c.tolerance;
  const cCoupling = c.coupling, cPatch = c.patch, cRollMass = c.rollMass, cRollImpulse = c.rollImpulse, cGap = c.gap;
  const biasRate = soft.biasRate, give = soft.give, massScale = soft.massScale, impulseScale = soft.impulseScale;
  for (let m = 0; m < c.count; m++) {
    const a = cA[m], b = cB[m], m2 = 2 * m, m4 = 4 * m, nx = cNormal[m2], ny = cNormal[m2 + 1], tx = -ny, ty = nx;
    const ima = im[a], imb = im[b], iia = ii[a], iib = ii[b], a2 = 2 * a, b2 = 2 * b, count = cPoints[m];
    let vax = v[a2], vay = v[a2 + 1], wa = w[a], vbx = v[b2], vby = v[b2 + 1], wb = w[b];
    // How each body has turned since the step began. A circle's contact is
    // followed by its centre, not a point on its rim, which rolls away (3D's rule).
    let ca = 1, sa = 0, cb = 1, sb = 0;
    if (shape[a] !== 1) { const x = r[a2], y = r[a2 + 1], x0 = start[a2], y0 = start[a2 + 1]; ca = x * x0 + y * y0; sa = y * x0 - x * y0; }
    if (shape[b] !== 1) { const x = r[b2], y = r[b2 + 1], x0 = start[b2], y0 = start[b2 + 1]; cb = x * x0 + y * y0; sb = y * x0 - x * y0; }
    const dx = p[b2] - p[a2], dy = p[b2 + 1] - p[a2 + 1], most = cTolerance[m] * inv;
    let least = Infinity, pressed = 0;

    // The normal: what each point asks for.
    let s0 = 0, t0 = 0, g0 = COMPLIANCE, sc0 = 1, ic0 = 0, s1 = 0, t1 = 0, g1 = COMPLIANCE, sc1 = 1, ic1 = 0;
    for (let k = 0; k < count; k++) {
      const j = m4 + 2 * k, ax = cRa[j], ay = cRa[j + 1], bx = cRb[j], by = cRb[j + 1];
      const s = (dx + cb * bx - sb * by - ca * ax + sa * ay) * nx + (dy + sb * bx + cb * by - sa * ax - ca * ay) * ny + cAdjusted[m2 + k];
      if (s < least) least = s;
      let target = 0, g = COMPLIANCE, sc = 1, ic = 0;
      if (s > 0) target = s * inv;
      else if (bias) {
        target = biasRate * s;
        if (target < -most) target = -most;
        g += give; sc = massScale; ic = impulseScale;
      }
      if (k === 0) { s0 = s; t0 = target; g0 = g; sc0 = sc; ic0 = ic; } else { s1 = s; t1 = target; g1 = g; sc1 = sc; ic1 = ic; }
    }
    cGap[m] = least;

    if (count === 2) {
      // Both points' closing speeds, and the 2 by 2 for their new totals.
      const i0 = m2, i1 = m2 + 1, j0 = m4, j1 = m4 + 2;
      const ax0 = cRa[j0], ay0 = cRa[j0 + 1], bx0 = cRb[j0], by0 = cRb[j0 + 1], ax1 = cRa[j1], ay1 = cRa[j1 + 1], bx1 = cRb[j1], by1 = cRb[j1 + 1];
      const v0 = (vbx - wb * by0 - vax + wa * ay0) * nx + (vby + wb * bx0 - vay - wa * ax0) * ny;
      const v1 = (vbx - wb * by1 - vax + wa * ay1) * nx + (vby + wb * bx1 - vay - wa * ax1) * ny;
      const k11 = cK[i0], k22 = cK[i1], k12 = cCoupling[m], l0 = cNormalImpulse[i0], l1 = cNormalImpulse[i1];
      const a11 = k11 * (1 + g0), a22 = k22 * (1 + g1);
      const b0 = k11 * l0 + k12 * l1 - v0 - t0, b1 = k12 * l0 + k22 * l1 - v1 - t1;
      let n0 = 0, n1 = 0;
      const det = a11 * a22 - k12 * k12;
      const x0 = (a22 * b0 - k12 * b1) / det, x1 = (a11 * b1 - k12 * b0) / det;
      if (x0 >= 0 && x1 >= 0) { n0 = x0; n1 = x1; }
      else {
        const only0 = b0 / a11, only1 = b1 / a22;
        if (only0 >= 0 && k12 * only0 - b1 >= 0) n0 = only0;
        else if (only1 >= 0 && k12 * only1 - b0 >= 0) n1 = only1;
      }
      const d0 = n0 - l0, d1 = n1 - l1;
      cNormalImpulse[i0] = n0; cNormalImpulse[i1] = n1;
      if (n0 > cMaxNormalImpulse[i0]) cMaxNormalImpulse[i0] = n0;
      if (n1 > cMaxNormalImpulse[i1]) cMaxNormalImpulse[i1] = n1;
      const px = (d0 + d1) * nx, py = (d0 + d1) * ny;
      vax -= ima * px; vay -= ima * py;
      vbx += imb * px; vby += imb * py;
      wa -= iia * (d0 * (ax0 * ny - ay0 * nx) + d1 * (ax1 * ny - ay1 * nx));
      wb += iib * (d0 * (bx0 * ny - by0 * nx) + d1 * (bx1 * ny - by1 * nx));
      pressed = n0 + n1;
    } else {
      const i = m2, ax = cRa[m4], ay = cRa[m4 + 1], bx = cRb[m4], by = cRb[m4 + 1];
      const vn = (vbx - wb * by - vax + wa * ay) * nx + (vby + wb * bx - vay - wa * ax) * ny;
      const old = cNormalImpulse[i];
      let next = old - cNormalMass[i] * sc0 * (vn + t0) - ic0 * old;
      if (next < 0) next = 0;
      const d = next - old;
      cNormalImpulse[i] = next;
      if (next > cMaxNormalImpulse[i]) cMaxNormalImpulse[i] = next;
      const px = d * nx, py = d * ny;
      vax -= ima * px; vay -= ima * py;
      vbx += imb * px; vby += imb * py;
      wa -= iia * (ax * py - ay * px);
      wb += iib * (bx * py - by * px);
      pressed = next;
    }

    // Friction, a point at a time, within mu of what that point pushes with.
    const mu = cFriction[m];
    for (let k = 0; k < count; k++) {
      const i = m2 + k, j = m4 + 2 * k, ax = cRa[j], ay = cRa[j + 1], bx = cRb[j], by = cRb[j + 1];
      const vt = (vbx - wb * by - vax + wa * ay) * tx + (vby + wb * bx - vay - wa * ax) * ty;
      const limit = mu * cNormalImpulse[i], old = cTangentImpulse[i];
      let next = old - cTangentMass[i] * vt;
      if (next > limit) next = limit;
      else if (next < -limit) next = -limit;
      const d = next - old;
      cTangentImpulse[i] = next;
      const px = d * tx, py = d * ty;
      vax -= ima * px; vay -= ima * py;
      vbx += imb * px; vby += imb * py;
      wa -= iia * (ax * py - ay * px);
      wb += iib * (bx * py - by * px);
    }

    // Rolling: see PATCHES. One point only; two have their spread.
    if (count === 1) {
      const limit = cPatch[m] * pressed, old = cRollImpulse[m];
      let next = old - cRollMass[m] * (wb - wa);
      if (next > limit) next = limit;
      else if (next < -limit) next = -limit;
      const d = next - old;
      cRollImpulse[m] = next;
      wa -= iia * d; wb += iib * d;
    }
    v[a2] = vax; v[a2 + 1] = vay; w[a] = wa; v[b2] = vbx; v[b2 + 1] = vby; w[b] = wb;
  }
}

/**
 * The bounce, once the substeps are done, as in 3D (contact.js restitution):
 * each point that met faster than a bounce too small to see, one that would
 * rise no higher than the tolerance, is sent apart at its restitution times
 * the speed it met at.
 */
export function restitution(world, c, gravity) {
  const im = world._invMass, ii = world._invInertia, v = world._velocity, w = world._angular;
  for (let m = 0; m < c.count; m++) {
    const e = c.restitution[m];
    if (e === 0) continue;
    const threshold = Math.sqrt(2 * gravity * c.tolerance[m]);
    const a = c.a[m], b = c.b[m], m2 = 2 * m, m4 = 4 * m, nx = c.normal[m2], ny = c.normal[m2 + 1], a2 = 2 * a, b2 = 2 * b;
    // Two points bounce together, as they are solved together: one at a time,
    // the first turns the body, and a flat hit between equal boxes with
    // restitution 1 kept 6% of its speed where it should have kept none.
    if (c.points[m] === 2) {
      const i0 = m2, i1 = m2 + 1, r0 = c.relativeVelocity[i0], r1 = c.relativeVelocity[i1];
      const go0 = r0 <= -threshold && c.maxNormalImpulse[i0] > 0, go1 = r1 <= -threshold && c.maxNormalImpulse[i1] > 0;
      if (!go0 && !go1) continue;
      const ax0 = c.ra[m4], ay0 = c.ra[m4 + 1], bx0 = c.rb[m4], by0 = c.rb[m4 + 1];
      const ax1 = c.ra[m4 + 2], ay1 = c.ra[m4 + 3], bx1 = c.rb[m4 + 2], by1 = c.rb[m4 + 3];
      const v0 = (v[b2] - w[b] * by0 - v[a2] + w[a] * ay0) * nx + (v[b2 + 1] + w[b] * bx0 - v[a2 + 1] - w[a] * ax0) * ny;
      const v1 = (v[b2] - w[b] * by1 - v[a2] + w[a] * ay1) * nx + (v[b2 + 1] + w[b] * bx1 - v[a2 + 1] - w[a] * ax1) * ny;
      const k11 = c.k[i0], k22 = c.k[i1], k12 = c.coupling[m], l0 = c.normalImpulse[i0], l1 = c.normalImpulse[i1];
      const a11 = k11 * (1 + COMPLIANCE), a22 = k22 * (1 + COMPLIANCE);
      const b0 = k11 * l0 + k12 * l1 - v0 - (go0 ? e * r0 : 0), b1 = k12 * l0 + k22 * l1 - v1 - (go1 ? e * r1 : 0);
      const det = a11 * a22 - k12 * k12, x0 = (a22 * b0 - k12 * b1) / det, x1 = (a11 * b1 - k12 * b0) / det;
      let n0 = l0, n1 = l1;
      if (x0 >= 0 && x1 >= 0) { n0 = x0; n1 = x1; }
      else if (b0 >= 0 && k12 * b0 / a11 - b1 >= 0) { n0 = b0 / a11; n1 = 0; }
      else if (b1 >= 0 && k12 * b1 / a22 - b0 >= 0) { n0 = 0; n1 = b1 / a22; }
      const d0 = n0 - l0, d1 = n1 - l1, im0 = im[a], im1 = im[b], px = (d0 + d1) * nx, py = (d0 + d1) * ny;
      c.normalImpulse[i0] = n0; c.normalImpulse[i1] = n1;
      v[a2] -= im0 * px; v[a2 + 1] -= im0 * py;
      v[b2] += im1 * px; v[b2 + 1] += im1 * py;
      w[a] -= ii[a] * (d0 * (ax0 * ny - ay0 * nx) + d1 * (ax1 * ny - ay1 * nx));
      w[b] += ii[b] * (d0 * (bx0 * ny - by0 * nx) + d1 * (bx1 * ny - by1 * nx));
      continue;
    }
    for (let k = 0; k < c.points[m]; k++) {
      const i = m2 + k, j = m4 + 2 * k;
      if (c.relativeVelocity[i] > -threshold || c.maxNormalImpulse[i] === 0) continue;
      const ax = c.ra[j], ay = c.ra[j + 1], bx = c.rb[j], by = c.rb[j + 1];
      const vn = (v[b2] - w[b] * by - v[a2] + w[a] * ay) * nx + (v[b2 + 1] + w[b] * bx - v[a2 + 1] - w[a] * ax) * ny;
      const old = c.normalImpulse[i];
      let next = old - c.normalMass[i] * (vn + e * c.relativeVelocity[i]);
      if (next < 0) next = 0;
      const d = next - old;
      c.normalImpulse[i] = next;
      const px = d * nx, py = d * ny;
      v[a2] -= im[a] * px; v[a2 + 1] -= im[a] * py;
      v[b2] += im[b] * px; v[b2 + 1] += im[b] * py;
      w[a] -= ii[a] * (ax * py - ay * px);
      w[b] += ii[b] * (bx * py - by * px);
    }
  }
}
