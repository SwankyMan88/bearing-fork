// Body2D: a handle to one body in a 2D world, as Body is in 3D (see body.js).
//
// It holds a world and an id. Its data lives in the world's columns, so
// compare `a.id === b.id`, and set through methods: `position` is a frozen copy.

import { finite, readOnly } from '../core/check.js';
import { SLOT_SPAN } from '../core/slots.js';

export class Body2D {
  #world;
  #id;

  constructor(world, id) {
    this.#world = world;
    this.#id = id;
  }

  get world() { return this.#world; }
  set world(_) { readOnly('body.world'); }

  /** A number, unique to this body for the life of its world. */
  get id() { return this.#id; }
  set id(_) { readOnly('body.id'); }

  /** Where it sits in `transforms`, 3 numbers to a slot. Reused once it is removed, so don't keep it. */
  get slot() { return this.#id % SLOT_SPAN; }
  set slot(_) { readOnly('body.slot'); }

  get alive() { return this.#world._alive(this.#id); }
  set alive(_) { readOnly('body.alive'); }

  /** Whether it is asleep: left out of steps until something disturbs it. */
  get asleep() { return this.#world._asleepOf('body.asleep', this.#id); }
  set asleep(_) { readOnly('body.asleep'); }

  /** kg. */
  get mass() { return this.#world._massOf('body.mass', this.#id); }
  set mass(_) { readOnly('body.mass', 'setBody(body, { mass })'); }

  /** How hard it is to turn, kg·px², about its centre of mass. */
  get inertia() { return this.#world._inertiaOf('body.inertia', this.#id); }
  set inertia(_) { readOnly('body.inertia', 'setBody(body, { inertia })'); }

  /** Its origin, [x, y], px. */
  get position() { return this.#world._poseOf('body.position', this.#id); }
  set position(_) { readOnly('body.position', 'setPosition(x, y)'); }

  /** Radians, clockwise on a y-down screen, and not wrapped: a wheel's goes on counting. */
  get angle() { return this.#world._angleOf('body.angle', this.#id); }
  set angle(_) { readOnly('body.angle', 'setAngle(radians)'); }

  get worldCenterOfMass() { return this.#world._vector('body.worldCenterOfMass', this.#id, this.#world._position); }
  set worldCenterOfMass(_) { readOnly('body.worldCenterOfMass', 'setBody(body, { centerOfMass })'); }

  /** Of its centre of mass, px/s. */
  get velocity() { return this.#world._vector('body.velocity', this.#id, this.#world._velocity); }
  set velocity(_) { readOnly('body.velocity', 'setVelocity(x, y)'); }

  /** rad/s. */
  get angularVelocity() { return this.#world._spinOf('body.angularVelocity', this.#id); }
  set angularVelocity(_) { readOnly('body.angularVelocity', 'setAngularVelocity(radians)'); }

  setPosition(x, y) {
    this.#world._setPosition('setPosition', this.#id, x, y);
    return this;
  }

  /** Radians: as a Winding node's setAngle. */
  setAngle(radians) {
    this.#world._slotOf('setAngle', this.#id);
    this.#world._setAngle('setAngle', this.#id, finite('setAngle', 'radians', radians));
    return this;
  }

  setVelocity(x, y) {
    this.#world._setVelocity('setVelocity', this.#id, x, y);
    return this;
  }

  /** rad/s. */
  setAngularVelocity(radians) {
    this.#world._setSpin('setAngularVelocity', this.#id, radians);
    return this;
  }

  /** The velocities that bring its origin to `position`, turned to `angle` (null: as it is), over a step of `dt` seconds. */
  moveTo(position, angle, dt) {
    this.#world._moveTo('moveTo', this.#id, position, angle, dt);
    return this;
  }

  /** A force, kg·px/s², for the next step. Off the centre, at `point`, it turns the body too. */
  applyForce(force, point) {
    this.#world._applyForce('applyForce', this.#id, force, point);
    return this;
  }

  /** A torque, kg·px²/s², for the next step. */
  applyTorque(torque) {
    this.#world._applyTorque('applyTorque', this.#id, torque);
    return this;
  }

  /** An impulse, kg·px/s, changing the velocity at once. Off the centre, at `point`, it turns the body too. */
  applyImpulse(impulse, point) {
    this.#world._applyImpulse('applyImpulse', this.#id, impulse, point);
    return this;
  }

  /** An angular impulse, kg·px²/s, changing the angular velocity at once. */
  applyAngularImpulse(impulse) {
    this.#world._applyAngularImpulse('applyAngularImpulse', this.#id, impulse);
    return this;
  }

  /** Same as world.remove(body). Does nothing if the body is already gone. */
  destroy() {
    this.#world._remove('destroy', this);
  }
}
