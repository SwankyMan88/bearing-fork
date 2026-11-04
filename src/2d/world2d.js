// World2D: bodies in a plane, in typed-array columns, as World is in 3D.
//
// A 2D module of its own, not 3D with an axis left out (rule 106). A turn is
// one angle, inertia one number, friction one row, and a pair of bodies touches
// at two points at most, so a hot loop written for 2D does less than half the
// work of the 3D one with the third axis zeroed. It shares `core/`, and its
// API's shape: one that knows World knows this.
//
// UNITS are Winding's 2D view's: a unit is a CSS pixel, y points down, and a
// positive angle turns clockwise on the screen. 100 px to the metre is a
// convention, Godot's, and it sets the two defaults that have a unit in them:
// gravity, 9.8 m/s² as 980 px/s², and density, water's 1000 kg/m³ over a slab
// 1 m deep as 0.1 kg/px². Nothing else has a unit, since every tolerance
// follows the size of the bodies, so metres with y up are a matter of setting
// those two.
//
// ROTATION is kept as its cosine and sine, and turned in the step with exact
// operations alone, so the step needs no sine (the rule: bit-identical on
// every machine). `_angle` keeps the angle itself, unwrapped, for `transforms`,
// so that a wheel's goes on counting and `previous` to `transforms` is always
// the short way a renderer can interpolate.
//
// The step works from the centre of mass, as the 3D step does: `_position` is
// the centre of mass, and `_offset` where that is from the body's origin in
// its own frame. The API reads and writes the origin.

import {
  fail, show, finite, positive, vec2, xy, positive2, oneOf, options, known, readOnly, handle,
} from '../core/check.js';
import { atan2, cos, sin } from '../core/math.js';
import { Slots, resized, MAX_ID, MAX_SLOTS } from '../core/slots.js';
import { Body2D } from './body2d.js';
import { compound, convexHull, plain } from './shapes2d.js';
import { Core } from './collide2d.js';
import { Contacts2D, PIXEL, makeSoft, meet, prepare, restitution, soft, solve, store, warmStart } from './contact2d.js';
import { Broad2D, Pairs2D, pairable } from './pairs2d.js';

const WORLD_OPTIONS = ['gravity', 'substeps', 'sleeping'];
const BODY_OPTIONS = [
  'type', 'shape', 'size', 'radius', 'height', 'vertices', 'parts',
  'density', 'mass', 'inertia', 'centerOfMass',
  'friction', 'restitution', 'damping', 'angularDamping', 'gravityScale', 'layers', 'mask', 'group',
  'lockRotation', 'lockPosition',
  'position', 'angle', 'velocity', 'angularVelocity',
];
const PART_OPTIONS = ['shape', 'size', 'radius', 'height', 'vertices', 'position', 'angle', 'density'];
const TYPES = ['dynamic', 'static', 'kinematic'];
const SHAPES = ['box', 'circle', 'capsule', 'polygon', 'compound'];
const PART_SHAPES = ['box', 'circle', 'capsule', 'polygon'];
const DYNAMIC = 0, STATIC = 1, CIRCLE = 1;

/** Which sizes each shape takes, so `a circle has no size` can be said. */
const SIZES = { box: ['size'], circle: ['radius'], capsule: ['radius', 'height'], polygon: ['vertices'], compound: ['parts'] };
const ALL_SIZES = ['size', 'radius', 'height', 'vertices', 'parts'];

// 9.8 m/s² at 100 px to the metre, y down; see the top of this file.
const GRAVITY = [0, 980];
// 8, measured for 3D (world.js, SUBSTEPS); step 2 of the plan measures it here.
const SUBSTEPS = 8;
// The most a body other than a circle turns in a step, as in 3D (world.js, SPIN).
const SPIN = Math.PI;
// A contact's spring, as in 3D (world.js): an eighth of the substep rate, and
// well past critically damped, so overlaps ease out without a bounce.
const STIFFNESS = 1 / 8;
const DAMPING_RATIO = 10;
// How long a body stays within its tolerance of where it rested before its
// island may sleep: 3D's measure (world.js, SLEEP_TIME).
const SLEEP_TIME = 1;

const DEFAULTS = Object.freeze({
  // A 1 m box, at 100 px to the metre, as 3D's default is a 1 m cube.
  type: 'dynamic', shape: 'box', size: [100, 100], radius: 50, height: 200, vertices: null, parts: null,
  density: 0.1, mass: 0, massGiven: false, inertia: 0, inertiaGiven: false, centerOfMass: null,
  friction: 0.5, restitution: 0, damping: 0, angularDamping: 0, gravityScale: 1,
  // Everything collides with everything until told otherwise, as in 3D.
  layers: 1, mask: 0xffffffff, group: 0,
  lockRotation: false, lockPosition: [false, false],
  position: [0, 0], angle: 0, velocity: [0, 0], angularVelocity: 0,
});

/** Every per-slot column: name, array type, numbers per slot. */
const COLUMNS = [
  ['_position', Float64Array, 2],    // of the centre of mass, px
  ['_rotation', Float64Array, 2],    // cos, sin
  ['_angle', Float64Array, 1],       // the same turn as a number, unwrapped
  ['_startTurn', Float64Array, 2],   // cos, sin as the step began: scratch, for _angle
  ['_velocity', Float64Array, 2],
  ['_angular', Float64Array, 1],
  ['_offset', Float64Array, 2],      // the centre of mass from the origin, in the body's frame
  ['_com', Float64Array, 2],         // centerOfMass as given
  ['_comGiven', Uint8Array, 1],
  ['_dims', Float64Array, 3],        // a box's width, height; a circle's or capsule's radius, height
  ['_shape', Uint8Array, 1],
  ['_type', Uint8Array, 1],
  ['_mass', Float64Array, 1],
  ['_massGiven', Uint8Array, 1],
  ['_density', Float64Array, 1],
  ['_inertia', Float64Array, 1],
  ['_inertiaGiven', Uint8Array, 1],
  ['_invMass', Float64Array, 1],     // 0 for anything but a dynamic body
  ['_invInertia', Float64Array, 1],  // and 0 too for one locked from turning
  ['_force', Float64Array, 2],
  ['_torque', Float64Array, 1],
  ['_forced', Uint8Array, 1],        // on _forcedSlots
  ['_friction', Float64Array, 1],
  ['_restitution', Float64Array, 1],
  ['_damping', Float64Array, 1],
  ['_angularDamping', Float64Array, 1],
  ['_gravityScale', Float64Array, 1],
  ['_layers', Uint32Array, 1],       // which of 32 layers it is in, as bits
  ['_mask', Uint32Array, 1],         // which it collides with
  ['_group', Float64Array, 1],       // bodies of one group, but 0, never collide
  ['_lockRotation', Uint8Array, 1],
  ['_lockMove', Uint8Array, 1],      // bit 0: never moves along x; bit 1: along y
  ['_inAwake', Int32Array, 1],       // 1 + its place in _awakeList, or 0
  ['_awakeList', Int32Array, 1],
  ['_island', Int32Array, 1],        // asleep: 1 + the first of its island; else 0
  ['_islandNext', Int32Array, 1],    // 1 + the next of its island, or 0
  ['_still', Float64Array, 1],       // seconds within its tolerance of _rest
  ['_calm', Uint8Array, 1],          // stayed there a whole SLEEP_TIME: ready to sleep
  ['_rest', Float64Array, 4],        // the pose it is measured from: x, y, cos, sin
  ['_parent', Int32Array, 1],        // union-find, while islands are made
  ['_blocked', Uint8Array, 1],       // and whether a root's island has anyone not calm
  ['_movedAt', Float64Array, 1],     // the step it last moved in
  ['_size', Float64Array, 1],        // the shape's thinnest width, px: what its tolerances follow
  ['_reach', Float64Array, 1],       // the furthest it reaches from its centre of mass, px
  ['_motion', Float64Array, 1],      // how far it can move this step, px
  ['_transforms', Float32Array, 3],
  ['_previous', Float32Array, 3],
];

