# Bearing 2D API reference

`bearing-physics/2d` is Bearing for a flat world: the same calls, options and errors as
[the 3D reference](API.md), in pixels. This page lists every call. It grows as the 2D module does:
for now, boxes, circles, capsules, polygons and compounds collide, stack, roll and sleep, thousands
at a time, on tilemaps and chains, with rays, shape casts, contact events and sensors.

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

[World2D](#world-class) · [Body2D](#body) · [Contacts](#contacts) · [Tilemaps and chains](#levels) · [Contact events and sensors](#events) · [Character bodies](#characters) · [Sleeping](#sleeping)

## Index

**A** &nbsp; [`world.addBody()`](#world-addbody) · [`body.alive`](#body-alive) · [`body.asleep`](#body-asleep) · [`body.angle`](#body-angle) · [`body.angularVelocity`](#body-angularvelocity) · [`body.applyAngularImpulse()`](#body-applyangularimpulse) · [`body.applyForce()`](#body-applyforce) · [`body.applyImpulse()`](#body-applyimpulse) · [`body.applyTorque()`](#body-applytorque)

**B** &nbsp; [Body2D](#body) · [`world.body()`](#world-body) · [`world.bodyCount`](#world-bodycount) · [`world.bodyOf()`](#world-bodyof)

**C** &nbsp; [Character bodies](#characters) · [Contact events and sensors](#events) · [Contacts](#contacts) · [`world.contacts()`](#world-contacts)

**D** &nbsp; [`body.destroy()`](#body-destroy) · [`world.destroy()`](#world-destroy)

**G** &nbsp; [`world.gravity`](#world-gravity) · [`world.groundOf()`](#world-groundof)

**I** &nbsp; [`body.id`](#body-id) · [`body.inertia`](#body-inertia)

**M** &nbsp; [`body.mass`](#body-mass) · [`world.moved()`](#world-moved) · [`body.moveTo()`](#body-moveto)

**O** &nbsp; [`world.overlap()`](#world-overlap)

**P** &nbsp; [`body.position`](#body-position) · [`world.previous`](#world-previous)

**R** &nbsp; [`world.raycast()`](#world-raycast) · [`world.raycastAll()`](#world-raycastall) · [`world.remove()`](#world-remove)

**S** &nbsp; [`body.setAngle()`](#body-setangle) · [`body.setAngularVelocity()`](#body-setangularvelocity) · [`world.setBody()`](#world-setbody) · [`body.setPosition()`](#body-setposition) · [`body.setVelocity()`](#body-setvelocity) · [`world.shapeCast()`](#world-shapecast) · [`world.sleeping`](#world-sleeping) · [Sleeping](#sleeping) · [`body.slot`](#body-slot) · [`world.step()`](#world-step) · [`world.stepCount`](#world-stepcount) · [`world.setTile()`](#world-settile) · [`world.substeps`](#world-substeps)

**T** &nbsp; [`world.touching()`](#world-touching) · [`world.tileAt()`](#world-tileat) · [Tilemaps and chains](#levels) · [`world.transforms`](#world-transforms)

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
| `type` | `'dynamic'` | `'dynamic'`: moved by gravity and forces. `'static'`: stays where it is put. `'kinematic'`: moves at the velocity you give it, ignoring gravity and forces. `'character'`: walks at the velocity you give it, stopped by walls and carried by the ground. See [Character bodies](#characters). |
| `shape` | `'box'` | `'box'`, `'circle'`, `'capsule'`, `'polygon'`, `'compound'`, or for a level `'tilemap'` or `'chain'`. See [Tilemaps and chains](#levels). |
| `size` | `[100, 100]` | A box's width and height, px. |
| `radius` | `50` | A circle's or capsule's, px. |
| `height` | `200` | A capsule's, end to end along its y, px. At least twice `radius`. |
| `vertices` | a 100 px square; a chain's, one 100 px line | A polygon's points, `[x0, y0, x1, y1, ...]`, px, from its own origin. Any points: it takes their convex hull, so points inside are dropped. A concave shape is a `compound`. A chain's, in order: see [Tilemaps and chains](#levels). |
| `parts` | one default box | A compound's parts: each `{ shape, ...its sizes, position, angle, density }`, box, circle, capsule or polygon, placed from the body's origin. A part with no `density` takes the body's. |
| `tileSize` | `[16, 16]` | A tilemap's tile, `[width, height]`, px, as Winding's. |
| `columns` | `1` | A tilemap's width in tiles. |
| `rows` | `1` | A tilemap's height in tiles. |
| `tiles` | all empty | `columns * rows` ids, row by row from the top-left, as Winding's: 0 is empty, anything else solid. Copied. |
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
| `sensor` | `false` | Reports what overlaps it and pushes nothing. See [Contact events and sensors](#events). |
| `lockRotation` | `false` | Whether it never turns. |
| `lockPosition` | `[false, false]` | The axes its centre of mass never moves along, x and y. |
| `maxSlope` | `π/4` | A character's steepest walkable ground, radians from level, from 0 to π/2. |
| `stepHeight` | a ninth of its height | The tallest step a character walks up, px. A tile game wants a tile, or 0. `null` follows the size again. |
| `pushForce` | `0` | The most force a character pushes dynamic bodies with, kg·px/s². 0 pushes nothing. |
| `position` | `[0, 0]` | Its origin, px. |
| `angle` | `0` | Radians. |
| `velocity` | `[0, 0]` | Of its centre of mass, px/s. |
| `angularVelocity` | `0` | rad/s. |

Returns: a [`Body2D`](#body).

Throws: `addBody: this world was destroyed`; `addBody: options must be an object, got …`; `addBody: unknown option '…' (did you mean '…'?)`; `addBody: unknown option '…' (the options are type, shape, size, radius, height, vertices, parts, tileSize, columns, rows, tiles, density, mass, inertia, centerOfMass, friction, restitution, damping, angularDamping, gravityScale, layers, mask, group, sensor, lockRotation, lockPosition, maxSlope, stepHeight, pushForce, position, angle, velocity, angularVelocity)`; `addBody: type must be 'dynamic', 'static', 'kinematic' or 'character', got …`; `addBody: type must be 'dynamic', 'static' or 'kinematic' for a …, got 'character'`; `addBody: a character body has no centerOfMass`; `addBody: a … body has no …`; `addBody: maxSlope must be an angle from 0 to π/2, in radians, got …`; `addBody: stepHeight must be 0 or more, or null to follow the size, got …`; `addBody: pushForce must be 0 or more, got …`; `addBody: shape must be 'box', 'circle', 'capsule', 'polygon', 'compound', 'tilemap' or 'chain', got …`; `addBody: a <shape> has no <option>`; `addBody: size must be 2 positive numbers, got …`; `addBody: radius must be a positive number, got …`; `addBody: height must be a positive number, got …`; `addBody: height must be at least twice radius (…), got …`; `addBody: vertices must be finite numbers, two to a vertex, got …`; `addBody: vertices must span an area (3 points not on one line), got …`; `addBody: vertices must be 2 or more points, finite numbers, two to a point, got …`; `addBody: vertices must not repeat a point, got …`; `addBody: tileSize must be 2 positive numbers, got …`; `addBody: columns must be a whole number, 1 or more, got …`; `addBody: rows must be a whole number, 1 or more, got …`; `addBody: tiles must be whole numbers that fit in 32 bits, got …`; `addBody: tiles holds … ids; a … x … map needs …`; `addBody: type must be 'static' for a <shape>, got …`; `addBody: parts must be a list of one or more parts, got …`; `addBody: parts[…] must be an object, got …`; `addBody: parts[…]: unknown option '…' (did you mean '…'?)`; `addBody: parts[…]: unknown option '…' (the options are shape, size, radius, height, vertices, position, angle, density)`; `addBody: parts[…].shape must be 'box', 'circle', 'capsule' or 'polygon', got …`; `addBody: parts[…]: a <shape> has no <option>`; `addBody: parts[…].size must be 2 positive numbers, got …`; `addBody: parts[…].radius must be a positive number, got …`; `addBody: parts[…].height must be a positive number, got …`; `addBody: parts[…].height must be at least twice radius (…), got …`; `addBody: parts[…].vertices must be finite numbers, two to a vertex, got …`; `addBody: parts[…].vertices must span an area (3 points not on one line), got …`; `addBody: parts[…].position must be 2 finite numbers, got …`; `addBody: parts[…].angle must be a finite number, got …`; `addBody: parts[…].density must be a positive number, got …`; `addBody: give mass or density, not both`; `addBody: mass must be a positive number, got …`; `addBody: density must be a positive number, got …`; `addBody: inertia must be a positive number, or null to follow the shape, got …`; `addBody: centerOfMass must be 2 finite numbers, got …`; `addBody: friction must be 0 or more, got …`; `addBody: restitution must be from 0 to 1, got …`; `addBody: damping must be 0 or more, got …`; `addBody: angularDamping must be 0 or more, got …`; `addBody: gravityScale must be a finite number, got …`; `addBody: layers must be a whole number that fits in 32 bits, got …`; `addBody: mask must be a whole number that fits in 32 bits, got …`; `addBody: group must be a whole number, 0 or more, got …`; `addBody: sensor must be true or false, got …`; `addBody: lockRotation must be true or false, got …`; `addBody: lockPosition must be 2 true or false values, got …`; `addBody: position must be 2 finite numbers, got …`; `addBody: angle must be a finite number, got …`; `addBody: a static body has no velocity`; `addBody: a static body has no angularVelocity`; `addBody: velocity must be 2 finite numbers, got …`; `addBody: angularVelocity must be a finite number, got …`; `addBody: a world holds at most 16777216 bodies (the slot field of an id is 24 bits)`.

```js
const shard = world.addBody({ shape: 'polygon', vertices: [0, 0, 6, 1, 4, 5], position: [320, 96], angle: 0.3 });
const ell = world.addBody({ shape: 'compound', parts: [
  { size: [12, 4], position: [6, 2] },
  { size: [4, 8], position: [2, 8] },
] });
```

Notes: a compound's `position` is its origin, not its centre of mass, which Bearing works out from
its parts.

<a id="world-raycast"></a>
### `world.raycast(origin, direction, options)` → `{ body, point, normal, distance } | null`

The nearest body the ray from `origin` along `direction` meets, or `null`. `direction` needn't be
unit length; `distance` is px along it. Every shape can be hit, sleeping bodies too, and a chain from
either side. A ray that starts inside something hits it at 0, with `normal` back along the ray.
Sensors are passed through.

| Option | Default | Meaning |
|---|---|---|
| `maxDistance` | `Infinity` | Ignore hits this far or further, px. |
| `mask` | `0xffffffff` | Which of the 32 layers to hit, as bits: a body is hit if any of its `layers` is in it. |
| `ignore` | `null` | A body to leave out, or a list of them, such as a ragdoll's own parts. |

Returns: `{ body, point, normal, distance }`, or `null` for a miss.

Throws: `raycast: this world was destroyed`; `raycast: origin must be 2 finite numbers, got …`; `raycast: direction must be 2 finite numbers, not both zero, got …`; `raycast: options must be an object, got …`; `raycast: unknown option '…' (did you mean '…'?)`; `raycast: unknown option '…' (the options are maxDistance, mask, ignore)`; `raycast: maxDistance must be 0 or more, got …`; `raycast: mask must be a whole number that fits in 32 bits, got …`; `raycast: ignore must be a Body2D or a list of Body2Ds, got …`; `raycast: ignore belongs to another world`; `raycast: ignore was removed`; `raycast: ignore[…] must be a Body2D, got …`; `raycast: ignore[…] belongs to another world`; `raycast: ignore[…] was removed`.

```js
const below = world.raycast(ball.position, [0, 1], { maxDistance: 400, ignore: ball });
if (below) console.log(below.distance, below.normal);
```

<a id="world-raycastall"></a>
### `world.raycastAll(origin, direction, options)` → `Array`

Every body the ray meets, nearest first, each once. Takes `raycast`'s options.

Returns: an array of `{ body, point, normal, distance }`; `[]` for none.

Throws: `raycastAll: this world was destroyed`; `raycastAll: origin must be 2 finite numbers, got …`; `raycastAll: direction must be 2 finite numbers, not both zero, got …`; `raycastAll: options must be an object, got …`; `raycastAll: unknown option '…' (did you mean '…'?)`; `raycastAll: unknown option '…' (the options are maxDistance, mask, ignore)`; `raycastAll: maxDistance must be 0 or more, got …`; `raycastAll: mask must be a whole number that fits in 32 bits, got …`; `raycastAll: ignore must be a Body2D or a list of Body2Ds, got …`; `raycastAll: ignore belongs to another world`; `raycastAll: ignore was removed`; `raycastAll: ignore[…] must be a Body2D, got …`; `raycastAll: ignore[…] belongs to another world`; `raycastAll: ignore[…] was removed`.

```js
for (const hit of world.raycastAll([0, 0], [1, 0])) console.log(hit.body.id);
```

<a id="world-shapecast"></a>
### `world.shapeCast(shape, origin, direction, options)` → `{ body, point, normal, distance } | null`

The first body `shape`, moving from `origin` along `direction`, would touch, or `null`. `shape` is
`{ shape, size, radius, height }`, addBody's names and defaults: `{}` is a 100 px box. `normal`
points from the surface back at the shape. It takes `raycast`'s options, and `angle`, how the shape
is turned.

Returns: `{ body, point, normal, distance }`, or `null`.

Throws: `shapeCast: this world was destroyed`; `shapeCast: shape must be an object, got …`; `shapeCast: shape: unknown option '…' (did you mean '…'?)`; `shapeCast: shape: unknown option '…' (the options are shape, size, radius, height)`; `shapeCast: shape.shape must be 'box', 'circle' or 'capsule', got …`; `shapeCast: shape: a <shape> has no <option>`; `shapeCast: shape.size must be 2 positive numbers, got …`; `shapeCast: shape.radius must be a positive number, got …`; `shapeCast: shape.height must be a positive number, got …`; `shapeCast: shape.height must be at least twice radius (…), got …`; `shapeCast: origin must be 2 finite numbers, got …`; `shapeCast: direction must be 2 finite numbers, not both zero, got …`; `shapeCast: options must be an object, got …`; `shapeCast: unknown option '…' (did you mean '…'?)`; `shapeCast: unknown option '…' (the options are maxDistance, mask, ignore, angle)`; `shapeCast: maxDistance must be 0 or more, got …`; `shapeCast: mask must be a whole number that fits in 32 bits, got …`; `shapeCast: ignore must be a Body2D or a list of Body2Ds, got …`; `shapeCast: ignore belongs to another world`; `shapeCast: ignore was removed`; `shapeCast: ignore[…] must be a Body2D, got …`; `shapeCast: ignore[…] belongs to another world`; `shapeCast: ignore[…] was removed`; `shapeCast: angle must be a finite number, got …`.

```js
const hit = world.shapeCast({ size: [20, 40] }, [0, 0], [1, 0], { maxDistance: 300 });
```

Notes: it stops within a tolerance short of touching. A shape already touching and moving away
isn't stopped.

<a id="world-overlap"></a>
### `world.overlap(shape, position, options)` → `Array`

The bodies `shape`, placed at `position`, overlaps or touches. Sensors are left out.

| Option | Default | Meaning |
|---|---|---|
| `mask` | `0xffffffff` | Which of the 32 layers to find, as bits. |
| `ignore` | `null` | A body to leave out, or a list of them. |
| `angle` | `0` | How the shape is turned. |

Returns: an array of [`Body2D`](#body); `[]` for none.

Throws: `overlap: this world was destroyed`; `overlap: shape must be an object, got …`; `overlap: shape: unknown option '…' (did you mean '…'?)`; `overlap: shape: unknown option '…' (the options are shape, size, radius, height)`; `overlap: shape.shape must be 'box', 'circle' or 'capsule', got …`; `overlap: shape: a <shape> has no <option>`; `overlap: shape.size must be 2 positive numbers, got …`; `overlap: shape.radius must be a positive number, got …`; `overlap: shape.height must be a positive number, got …`; `overlap: shape.height must be at least twice radius (…), got …`; `overlap: position must be 2 finite numbers, got …`; `overlap: options must be an object, got …`; `overlap: unknown option '…' (did you mean '…'?)`; `overlap: unknown option '…' (the options are mask, ignore, angle)`; `overlap: mask must be a whole number that fits in 32 bits, got …`; `overlap: ignore must be a Body2D or a list of Body2Ds, got …`; `overlap: ignore belongs to another world`; `overlap: ignore was removed`; `overlap: ignore[…] must be a Body2D, got …`; `overlap: ignore[…] belongs to another world`; `overlap: ignore[…] was removed`; `overlap: angle must be a finite number, got …`.

```js
const blast = [200, 50];
for (const body of world.overlap({ shape: 'circle', radius: 80 }, blast)) body.applyImpulse([0, -5000]);
```

<a id="world-contacts"></a>
### `world.contacts(body?)` → `Array`

The last step's contact events: which pairs began touching, which met again while touching, and
which stopped. Read it after each step. Given a body, only that body's events, each turned so that
`a` is that body. See [Contact events and sensors](#events).

Returns: fresh plain objects, in the same order every run. A begin is
`{ type: 'begin', a, b, point, normal, speed }`: `point` is where they met, `normal` the unit
direction from `a` to `b`, `speed` how fast they closed along it, px/s. An impact,
`{ type: 'impact', a, b, point, normal, speed }`, has a begin's fields. An end is
`{ type: 'end', a, b }`.

Throws: `contacts: this world was destroyed`; `contacts: body must be a Body2D, got …`; `contacts: body belongs to another world`.

```js
world.step(1 / 60);
for (const e of world.contacts()) {
  if (e.type !== 'end' && e.speed > 200) console.log('thud', e.point, e.speed);
}
```

Notes: a removed body can still be asked about: its events come with the step after its removal,
its handle reading `alive` as `false`.

<a id="world-touching"></a>
### `world.touching(body)` → `Array`

Every body touching this one as of the last step, or overlapping it where either is a sensor. It
costs what the body is near, and a sleeping body's touches are kept.

Returns: an array of [`Body2D`](#body); `[]` if none.

Throws: `touching: this world was destroyed`; `touching: body must be a Body2D, got …`; `touching: body belongs to another world`; `touching: body was removed`.

```js
const inside = world.touching(crate).map((b) => b.id);
```

<a id="world-groundof"></a>
### `world.groundOf(body)` → `{ body, point, normal } | null`

What a [character](#characters) stands on, as of the last step: the body, the point it stands at and
the ground's normal, out of the ground. Read it to know whether it can jump.

Returns: the ground, or `null` in the air, or for a body that isn't a character.

Throws: `groundOf: this world was destroyed`; `groundOf: body must be a Body2D, got …`; `groundOf: body belongs to another world`; `groundOf: body was removed`.

```js
const hero = world.addBody({ type: 'character', size: [14, 44] });
if (world.groundOf(hero)) hero.setVelocity(hero.velocity[0], -400);
```

<a id="world-settile"></a>
### `world.setTile(body, x, y, id)`

Changes tile (x, y) of a tilemap, 0 for empty, as Winding's `scene.setTile`. Anything near the cell
wakes: it may have rested on the tile, or be under what is laid. One store, however big the map.

Throws: `setTile: this world was destroyed`; `setTile: body must be a Body2D, got …`; `setTile: body belongs to another world`; `setTile: body was removed`; `setTile: this body has no tilemap`; `setTile: x and y must be inside the … x … map, got …`; `setTile: id must be a whole number that fits in 32 bits, got …`.

```js
const map = world.addBody({ shape: 'tilemap', tileSize: [16, 16], columns: 100, rows: 40 });
world.setTile(map, 12, 3, 1);   // lay a block
world.setTile(map, 12, 3, 0);   // break it
```

<a id="world-tileat"></a>
### `world.tileAt(body, x, y)` → `number`

The id of tile (x, y) of a tilemap, as Winding's `scene.tileAt`.

Throws: `tileAt: this world was destroyed`; `tileAt: body must be a Body2D, got …`; `tileAt: body belongs to another world`; `tileAt: body was removed`; `tileAt: this body has no tilemap`; `tileAt: x and y must be inside the … x … map, got …`.

```js
const map = world.addBody({ shape: 'tilemap', tileSize: [16, 16], columns: 4, rows: 1, tiles: [1, 0, 0, 1] });
console.log(world.tileAt(map, 3, 0));
```

<a id="world-setbody"></a>
### `world.setBody(body, changes)`

Changes any of the options `addBody` took, and leaves the rest. Mass and inertia follow a new
shape, unless given.

Throws: `setBody: this world was destroyed`; `setBody: body must be a Body2D, got …`; `setBody: body belongs to another world`; `setBody: body was removed`; `setBody: changes must be an object, got …`; `setBody: unknown option '…' (did you mean '…'?)`; `setBody: unknown option '…' (the options are type, shape, size, radius, height, vertices, parts, tileSize, columns, rows, tiles, density, mass, inertia, centerOfMass, friction, restitution, damping, angularDamping, gravityScale, layers, mask, group, sensor, lockRotation, lockPosition, maxSlope, stepHeight, pushForce, position, angle, velocity, angularVelocity)`; `setBody: type must be 'dynamic', 'static', 'kinematic' or 'character', got …`; `setBody: type must be 'dynamic', 'static' or 'kinematic' for a …, got 'character'`; `setBody: a character body has no centerOfMass`; `setBody: a … body has no …`; `setBody: maxSlope must be an angle from 0 to π/2, in radians, got …`; `setBody: stepHeight must be 0 or more, or null to follow the size, got …`; `setBody: pushForce must be 0 or more, got …`; `setBody: shape must be 'box', 'circle', 'capsule', 'polygon', 'compound', 'tilemap' or 'chain', got …`; `setBody: a <shape> has no <option>`; `setBody: size must be 2 positive numbers, got …`; `setBody: radius must be a positive number, got …`; `setBody: height must be a positive number, got …`; `setBody: height must be at least twice radius (…), got …`; `setBody: vertices must be finite numbers, two to a vertex, got …`; `setBody: vertices must span an area (3 points not on one line), got …`; `setBody: vertices must be 2 or more points, finite numbers, two to a point, got …`; `setBody: vertices must not repeat a point, got …`; `setBody: tileSize must be 2 positive numbers, got …`; `setBody: columns must be a whole number, 1 or more, got …`; `setBody: rows must be a whole number, 1 or more, got …`; `setBody: tiles must be whole numbers that fit in 32 bits, got …`; `setBody: tiles holds … ids; a … x … map needs …`; `setBody: type must be 'static' for a <shape>, got …`; `setBody: parts must be a list of one or more parts, got …`; `setBody: give mass or density, not both`; `setBody: mass must be a positive number, got …`; `setBody: density must be a positive number, got …`; `setBody: inertia must be a positive number, or null to follow the shape, got …`; `setBody: centerOfMass must be 2 finite numbers, got …`; `setBody: friction must be 0 or more, got …`; `setBody: restitution must be from 0 to 1, got …`; `setBody: damping must be 0 or more, got …`; `setBody: angularDamping must be 0 or more, got …`; `setBody: gravityScale must be a finite number, got …`; `setBody: layers must be a whole number that fits in 32 bits, got …`; `setBody: mask must be a whole number that fits in 32 bits, got …`; `setBody: group must be a whole number, 0 or more, got …`; `setBody: sensor must be true or false, got …`; `setBody: lockRotation must be true or false, got …`; `setBody: lockPosition must be 2 true or false values, got …`; `setBody: position must be 2 finite numbers, got …`; `setBody: angle must be a finite number, got …`; `setBody: a static body has no velocity`; `setBody: a static body has no angularVelocity`; `setBody: velocity must be 2 finite numbers, got …`; `setBody: angularVelocity must be a finite number, got …`.

```js
world.setBody(ball, { shape: 'circle', radius: 16, type: 'static' });
```

<a id="world-bodyof"></a>
### `world.bodyOf(body)` → `object`

A copy of the body's options as they are now, in the form `addBody` takes, so
`world.addBody(world.bodyOf(body))` makes a copy of it.

Returns: `{ type, shape, …sizes, mass or density, inertia, centerOfMass, friction, restitution, damping, angularDamping, gravityScale, layers, mask, group, sensor, lockRotation, lockPosition, maxSlope, stepHeight, pushForce, position, angle, velocity, angularVelocity }`.
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

<a id="levels"></a>
## Tilemaps and chains

A level is one body, static, that touches many others in many places. It has no mass or angle.

**A tilemap** takes the same numbers as a Winding tilemap, so one array can describe both. Its
`position` is the map's top-left corner, as a Winding tilemap's with the default pivot.

```js
const tiles = new Uint32Array(100 * 40);
tiles.fill(1, 100 * 30);   // solid from row 30 down
const ground = world.addBody({ shape: 'tilemap', tileSize: [16, 16], columns: 100, rows: 40, tiles });
```

- **Any size.** A body looks only at the cells under it, so 20 million tiles step like 100.
- **No seams.** Tiles aren't boxes here: under a body, the map joins the sides that are exposed,
  solid on one hand and empty on the other, into long lines. A floor is one line, so nothing catches
  on the joins between tiles: a frictionless box crosses 100 of them at 800 px/s without a bump.
- **Any id but 0 is solid.** A map only of what collides, kept beside the one that draws, says which
  tiles are for show.
- **Outside the map is empty,** so a body can fall off its end.
- **Laying a tile on a body** is the game's to sort out. A body pressed past a line is pushed back
  out the way it came, but one wholly inside solid tiles, with no open side near it, stays there.

**A chain** is a line of points, for slopes and hills tiles don't suit. It is one-sided: its front
is on the left of the way it is drawn, on a y-down screen, so drawn left to right it faces up, and
a body can pass through it from behind, as a platform you jump up through.

```js
world.addBody({ shape: 'chain', vertices: [-300, -100, 0, 0, 300, -100] });   // a valley
```

- **Its joints catch nothing:** a flat chain cut into 100 lines is as smooth as one.
- It has no `angle`. `position` moves it. Every line near a body is found by testing them all, so
  keep a chain to hundreds of points.

**Concave shapes** are compounds. A shape cut from pixels is rows of boxes merged where they can
be: `{ shape: 'compound', parts: [...] }`. Each part costs a pair of its own near anything it
touches, so fewer rectangles run faster.

<a id="events"></a>
## Contact events and sensors

After each step, [`world.contacts()`](#world-contacts) lists what began touching, what met again,
and what stopped, and [`world.touching()`](#world-touching) says what touches a body now. They work
as in [3D](API.md#events): read after the step, never called back, so a body can be removed on the
spot.

- **A pair is one pair however it touches.** A body against a tilemap or chain begins once, and
  ends once, whatever lines it crosses.
- **An impact is touching, and hit again:** a box on a tilemap sliding into a wall of the same map,
  or a body struck down onto the one it rests on. It comes when the pair's fastest pushed point
  closes faster than last step by more than a bounce too small to see, √(2 g tolerance). A rise,
  not a speed, so pressing gives none. So one check, `e.type !== 'end'`, reads every hit.
- **Nothing changing writes nothing:** there are no stay events, so a resting pile costs none.

**Sensors.** Any body is a sensor with `sensor: true`. It pushes nothing and nothing pushes it, and
bodies pass through on exactly the same path. It sees every body but other sensors, by layers and
masks, sleeping ones too, and wakes nothing. Queries pass through it. It looks where a step leaves
bodies, so one that crosses it entirely within a step isn't seen.

<a id="characters"></a>
## Character bodies

A body with `type: 'character'` is a box, circle or capsule you walk: it goes at the velocity you
give it and nothing pushes it, as a kinematic body does, but it collides as a person does. It reads
no input and owns no feel: speed, jump height and air control are yours, set with `setVelocity`
each step. As in 3D:

- **Each step,** it is pushed out of anything it overlaps, moves by its velocity, sliding along what
  it meets, and is put where that ended, before the solve. It stands still through the solve.
- **Walls** take away the part of its velocity going into them. [`body.velocity`](#body-velocity)
  reads what is left, so a game keeps its own wanted speed apart.
- **Ground** no steeper than `maxSlope` holds it up, at the speed you asked for across it, up slopes
  and down them without leaving the ground. Gravity acts on it only in the air, and `gravityScale`
  counts. To jump, give it a velocity against gravity while on the ground.
- **Steps** up to `stepHeight` are walked up. It stays on the ground going down them too. Off an
  edge taller than that, it falls.
- **What moves carries it.** On a kinematic platform or a dynamic body, it moves at that body's
  velocity where it stands, added to its own, and [`groundOf`](#world-groundof) names it.
- **It pushes nothing,** unless given a `pushForce`, and then at most that force on what it walks into.
- **It blocks on what it would collide with:** layers, masks and groups count, and sensors don't.
  Dynamic bodies landing on it stand on it, as on a wall.
- **It never sleeps,** though what lies around it does.
- **Nothing turns it.**

```js
const tiles = new Uint32Array(64 * 16).fill(1, 64 * 12);
world.addBody({ shape: 'tilemap', tileSize: [16, 16], columns: 64, rows: 16, tiles });
const hero = world.addBody({ type: 'character', shape: 'capsule', radius: 7, height: 44, position: [100, 170], stepHeight: 16 });
for (let i = 0; i < 60; i++) {
  hero.setVelocity(120, world.groundOf(hero) && i === 30 ? -350 : hero.velocity[1]);
  world.step(1 / 60);
}
```

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
