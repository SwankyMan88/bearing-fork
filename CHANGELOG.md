# Changelog

All notable changes to Bearing are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html), measured against the
[API reference](docs/API.md).

## [Unreleased]

## [1.1.0] - 2026-11-03

What the games need first from 1.x, added without changing anything 1.0 code relies on. A hit
between bodies already touching is now an event, so damage can be read from every blow; a group
keeps each ragdoll's parts off one another, a hundred ragdolls at once; queries leave out a list
of bodies; and `body.moveTo` drives an animated kinematic body to a pose, exactly. No simulation
results changed from 1.0.0. Saves move to format 12, and as before load only into the version
that made them.

### Added

- **Impact events.** `world.contacts()` gives `{ type: 'impact', a, b, point, normal, speed }`, a
  begin's fields, when two bodies already touching meet again: a box sliding on a level mesh into a
  wall of the same mesh, which gave no event at all before, or a sword resting on a shield swung
  into it. It comes when the pair's fastest closing speed rose since the last step by more than a
  bounce too small to see, so steady pressing gives none. Every hit is now a begin or an impact.
  The save format is 11.
- **Groups.** Body option `group`: bodies of the same group never collide with each other,
  whatever their layers, so a hundred ragdolls can each keep their own parts apart, which 32
  layers can't. Any whole number, a body's `id` included; `0`, the default, is none. It holds for
  contacts, sensors and characters. The save format is 12.
- **`ignore` takes a list.** `raycast`, `raycastAll`, `shapeCast` and `overlap` leave out every body
  in a list given as `ignore`, such as a ragdoll's own parts, as well as one body as before. A
  wrong value says so: `ignore must be a Body or a list of Bodies, got …`, `ignore[1] must be a
  Body, got …`.
- **`body.moveTo(position, rotation, dt)`.** Sets the velocities that bring a body to a pose over
  the next step, so an animated kinematic body (a door, an arm, a platform on a path) pushes what
  it meets as it goes. A kinematic body lands on the pose to rounding, its turn worked out with
  Bearing's own sine, cosine and arctangent, as Box2D 3's `b2Body_SetTargetTransform` and Jolt's
  `MoveKinematic` do it but exact.

## [1.0.0] - 2026-11-03

Bearing 1.0. The whole API was gone through before it, as Winding's was, so that code written
against it keeps working through 1.x: a few names were made to mean one thing each (the old ones
throw, saying what they are called now), what each call gives back was made to round-trip, and
the API reference now says exactly what 1.x promises and what it doesn't. The determinism hash is
checked on Bun as well as Node, and CI runs only the tests a change reaches. No simulation results
changed from 0.14.0.

### Changed

- **Breaking:** `body.centerOfMass`, where a body's mass is centred in the world, is now
  `body.worldCenterOfMass`, as Winding's is `node.worldPosition()`, so that `centerOfMass` means
  one thing: the option, in the body's own frame, which keeps its name. Reading or assigning the old
  property throws, saying so.
- **Breaking:** a joint's `friction` option is now `frictionForce`, the same N·m or N, paired with
  `motorForce`; a body's `friction`, a coefficient, keeps its name. Giving a joint `friction`
  throws, saying so, and `jointOf` gives `frictionForce`.
- **Breaking:** "not set" reads back one way. `bodyOf` always gives `inertia` (and, but for a
  character, `centerOfMass`) where the body can have them, and a character's `stepHeight`, as
  `null` while they follow their worked-out default; `jointOf` always gives `min` and `max` where
  the joint has them, `null` for the default. `null` is the default wherever the default is worked
  out or none, as the API reference's Conventions now say once.
- **Breaking:** the TypeScript type `Shape` is now `ShapeType`, beside `BodyType` and `JointType`.
  `Vec3` and `Quat` take any array-like of numbers, a plain `number[]` included, as the reference
  always said; what Bearing gives back is still a tuple.
- **Breaking:** error messages made one form. A property names itself in all of its errors
  (`world.gravity: this world was destroyed`, `body.position: this body was removed`,
  `joint.force: this joint was removed`). A Body or Joint given to any call is checked by one rule
  with one set of messages: `<name> must be a Body, got …`, `<name> belongs to another world`,
  `<name> was removed` (`setBody: body was removed`, `addJoint: b belongs to another world`,
  `remove: handle belongs to another world`). A query shape's own fields are named as its own:
  `shapeCast: shape: unknown option 'radus' (did you mean 'radius'?)`, `shapeCast: shape.radius
  must be a positive number, got -1`.