const POSE = new Float64Array(3);
/** Pairs read off a body's list before changing it: rows move as pairs are woken or dropped. */
const WOKEN = [];

export class World2D {
  constructor(options_) {
    const o = options('World2D', options_);
    known('World2D', o, WORLD_OPTIONS);
    this._gravity = o.gravity === undefined ? [...GRAVITY] : vec2('World2D', 'gravity', o.gravity);
    this._substeps = o.substeps === undefined ? SUBSTEPS : whole('World2D', 'substeps', o.substeps);
    this._sleeping = o.sleeping === undefined ? true : flag('World2D', 'sleeping', o.sleeping);
    this._slots = new Slots();
    // Every column named first, then made: an object given more than a dozen
    // fields by computed name becomes a dictionary (world.js, FAST PROPERTIES).
    this._position = null; this._rotation = null; this._angle = null; this._startTurn = null;
    this._velocity = null; this._angular = null; this._offset = null; this._com = null;
    this._comGiven = null; this._dims = null; this._shape = null; this._type = null;
    this._mass = null; this._massGiven = null; this._density = null; this._inertia = null;
    this._inertiaGiven = null; this._invMass = null; this._invInertia = null; this._force = null;
    this._torque = null; this._forced = null; this._friction = null; this._restitution = null;
    this._damping = null; this._angularDamping = null; this._gravityScale = null;
    this._lockRotation = null; this._lockMove = null; this._inAwake = null; this._awakeList = null;
    this._layers = null; this._mask = null; this._group = null; this._island = null; this._islandNext = null;
    this._still = null; this._calm = null; this._rest = null; this._parent = null; this._blocked = null; this._movedAt = null;
    this._size = null; this._reach = null; this._motion = null;
    this._transforms = null; this._previous = null;
    for (const [name, Type] of COLUMNS) this[name] = new Type(0);
    /** By slot: a polygon's corners, or a compound's parts, as given in option form; else null. */
    this._geometry = [];
    /** By slot: its shape as the contact code wants it (collide2d.js), or null for a compound, as yet. */
    this._core = [];
    /** This step's manifolds (contact2d.js). */
    this._contacts = new Contacts2D();
    /** Bodies filed in trees, and the pairs near each other (pairs2d.js). */
    this._broad = new Broad2D();
    this._pairs = new Pairs2D();
    /** Slots that stopped moving, for moved(): a list, so a world at rest walks none of it. */
    this._stopped = [];
    this._stoppedFloor = 0;
    /** Times a pair was tested for touching: for the off-means-off test, which reads it. */
    this._narrowed = 0;
    /** Slots with a force or torque waiting: a step with none applied looks at nothing (rule 28). */
    this._forcedSlots = [];
    this._awakeCount = 0;
    this._lockMoveCount = 0;
    this._stepCount = 0;
    this._destroyed = false;
  }

  // ---- settings and state ----

  /** How many smaller steps each step is solved in. */
  get substeps() {
    this._live('world.substeps');
    return this._substeps;
  }

  set substeps(value) {
    this._live('world.substeps');
    this._substeps = whole(null, 'world.substeps', value);
  }

  /** Whether bodies at rest go to sleep. Switching it off wakes every sleeping body. */
  get sleeping() {
    this._live('world.sleeping');
    return this._sleeping;
  }

  set sleeping(value) {
    this._live('world.sleeping');
    this._sleeping = flag(null, 'world.sleeping', value);
    if (!value) this._wakeAll();
  }

  /** px/s². A copy; assign a new value to change it. */
  get gravity() {
    this._live('world.gravity');
    return Object.freeze([...this._gravity]);
  }

  set gravity(value) {
    this._live('world.gravity');
    this._gravity = vec2(null, 'world.gravity', value);
    // What held a body at rest may not now: every sleeping body wakes (rule 36).
    this._wakeAll();
  }

  get stepCount() {
    this._live('world.stepCount');
    return this._stepCount;
  }

  set stepCount(_) { readOnly('world.stepCount'); }

  get bodyCount() {
    this._live('world.bodyCount');
    return this._slots.count;
  }

  set bodyCount(_) { readOnly('world.bodyCount'); }

  get transforms() {
    this._live('world.transforms');
    return this._transforms;
  }

  set transforms(_) { readOnly('world.transforms'); }

  get previous() {
    this._live('world.previous');
    return this._previous;
  }

  set previous(_) { readOnly('world.previous'); }

  // ---- bodies ----

  addBody(options_) {
    this._live('addBody');
    const spec = resolve('addBody', DEFAULTS, options('addBody', options_));
    let s = this._slots.take();
    if (s < 0) {
      this._grow('addBody');
      s = this._slots.take();
    }
    this._write(s, spec);
    this._stamp(s);
    this._broad.add(this, s);
    if (this._type[s] !== STATIC) this._awaken(s);
    return new Body2D(this, this._slots.id(s));
  }

  setBody(body, changes) {
    const s = this._slotOfBody('setBody', body);
    const spec = resolve('setBody', this._spec(s), options('setBody', changes, 'changes'));
    // Any change can change what holds it, so it and what touches it wake (rule 36).
    this._wake(s);
    this._wakeTouching(s);
    this._write(s, spec);
    this._stamp(s);
    if (this._type[s] === STATIC) this._unawaken(s);
    else this._awaken(s);
    // Its filtering or type may have changed: what can't pair now goes, and it asks again.
    const pairs = this._pairs;
    WOKEN.length = 0;
    for (let e = pairs.head[s] - 1; e >= 0; e = pairs.next[e] - 1) WOKEN.push(pairs.a[e >> 1], pairs.b[e >> 1]);
    for (let k = 0; k < WOKEN.length; k += 2) if (!pairable(this, WOKEN[k], WOKEN[k + 1])) pairs.drop(pairs.find(WOKEN[k], WOKEN[k + 1]));
    this._broad.refile(this, s);
  }

