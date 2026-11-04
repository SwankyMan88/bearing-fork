# Bearing 2D API reference

`bearing-physics/2d` is Bearing for a flat world: the same calls, options and errors as
[the 3D reference](API.md), in pixels. This page lists every call. It grows as the 2D module does:
for now, boxes, circles, capsules and polygons collide, stack, roll and sleep, thousands at a time.
A compound moves and turns but doesn't touch anything yet.

```js
import { World2D } from 'bearing-physics/2d';
```

## Conventions

Everything in [the 3D reference's conventions](API.md#conventions) holds. These are the differences.

- **Units are pixels.** A unit is a CSS pixel, y points down, and a positive angle turns clockwise
  on the screen, as in Winding's 2D view, CSS and Godot, so positions and angles copy straight
  across. Lengths are px, speeds px/s and angles radians.
- **100 px is 1 m.** That is a convention, Godot's, not something derived, and it sets the two
  defaults with a unit in them: gravity `[0, 980]`, 9.8 m/s², and density 0.1 kg/px², which is
  water's 1000 kg/m³ over a slab 1 m deep. A 32 px box weighs 102 kg.
- **Metres work too.** Nothing else in Bearing has a unit, because every tolerance follows the size
  of the bodies. For metres with y up, as in Box2D or Unity, set `gravity: [0, -9.81]` and a
  density in kg/m²; sizes in metres then just work, and a positive angle turns anticlockwise.
- **Forces are in px.** A force is kg·px/s², so 1 N is 100; a torque is kg·px²/s², so 1 N·m is 10,000.
- **Vectors are `[x, y]`, or `(x, y)` in a setter.** Any array-like will do.
- **A rotation is one number.** `angle`, in radians, and `angularVelocity`, in rad/s. An angle isn't
  wrapped: a wheel's goes on counting, so interpolating from `previous` to `transforms` goes the
  short way.

## Contents

[World2D](#world-class) · [Body2D](#body) · [Contacts](#contacts) · [Sleeping](#sleeping)

## Index

**A** &nbsp; [`world.addBody()`](#world-addbody) · [`body.alive`](#body-alive) · [`body.asleep`](#body-asleep) · [`body.angle`](#body-angle) · [`body.angularVelocity`](#body-angularvelocity) · [`body.applyAngularImpulse()`](#body-applyangularimpulse) · [`body.applyForce()`](#body-applyforce) · [`body.applyImpulse()`](#body-applyimpulse) · [`body.applyTorque()`](#body-applytorque)

**B** &nbsp; [Body2D](#body) · [`world.body()`](#world-body) · [`world.bodyCount`](#world-bodycount) · [`world.bodyOf()`](#world-bodyof)

**C** &nbsp; [Contacts](#contacts)

**D** &nbsp; [`body.destroy()`](#body-destroy) · [`world.destroy()`](#world-destroy)

**G** &nbsp; [`world.gravity`](#world-gravity)

**I** &nbsp; [`body.id`](#body-id) · [`body.inertia`](#body-inertia)

**M** &nbsp; [`body.mass`](#body-mass) · [`world.moved()`](#world-moved) · [`body.moveTo()`](#body-moveto)

**P** &nbsp; [`body.position`](#body-position) · [`world.previous`](#world-previous)

**R** &nbsp; [`world.remove()`](#world-remove)

**S** &nbsp; [`body.setAngle()`](#body-setangle) · [`body.setAngularVelocity()`](#body-setangularvelocity) · [`world.setBody()`](#world-setbody) · [`body.setPosition()`](#body-setposition) · [`body.setVelocity()`](#body-setvelocity) · [`world.sleeping`](#world-sleeping) · [Sleeping](#sleeping) · [`body.slot`](#body-slot) · [`world.step()`](#world-step) · [`world.stepCount`](#world-stepcount) · [`world.substeps`](#world-substeps)

**T** &nbsp; [`world.transforms`](#world-transforms)

**V** &nbsp; [`body.velocity`](#body-velocity)

**W** &nbsp; [World2D](#world-class) · [`new World2D()`](#world) · [`body.world`](#body-world) · [`body.worldCenterOfMass`](#body-worldcenterofmass)

<a id="world-class"></a>
## World2D

A world holds bodies and moves them on when stepped. Two worlds never affect each other.

<a id="world"></a>
### `new World2D(options)`

Makes a world. Every option has a default.

| Option | Default | Meaning |
|---|---|---|
| `gravity` | `[0, 980]` | What pulls dynamic bodies, px/s²: 9.8 m/s² downward on a y-down screen, at 100 px to the metre. |
| `substeps` | `8` | How many smaller steps each step is solved in. |
| `sleeping` | `true` | Whether bodies at rest go to sleep. |

Throws: `World2D: options must be an object, got …`; `World2D: unknown option '…' (did you mean '…'?)`; `World2D: unknown option '…' (the options are gravity, substeps, sleeping)`; `World2D: gravity must be 2 finite numbers, got …`; `World2D: substeps must be a whole number, 1 or more, got …`; `World2D: sleeping must be true or false, got …`.

```js
const world = new World2D({ gravity: [0, 1600] });   // a game's own, heavier fall
```

<a id="world-gravity"></a>
### `world.gravity` → `[x, y]`

What pulls dynamic bodies, px/s². Reads as a frozen copy; assign a new value to change it, at any
time.

Throws: `world.gravity: this world was destroyed`; `world.gravity must be 2 finite numbers, got …`.

```js
world.gravity = [0, 0];   // floating
```

<a id="world-substeps"></a>
### `world.substeps` → `number`

How many smaller steps each step is solved in, 1 or more. Assign to change it, at any time.

Throws: `world.substeps: this world was destroyed`; `world.substeps must be a whole number, 1 or more, got …`.

```js
world.substeps = 16;
```

<a id="world-sleeping"></a>
### `world.sleeping` → `boolean`

Whether bodies at rest go to sleep: left out of every step until something disturbs them. See
[Sleeping](#sleeping). Assign to change it, at any time; switching it off wakes every sleeping body.

Throws: `world.sleeping: this world was destroyed`; `world.sleeping must be true or false, got …`.

```js
world.sleeping = false;
```

<a id="world-moved"></a>
### `world.moved(since)` → `Int32Array`

The slots of bodies that moved after step `since`, so a renderer copies only those: keep
[`stepCount`](#world-stepcount) from your last copy and pass it. A world of 10,000 sleeping bodies
gives none, and looks at none of them.

Throws: `moved: this world was destroyed`; `moved: since must be a whole number, 0 or more, got …`.

```js
let drawn = world.stepCount;
world.step(1 / 60);
for (const slot of world.moved(drawn)) console.log(slot);
drawn = world.stepCount;
```

Notes: a body put somewhere by hand counts as moved. Slots are reused once a body is removed.

<a id="world-bodycount"></a>
### `world.bodyCount` → `number`

How many bodies the world holds. Read only.

Throws: `world.bodyCount: this world was destroyed`; `world.bodyCount is read only`.

```js
console.log(world.bodyCount);
```

<a id="world-stepcount"></a>
### `world.stepCount` → `number`

How many steps the world has taken. Read only.

Throws: `world.stepCount: this world was destroyed`; `world.stepCount is read only`.

```js
console.log(world.stepCount);
```

<a id="world-transforms"></a>
### `world.transforms` → `Float32Array`

Every body's place as of the last step, 3 numbers to a slot: x, y, angle. Bulk reading, for
copying a whole world into a renderer in one loop. Read only, and live: the same numbers change
with each step, but the array itself is replaced when the world grows, so read it afresh each
frame.

Throws: `world.transforms: this world was destroyed`; `world.transforms is read only`.

```js
const t = world.transforms, o = ball.slot * 3;
console.log(t[o], t[o + 1], t[o + 2]);
```

<a id="world-previous"></a>
### `world.previous` → `Float32Array`

`transforms` as the last step began, the same layout, so a drawn frame can sit between two steps.
A body put somewhere by hand has both changed, so it isn't drawn sliding across.

Throws: `world.previous: this world was destroyed`; `world.previous is read only`.

```js
const p = world.previous, t = world.transforms, o = ball.slot * 3, alpha = 0.5;
const y = p[o + 1] + (t[o + 1] - p[o + 1]) * alpha;
```

<a id="world-addbody"></a>
### `world.addBody(options)` → `Body2D`

Adds a body. Every option has a default, so `addBody()` is a 100 px box, 1 m at 100 px to the metre.

| Option | Default | Meaning |
|---|---|---|
| `type` | `'dynamic'` | `'dynamic'`: moved by gravity and forces. `'static'`: stays where it is put. `'kinematic'`: moves at the velocity you give it, ignoring gravity and forces. |
| `shape` | `'box'` | `'box'`, `'circle'`, `'capsule'`, `'polygon'` or `'compound'`. |
| `size` | `[100, 100]` | A box's width and height, px. |
| `radius` | `50` | A circle's or capsule's, px. |
| `height` | `200` | A capsule's, end to end along its y, px. At least twice `radius`. |
| `vertices` | a 100 px square | A polygon's points, `[x0, y0, x1, y1, ...]`, px, from its own origin. Any points: it takes their convex hull, so points inside are dropped. A concave shape is a `compound`. |
| `parts` | one default box | A compound's parts: each `{ shape, ...its sizes, position, angle, density }`, box, circle, capsule or polygon, placed from the body's origin. A part with no `density` takes the body's. |
| `density` | `0.1` | kg/px². Its mass is this times its area. |
| `mass` | from `density` | kg, instead of `density`. |
| `inertia` | from the shape and mass | How hard it is to turn about its centre of mass, kg·px². `null` follows the shape again. |
| `centerOfMass` | the shape's centre | Where it balances, `[x, y]`, px, in its own frame. It keeps the shape's inertia. `null` is the shape's centre again. |
| `friction` | `0.5` | How much it resists sliding, 0 or more: mixed with what it touches as the square root of the two, so ice is slippery against anything. |
| `restitution` | `0` | How much of its speed it bounces back with, from 0 to 1: the larger of the two touching. |
| `damping` | `0` | Speed lost per second, 1/s. |
| `angularDamping` | `0` | Spin lost per second, 1/s. |
| `gravityScale` | `1` | Multiplies the world's gravity for this body. |
| `layers` | `1` | Which of 32 layers it is in, one bit each. Two bodies collide when each one's layers are in the other's `mask`, as in [3D](API.md#layers). |
| `mask` | `0xffffffff` | Which layers it collides with, one bit each: all of them. |
| `group` | `0` (none) | Bodies of the same group never collide with each other, whatever their layers: any whole number, so a body's `id` will do. |
| `lockRotation` | `false` | Whether it never turns. |
| `lockPosition` | `[false, false]` | The axes its centre of mass never moves along, x and y. |
| `position` | `[0, 0]` | Its origin, px. |
| `angle` | `0` | Radians. |
| `velocity` | `[0, 0]` | Of its centre of mass, px/s. |
| `angularVelocity` | `0` | rad/s. |

Returns: a [`Body2D`](#body).

Throws: `addBody: this world was destroyed`; `addBody: options must be an object, got …`; `addBody: unknown option '…' (did you mean '…'?)`; `addBody: unknown option '…' (the options are type, shape, size, radius, height, vertices, parts, density, mass, inertia, centerOfMass, friction, restitution, damping, angularDamping, gravityScale, layers, mask, group, lockRotation, lockPosition, position, angle, velocity, angularVelocity)`; `addBody: type must be 'dynamic', 'static' or 'kinematic', got …`; `addBody: shape must be 'box', 'circle', 'capsule', 'polygon' or 'compound', got …`; `addBody: a <shape> has no <option>`; `addBody: size must be 2 positive numbers, got …`; `addBody: radius must be a positive number, got …`; `addBody: height must be a positive number, got …`; `addBody: height must be at least twice radius (…), got …`; `addBody: vertices must be finite numbers, two to a vertex, got …`; `addBody: vertices must span an area (3 points not on one line), got …`; `addBody: parts must be a list of one or more parts, got …`; `addBody: parts[…] must be an object, got …`; `addBody: parts[…]: unknown option '…' (did you mean '…'?)`; `addBody: parts[…]: unknown option '…' (the options are shape, size, radius, height, vertices, position, angle, density)`; `addBody: parts[…].shape must be 'box', 'circle', 'capsule' or 'polygon', got …`; `addBody: parts[…]: a <shape> has no <option>`; `addBody: parts[…].size must be 2 positive numbers, got …`; `addBody: parts[…].radius must be a positive number, got …`; `addBody: parts[…].height must be a positive number, got …`; `addBody: parts[…].height must be at least twice radius (…), got …`; `addBody: parts[…].vertices must be finite numbers, two to a vertex, got …`; `addBody: parts[…].vertices must span an area (3 points not on one line), got …`; `addBody: parts[…].position must be 2 finite numbers, got …`; `addBody: parts[…].angle must be a finite number, got …`; `addBody: parts[…].density must be a positive number, got …`; `addBody: give mass or density, not both`; `addBody: mass must be a positive number, got …`; `addBody: density must be a positive number, got …`; `addBody: inertia must be a positive number, or null to follow the shape, got …`; `addBody: centerOfMass must be 2 finite numbers, got …`; `addBody: friction must be 0 or more, got …`; `addBody: restitution must be from 0 to 1, got …`; `addBody: damping must be 0 or more, got …`; `addBody: angularDamping must be 0 or more, got …`; `addBody: gravityScale must be a finite number, got …`; `addBody: layers must be a whole number that fits in 32 bits, got …`; `addBody: mask must be a whole number that fits in 32 bits, got …`; `addBody: group must be a whole number, 0 or more, got …`; `addBody: lockRotation must be true or false, got …`; `addBody: lockPosition must be 2 true or false values, got …`; `addBody: position must be 2 finite numbers, got …`; `addBody: angle must be a finite number, got …`; `addBody: a static body has no velocity`; `addBody: a static body has no angularVelocity`; `addBody: velocity must be 2 finite numbers, got …`; `addBody: angularVelocity must be a finite number, got …`; `addBody: a world holds at most 16777216 bodies (the slot field of an id is 24 bits)`.

```js
const shard = world.addBody({ shape: 'polygon', vertices: [0, 0, 6, 1, 4, 5], position: [320, 96], angle: 0.3 });
const ell = world.addBody({ shape: 'compound', parts: [
  { size: [12, 4], position: [6, 2] },
  { size: [4, 8], position: [2, 8] },
] });
```

Notes: a compound's `position` is its origin, not its centre of mass, which Bearing works out from
its parts.

<a id="world-setbody"></a>
### `world.setBody(body, changes)`

Changes any of the options `addBody` took, and leaves the rest. Mass and inertia follow a new
shape, unless given.

Throws: `setBody: this world was destroyed`; `setBody: body must be a Body2D, got …`; `setBody: body belongs to another world`; `setBody: body was removed`; `setBody: changes must be an object, got …`; `setBody: unknown option '…' (did you mean '…'?)`; `setBody: unknown option '…' (the options are type, shape, size, radius, height, vertices, parts, density, mass, inertia, centerOfMass, friction, restitution, damping, angularDamping, gravityScale, layers, mask, group, lockRotation, lockPosition, position, angle, velocity, angularVelocity)`; `setBody: type must be 'dynamic', 'static' or 'kinematic', got …`; `setBody: shape must be 'box', 'circle', 'capsule', 'polygon' or 'compound', got …`; `setBody: a <shape> has no <option>`; `setBody: size must be 2 positive numbers, got …`; `setBody: radius must be a positive number, got …`; `setBody: height must be a positive number, got …`; `setBody: height must be at least twice radius (…), got …`; `setBody: vertices must be finite numbers, two to a vertex, got …`; `setBody: vertices must span an area (3 points not on one line), got …`; `setBody: parts must be a list of one or more parts, got …`; `setBody: give mass or density, not both`; `setBody: mass must be a positive number, got …`; `setBody: density must be a positive number, got …`; `setBody: inertia must be a positive number, or null to follow the shape, got …`; `setBody: centerOfMass must be 2 finite numbers, got …`; `setBody: friction must be 0 or more, got …`; `setBody: restitution must be from 0 to 1, got …`; `setBody: damping must be 0 or more, got …`; `setBody: angularDamping must be 0 or more, got …`; `setBody: gravityScale must be a finite number, got …`; `setBody: layers must be a whole number that fits in 32 bits, got …`; `setBody: mask must be a whole number that fits in 32 bits, got …`; `setBody: group must be a whole number, 0 or more, got …`; `setBody: lockRotation must be true or false, got …`; `setBody: lockPosition must be 2 true or false values, got …`; `setBody: position must be 2 finite numbers, got …`; `setBody: angle must be a finite number, got …`; `setBody: a static body has no velocity`; `setBody: a static body has no angularVelocity`; `setBody: velocity must be 2 finite numbers, got …`; `setBody: angularVelocity must be a finite number, got …`.

```js
world.setBody(ball, { shape: 'circle', radius: 16, type: 'static' });
```

<a id="world-bodyof"></a>
### `world.bodyOf(body)` → `object`

A copy of the body's options as they are now, in the form `addBody` takes, so
`world.addBody(world.bodyOf(body))` makes a copy of it.

Returns: `{ type, shape, …sizes, mass or density, inertia, centerOfMass, friction, restitution, damping, angularDamping, gravityScale, layers, mask, group, lockRotation, lockPosition, position, angle, velocity, angularVelocity }`.
`vertices` are a polygon's convex hull, `inertia` and `centerOfMass` `null` while they follow the
shape, and a static body has no velocities.

Throws: `bodyOf: this world was destroyed`; `bodyOf: body must be a Body2D, got …`; `bodyOf: body belongs to another world`; `bodyOf: body was removed`.

```js
const copy = world.addBody(world.bodyOf(crate));
```

<a id="world-remove"></a>
### `world.remove(handle)`

Takes a body out of the world. Removing one already gone does nothing.

Throws: `remove: this world was destroyed`; `remove: handle must be a Body2D, got …`; `remove: handle belongs to another world`.

```js
world.remove(crate);
```

<a id="world-body"></a>
### `world.body(id)` → `Body2D`

A handle for a body's id. It doesn't check that the body is alive.

Throws: `body: this world was destroyed`; `body: id must be a whole number from 0 to 9007199254740991, got …`.

```js
const again = world.body(crate.id);
```

<a id="world-step"></a>
### `world.step(dt)`

Moves the world on by `dt` seconds, exactly. Call it from your loop's fixed update.

Throws: `step: this world was destroyed`; `step: dt must be a positive number of seconds, got …`.

```js
world.step(1 / 60);
```

Notes: a step is `substeps` smaller steps. Each is semi-implicit Euler, velocity first and position
from the new velocity, so a fall of n substeps of h covers g h² n (n + 1) / 2. A body turns by
2 atan(ω h / 2) a substep, a little short of ω h: at 6 rad/s, 1 part in 80,000. A body other than a
circle spins at most half a turn a step, π / dt rad/s, 188 rad/s at 60 Hz, as in 3D.

<a id="world-destroy"></a>
### `world.destroy()`

Lets go of everything. Using the world afterwards throws; calling this again does nothing.

```js
world.destroy();
```

<a id="body"></a>
## Body2D

A handle to one body: a world and an id. Its data lives in the world, so two handles can name one
body. Compare `a.id === b.id`.

<a id="body-id"></a>
### `body.id` → `number`

A number unique to this body for the life of its world. Read only.

Throws: `body.id is read only`.

```js
console.log(crate.id);
```

<a id="body-slot"></a>
### `body.slot` → `number`

Where it sits in [`transforms`](#world-transforms), 3 numbers to a slot. Reused once it is removed,
so don't keep it. Read only.

Throws: `body.slot is read only`.

```js
const x = world.transforms[crate.slot * 3];
```

<a id="body-world"></a>
### `body.world` → `World2D`

The world it belongs to. Read only.

Throws: `body.world is read only`.

```js
console.log(crate.world === world);
```

<a id="body-alive"></a>
### `body.alive` → `boolean`

Whether it is still in its world. Read only.

Throws: `body.alive is read only`.

```js
console.log(crate.alive);
```

<a id="body-asleep"></a>
### `body.asleep` → `boolean`

Whether it is asleep. Read only. See [Sleeping](#sleeping).

Throws: `body.asleep: this world was destroyed`; `body.asleep: this body was removed`; `body.asleep is read only`.

```js
console.log(crate.asleep);
```

<a id="body-mass"></a>
### `body.mass` → `number`

kg. Read only; change it with [`setBody`](#world-setbody).

Throws: `body.mass: this world was destroyed`; `body.mass: this body was removed`; `body.mass is read only; use setBody(body, { mass })`.

```js
console.log(crate.mass);
```

<a id="body-inertia"></a>
### `body.inertia` → `number`

How hard it is to turn about its centre of mass, kg·px². Read only.

Throws: `body.inertia: this world was destroyed`; `body.inertia: this body was removed`; `body.inertia is read only; use setBody(body, { inertia })`.

```js
console.log(crate.inertia);
```

<a id="body-position"></a>
### `body.position` → `[x, y]`

Its origin, px, a frozen copy.

Throws: `body.position: this world was destroyed`; `body.position: this body was removed`; `body.position is read only; use setPosition(x, y)`.

```js
const [x, y] = crate.position;
```

<a id="body-angle"></a>
### `body.angle` → `number`

Radians, clockwise on a y-down screen, and not wrapped.

Throws: `body.angle: this world was destroyed`; `body.angle: this body was removed`; `body.angle is read only; use setAngle(radians)`.

```js
console.log(crate.angle);
```

<a id="body-worldcenterofmass"></a>
### `body.worldCenterOfMass` → `[x, y]`

Where its mass is centred in the world, px, a frozen copy.

Throws: `body.worldCenterOfMass: this world was destroyed`; `body.worldCenterOfMass: this body was removed`; `body.worldCenterOfMass is read only; use setBody(body, { centerOfMass })`.

```js
console.log(crate.worldCenterOfMass);
```

<a id="body-velocity"></a>
### `body.velocity` → `[x, y]`

Of its centre of mass, px/s, a frozen copy.

Throws: `body.velocity: this world was destroyed`; `body.velocity: this body was removed`; `body.velocity is read only; use setVelocity(x, y)`.

```js
const [vx, vy] = ball.velocity;
```

<a id="body-angularvelocity"></a>
### `body.angularVelocity` → `number`

rad/s.

Throws: `body.angularVelocity: this world was destroyed`; `body.angularVelocity: this body was removed`; `body.angularVelocity is read only; use setAngularVelocity(radians)`.

```js
console.log(ball.angularVelocity);
```

<a id="body-setposition"></a>
### `body.setPosition(x, y)` → `Body2D`

Puts its origin there at once. Its velocity is unchanged.

Throws: `setPosition: this world was destroyed`; `setPosition: this body was removed`; `setPosition: x and y must be finite numbers, got …`.

```js
ball.setPosition(100, 40).setVelocity(200, 0);
```

<a id="body-setangle"></a>
### `body.setAngle(radians)` → `Body2D`

Turns it to that angle at once, about its origin.

Throws: `setAngle: this world was destroyed`; `setAngle: this body was removed`; `setAngle: radians must be a finite number, got …`.

```js
crate.setAngle(Math.PI / 4);
```

<a id="body-setvelocity"></a>
### `body.setVelocity(x, y)` → `Body2D`

Sets how fast its centre of mass moves, px/s.

Throws: `setVelocity: this world was destroyed`; `setVelocity: this body was removed`; `setVelocity: x and y must be finite numbers, got …`; `setVelocity: a static body has no velocity`.

```js
ball.setVelocity(0, -300);   // a hop: y points down
```

Notes: along an axis the body is locked on, its speed stays 0.

<a id="body-setangularvelocity"></a>
### `body.setAngularVelocity(radians)` → `Body2D`

Sets how fast it turns, rad/s, clockwise on a y-down screen.

Throws: `setAngularVelocity: this world was destroyed`; `setAngularVelocity: this body was removed`; `setAngularVelocity: radians must be a finite number, got …`; `setAngularVelocity: a static body has no angularVelocity`.

```js
crate.setAngularVelocity(Math.PI);
```

Notes: a body with `lockRotation` stays at 0.

<a id="body-moveto"></a>
### `body.moveTo(position, angle, dt)` → `Body2D`

Sets the velocities that bring its origin to `position`, turned to `angle` the short way round,
over the next step of `dt` seconds: how a kinematic body follows an animation. `angle` `null` keeps
the angle it has.

Throws: `moveTo: this world was destroyed`; `moveTo: this body was removed`; `moveTo: position must be 2 finite numbers, got …`; `moveTo: angle must be a finite number, got …`; `moveTo: dt must be a positive number, got …`; `moveTo: a static body has no velocity`.

```js
const lift = world.addBody({ type: 'kinematic', size: [200, 20] });
lift.moveTo([0, -2], null, 1 / 60);
world.step(1 / 60);
```

Notes: a kinematic body lands on the pose to rounding. The velocities stay after the step.

<a id="body-applyforce"></a>
### `body.applyForce(force, point)` → `Body2D`

Pushes it with `force`, kg·px/s², for the next step. At `point`, world space, off its centre of
mass, it turns the body too.

Throws: `applyForce: this world was destroyed`; `applyForce: this body was removed`; `applyForce: force must be 2 finite numbers, got …`; `applyForce: point must be 2 finite numbers, got …`.

```js
crate.applyForce([500, 0]);
```

Notes: nothing for a static or kinematic body.

<a id="body-applytorque"></a>
### `body.applyTorque(torque)` → `Body2D`

Turns it with `torque`, kg·px²/s², for the next step.

Throws: `applyTorque: this world was destroyed`; `applyTorque: this body was removed`; `applyTorque: torque must be a finite number, got …`.

```js
crate.applyTorque(5000);
```

Notes: nothing for a static or kinematic body.

<a id="body-applyimpulse"></a>
### `body.applyImpulse(impulse, point)` → `Body2D`

Changes its velocity at once by `impulse`, kg·px/s, over its mass. At `point`, world space, off its
centre of mass, it turns the body too.

Throws: `applyImpulse: this world was destroyed`; `applyImpulse: this body was removed`; `applyImpulse: impulse must be 2 finite numbers, got …`; `applyImpulse: point must be 2 finite numbers, got …`.

```js
crate.applyImpulse([0, -5000]);
```

Notes: nothing for a static or kinematic body.

<a id="body-applyangularimpulse"></a>
### `body.applyAngularImpulse(impulse)` → `Body2D`

Changes its spin at once by `impulse`, kg·px²/s, over its inertia.

Throws: `applyAngularImpulse: this world was destroyed`; `applyAngularImpulse: this body was removed`; `applyAngularImpulse: impulse must be a finite number, got …`.

```js
crate.applyAngularImpulse(1000);
```

Notes: nothing for a static or kinematic body.

<a id="body-destroy"></a>
### `body.destroy()`

Same as [`world.remove(body)`](#world-remove). Does nothing if it is already gone.

Throws: `destroy: this world was destroyed`.

```js
crate.destroy();
```

<a id="contacts"></a>
## Contacts

Two bodies touch when at least one is dynamic. Every contact tolerance is a two-hundredth of the
thinner body's thinnest width, so a 32 px box's is 0.16 px and a 4 px shard's 0.02 px, and
nothing needs tuning for size.

- **Bodies rest a little into each other.** Overlaps ease out as a stiff spring would, which is
  what lets a stack stand. A 32 px box rests about 0.01 px deep, and the top of a stack of 10 has
  come down 0.86 px, at any box size.
- **Corners are tested exactly, rounded shapes by their cores.** Over 20,000 random pairs, a
  contact reads the true gap to within one and a half tolerances.
- **Friction stops a slide where v² / 2 μ g says:** a box at 300 px/s stops within 2 px of it.
- **A ball rolls to rest.** A contact of one point resists rolling a little, a coefficient of 0.01
  as in 3D: a 16 px disc rolling at 200 px/s goes about 3,060 px.
- **A bounce stops** when it would rise no higher than the tolerance, so nothing bounces forever.
- **A fast body stops at a surface,** by contact points found ahead of it: a 5 px ball at 5,000 px/s,
  83 px a step, stops at a 20 px wall. This covers what is ahead of it as a step begins. Full
  continuous collision comes later.
- **A light body under a heavy one gives.** It settles, but sinks in as the weight above it grows,
  as in 3D: a 40 by 20 px box on one ten times lighter sinks 0.26 px, on one 100 times lighter
  2.4 px, and on one 1,000 times lighter it flattens through it. Keep what stands on what within
  about 10 to 1.

<a id="sleeping"></a>
## Sleeping

A body that has stopped is put to sleep: left out of every step, at no cost, until something
disturbs it. 5,000 shards at rest step in 0.0001 ms. There is nothing to call.

- **Islands sleep together.** Bodies touching each other form an island, and it sleeps when every
  one of them has stayed within its tolerance of where it rested for 1 s. Static bodies join no
  island, or everything on one floor would be one.
- **Anything that disturbs it wakes it:** being touched by something awake, or any setter, force or
  impulse on it or on what it rests on, or removing what holds it up. There is no call to make.
- **A sleeping body keeps its place in [`transforms`](#world-transforms),** and
  [`moved`](#world-moved) leaves it out.