- A save is stamped with the version of Bearing that made it, and loads only into that version:
  `load: this data was saved by Bearing 0.14.0, and this is …; a save loads only into the version
  that made it`. Its format is 10.

### Added

- `world.joint(id)`, a handle for a joint's id, as `world.body(id)` is for a body's.
- `world.save()` data carries `version`, the Bearing that saved it.
- The API reference's "What 1.x promises": what code written against it can rely on through 1.x
  (every call, option, default's meaning, return shape and unit; bad input throwing and changing
  nothing), and what it can't (simulation bits across versions, measured figures, documented
  limitations, error wording, new kinds and fields, modules by path, how ids are laid out), and
  its Renamed section. From 1.0, a name renamed in 1.x keeps working until 2.0.
- The reference lists every type the package exports.

### Fixed

- `setBody(body, bodyOf(body))` and `setJoint(joint, jointOf(joint))` change nothing, and
  `addBody(bodyOf(body))` and `addJoint(jointOf(joint))` make copies, with nothing lost to a field
  left out. `setJoint` takes `a` and `b` given as they are, and an `anchor`, `anchorB` or `axis`
  given as it already is changes nothing, so a joint given back what `jointOf` read keeps its angle
  and what it carried, mid-swing.
- A distance joint's `length: null` goes back to its default, how far apart its ends are now.
- `jointOf().axis` is the axis as it was given, made unit length, not worked out again from how
  the bodies have turned, which read it back a rounding off.
- `raycast`, `raycastAll`, `shapeCast` and `overlap` given a removed body as `ignore` throw, as
  every other call given a removed body does, rather than ignoring nothing.
- A hinge given a rotation as its `target` is told its target must be a number, not that it must
  be from -π to π.
- The reference: "centre" means one point each time (`setPosition` moves the origin; anchors'
  defaults, and a force or impulse with no point, are at the centre of mass; `velocity` is the
  centre of mass's); `bodyOf`'s Returns names every field, a hull's `vertices` and a compound's
  `parts` included; the Body entry says what still works on a removed body; a distance joint's
  `min` and `max` default to its `length`; `world.contacts(body?)`; stale lines on joints,
  contacts and stay events.

## [0.14.0] - 2026-11-02

The first release. Bearing is a 3D physics engine in plain JavaScript, for any renderer, with no
dependencies and no build step, and this brings everything built so far: dynamic, static,
kinematic and character bodies of boxes, balls, capsules, convex hulls and compounds; triangle
meshes and heightfields, read from `.glb` too; contacts that stack, friction, bounces and
continuous collision; sleeping; raycasts, shape casts and overlap tests; contact events and
sensors; fixed, ball, hinge, slider, distance and rotation joints with stops, motors, springs,
friction, pose targets and the force each one carries; save and load; and workers. The same
inputs give the same results to the bit on every machine and with any number of workers. It is
numbered 0.14.0 because that is where the roadmap's plan puts the API, and before 1.0 a minor
version may still change it.

### Added

- Joints are solved on the workers too: joints that share no moving body, and whole joint trees,
  go to different threads, each body taking its pushes in the same order as on one thread, so the
  results are the same to the bit with any number of workers. With that and work kept from one
  pass to the next, 100 ragdolls standing on their motors step in about 6 ms instead of 26 on an
  i7-1260P (18 to 21 ms on one thread), and ragdolls and chains are faster on one thread too.
- `new World({ gravity })`, with `world.gravity`, `world.bodyCount`, `world.step(dt)` and
  `world.destroy()`. A step is exactly `dt` seconds of semi-implicit Euler: gravity for dynamic
  bodies, velocity for dynamic and kinematic ones.
- Bodies: `world.addBody`, `world.setBody`, `world.bodyOf`, `world.remove` and `world.body(id)`.
  Box, sphere and capsule shapes, with mass from the shape's volume and a density (water's by
  default) unless a mass is given. Dynamic, static and kinematic types.
- `Body` handles: `id`, `slot`, `world`, `alive`, `mass`, read-only copies of `position`,
  `rotation`, `velocity` and `angularVelocity`, and the chaining setters `setPosition`,
  `setRotation`, `setAxisAngle`, `setEuler`, `setVelocity` and `setAngularVelocity`.