  bodyOf(body) {
    const s = this._slotOfBody('bodyOf', body);
    const spec = this._spec(s), out = { type: spec.type, shape: spec.shape };
    for (const k of SIZES[spec.shape]) out[k] = k === 'size' || k === 'vertices' ? [...spec[k]] : k === 'parts' ? spec.parts.map(copyPart) : spec[k];
    if (spec.massGiven) out.mass = spec.mass;
    else out.density = spec.density;
    // Not given reads back as null, which setBody and addBody take as "work it out".
    out.inertia = spec.inertiaGiven ? spec.inertia : null;
    out.centerOfMass = spec.centerOfMass === null ? null : [...spec.centerOfMass];
    out.friction = spec.friction; out.restitution = spec.restitution;
    out.damping = spec.damping; out.angularDamping = spec.angularDamping; out.gravityScale = spec.gravityScale;
    out.layers = spec.layers; out.mask = spec.mask; out.group = spec.group;
    out.lockRotation = spec.lockRotation;
    out.lockPosition = [...spec.lockPosition];
    out.position = [...spec.position];
    out.angle = spec.angle;
    if (spec.type !== 'static') {
      out.velocity = [...spec.velocity];
      out.angularVelocity = spec.angularVelocity;
    }
    return out;
  }

  /** Takes a body out. Removing one already gone does nothing, as in Winding. */
  remove(handle_) {
    this._remove('remove', handle_);
  }

  /** A handle for a body's id. Doesn't check the body is alive. */
  body(id) {
    this._live('body');
    if (!Number.isInteger(id) || id < 0 || id > MAX_ID) fail('body', `id must be a whole number from 0 to ${MAX_ID}, got ${show(id)}`);
    return new Body2D(this, id);
  }

  /**
   * The slots of bodies that moved since step `since`, so a renderer copies
   * only those: a world of 10,000 sleeping bodies copies none.
   */
  moved(since) {
    this._live('moved');
    if (!Number.isInteger(since) || since < 0) fail('moved', `since must be a whole number, 0 or more, got ${show(since)}`);
    const out = [], at = this._movedAt, seen = new Set(), list = this._awakeList;
    if (since < this._stoppedFloor) {
      for (let s = 0; s < this._slots.top; s++) if (this._slots.state[s] === 1 && at[s] > since) out.push(s);
      return Int32Array.from(out);
    }
    for (let i = 0; i < this._awakeCount; i++) if (at[list[i]] > since) { out.push(list[i]); seen.add(list[i]); }
    const stopped = this._stopped;
    for (let i = stopped.length - 2; i >= 0 && stopped[i + 1] > since; i -= 2) {
      const s = stopped[i];
      if (!seen.has(s) && this._slots.state[s] === 1 && at[s] > since) { out.push(s); seen.add(s); }
    }
    return Int32Array.from(out);
  }

  /** Moves the world on by `dt` seconds, exactly. */
  step(dt) {
    this._live('step');
    if (typeof dt !== 'number' || !(dt > 0) || dt === Infinity) fail('step', `dt must be a positive number of seconds, got ${show(dt)}`);
    this._stepCount++;
    if (this._forcedSlots.length > 0) this._applyForces(dt);
    const list = this._awakeList, tr = this._transforms, prev = this._previous, r = this._rotation, turn = this._startTurn;
    for (let i = 0; i < this._awakeCount; i++) {
      const s = list[i], t3 = 3 * s, s2 = 2 * s;
      prev[t3] = tr[t3]; prev[t3 + 1] = tr[t3 + 1]; prev[t3 + 2] = tr[t3 + 2];
      turn[s2] = r[s2]; turn[s2 + 1] = r[s2 + 1];
    }
    const substeps = this._substeps, h = dt / substeps, pins = this._lockMoveCount > 0, g = this._gravity;
    const gravity = Math.sqrt(g[0] * g[0] + g[1] * g[1]), c = this._contacts;
    this._narrow(dt, gravity);
    const touching = c.count > 0;
    if (touching) {
      makeSoft(STIFFNESS / h, DAMPING_RATIO, h, soft);
      prepare(this, c);
    }
    for (let sub = 0; sub < substeps; sub++) {
      this._accelerate(h, dt);
      if (touching) warmStart(this, c);
      if (pins) this._pin();
      if (touching) solve(this, c, h, true);
      if (pins) this._pin();
      this._move(h);
      if (touching) solve(this, c, h, false);
      if (pins) this._pin();
    }
    if (touching) {
      restitution(this, c, gravity);
      if (pins) this._pin();
      store(c, this._pairs);
    }
    const angle = this._angle;
    for (let i = 0; i < this._awakeCount; i++) {
      const s = list[i], s2 = 2 * s, c = r[s2], z = r[s2 + 1], c0 = turn[s2], z0 = turn[s2 + 1];
      // The step's turn as an angle: the spin cap keeps it under half a turn,
      // but for a circle, whose `angle` may lose whole turns at such speeds.
      if (c !== c0 || z !== z0) angle[s] += atan2(z * c0 - c * z0, c * c0 + z * z0);
      this._place(s);
      this._movedAt[s] = this._stepCount;
    }
    if (this._sleeping) this._sleep(dt);
  }

