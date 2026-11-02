# Hello world, side by side

The same small program written four times: once in Bearing and once in each of Rapier, cannon-es
and Jolt. Each one:

- makes a static floor, 20 m square and 1 m thick, its top at y = 0;
- drops a 1 m box from 5 m up;
- rolls a ball 0.5 m across into it, at 3 m/s from 4 m away, so it arrives as the box lands;
- steps the world at 60 Hz for 3 s, and prints where the box ended up.

Each is written as its own documentation shows, with nothing set that the program doesn't need,
so each engine's own defaults decide the rest: friction, bounce and, where the engine works it
out, mass. That is why the four boxes don't end in quite the same place. The Bearing program is
run by Bearing's tests (`test/docs.test.js`); the other three are run, exactly as printed here, by
a page that loads each engine from jsDelivr at the version below.
All four were run as printed in Chrome 152 on 2 November 2026, Bearing loaded from this
repository through jsDelivr at commit `82b6a59`: each left the box resting at y = 0.50 m (Jolt's,
with its 5 cm convex radius, at 0.48).

**Versions when this was written (2 November 2026):**

| Engine | Package | Version |
|---|---|---|
| Bearing | `bearing-physics` (not yet published) | the repository, at the commit this page is in |
| Rapier | `@dimforge/rapier3d-simd-compat` | 0.21.0 |
| cannon-es | `cannon-es` | 0.20.0 |
| Jolt | `jolt-physics` | 1.1.0 |

These are the versions `bench/compare.html` measures. Newer versions of any of them may differ.
Each engine's own docs are the authority on its current API.

## Line count

| | Bearing | Rapier | cannon-es | Jolt |
|---|---|---|---|---|
| Lines, blank lines excluded | 7 | 11 | 15 | 31 |
| Imports | 1 | 1 | 1 | 1 |

Line count is a rough measure. Most of the difference comes from what each engine works out by
itself, not from how wordy it is; the table after the code shows where.

## Bearing

```js
import { World } from 'bearing-physics';

const world = new World();
world.addBody({ type: 'static', size: [20, 1, 20], position: [0, -0.5, 0] });
const box = world.addBody({ position: [0, 5, 0] });
world.addBody({ shape: 'sphere', radius: 0.25, position: [-4, 0.25, 0], velocity: [3, 0, 0], angularVelocity: [0, 0, -12] });

for (let i = 0; i < 180; i++) world.step(1 / 60);
console.log(box.position);
```

Gravity is Earth's, and the box's mass, 1,000 kg, and the ball's, 65 kg, come from their shapes
and water's density. Sizes are full sizes, as a model's are. The ball rolls, so it is given the
spin that goes with its speed, 3 / 0.25 = 12 rad/s; given none, it would slide until friction
set it rolling. It prints about `[0.0018, 0.4999, 0]`: the box lands flat, its centre sagging
0.07 mm, and the ball, 15 times lighter, nudges it 2 mm along x.

## Rapier

```js
import RAPIER from '@dimforge/rapier3d-simd-compat';

await RAPIER.init();
const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
world.createCollider(RAPIER.ColliderDesc.cuboid(10, 0.5, 10).setTranslation(0, -0.5, 0));
const box = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 5, 0));
world.createCollider(RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5), box);
const ballDesc = RAPIER.RigidBodyDesc.dynamic().setTranslation(-4, 0.25, 0)
  .setLinvel(3, 0, 0).setAngvel({ x: 0, y: 0, z: -12 });
world.createCollider(RAPIER.ColliderDesc.ball(0.25), world.createRigidBody(ballDesc));

for (let i = 0; i < 180; i++) world.step();
console.log(box.translation());
```

Compared with Bearing:

- **It has to be started:** `RAPIER.init()` loads its WebAssembly before anything else can run.
- **Gravity is given.** The world takes it as its one required argument.
- **A body and its shape are two things,** a rigid body and a collider, each made from a
  descriptor. A collider with no body is fixed, which is how the floor is made.
- **Sizes are half sizes:** `cuboid(0.5, 0.5, 0.5)` is a 1 m box.
- **Its density is 1 kg/m³ by default,** so the box weighs 1 kg. The bodies' masses come out a
  thousandth of Bearing's, and in the same ratio, so the two collide alike.
- **The step is a setting:** `world.timestep`, 1/60 s by default, rather than an argument.

## cannon-es

```js
import * as CANNON from 'cannon-es';

const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.81, 0) });
const ground = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Box(new CANNON.Vec3(10, 0.5, 10)) });
ground.position.set(0, -0.5, 0);
world.addBody(ground);
const box = new CANNON.Body({ mass: 1000, shape: new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.5)) });
box.position.set(0, 5, 0);
world.addBody(box);
const ball = new CANNON.Body({ mass: 65.4, shape: new CANNON.Sphere(0.25) });
ball.position.set(-4, 0.25, 0);
ball.velocity.set(3, 0, 0);
ball.angularVelocity.set(0, 0, -12);
world.addBody(ball);

for (let i = 0; i < 180; i++) world.step(1 / 60);
console.log(box.position);
```

Compared with Bearing:

- **Gravity is given:** a new world's is zero.
- **Every mass is given, by hand.** A body's mass is 0 unless given, and a body of mass 0 doesn't
  move. The ball's 65.4 kg is water's density times its volume, worked out here so the two bodies
  weigh what they do in Bearing. Its inertia is worked out from the shape.
- **A body, its shape and the world are three steps:** make the body with its shape, place it,
  then add it to the world.
- **Sizes are half sizes**, as `Vec3`s.
- **Its default friction and bounce are 0.3 and 0.3**, against Bearing's 0.5 and 0, so its box
  bounces on landing.