- `world.transforms` and `world.previous`: every body's position and rotation as one
  `Float32Array`, now and before the last step, for any renderer to copy and interpolate.
- Ids that can never reach the wrong body: a 24-bit slot and a 29-bit generation in one exact
  number. Storage that grows as bodies are added and shrinks as they go.
- Bit-identical results on every machine: nothing in Bearing calls an implementation-approximated
  function, and rotations from angles use Bearing's own sine and cosine.
- Every error names its call, its option, what it must be and what it got, and an unknown option
  suggests the nearest real one.
- Inertia from the shape and mass, about the body's own axes, or an `inertia` option to give your
  own; `body.inertia` reads it.
- Lopsided bodies tumble as real ones do: a box spun about its middle axis flips over. A step
  carries angular momentum across exactly, so it is kept to rounding, and energy can only fall,
  so a fast spin never blows up.
- Forces and impulses: `body.applyForce(force, point)` and `body.applyTorque(torque)` act for the
  next step; `body.applyImpulse(impulse, point)` and `body.applyAngularImpulse(impulse)` act at
  once. Static and kinematic bodies are not moved by them.
- Collision. Every pair of box, sphere and capsule gets exact contact points, found before the
  shapes touch, and a soft-step solver keeps them apart: bodies rest, stack, slide and bounce. A
  210-box pyramid stands within a tenth of a millimetre of where it was built (contact points keep
  their names from step to step even where faces line up exactly, so each keeps what it carried
  over); a box on a slope holds until tan θ
  passes its friction and then slides at exactly g (sin θ − μ cos θ); balls with restitution 1 keep
  their momentum and energy. Kinematic bodies push dynamic ones and carry what stands on them.
- Body options `friction` (0.5), `restitution` (0), `damping`, `angularDamping` and `gravityScale`.
  Friction mixes as a geometric mean, restitution as the larger. Friction is worked out once for
  each contact, at the centre of its points, with turning about the normal resisted by the
  points' spread (Box3D's way). Friction that holds also pulls
  back any slip the solver let through, so a settled heap stays where it settled and goes to
  sleep: the benchmark's 1,000 boxes were 883 awake for good, at 45 ms a step, and now all sleep.
- `world.substeps` (8), the one solver setting, measured rather than chosen: the fewest that keep
  the pyramid within half a box's tolerance.