  /** Lets go of everything. Using the world afterwards throws; calling this again does nothing. */
  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    this._slots = new Slots();
    for (const [name, Type] of COLUMNS) this[name] = new Type(0);
    this._geometry = [];
    this._core = [];
    this._contacts = new Contacts2D();
    this._broad = new Broad2D();
    this._pairs = new Pairs2D();
    this._stopped = [];
    this._forcedSlots = [];
    this._awakeCount = 0;
    this._lockMoveCount = 0;
  }

  // ---- what Body2D calls (public, but not for users: see test/2d-docs.test.js) ----

  _live(caller) {
    if (this._destroyed) fail(caller, 'this world was destroyed');
  }

  /** The slot of a live id, after checking the world; throws naming `caller` otherwise. */
  _slotOf(caller, id) {
    this._live(caller);
    const s = this._slots.slotOf(id);
    if (s < 0) fail(caller, 'this body was removed');
    return s;
  }

  _alive(id) {
    return !this._destroyed && this._slots.slotOf(id) >= 0;
  }

  /** A slot's two numbers in `column`, as a frozen copy. */
  _vector(caller, id, column) {
    const s = this._slotOf(caller, id);
    return Object.freeze([column[2 * s], column[2 * s + 1]]);
  }

  _asleepOf(caller, id) {
    return this._island[this._slotOf(caller, id)] !== 0;
  }

  _massOf(caller, id) {
    return this._mass[this._slotOf(caller, id)];
  }

  _inertiaOf(caller, id) {
    return this._inertia[this._slotOf(caller, id)];
  }

  _angleOf(caller, id) {
    return this._angle[this._slotOf(caller, id)];
  }

  _spinOf(caller, id) {
    return this._angular[this._slotOf(caller, id)];
  }

  _poseOf(caller, id) {
    this._pose(this._slotOf(caller, id));
    return Object.freeze([POSE[0], POSE[1]]);
  }

  _setPosition(caller, id, x, y) {
    const s = this._slotOf(caller, id), at = xy(caller, x, y);
    this._pose(s);
    this._put(s, at[0], at[1], POSE[2]);
    this._moved(s);
  }

  _setAngle(caller, id, radians) {
    const s = this._slotOf(caller, id);
    this._pose(s);
    this._put(s, POSE[0], POSE[1], radians);
    this._moved(s);
  }

  _setVelocity(caller, id, x, y) {
    const s = this._slotOf(caller, id), v = xy(caller, x, y);
    if (this._type[s] === STATIC) fail(caller, 'a static body has no velocity');
    this._wake(s);
    this._velocity[2 * s] = v[0]; this._velocity[2 * s + 1] = v[1];
    this._pinned(s);
  }

  _setSpin(caller, id, radians) {
    const s = this._slotOf(caller, id);
    finite(caller, 'radians', radians);
    if (this._type[s] === STATIC) fail(caller, 'a static body has no angularVelocity');
    this._wake(s);
    if (this._lockRotation[s] === 0) this._angular[s] = radians;
  }

  /**
   * body.moveTo: the velocities that take its origin to `position`, turned to
   * `angle`, the short way round, over a step of dt. A substep turns by
   * 2 atan(ω h / 2) (_move), so the spin is sized to that, and a kinematic
   * body lands on the pose to rounding, as in 3D.
   */
  _moveTo(caller, id, position, angle, dt) {
    const s = this._slotOf(caller, id), at = vec2(caller, 'position', position);
    if (angle !== null && angle !== undefined) finite(caller, 'angle', angle);
    if (typeof dt !== 'number' || !(dt > 0) || dt === Infinity) fail(caller, `dt must be a positive number, got ${show(dt)}`);
    if (this._type[s] === STATIC) fail(caller, 'a static body has no velocity');
    this._wake(s);
    const s2 = 2 * s, c = this._rotation[s2], z = this._rotation[s2 + 1];
    let tc = c, tz = z;
    if (angle !== null && angle !== undefined) { tc = cos(angle); tz = sin(angle); }
    const ox = this._offset[s2], oy = this._offset[s2 + 1];
    this._velocity[s2] = (at[0] + tc * ox - tz * oy - this._position[s2]) / dt;
    this._velocity[s2 + 1] = (at[1] + tz * ox + tc * oy - this._position[s2 + 1]) / dt;
    this._pinned(s);
    const half = atan2(tz * c - tc * z, tc * c + tz * z) * 0.5 / this._substeps, h = dt / this._substeps;
    if (this._lockRotation[s] === 0) this._angular[s] = 2 * sin(half) / (cos(half) * h);
  }

  // Forces and impulses. Each checks its arguments whatever the body's type,
  // then does nothing to a static or kinematic body: those act as infinitely
  // heavy, as in 3D, so an explosion can push everything near it unasked.

  _applyForce(caller, id, force, point) {
    const s = this._slotOf(caller, id), f = vec2(caller, 'force', force);
    const at = point === undefined ? null : vec2(caller, 'point', point);
    if (this._type[s] !== DYNAMIC) return;
    this._wake(s);
    const s2 = 2 * s;
    this._force[s2] += f[0]; this._force[s2 + 1] += f[1];
    if (at) this._torque[s] += (at[0] - this._position[s2]) * f[1] - (at[1] - this._position[s2 + 1]) * f[0];
    this._queue(s);
  }

  _applyTorque(caller, id, torque) {
    const s = this._slotOf(caller, id);
    finite(caller, 'torque', torque);
    if (this._type[s] !== DYNAMIC) return;
    this._wake(s);
    this._torque[s] += torque;
    this._queue(s);
  }

  _applyImpulse(caller, id, impulse, point) {
    const s = this._slotOf(caller, id), j = vec2(caller, 'impulse', impulse);
    const at = point === undefined ? null : vec2(caller, 'point', point);
    if (this._type[s] !== DYNAMIC) return;
    this._wake(s);
    const s2 = 2 * s, m = this._invMass[s];
    this._velocity[s2] += j[0] * m; this._velocity[s2 + 1] += j[1] * m;
    this._pinned(s);
    if (at) this._angular[s] += this._invInertia[s] * ((at[0] - this._position[s2]) * j[1] - (at[1] - this._position[s2 + 1]) * j[0]);
  }

  _applyAngularImpulse(caller, id, impulse) {
    const s = this._slotOf(caller, id);
    finite(caller, 'impulse', impulse);
    if (this._type[s] !== DYNAMIC) return;
    this._wake(s);
    this._angular[s] += this._invInertia[s] * impulse;
  }

  _queue(s) {
    if (this._forced[s] === 0) {
      this._forced[s] = 1;
      this._forcedSlots.push(s);
    }
  }

  _remove(caller, body) {
    this._live(caller);
    if (!(body instanceof Body2D)) fail(caller, `handle must be a Body2D, got ${show(body)}`);
    const s = handle(caller, 'handle', body, this, Body2D, this._slots, true);
    if (s < 0) return;
    // What it was holding up wakes, and its pairs go with it.
    this._wake(s);
    this._wakeTouching(s);
    const pairs = this._pairs;
    while (pairs.head[s] !== 0) pairs.drop((pairs.head[s] - 1) >> 1);
    this._broad.remove(s);
    // A force waiting on this slot must not land on whichever body gets it next.
    this._forced[s] = 0;
    this._force[2 * s] = 0; this._force[2 * s + 1] = 0; this._torque[s] = 0;
    this._geometry[s] = null;
    this._core[s] = null;
    if (this._lockMove[s] !== 0) { this._lockMove[s] = 0; this._lockMoveCount--; }
    this._unawaken(s);
    this._slots.release(s);
    // Shrunk by the 1/4 rule, as in 3D (world.js _remove).
    const top = this._slots.top;
    if (top <= this._slots.capacity / 4) {
      let capacity = top === 0 ? 0 : 1;
      while (capacity < top) capacity *= 2;
      this._resize(capacity);
    }
    pairs.trim();
    this._broad.trim();
  }

  // ---- inside ----

  _slotOfBody(caller, body) {
    this._live(caller);
    return handle(caller, 'body', body, this, Body2D, this._slots);
  }

  _grow(caller) {
    const slots = this._slots;
    // slots.limit is MAX_SLOTS except in a test, which lowers it to reach this.
    if (slots.capacity >= slots.limit) {
      fail(caller, `a world holds at most ${MAX_SLOTS} bodies (the slot field of an id is 24 bits)`);
    }
    this._resize(Math.min(Math.max(slots.capacity * 2, 1), slots.limit));
  }

  _resize(capacity) {
    this._slots.resize(capacity);
    for (const [name, , per] of COLUMNS) this[name] = resized(this[name], capacity * per);
    for (const g of [this._geometry, this._core]) {
      const had = g.length;
      g.length = capacity;
      for (let s = had; s < capacity; s++) g[s] = null;
    }
    this._pairs.resize(capacity);
    this._broad.resize(capacity);
  }

  _awaken(s) {
    if (this._inAwake[s] !== 0) return;
    this._awakeList[this._awakeCount] = s;
    this._inAwake[s] = ++this._awakeCount;
  }

  _unawaken(s) {
    const i = this._inAwake[s] - 1;
    if (i < 0) return;
    const last = this._awakeList[--this._awakeCount];
    this._awakeList[i] = last;
    this._inAwake[last] = i + 1;
    this._inAwake[s] = 0;
  }

  /** Slot s's island, if it is asleep, back among the awake, and every pair of theirs looked at again. */
  _wake(s) {
    if (this._island[s] === 0) return;
    const pairs = this._pairs, r = this._rotation, turn = this._startTurn;
    for (let b = this._island[s] - 1; b >= 0;) {
      const next = this._islandNext[b] - 1, b2 = 2 * b, t3 = 3 * b;
      this._island[b] = 0; this._islandNext[b] = 0;
      this._awaken(b);
      this._still[b] = 0; this._calm[b] = 0;
      this._rest[4 * b] = this._position[b2]; this._rest[4 * b + 1] = this._position[b2 + 1];
      this._rest[4 * b + 2] = r[b2]; this._rest[4 * b + 3] = r[b2 + 1];
      // Woken by a touch in the middle of finding contacts: this step's start is now.
      turn[b2] = r[b2]; turn[b2 + 1] = r[b2 + 1];
      this._previous[t3] = this._transforms[t3]; this._previous[t3 + 1] = this._transforms[t3 + 1]; this._previous[t3 + 2] = this._transforms[t3 + 2];
      // Waking a pair swaps rows, which moves edges, so the list is read first.
      WOKEN.length = 0;
      for (let e = pairs.head[b] - 1; e >= 0; e = pairs.next[e] - 1) if ((e >> 1) >= pairs.active) WOKEN.push(pairs.a[e >> 1], pairs.b[e >> 1]);
      for (let k = 0; k < WOKEN.length; k += 2) pairs.wake(pairs.find(WOKEN[k], WOKEN[k + 1]));
      b = next;
    }
  }

  _wakeAll() {
    for (let s = 0; s < this._slots.top; s++) if (this._island[s] !== 0) this._wake(s);
  }

  /** Everything touching slot s wakes. */
  _wakeTouching(s) {
    const pairs = this._pairs;
    for (let e = pairs.head[s] - 1; e >= 0;) {
      const p = e >> 1, other = pairs.a[p] === s ? pairs.b[p] : pairs.a[p];
      if (this._island[other] === 0) { e = pairs.next[e] - 1; continue; }
      this._wake(other);
      e = pairs.head[s] - 1;   // waking moved rows: from the top, the woken now awake
    }
  }

  /** Moved by hand between steps: it counts from the next step, so moved(stepCount) sees it. */
  _stamp(s) {
    this._movedAt[s] = this._stepCount + 1;
    this._note(s, this._stepCount + 1);
  }

  /** On the list moved() reads for what isn't awake; kept to twice the storage, its oldest half dropped. */
  _note(s, stamp) {
    const list = this._stopped;
    list.push(s, stamp);
    if (list.length > 2 * Math.max(this._slots.capacity, 64) * 2) {
      const half = list.length >> 1 & ~1;
      this._stoppedFloor = list[half - 1];
      list.splice(0, half);
    }
  }

  /** After a teleport: drawn there, stamped, filed afresh, and what a static body held woken. */
  _moved(s) {
    this._place(s);
    this._settled(s);
    this._stamp(s);
    this._wake(s);
    if (this._type[s] === STATIC) this._wakeTouching(s);
    this._broad.refile(this, s);
  }

  /** Slot s's origin and angle as the API has them, into POSE. */
  _pose(s) {
    const s2 = 2 * s, c = this._rotation[s2], z = this._rotation[s2 + 1], ox = this._offset[s2], oy = this._offset[s2 + 1];
    POSE[0] = this._position[s2] - (c * ox - z * oy);
    POSE[1] = this._position[s2 + 1] - (z * ox + c * oy);
    POSE[2] = this._angle[s];
  }

  /** Slot s with its origin at (x, y), turned by `angle`: the inverse of _pose. */
  _put(s, x, y, angle) {
    const s2 = 2 * s, c = cos(angle), z = sin(angle), ox = this._offset[s2], oy = this._offset[s2 + 1];
    this._rotation[s2] = c; this._rotation[s2 + 1] = z;
    this._startTurn[s2] = c; this._startTurn[s2 + 1] = z;
    this._angle[s] = angle;
    this._position[s2] = x + c * ox - z * oy;
    this._position[s2 + 1] = y + z * ox + c * oy;
  }

  /** Copies a slot's pose out to `transforms`. */
  _place(s) {
    const t3 = 3 * s, tr = this._transforms;
    this._pose(s);
    tr[t3] = POSE[0]; tr[t3 + 1] = POSE[1]; tr[t3 + 2] = POSE[2];
  }

  /** After a teleport: `previous` goes with it, so a renderer doesn't draw it sliding across. */
  _settled(s) {
    const t3 = 3 * s, tr = this._transforms, prev = this._previous;
    prev[t3] = tr[t3]; prev[t3 + 1] = tr[t3 + 1]; prev[t3 + 2] = tr[t3 + 2];
  }

  /** A slot's full description, in option form, with the position as `_pose` reads it. */
  _spec(s) {
    const shape = SHAPES[this._shape[s]], d = this._dims, s2 = 2 * s, s3 = 3 * s;
    this._pose(s);
    const g = this._geometry[s];
    return {
      type: TYPES[this._type[s]], shape,
      size: shape === 'box' ? [d[s3], d[s3 + 1]] : [...DEFAULTS.size],
      radius: shape === 'circle' || shape === 'capsule' ? d[s3] : DEFAULTS.radius,
      height: shape === 'capsule' ? d[s3 + 1] : DEFAULTS.height,
      vertices: shape === 'polygon' ? g : null, parts: shape === 'compound' ? g : null,
      density: this._density[s], mass: this._mass[s], massGiven: this._massGiven[s] === 1,
      inertia: this._inertia[s], inertiaGiven: this._inertiaGiven[s] === 1,
      centerOfMass: this._comGiven[s] === 1 ? [this._com[s2], this._com[s2 + 1]] : null,
      friction: this._friction[s], restitution: this._restitution[s], damping: this._damping[s],
      angularDamping: this._angularDamping[s], gravityScale: this._gravityScale[s],
      layers: this._layers[s], mask: this._mask[s], group: this._group[s],
      lockRotation: this._lockRotation[s] === 1,
      lockPosition: [(this._lockMove[s] & 1) !== 0, (this._lockMove[s] & 2) !== 0],
      position: [POSE[0], POSE[1]], angle: POSE[2],
      velocity: [this._velocity[s2], this._velocity[s2 + 1]], angularVelocity: this._angular[s],
    };
  }

  /** Writes a checked description into slot s's columns. */
  _write(s, spec) {
    const s2 = 2 * s, s3 = 3 * s, d = this._dims;
    this._type[s] = TYPES.indexOf(spec.type);
    this._shape[s] = SHAPES.indexOf(spec.shape);
    this._geometry[s] = spec.shape === 'polygon' ? spec.vertices : spec.shape === 'compound' ? spec.parts : null;
    d[s3] = spec.shape === 'box' ? spec.size[0] : spec.radius;
    d[s3 + 1] = spec.shape === 'box' ? spec.size[1] : spec.height;
    this._density[s] = spec.density;
    this._massGiven[s] = spec.massGiven ? 1 : 0;
    // Worked out at a density of 1 for a plain shape; a compound's parts have
    // densities of their own, so its mass is worked out as a whole, and scaled
    // to a mass given.
    let mass, moment, cx, cy;
    if (spec.shape === 'compound') {
      const m = compound(spec.parts, spec.density);
      mass = spec.massGiven ? spec.mass : m.mass;
      moment = m.moment * (mass / m.mass);
      cx = m.x; cy = m.y;
    } else {
      const m = plain(spec.shape, spec.size, spec.radius, spec.height, spec.vertices);
      mass = spec.massGiven ? spec.mass : m.area * spec.density;
      moment = m.moment * (mass / m.area);
      cx = m.x; cy = m.y;
    }
    this._mass[s] = mass;
    this._inertiaGiven[s] = spec.inertiaGiven ? 1 : 0;
    this._inertia[s] = spec.inertiaGiven ? spec.inertia : moment;
    // A centre of mass given moves where the body turns about, and keeps the
    // shape's own inertia, as in 3D.
    this._comGiven[s] = spec.centerOfMass === null ? 0 : 1;
    if (spec.centerOfMass !== null) { cx = spec.centerOfMass[0]; cy = spec.centerOfMass[1]; this._com[s2] = cx; this._com[s2 + 1] = cy; }
    this._offset[s2] = cx; this._offset[s2 + 1] = cy;
    this._shaped(s, spec, cx, cy);
    const moves = spec.type === 'dynamic';
    this._invMass[s] = moves ? 1 / mass : 0;
    this._invInertia[s] = moves && !spec.lockRotation ? 1 / this._inertia[s] : 0;
    this._friction[s] = spec.friction; this._restitution[s] = spec.restitution;
    this._damping[s] = spec.damping; this._angularDamping[s] = spec.angularDamping;
    this._gravityScale[s] = spec.gravityScale;
    this._layers[s] = spec.layers; this._mask[s] = spec.mask; this._group[s] = spec.group;
    this._lockRotation[s] = spec.lockRotation ? 1 : 0;
    const held = (spec.lockPosition[0] ? 1 : 0) | (spec.lockPosition[1] ? 2 : 0);
    this._lockMoveCount += (held !== 0 ? 1 : 0) - (this._lockMove[s] !== 0 ? 1 : 0);
    this._lockMove[s] = held;
    this._put(s, spec.position[0], spec.position[1], spec.angle);
    const still = spec.type === 'static';
    this._velocity[s2] = still ? 0 : spec.velocity[0]; this._velocity[s2 + 1] = still ? 0 : spec.velocity[1];
    this._angular[s] = still || spec.lockRotation ? 0 : spec.angularVelocity;
    this._pinned(s);
    this._place(s);
    this._settled(s);
    this._still[s] = 0; this._calm[s] = 0;
    this._rest[4 * s] = this._position[s2]; this._rest[4 * s + 1] = this._position[s2 + 1];
    this._rest[4 * s + 2] = this._rotation[s2]; this._rest[4 * s + 3] = this._rotation[s2 + 1];
  }

  /**
   * Slot s's core, its corners from the centre of mass (cx, cy), and the size
   * and reach everything else scales by. A compound has no core: step 4.
   */
  _shaped(s, spec, cx, cy) {
    let corners = null, radius = 0;
    if (spec.shape === 'box') {
      const w = spec.size[0] * 0.5, h = spec.size[1] * 0.5;
      corners = [-w, -h, w, -h, w, h, -w, h];
    } else if (spec.shape === 'circle') {
      corners = [0, 0]; radius = spec.radius;
    } else if (spec.shape === 'capsule') {
      const L = spec.height * 0.5 - spec.radius;
      corners = [0, -L, 0, L]; radius = spec.radius;
    } else if (spec.shape === 'polygon') {
      corners = [...spec.vertices];
    }
    if (corners === null) { this._core[s] = null; this._size[s] = 0; this._reach[s] = 0; return; }
    for (let k = 0; k < corners.length; k += 2) { corners[k] -= cx; corners[k + 1] -= cy; }
    const core = this._core[s] = new Core(corners, radius);
    let reach = 0;
    for (let k = 0; k < core.n; k++) reach = Math.max(reach, core.x[k] * core.x[k] + core.y[k] * core.y[k]);
    this._reach[s] = Math.sqrt(reach) + radius;
    // The thinnest width: across each side, the furthest corner.
    let width = Infinity;
    if (core.n >= 3) {
      for (let k = 0; k < core.n; k++) {
        let far = 0;
        for (let j = 0; j < core.n; j++) far = Math.max(far, -((core.x[j] - core.x[k]) * core.nx[k] + (core.y[j] - core.y[k]) * core.ny[k]));
        width = Math.min(width, far);
      }
    }
    this._size[s] = core.n >= 3 ? width + 2 * radius : 2 * radius;
  }

  /**
   * This step's manifolds, and how far each body can move in it: speed, plus
   * what gravity adds, plus spin times reach (a circle's spin moves nothing),
   * all over dt. Two bodies further apart than the sum of theirs can't meet.
   */
  _narrow(dt, gravity) {
    const list = this._awakeList, n = this._awakeCount, v = this._velocity, w = this._angular;
    const motion = this._motion, reach = this._reach, shape = this._shape, type = this._type;
    for (let i = 0; i < n; i++) {
      const s = list[i], s2 = 2 * s;
      const speed = Math.sqrt(v[s2] * v[s2] + v[s2 + 1] * v[s2 + 1]) + (type[s] === DYNAMIC ? gravity * dt : 0);
      motion[s] = (speed + (shape[s] === CIRCLE ? 0 : Math.abs(w[s]) * reach[s])) * dt;
    }
    const broad = this._broad, pairs = this._pairs, c = this._contacts, core = this._core, island = this._island;
    broad.update(this);
    if (broad.movedCount > 0) broad.candidates(this, pairs);
    c.count = 0;
    // `active` may grow as this walks: a pair woken here is looked at this step.
    for (let p = 0; p < pairs.active;) {
      const a = pairs.a[p], b = pairs.b[p];
      if (!broad.overlap(a, b)) { pairs.drop(p); continue; }
      if (core[a] !== null && core[b] !== null) {
        this._narrowed++;
        if (meet(this, c, a, b, p, pairs)) {
          // A sleeping body touched wakes, and its island's pairs join this walk.
          if (island[a] !== 0) this._wake(a);
          if (island[b] !== 0) this._wake(b);
        } else {
          pairs.ids[2 * p] = -1; pairs.ids[2 * p + 1] = -1; pairs.roll[p] = 0;
        }
      }
      p++;
    }
  }

  /**
   * Who may sleep. An island, bodies touching, sleeps when every one of them
   * has stayed within its tolerance of where it rested for SLEEP_TIME:
   * distance, not speed, since a speed rule kept a buzzing heap awake for good
   * (world.js). The rest pose is taken again each whole SLEEP_TIME, so a body
   * creeping less than its tolerance a second is still. Islands are made by
   * union-find over this step's contacts, only once someone is ready. Static
   * bodies join nothing, or a whole floor would be one island.
   */
  _sleep(dt) {
    const list = this._awakeList, p = this._position, r = this._rotation, rest = this._rest, reach = this._reach;
    const size = this._size, still = this._still, calm = this._calm, shape = this._shape, parent = this._parent;
    let ready = false;
    for (let i = 0; i < this._awakeCount; i++) {
      const s = list[i], s2 = 2 * s, s4 = 4 * s, tolerance = size[s] * PIXEL;
      const dx = p[s2] - rest[s4], dy = p[s2 + 1] - rest[s4 + 1], dc = r[s2] - rest[s4 + 2], dz = r[s2 + 1] - rest[s4 + 3];
      let far = dx * dx + dy * dy;
      if (shape[s] !== CIRCLE) far += (dc * dc + dz * dz) * reach[s] * reach[s];
      const again = far > tolerance * tolerance;
      still[s] = again ? 0 : still[s] + dt;
      if (again) calm[s] = 0;
      else if (still[s] >= SLEEP_TIME) { calm[s] = 1; still[s] = 0; }
      if (again || still[s] === 0) {
        rest[s4] = p[s2]; rest[s4 + 1] = p[s2 + 1]; rest[s4 + 2] = r[s2]; rest[s4 + 3] = r[s2 + 1];
      }
      if (calm[s] === 1) ready = true;
      parent[s] = s;
    }
    if (!ready) return;
    const find = (x) => {
      while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
      return x;
    };
    const c = this._contacts, type = this._type;
    for (let m = 0; m < c.count; m++) {
      const a = c.a[m], b = c.b[m];
      if (type[a] === DYNAMIC && type[b] === DYNAMIC) parent[find(a)] = find(b);
    }
    // An island with anyone not calm stays up. Every body points straight at
    // its root first, so nothing below has to walk.
    const blocked = this._blocked;
    for (let i = 0; i < this._awakeCount; i++) {
      const s = list[i], root = find(s);
      parent[s] = root;
      blocked[root] = 0;
    }
    for (let i = 0; i < this._awakeCount; i++) {
      const s = list[i];
      if (calm[s] === 0) blocked[parent[s]] = 1;
    }
    const isle = this._island, nextOf = this._islandNext, roots = new Map();
    for (let i = 0; i < this._awakeCount; i++) {
      const s = list[i], root = parent[s];
      if (blocked[root] === 1) continue;
      const head = roots.get(root);
      nextOf[s] = head === undefined ? 0 : head + 1;
      roots.set(root, s);
    }
    if (roots.size === 0) return;
    const v = this._velocity, w = this._angular, pairs = this._pairs;
    for (const head of roots.values()) {
      for (let b = head; b >= 0; b = nextOf[b] - 1) {
        isle[b] = head + 1;
        v[2 * b] = 0; v[2 * b + 1] = 0; w[b] = 0;
        this._unawaken(b);
        this._note(b, this._stepCount);
      }
    }
    // Pairs with no awake body left: at the end of the list, costing nothing.
    for (let p2 = pairs.active - 1; p2 >= 0; p2--) {
      const a = pairs.a[p2], b = pairs.b[p2];
      if (this._inAwake[a] === 0 && this._inAwake[b] === 0) pairs.rest(p2);
    }
  }

  _applyForces(dt) {
    const list = this._forcedSlots, forced = this._forced, f = this._force, t = this._torque;
    const v = this._velocity, w = this._angular, im = this._invMass, ii = this._invInertia;
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if (forced[s] === 0) continue;   // removed since, or a repeat
      forced[s] = 0;
      const s2 = 2 * s;
      // Made static or kinematic since: im and ii are 0, and it goes with the step.
      v[s2] += f[s2] * dt * im[s]; v[s2 + 1] += f[s2 + 1] * dt * im[s];
      w[s] += t[s] * dt * ii[s];
      f[s2] = 0; f[s2 + 1] = 0; t[s] = 0;
    }
    list.length = 0;
  }

  /** Gravity and damping on dynamic bodies, and the spin cap, as each substep starts. */
  _accelerate(h, dt) {
    const list = this._awakeList, n = this._awakeCount, type = this._type, shape = this._shape;
    const v = this._velocity, w = this._angular, scale = this._gravityScale;
    const damping = this._damping, angularDamping = this._angularDamping;
    const gx = this._gravity[0] * h, gy = this._gravity[1] * h, most = SPIN / dt;
    for (let i = 0; i < n; i++) {
      const s = list[i];
      if (type[s] !== DYNAMIC) continue;
      const s2 = 2 * s, g = scale[s];
      v[s2] += gx * g; v[s2 + 1] += gy * g;
      // dv/dt = -c v, taken implicitly, as in 3D: exact operations, and never past zero.
      if (damping[s] !== 0) {
        const k = 1 / (1 + h * damping[s]);
        v[s2] *= k; v[s2 + 1] *= k;
      }
      if (angularDamping[s] !== 0) w[s] /= 1 + h * angularDamping[s];
      if (shape[s] !== CIRCLE) {
        if (w[s] > most) w[s] = most;
        else if (w[s] < -most) w[s] = -most;
      }
    }
  }

  /**
   * Position from the new velocity, and the turn. (cos, sin) is carried on by
   * the turn whose half-angle tangent is t = ω h / 2: cos (1 - t²)/(1 + t²),
   * sin 2t/(1 + t²), exact operations alone. That is a turn of 2 atan(ω h / 2)
   * rather than ω h, short by (ω h)²/12 of itself, the same turn the 3D step's
   * quaternion update makes. Back to unit length after, against rounding.
   */
  _move(h) {
    const list = this._awakeList, n = this._awakeCount, half = h * 0.5;
    const p = this._position, r = this._rotation, v = this._velocity, w = this._angular;
    for (let i = 0; i < n; i++) {
      const s = list[i], s2 = 2 * s;
      p[s2] += v[s2] * h; p[s2 + 1] += v[s2 + 1] * h;
      if (w[s] === 0) continue;
      const t = w[s] * half, k = 1 / (1 + t * t), tc = (1 - t * t) * k, tz = 2 * t * k;
      const c = r[s2] * tc - r[s2 + 1] * tz, z = r[s2 + 1] * tc + r[s2] * tz, l = 1 / Math.sqrt(c * c + z * z);
      r[s2] = c * l; r[s2 + 1] = z * l;
    }
  }

  /** Every awake body's speed along its locked axes back to 0: as lockPosition holds in 3D (world.js _pin). */
  _pin() {
    const list = this._awakeList, lock = this._lockMove, v = this._velocity;
    for (let i = 0; i < this._awakeCount; i++) {
      const s = list[i], l = lock[s];
      if (l === 0) continue;
      if ((l & 1) !== 0) v[2 * s] = 0;
      if ((l & 2) !== 0) v[2 * s + 1] = 0;
    }
  }

  _pinned(s) {
    const l = this._lockMove[s];
    if ((l & 1) !== 0) this._velocity[2 * s] = 0;
    if ((l & 2) !== 0) this._velocity[2 * s + 1] = 0;
  }
}

