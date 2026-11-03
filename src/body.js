// Body: a handle to one body in a world.
//
// A Body holds a world and an id, and nothing else. The body's data lives in
// the world's columns, at the slot the id names, so creating a thousand
// handles moves no data, and two handles to one body are two different
// objects. Compare `a.id === b.id`, not `a === b`.
//
// SETTERS, NOT PROPERTIES, for the same reason as Winding's Node. The data is
// shared columns, so `body.position.x = 5` could only work through a live view
// or a Proxy, and neither would know to keep `previous` in step with a
// teleport. So `position` is a frozen copy, assigning to it throws, and
// `setPosition(x, y, z)` is how a body moves.

import { fail, finite, direction, quat, readOnly, show } from './core/check.js';
import { quatAxisAngle, quatEuler } from './core/math.js';
import { SLOT_SPAN } from './core/slots.js';

export class Body {
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

  /** Where this body's numbers are in `world.transforms`: at slot * 7. */
  get slot() { return this.#id % SLOT_SPAN; }
  set slot(_) { readOnly('body.slot'); }

  /** false once the body is removed, or its world destroyed. Never throws. */
  get alive() { return this.#world._alive(this.#id); }
  set alive(_) { readOnly('body.alive'); }

  /**
   * true while the body is asleep: at rest, and left out of steps until
   * something disturbs it. A static body never is.
   */
  get asleep() { return this.#world._asleepOf('body.asleep', this.#id); }
  set asleep(_) { readOnly('body.asleep'); }

  /** kg. */
  get mass() { return this.#world._massOf('body.mass', this.#id); }
  set mass(_) { readOnly('body.mass', "setBody(body, { mass })"); }

  /** kg·m² about the body's own x, y and z axes, a frozen copy. */
  get inertia() { return this.#world._vector('body.inertia', this.#id, this.#world._inertia, 3); }
  set inertia(_) { readOnly('body.inertia', 'setBody(body, { inertia })'); }

  /** m, a frozen copy: the body's origin, where it was placed, whatever its centre of mass. */
  get position() { return this.#world._poseOf('body.position', this.#id, false); }
  set position(_) { readOnly('body.position', 'setPosition(x, y, z)'); }

  /** A quaternion [x, y, z, w], a frozen copy. */
  get rotation() { return this.#world._poseOf('body.rotation', this.#id, true); }
  set rotation(_) { readOnly('body.rotation', 'setRotation(q)'); }

  /** m, in the world, a frozen copy: where its mass is centred, which it turns about. */
  get worldCenterOfMass() { return this.#world._centerOf('body.worldCenterOfMass', this.#id); }
  set worldCenterOfMass(_) { readOnly('body.worldCenterOfMass', 'setBody(body, { centerOfMass })'); }

  // Renamed before 1.0 (rule 47): the world-space reading is worldCenterOfMass,
  // as Winding's is node.worldPosition(), so `centerOfMass` means one thing,
  // the option, in the body's own frame. Reading or assigning it says so.
  get centerOfMass() { return renamed(); }
  set centerOfMass(_) { renamed(); }

  /** m/s, a frozen copy. */
  get velocity() { return this.#world._vector('body.velocity', this.#id, this.#world._velocity, 3); }
  set velocity(_) { readOnly('body.velocity', 'setVelocity(x, y, z)'); }

  /** rad/s about each world axis, a frozen copy. */
  get angularVelocity() { return this.#world._vector('body.angularVelocity', this.#id, this.#world._angular, 3); }
  set angularVelocity(_) { readOnly('body.angularVelocity', 'setAngularVelocity(x, y, z)'); }

  setPosition(x, y, z) {
    this.#world._setPosition('setPosition', this.#id, x, y, z);
    return this;
  }

  /** Takes a quaternion [x, y, z, w], normalized on the way in. */
  setRotation(q) {
    this.#world._slotOf('setRotation', this.#id);
    this.#world._setRotation('setRotation', this.#id, quat('setRotation', 'q', q));
    return this;
  }

  /** Turns the body `radians` about `axis`, which needn't be unit length. Replaces the whole rotation. */
  setAxisAngle(axis, radians) {
    this.#world._slotOf('setAxisAngle', this.#id);
    const a = direction('setAxisAngle', 'axis', axis);
    finite('setAxisAngle', 'radians', radians);
    this.#world._setRotation('setAxisAngle', this.#id, quatAxisAngle(a, radians));
    return this;
  }

  /** Radians: yaw about Y, then pitch about X, then roll about Z, as Winding's setEuler. */
  setEuler(yaw, pitch, roll = 0) {
    this.#world._slotOf('setEuler', this.#id);
    const angles = [yaw, pitch, roll];
    if (!angles.every((a) => typeof a === 'number' && Number.isFinite(a))) {
      fail('setEuler', `yaw, pitch and roll must be finite numbers, got ${show(angles)}`);
    }
    this.#world._setRotation('setEuler', this.#id, quatEuler(yaw, pitch, roll));
    return this;
  }

  setVelocity(x, y, z) {
    this.#world._setVelocity('setVelocity', this.#id, 'velocity', x, y, z);
    return this;
  }

  /** rad/s about each world axis. */
  setAngularVelocity(x, y, z) {
    this.#world._setVelocity('setAngularVelocity', this.#id, 'angularVelocity', x, y, z);
    return this;
  }

  /**
   * Sets the velocities that bring the body's origin to `position`, turned to
   * `rotation` (null: as it is now), over the next step of `dt` seconds: how an
   * animated kinematic body is moved, pushing what it meets as it goes.
   */
  moveTo(position, rotation, dt) {
    this.#world._moveTo('moveTo', this.#id, position, rotation, dt);
    return this;
  }

  /**
   * A force in N, world space, acting for the next step and then cleared.
   * Off the centre, at `point` (world space, m), it turns the body too.
   */
  applyForce(force, point) {
    this.#world._applyForce('applyForce', this.#id, force, point);
    return this;
  }

  /** A torque in N·m, world space, acting for the next step and then cleared. */
  applyTorque(torque) {
    this.#world._applyTorque('applyTorque', this.#id, torque);
    return this;
  }

  /** An impulse in N·s, world space, changing the velocity at once. Off the centre, at `point`, it turns the body too. */
  applyImpulse(impulse, point) {
    this.#world._applyImpulse('applyImpulse', this.#id, impulse, point);
    return this;
  }

  /** An angular impulse in N·m·s, world space, changing the angular velocity at once. */
  applyAngularImpulse(impulse) {
    this.#world._applyAngularImpulse('applyAngularImpulse', this.#id, impulse);
    return this;
  }

  /** Same as world.remove(body). Does nothing if the body is already gone. */
  destroy() {
    this.#world._remove('destroy', this);
  }
}

function renamed() {
  throw new Error("body.centerOfMass is now body.worldCenterOfMass (world space); the centerOfMass option is in the body's own frame");
}