- Every contact tolerance comes from the size of the bodies touching (a two-hundredth of the
  smaller one's thinnest size, about a pixel), so a 1 cm marble and a 50 m building both settle
  with nothing retuned.
- Thousands of bodies: a broadphase finds which bodies might touch without testing every pair.
  Bodies sit in a tree of boxes, and only a body that moves out of its box is looked up again, so
  a pile at rest costs almost nothing to keep. No world bounds and nothing to size.
- Body options `layers` and `mask`: 32 collision layers as bits. Two bodies collide when each one's
  layers are in the other's mask; by default everything collides with everything.
- Sleeping. Touching bodies form islands, and an island whose bodies have all strayed less than a
  pixel in every second for a second goes to sleep: left out of every step, at no cost, until
  something disturbs it. Anything that does wakes it, with nothing to call: a touch, any setter,
  force or impulse, `setBody`, removing or moving what it rests on, or changing `world.gravity`.
  10,000 boxes asleep step in a few microseconds. `world.sleeping` (on by default) switches it off,
  and `body.asleep` says whether a body is.
- Balls and capsules roll and spin to a stop. Every contact is a patch as wide as its tolerance,
  which resists rolling and spinning as a real one does: a rolling resistance of 0.01 for any ball
  or capsule, so a ball rolled at 1 m/s rolls 7.1 m and stops, at any size. A fast-rolling ball
  also stays on the floor: the solver now follows a ball's contact by its centre, not by a point
  on its surface that rolled up and away.
- Queries. `world.raycast(origin, direction, options)` finds the nearest body a ray meets, and
  `world.raycastAll` every one, nearest first, each as `{ body, point, normal, distance }`.
  `world.shapeCast(shape, origin, direction, options)` slides a sphere, box or capsule and finds
  the first body it would touch, stopping within a pixel of it and never past it.
  `world.overlap(shape, position, options)` lists the bodies a shape placed there overlaps. Each
  takes `mask` and `ignore`; rays and casts take `maxDistance`. Queries see the world as it is
  between steps, walk the broadphase's tree, and never change what the world does. 10,000 rays into
  1,000 boxes take 73 ms on the laptop.
- `world.moved(since)`: the slots of the bodies an engine has to draw again since it last drew at
  step `since`, exact however many steps ran in between, so a world of sleeping bodies copies
  nothing. `world.stepCount` counts the steps.
- Triangle meshes and heightfields, for level geometry: `addBody({ shape: 'mesh', vertices,
  indices })` and `addBody({ shape: 'heightfield', heights, columns, spacing })`, static unless
  made kinematic. Every shape collides with their triangles, from either side, and the seams
  between triangles can't be caught on: a box slides across a floor of 800 triangles on exactly
  the path it takes across one box, and a ball rolls over a wavy heightfield without leaving it.
  Only the triangles under a body are looked at, about 17 a step for a box on 100,000 of them.
  Rays, shape casts and overlap tests see them too.
- `readGlb(bytes, options)`: every triangle of a `.glb` file's scene, or of one named node, placed
  as the scene places it, ready for a mesh body. No dependency; a file compressed with Draco or
  meshopt throws, naming the extension to export without.
- A kinematic body moving however slowly stays awake. Measured by how far it had strayed, a 10 m
  platform at 1 cm/s counted as still, fell asleep and stopped; now one is still only when its
  velocities are zero.
- Contact events. `world.contacts(body)` lists the last step's events: a `begin` when two bodies
  start touching, with where, which way and how fast they met, and an `end` when they stop. Read
  after the step, never called back from inside it, so anything can be changed while reading. A
  pair touches when the solver pushed it in the step or the step left it within a pixel. Given a
  body, only its events, turned so it is `a`. Removed bodies' touches end at the next step.
- `world.touching(body)`: every body touching it now, through the broadphase tree, for "is the
  player on the ground?" without a stay event per touching pair per step.
- Sensors: `addBody({ sensor: true })`, any shape and type. A sensor reports what overlaps it and
  pushes nothing; bodies pass through it on exactly the path they'd take without it. Sensors see
  every body but other sensors, never two static bodies, wake nothing, and queries pass through
  them. Events and sensors cost nothing when nothing changes.
- Character bodies: `addBody({ type: 'character' })`, moved at the velocity the game gives it, as a
  kinematic body is, but colliding as a person walking does. It slides along walls, walks up ground
  no steeper than `maxSlope` (45° by default) at the speed it is given, steps up onto anything no
  taller than `stepHeight` (a ninth of its height), stays on the ground going down slopes and
  stairs, falls under gravity in the air and lands, and rides what it stands on. Its velocity reads
  what it did: the part into a wall goes, and landing stops the fall. `world.groundOf(body)` says
  what it stands on, where, and how steep. It reads no input; physics engines call this a character
  controller.
- `lockRotation: [x, y, z]` on any body: the world axes it never turns about. `[true, false, true]`
  keeps a dynamic capsule upright; `[true, true, false]` keeps a 2.5D game's bodies turning only in
  their plane, where they also stay, to the bit.
- Joints: `world.addJoint`, `world.setJoint`, `world.jointOf`, `world.jointCount`, and `Joint`
  handles (`id`, `world`, `alive`, `destroy()`), removed by `world.remove(joint)` or with either of
  their bodies. Fixed, ball, hinge, slider and distance joints, between two bodies or a body and a
  point in the world, placed in world space. Hinges and sliders have limits and motors, ball joints
  a twist limit and a cone, and a distance joint is a rod, a rope or a spring. A joint's angle,
  position and motor are its `a`'s against its `b`. Joined bodies don't collide unless `collide`
  says they do, sleep and wake together, and a character doesn't walk into what is joined to it.
- Chains, ragdolls and bridges are solved exactly: joints that join bodies into trees are solved
  all together every pass (Baraff's linear-time method), so a 100-link chain hangs at its built
  length from the first step and a weight 100 times a link's mass doesn't stretch it. Limits are
  solved against their own joint's pin, so a slammed door stops on its stop.
- Joints have the last word in each pass, after the contacts, so a contact's push on one limb is
  shared with the whole body the joints tie it to. Solved the other way, limbs at rest rattled and
  32 ragdolls never slept; now their joints hold within a tenth of a millimetre and they sleep
  once nothing in them still swings.
- A chain hung from a turning kinematic body and swept into a post, other chains or a heap of
  boxes passes through or pushes past them instead of being flung: a tree of joints held to
  something that can't move, while it touches anything, starts each substep from none of last
  substep's impulses, which no longer balanced the contacts', and its bodies are no longer caught
  alone at a wall.
  Eight links on a plate turning at 0.5 to 10 rad/s, among hanging chains and boxes, now go no
  faster than 1.75 times the same chain with nothing in its way; before, they were flung past
  1,000 m/s at 1.5 to 7 rad/s.
- A chain whipped round fast, touching nothing, keeps its joints shut. The joints were solved
  with the inertia each body had as the step began, though their anchors follow it as it turns;
  a link spinning a few tenths of a radian a substep took a pull at its end as turning it about
  its own length. Eight links on a plate turning at 10 rad/s opened their joints by 4.9 m; now
  26 mm. The joints now take each body's inertia where it has turned to; the contacts keep the
  step's.
- A long box lying on one slope of a ridge, an end past the crest, rests there. Its centre was
  below the far slope's plane, carried back under it, so that slope's triangles were touched from
  below and pressed it 0.3 m down into the slope it lay on: wedged, it took up to 15 s to sleep
  on a mesh and a heightfield alike (22 and 21 of 300 drops of a 2 m box had such a contact; now
  none, and the slowest sleeps in 5.4 and 7.9 s). A box's or hull's part over a triangle now
  decides the side when the triangle's own face stands in for the shape's.
- A heightfield has one side: it is ground, and pushes everything under its surface up out of it,
  along its own +y, which turns with the body, so a heightfield turned over is a ceiling. Two-sided,
  a body pressed in past its centre was pushed down through it by a triangle beside it whose plane
  passed over that centre: a rock at the bottom of a 288-body heap fell through the ground for good.
  Meshes keep two sides. A heightfield given negative heights and gravity up to stand for a ceiling
  now needs turning over instead.
- A box's or hull's corner pressed into a valley of a mesh or heightfield could go through it.
  Under the seam of a fold inward, a corner is over neither face, and each face left it out, so
  nothing held it: a rock pressed into a valley by a heap sank 0.5 m in ten steps. Such a corner
  is now held by both faces.
- Ragdolls with joint friction settle every time. Two boxes lying flat on each other, such as a
  ragdoll's thigh on its own forearm, can swap which face the contact is clipped against from one
  step to the next, and their points were named by that face, so every swap lost the points'
  impulses: the thigh dropped onto the forearm and bounced, and the ragdoll buzzed in place at up
  to 6 cm/s for good. 6 of 20 starts of the 32 joint-friction ragdolls never slept; now all 20
  sleep by 5.9 s. A box contact's points are now named by what of each box made them.
- Hulls lying flat on hulls or boxes keep their contact points' impulses when the face the
  contact is clipped against swaps, as boxes do: their points are now named by what of each
  shape made them. In ragdolls made of hulls, a chest lying flat on the floor buzzed at 5 cm/s
  and kept its ragdoll awake to 21 s in 1 of 12 starts; now all 12 sleep by 6.25 s.
- Each substep's solving pass reads every contact point's separation from the relaxing pass before
  it, which left the bodies exactly where the solving pass finds them, instead of working it out
  again: the same results to the bit, and the 1,000-box pile steps about 4% faster, the pyramid
  5.6%, a pile of hulls 2.7%.
- The contact solve reads its columns once a pass instead of once a manifold: the same results to
  the bit, and the 1,000-box pile steps about 31% faster, the pyramid 40%, hulls 30%, boxes on
  terrain 28% and ragdolls 8%; 10,000 boxes falling, 230 to 170 ms a step on one thread.
- The contacts' preparing and warm-start passes do the same: the pile, the pyramid, hulls and boxes
  on terrain about 9 to 16% faster again, to the bit.
- A contact's separation is measured with its normal turned into each body's frame, once a
  manifold, instead of each point's two anchors turned out of it: two turns a manifold where a box
  face took eight. Equal but for rounding (a pyramid's boxes end within a micrometre of where they
  did); the pile about 2 to 3.5% faster, the pyramid 3.5 to 5%, hulls 1 to 2.5%.
- A box face's four contact points pushing together are solved with the block's elimination written
  out: the same results to the bit, the pyramid about 9% faster and the pile 3%.
- A tree of joints keeps the factor of its equations from one substep to the next while none of its
  bodies has turned more than 0.071 rad since it was made (or it hangs from two or more fixed
  points), instead of factoring them afresh every substep: ragdolls step 11 to 19% faster and
  hanging chains 20 to 26%. Joints hold as before, within a few tenths of a millimetre; ragdolls
  with joint friction settle about 0.7 s later (5.6 to 6.3 s).
- The world and its contact store name every column when they are made, instead of adding them in a
  loop by computed name, which left both as hash tables in V8, every read of a column a lookup.
  The same results to the bit, and every scene faster: the pile and pyramid about 20 to 25%, hulls
  23 to 29%, terrain 15 to 19%, raycasts 11 to 14%, ragdolls 9%. A loaded world is made the same
  way, and a test fails if any of its stores falls back to a hash table.
- Hulls skip the separating axes that can't win (Catto's inscribed spheres): each hull keeps the
  radius of a ball inside it, and a face, or an edge along its whole arc, that the ball proves comes
  out below the best face already measured isn't measured. The same results to the bit. On 1,000
  rocks, 79% of face tests and 91% of edge pairs are skipped, and 70% of rocks' edge axes against
  terrain triangles: hulls on terrain step 21 to 28% faster, the rock pile 1 to 2%. Saved worlds
  are now format 6.
- Every pair of boxes, balls, capsules and hulls keeps its contact from step to step while its two
  bodies barely move against each other, not only pairs with a hull, and a pair still touching
  keeps it until either body has moved half a contact tolerance against the other, so a kept
  contact's depth is never off by more than a fresh one may be. On the settling 1,000-box pile,
  72% fewer contacts are found afresh, and the pile and pyramid step 8 to 10% faster. A jointed
  body's contacts are always found afresh: a ragdoll's light limbs rock onto corners a kept contact
  misses. The workers leave such pairs alone instead of finding a contact that would be thrown away.
- Part of an island can stop while the rest of it moves: a body stopped for a second, whose
  neighbours and theirs are too, is frozen, its contacts with frozen and static bodies left
  unsolved, and the whole frozen piece starts again as soon as anything within two contacts of it
  moves or is set by hand. The settling 1,000-box pile solves 73% of the contact points it did,
  its 15 s take 19% less time (the last 5 s 62% less), and it is all asleep at 12.5 s instead of
  14. With both, the pile's 15 s take 35% less time (8.4 to 5.5 s) and it is all asleep at 10.5 s.
  Saved worlds are now format 7.
- Pose motors: a joint's motor can drive to a `target`, a hinge's angle, a slider's position, or
  a ball joint's turn of `a` against `b`, as a spring with a `frequency` and `dampingRatio` (as a
  distance joint's), no stronger than `motorForce` (0 is a motor off: a target with no force does
  nothing). Solved inside the step, so it is steady however stiff: a knocked limb springs back at
  its frequency (1.00008 s at 1 Hz), a motor too weak for its load gives, and the benchmark's
  ragdoll stands on its own feet with every joint driven to its pose, within 0.32 mm for 10 s. A
  hinge's or slider's `motorSpeed` with a target is how fast the target moves, so one moved each
  step is followed without lagging (1.4e-7 rad against a step's turn without). A new `'rotation'`
  joint holds how `a` is turned against `b`, or the world, leaving it free to move, or with a
  motor drives that turn, its `cone` a hard stop: a ragdoll's pelvis kept upright this way stands
  through a 60 N·s shove that topples it without. Joints with no target keep their bits. Saved
  worlds are now format 8.
- Joint forces: `joint.force` and `joint.torque`, read after a step: the mean force (N) and
  torque (N·m, about its anchor on `a`) the joint pushed `a` with over the step, everything it did
  counted, as games need to break joints. Every impulse is counted along the row it was solved
  with, in every pass, so a jerk shows in full: a 1 kg ball dropped 0.9 m onto a rope reads 255 N
  in the step it goes taut, and 9.81 N hanging. A sleeping joint keeps its last. The same with any
  number of workers. Saved worlds are now format 9.
- Joint friction: `friction` on ball joints, hinges and sliders, the most torque (N·m) or force
  (N) the joint resists turning or sliding with, as a stiff hinge does. A hinge's or slider's is
  its motor held at speed 0, to the bit; a ball joint's resists turning every way alike. 32 ragdolls
  with 1 N·m on every joint all sleep within 6 s, where without it 286 of their 352 parts still
  swing at 12 s. None by default. Saved worlds are now format 5.
- Fixed: a hinge's or slider's motor turned off with `setJoint(joint, { motorForce: 0 })` went on
  pushing as hard as it last had, at every substep: a wheel kept speeding up.
- `world.remove(handle)` takes a body or a joint; its error is now `remove: handle must be a Body or
  a Joint, got …`.
- Bearing's own `atan` and `atan2` in `core/math.js`, exact operations only, within 1 ulp of
  `Math.atan2`, for joint angles that are the same on every machine.
- Fast bodies meet where they would meet. A pair not yet touching that moves against itself by
  more than its tolerance in a step is asked when its shapes would touch, following each body's
  velocity, gravity and spin (conservative advancement), and gets its contact at that moment, or
  none. A ball passing a corner with room to spare, or through a gap wider than itself, keeps its
  velocity exactly, where before it could be stopped at any speed; a 10 cm rod at 200 m/s spinning
  at up to 80 rad/s stops on a 2 cm wall, where before it passed 28 times in 50. Nothing to flag
  and no option; pairs at rest never ask.
- Nothing fast goes through. A body struck hard off its centre is spun up within a substep and
  turned through a thin wall where its contacts don't reach: rods turned any way went through a
  1 cm wall 57 times in 100. Now, after the solve, a body whose centre moved more than half its
  thinnest size sweeps a small ball at its centre along its path, against everything but other
  fast bodies, as they end the step; if the ball meets something, the body goes back to where it
  did, with its velocity into the surface returned as restitution would. Rods, cubes and planks
  turned any way, spinning or not, at 50 to 500 m/s, now pass none of a thin wall, a mesh, a
  heightfield or a thin plate floating free.
- A body other than a sphere spins at most half a turn a step, π / dt rad/s, 188 rad/s at 60 Hz.
  Faster, its contacts missed the sides it turned onto: a 10 cm rod spun at 400 rad/s gained energy
  from them until it reached 9,600 rad/s, and a chain of thin boxes whipping its end blew apart.
- Contact events: a touch the step couldn't foresee now also includes a spinning box meeting with a
  corner its contact didn't hold, and comes a step late like the others.
- Fixed: GJK called two shapes 0.22 mm apart touching when its last four points lay flat, which made
  a rod's time of impact stop short.
- Convex hulls: `shape: 'hull'` with `vertices`, any points, three numbers each. The hull is the
  smallest convex solid round them (quickhull), with points inside it or on its edges and faces
  dropped and faces lying in one plane merged, so a cube's 8 corners make 6 square faces and a cube
  made as a hull stacks exactly as a box does. Its mass, centre of mass and inertia are exact.
  Hulls collide with every shape, meshes and heightfields included, by separating axes and
  clipping.
- Compound bodies: `shape: 'compound'` with `parts`, boxes, spheres, capsules and hulls placed from
  the body's origin as one rigid body, each with its own `density` if given. Their masses,
  centres and inertias are summed exactly.
- A body's centre of mass can be off its origin: a hull's and a compound's are worked out, and the
  body turns about it. `body.centerOfMass` says where it is in the world. `position` and
  `world.transforms` stay at the origin, so a renderer draws a model where its file puts it.
  `velocity` is the centre of mass's. A lopsided body's inertia is about its principal axes,
  found exactly when it is made, and `body.inertia` gives the moments about them.
- `world.save()` and `World.load(data)`: the whole world as plain, JSON-safe data, and back, so a
  loaded world steps exactly as the saved one would have, to the bit, with the same ids. For
  replays, tests, checkpoints and bug reports that reproduce.
- `world.debugLines(options)`: the world as line segments in one `Float32Array`, nine numbers each
  (two ends and a colour), for any engine to draw: collision shapes, the last step's contacts,
  joints, and the broadphase's boxes.
- Hulls always touch where they overlap: the face a hull is clipped against is taken at its
  deepest corner, and a face that ties with a better axis is used only if its points hold the
  overlap. Before, two hulls overlapping by centimetres could get no contact for a step, and heaps
  of hulls kicked and stayed awake (4 of 16 never slept in 60 s; now all sleep, median 6 s).
- Hulls on meshes and heightfields take the same face at their deepest corner. Before, a rock
  pressed into terrain got points 1 to 4 cm shallower than it was, or none (thousands of cases
  over a few heaps; now tens, all fast arrivals or corners under a valley seam).
- A body on a mesh or heightfield steps the same whatever was stepped before it. Contacts on
  terrain took the carried-back offsets of the last pair that had an impact, even one in another
  world, so a box on a mesh could rest 6 mm from where it rests in a fresh process.
- Hull pairs that have barely moved against each other since the last step keep their contact
  instead of finding it again, within the tolerance a fresh one is found to: a pile of 1,000 hulls
  steps 30% faster. Saved worlds are now format 3; format 2 data is refused.
- Bodies no longer rock for good. A contact keeps at most four points, and they were chosen for
  how far apart they lie, so points a few millimetres off could push out the one a body rested
  on; the body sank there unheld, the overlap was pushed back out when the points changed, and
  each push lifted it. Points pressing are now chosen first, then those touching, then the rest,
  and a hull's deepest point is left out only while the four kept hold its weight up. Rocks and
  boxes on a bumpy mesh: 17 of 48 heaps never slept, now none (median 36 s to 7 s); the
  1,000-box pile's one never-sleeping start now sleeps in 11 s. A rock lying face to face on another,
  its weight over the middle of three pressed points, rocked between them; the four now start
  from the pressed point under its weight.
- Boxes slide over rippled meshes and heightfields as they should. Every fold between triangles,
  however slight, could give a contact whose normal pointed along the ground, and a sliding box
  hit it like a wall: on ripples of half a millimetre, a box 2° past friction's hold slid 0.9 m
  in 4 s where it should slide 3.06; now 3.14. A contact at a triangle's edge now counts only if
  its normal lies between that face and the face across the edge, as a contact at a seam already
  did. Saved worlds are now format 4 (meshes keep each edge's fold); format 3 data is refused.
- Friction at its limit pushes straight against the slide. A corner resting alone turns as it is
  pushed, and friction scaled straight down to its limit leaned up to 22° off the slide, so a box
  on rippled ground half a degree short of friction's hold crept on for good; now it stays put.
- A contact's points are pushed apart together, as one small problem solved exactly, instead of
  one after another four times over: the 1,000-box pile steps 5 to 6% faster and the pyramid 13 to
  17%, with stacks, slopes and sleeping as before.
- Contacts are solved in groups that share no moving body, ready for solving on several threads
  later. Results change in their last digits, and are still the same on every machine.
- `new World({ workers })` and `world.workers`: a world shares each step's contact work with
  threads of its own, `'auto'` by default, with results the same to the bit as on one thread. A
  landing pile of 1,000 boxes steps 3.2 times as fast on an i7-1260P laptop, 8,000 boxes 3.4
  times. They start by themselves once a world has enough contacts, sleep between steps, and end
  with `destroy()`. In a browser they need a cross-origin isolated page; without one, or with
  `workers: 0`, everything runs on one thread as before. Joints are solved on one thread, and the workers
  sleep through them rather than spin: 32 ragdolls stepped 1.6 times as slow with workers as
  without before that, and now 1.15 times.
- The `centerOfMass` option, `[x, y, z]` in the body's own frame or `null` for the shape's, moves
  any body's centre of mass, as a car's is lowered so it doesn't roll over.
- Documentation. The README says what Bearing is and isn't, with the measured comparison against
  Rapier, Jolt and cannon-es, its method and machine, where Bearing is ahead and where it is
  behind, how to load it before it is on npm, what its determinism promises and how that is
  tested, and its limitations. `docs/SIDE-BY-SIDE.md` has the same small program in Bearing,
  Rapier, cannon-es and Jolt, and what each asks for that Bearing works out. `docs/ENGINES.md`
  shows how Three.js, Babylon.js, PlayCanvas, Pixi and Winding copy `world.transforms` onto their
  objects, between steps and only for what moved. Every example in them runs in a test
  (`test/engines.test.js` runs the engine examples against stand-ins for each engine).
- Fixed in the API reference: `world.workers` now says the workers solve joints too, and when;
  a falling object of any shape is a hull or compound (it said compounds were still to come); and
  continuous collision doesn't make a sensor see a body that passes through it within a step (it
  said a later version would).

[Unreleased]: https://github.com/getlowarc/bearing/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/getlowarc/bearing/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/getlowarc/bearing/compare/v0.14.0...v1.0.0
[0.14.0]: https://github.com/getlowarc/bearing/releases/tag/v0.14.0