function whole(caller, name, value) {
  if (!Number.isInteger(value) || value < 1) fail(caller, `${name} must be a whole number, 1 or more, got ${show(value)}`);
  return value;
}

const atLeastZero = (caller, name, value) => {
  if (typeof value !== 'number' || !(value >= 0) || value === Infinity) fail(caller, `${name} must be 0 or more, got ${show(value)}`);
  return value;
};

/** 32 bits, given unsigned or signed: `~PLAYER` and `1 << 31` are negative (world.js bits). */
const bits = (caller, name, value) => {
  if (!Number.isInteger(value) || value < -0x80000000 || value > 0xffffffff) fail(caller, `${name} must be a whole number that fits in 32 bits, got ${show(value)}`);
  return value >>> 0;
};

const flag = (caller, name, value) => {
  if (typeof value !== 'boolean') fail(caller, `${name} must be true or false, got ${show(value)}`);
  return value;
};

const copyPart = (p) => {
  const out = { shape: p.shape };
  for (const k of SIZES[p.shape]) out[k] = Array.isArray(p[k]) ? [...p[k]] : p[k];
  out.position = [...p.position];
  out.angle = p.angle;
  if (p.density !== undefined) out.density = p.density;
  return out;
};

/** Flat corners, checked, as their convex hull. */
function corners(caller, name, value) {
  const ok = value !== null && typeof value === 'object' && value.length >= 2 && value.length % 2 === 0
    && Array.prototype.every.call(value, (x) => typeof x === 'number' && Number.isFinite(x));
  if (!ok) fail(caller, `${name} must be finite numbers, two to a vertex, got ${show(value)}`);
  const hull = convexHull(value);
  if (hull === null) fail(caller, `${name} must span an area (3 points not on one line), got ${show(value)}`);
  return hull;
}