- **For many bodies, more is needed:** every pair is tested and nothing sleeps unless
  `world.broadphase = new CANNON.SAPBroadphase(world)` and `allowSleep: true` are set, as its docs
  advise and the benchmark does. Three bodies don't need them.

## Jolt

```js
import initJolt from 'jolt-physics';

const Jolt = await initJolt();
const STILL = 0, MOVING = 1;
const pairs = new Jolt.ObjectLayerPairFilterTable(2);
pairs.EnableCollision(STILL, MOVING);
pairs.EnableCollision(MOVING, MOVING);
const layers = new Jolt.BroadPhaseLayerInterfaceTable(2, 2);
layers.MapObjectToBroadPhaseLayer(STILL, new Jolt.BroadPhaseLayer(0));
layers.MapObjectToBroadPhaseLayer(MOVING, new Jolt.BroadPhaseLayer(1));
const settings = new Jolt.JoltSettings();
settings.mObjectLayerPairFilter = pairs;
settings.mBroadPhaseLayerInterface = layers;
settings.mObjectVsBroadPhaseLayerFilter = new Jolt.ObjectVsBroadPhaseLayerFilterTable(layers, 2, pairs, 2);
const jolt = new Jolt.JoltInterface(settings);
Jolt.destroy(settings);
const bodies = jolt.GetPhysicsSystem().GetBodyInterface();
function add(shape, x, y, z, motion, layer) {
  const make = new Jolt.BodyCreationSettings(shape, new Jolt.RVec3(x, y, z), new Jolt.Quat(0, 0, 0, 1), motion, layer);
  const body = bodies.CreateBody(make);
  Jolt.destroy(make);
  bodies.AddBody(body.GetID(), Jolt.EActivation_Activate);
  return body;
}
add(new Jolt.BoxShape(new Jolt.Vec3(10, 0.5, 10), 0.05, null), 0, -0.5, 0, Jolt.EMotionType_Static, STILL);
const box = add(new Jolt.BoxShape(new Jolt.Vec3(0.5, 0.5, 0.5), 0.05, null), 0, 5, 0, Jolt.EMotionType_Dynamic, MOVING);
const ball = add(new Jolt.SphereShape(0.25, null), -4, 0.25, 0, Jolt.EMotionType_Dynamic, MOVING);
bodies.SetLinearVelocity(ball.GetID(), new Jolt.Vec3(3, 0, 0));
bodies.SetAngularVelocity(ball.GetID(), new Jolt.Vec3(0, 0, -12));

for (let i = 0; i < 180; i++) jolt.Step(1 / 60, 1);
const p = box.GetPosition();
console.log([p.GetX(), p.GetY(), p.GetZ()]);
```

Compared with Bearing:

- **It has to be started:** `initJolt()` loads its WebAssembly.
- **Collision filtering is set up first, and isn't optional.** Every body goes in an object layer,
  every object layer maps to a broadphase layer, and three tables say which layers meet. The two
  layers here, one for what doesn't move and one for what does, are the smallest setup its
  examples use.
- **Memory is managed by hand.** Jolt's objects live in WebAssembly memory, which JavaScript's
  garbage collector can't see, so what is made with `new` is let go of with `Jolt.destroy`, as the
  settings are here. This program, which ends at once, lets go of nothing else; one that runs
  for a while has to.
- **A body is made in three calls:** creation settings, `CreateBody`, then `AddBody` to put it in
  the world and wake it.
- **Sizes are half sizes, with rounded corners:** a box takes a convex radius, 0.05 m here as in
  its examples, which rounds its edges by that much.
- **Velocities are set through the body interface**, by the body's id, not on the body.
- **A step takes how many collision passes to make in it**, 1 here.
- Gravity, Earth's, and mass, from the shape and a density of 1,000 kg/m³, are worked out as in
  Bearing. Its default friction is 0.2 and its bounce 0.

## What each one asks of you

| | Bearing | Rapier | cannon-es | Jolt |
|---|---|---|---|---|
| Start-up | none | `await RAPIER.init()` | none | `await initJolt()` |
| Gravity | Earth's by default | given | given (zero by default) | Earth's by default |
| Mass | from the shape, water's density | from the shape, 1 kg/m³ | given, for every body | from the shape, water's density |
| Inertia | from the shape | from the shape | from the shape | from the shape |
| A body and its shape | one call | a body and a collider, from descriptors | body, `position.set`, `addBody` | settings, `CreateBody`, `AddBody` |
| Sizes | full | half | half | half, plus a convex radius |
| Collision filtering setup | none (everything collides by default) | none | none | layers and three tables, required |
| Broadphase for many bodies | built in | built in | `SAPBroadphase`, set by hand | built in, from the layers |
| Sleeping | on | on | off unless `allowSleep` | on |
| Freeing memory | the garbage collector | `world.free()`, for long-running pages | the garbage collector | `Jolt.destroy` for every `new` |
| The step | an argument | a setting | an argument | an argument, and a collision pass count |
| Solver settings | none needed | none needed | none needed | none needed |
| Defaults: friction, bounce | 0.5, 0 | 0.5, 0 | 0.3, 0.3 | 0.2, 0 |

No engine needed a solver setting for this scene: a box and a ball on a floor is easy for all
four. Where they part is on stacks and piles; see [How it compares](../README.md#how-it-compares).

Where Bearing does less: it is slower than Rapier on every scene measured, and than Jolt on every
scene but the rays (see [How it compares](../README.md#how-it-compares)). Rapier also comes as a 2D engine, and Jolt
has vehicles, soft bodies and shapes Bearing hasn't, such as cylinders. Bearing's
[API reference](API.md) lists everything it does.