/** One sizes check, for a body or a part: `name` is how its options read in a message. */
function sizes(caller, prefix, shape, o, base) {
  const out = { size: base.size, radius: base.radius, height: base.height, vertices: base.vertices };
  const has = (k) => o[k] !== undefined;
  if (has('size')) out.size = positive2(caller, `${prefix}size`, o.size);
  if (has('radius')) out.radius = positive(caller, `${prefix}radius`, o.radius);
  if (has('height')) out.height = positive(caller, `${prefix}height`, o.height);
  if (has('vertices')) out.vertices = corners(caller, `${prefix}vertices`, o.vertices);
  if (shape === 'polygon' && out.vertices === null) out.vertices = convexHull([-50, -50, 50, -50, 50, 50, -50, 50]);
  if (shape === 'capsule' && out.height < 2 * out.radius) fail(caller, `${prefix}height must be at least twice radius (${2 * out.radius}), got ${show(out.height)}`);
  return out;
}

function part(caller, k, given) {
  const name = `parts[${k}]`;
  if (given === null || typeof given !== 'object' || Array.isArray(given)) fail(caller, `${name} must be an object, got ${show(given)}`);
  known(`${caller}: ${name}`, given, PART_OPTIONS);
  const shape = given.shape === undefined ? 'box' : oneOf(caller, `${name}.shape`, given.shape, PART_SHAPES);
  for (const key of ALL_SIZES) if (key !== 'parts' && given[key] !== undefined && !SIZES[shape].includes(key)) fail(caller, `${name}: a ${shape} has no ${key}`);
  const out = { shape, ...sizes(caller, `${name}.`, shape, given, DEFAULTS) };
  out.position = given.position === undefined ? [0, 0] : vec2(caller, `${name}.position`, given.position);
  out.angle = given.angle === undefined ? 0 : finite(caller, `${name}.angle`, given.angle);
  if (given.density !== undefined) out.density = positive(caller, `${name}.density`, given.density);
  return out;
}

/** `base` changed by the options `given`, every one checked; nothing is written. */
function resolve(caller, base, given) {
  known(caller, given, BODY_OPTIONS);
  const has = (k) => given[k] !== undefined;
  const type = has('type') ? oneOf(caller, 'type', given.type, TYPES) : base.type;
  const shape = has('shape') ? oneOf(caller, 'shape', given.shape, SHAPES) : base.shape;
  for (const k of ALL_SIZES) if (has(k) && !SIZES[shape].includes(k)) fail(caller, `a ${shape} has no ${k}`);
  const { size, radius, height, vertices } = sizes(caller, '', shape, given, shape === base.shape ? base : DEFAULTS);
  let parts = shape === base.shape ? base.parts : null;
  if (has('parts')) {
    if (!Array.isArray(given.parts) || given.parts.length === 0) fail(caller, `parts must be a list of one or more parts, got ${show(given.parts)}`);
    parts = given.parts.map((p, k) => part(caller, k, p));
  }
  if (shape === 'compound' && parts === null) parts = [part(caller, 0, {})];

  if (has('mass') && has('density')) fail(caller, 'give mass or density, not both');
  let { density, mass, massGiven, inertia, inertiaGiven, centerOfMass } = base;
  if (has('mass')) { mass = positive(caller, 'mass', given.mass); massGiven = true; }
  if (has('density')) { density = positive(caller, 'density', given.density); massGiven = false; }
  if (given.inertia === null) inertiaGiven = false;
  else if (has('inertia')) {
    const i = given.inertia;
    if (typeof i !== 'number' || !(i > 0) || i === Infinity) fail(caller, `inertia must be a positive number, or null to follow the shape, got ${show(i)}`);
    inertia = i; inertiaGiven = true;
  }
  if (given.centerOfMass === null) centerOfMass = null;
  else if (has('centerOfMass')) centerOfMass = vec2(caller, 'centerOfMass', given.centerOfMass);

  const friction = has('friction') ? atLeastZero(caller, 'friction', given.friction) : base.friction;
  let restitution = base.restitution;
  if (has('restitution')) {
    const r = given.restitution;
    if (typeof r !== 'number' || !(r >= 0 && r <= 1)) fail(caller, `restitution must be from 0 to 1, got ${show(r)}`);
    restitution = r;
  }
  const damping = has('damping') ? atLeastZero(caller, 'damping', given.damping) : base.damping;
  const angularDamping = has('angularDamping') ? atLeastZero(caller, 'angularDamping', given.angularDamping) : base.angularDamping;
  const gravityScale = has('gravityScale') ? finite(caller, 'gravityScale', given.gravityScale) : base.gravityScale;
  const layers = has('layers') ? bits(caller, 'layers', given.layers) : base.layers;
  const mask = has('mask') ? bits(caller, 'mask', given.mask) : base.mask;
  let group = base.group;
  if (has('group')) {
    group = given.group;
    if (!Number.isSafeInteger(group) || group < 0) fail(caller, `group must be a whole number, 0 or more, got ${show(group)}`);
  }
  const lockRotation = has('lockRotation') ? flag(caller, 'lockRotation', given.lockRotation) : base.lockRotation;
  let lockPosition = base.lockPosition;
  if (has('lockPosition')) {
    const l = given.lockPosition;
    if (!(l !== null && typeof l === 'object' && l.length === 2 && typeof l[0] === 'boolean' && typeof l[1] === 'boolean')) {
      fail(caller, `lockPosition must be 2 true or false values, got ${show(l)}`);
    }
    lockPosition = [l[0], l[1]];
  }
  const position = has('position') ? vec2(caller, 'position', given.position) : base.position;
  const angle = has('angle') ? finite(caller, 'angle', given.angle) : base.angle;
  if (type === 'static') {
    if (has('velocity')) fail(caller, 'a static body has no velocity');
    if (has('angularVelocity')) fail(caller, 'a static body has no angularVelocity');
  }
  const velocity = has('velocity') ? vec2(caller, 'velocity', given.velocity) : base.velocity;
  const angularVelocity = has('angularVelocity') ? finite(caller, 'angularVelocity', given.angularVelocity) : base.angularVelocity;
  return {
    type, shape, size, radius, height, vertices, parts, density, mass, massGiven, inertia, inertiaGiven, centerOfMass,
    friction, restitution, damping, angularDamping, gravityScale, layers, mask, group, lockRotation, lockPosition,
    position, angle, velocity, angularVelocity,
  };
}
