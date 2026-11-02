# Engines

Bearing draws nothing. After each step, every body's position and rotation is in one
`Float32Array`, [`world.transforms`](API.md#world-transforms), and an engine copies them onto the
objects it draws. This page shows that copy for Three.js, Babylon.js, PlayCanvas, Pixi and Winding.

These are examples for your own code, not part of the package: Bearing imports nothing from any
engine, and no engine's code is in it. Each is a function that takes the world, the engine's
objects, and an array of the scene object that draws each body, by its [`slot`](API.md#body-slot):
`objects[body.slot] = mesh` when you make the two. Each does three things:

- **Steps the world at a fixed rate.** Bearing takes exactly the step it is given, and the same
  step every time keeps a simulation steady and repeatable. Winding steps at a fixed rate itself;
  for the others, `advance` below turns each frame's time into whole steps.
- **Draws between the last two steps.** A frame usually falls between two steps, so each body is
  drawn that far from where it was, [`world.previous`](API.md#world-previous), to where it is,
  [`world.transforms`](API.md#world-transforms): smooth at any frame rate, a step behind at most.
- **Copies only what moved.** [`world.moved(since)`](API.md#world-moved) lists the slots of the
  bodies that moved since the last frame drawn, so a world of sleeping bodies copies nothing.

Every one of them is run by `test/engines.test.js`, against stand-ins that have only the members
each example uses, named as the engine names them. That checks the copying, not the engines: each
engine's own docs are the authority on its API. **Versions followed:** Three.js r186, Babylon.js
9.30, PlayCanvas 2.23, PixiJS 8 and Winding 1.9.

## The fixed step, and the blend

All but Winding use these two. `advance` is the usual fixed-step loop (Glenn Fiedler's "Fix Your Timestep!"); the
quarter-second cap is so that a tab hidden for a minute catches up with a quarter of a second's
steps, 15, rather than 3,600 at once.

```js
const STEP = 1 / 60;
let owed = 0;

// Steps the world for as many whole steps as `seconds` makes, with what is
// left over carried to the next frame. Returns how far this frame sits
// between the last step and the next, from 0 to 1.
function advance(world, seconds) {
  owed += Math.min(seconds, 0.25);
  while (owed >= STEP) {
    world.step(STEP);
    owed -= STEP;
  }
  return owed / STEP;
}

// Where the body in `slot` is drawn, `alpha` of the way from the step before
// to the last, into `out` as x, y, z and the quaternion x, y, z, w. The
// rotation is blended the short way round, and normalized.
function blend(world, slot, alpha, out) {
  const t = world.transforms, p = world.previous, o = slot * 7;
  for (let k = 0; k < 3; k++) out[k] = p[o + k] + (t[o + k] - p[o + k]) * alpha;
  const dot = p[o + 3] * t[o + 3] + p[o + 4] * t[o + 4] + p[o + 5] * t[o + 5] + p[o + 6] * t[o + 6];
  const s = dot < 0 ? -1 : 1;
  let length = 0;
  for (let k = 3; k < 7; k++) {
    out[k] = s * p[o + k] + (t[o + k] - s * p[o + k]) * alpha;
    length += out[k] * out[k];
  }
  length = Math.sqrt(length);
  for (let k = 3; k < 7; k++) out[k] /= length;
  return out;
}
```

## Three.js

An `Object3D`'s `position` and `quaternion` take the numbers as they are: Three.js is right-handed
and y-up, as Bearing is, in metres by convention.

```js
function runThree(world, meshes, renderer, scene, camera) {
  const at = new Float64Array(7);
  let drawn = 0, last = null;
  renderer.setAnimationLoop((time) => {
    const alpha = advance(world, last === null ? 0 : (time - last) / 1000);
    last = time;
    for (const slot of world.moved(drawn)) {
      const mesh = meshes[slot];
      if (mesh === undefined) continue;
      blend(world, slot, alpha, at);
      mesh.position.set(at[0], at[1], at[2]);
      mesh.quaternion.set(at[3], at[4], at[5], at[6]);
    }
    drawn = world.stepCount;
    renderer.render(scene, camera);
  });
}
```

`setAnimationLoop` passes the time in milliseconds; the first frame steps nothing, since there is
no frame before it to measure from.

## Babylon.js

Babylon.js is left-handed by default, so the scene is made right-handed, as Bearing is, with
`scene.useRightHandedSystem = true`; then the numbers go across as they are. A mesh turns by
`rotationQuaternion` only once it has one, so give each mesh one when you make it:
`mesh.rotationQuaternion = new Quaternion()`.

```js
function runBabylon(world, meshes, engine, scene) {
  const at = new Float64Array(7);
  let drawn = 0;
  engine.runRenderLoop(() => {
    const alpha = advance(world, engine.getDeltaTime() / 1000);
    for (const slot of world.moved(drawn)) {
      const mesh = meshes[slot];
      if (mesh === undefined) continue;
      blend(world, slot, alpha, at);
      mesh.position.set(at[0], at[1], at[2]);
      mesh.rotationQuaternion.set(at[3], at[4], at[5], at[6]);
    }
    drawn = world.stepCount;
    scene.render();
  });
}
```

## PlayCanvas

PlayCanvas is right-handed and y-up, as Bearing is. An entity's `setPosition` and `setRotation`
take separate numbers, and place it in the world whatever its parent.

```js
function runPlayCanvas(world, entities, app) {
  const at = new Float64Array(7);
  let drawn = 0;
  app.on('update', (dt) => {
    const alpha = advance(world, dt);
    for (const slot of world.moved(drawn)) {
      const entity = entities[slot];
      if (entity === undefined) continue;
      blend(world, slot, alpha, at);
      entity.setPosition(at[0], at[1], at[2]);
      entity.setRotation(at[3], at[4], at[5], at[6]);
    }
    drawn = world.stepCount;
  });
}
```

`update` gives the frame's time in seconds, and the application draws the frame after it.

## Pixi

Pixi draws in 2D, and Bearing is 3D, so this draws the world from above: Bearing's x across the
screen and its z down it, the height dropped, and each body's turn about y as the sprite's
rotation. Seen from above with x to the right, z does point down the screen, so nothing is
mirrored. `PIXELS` is how many pixels a metre is drawn as: yours to choose.

```js
const PIXELS = 50;

function runPixi(world, sprites, app) {
  const at = new Float64Array(7);
  let drawn = 0;
  app.ticker.add((ticker) => {
    const alpha = advance(world, ticker.deltaMS / 1000);
    for (const slot of world.moved(drawn)) {
      const sprite = sprites[slot];
      if (sprite === undefined) continue;
      blend(world, slot, alpha, at);
      sprite.position.set(at[0] * PIXELS, at[2] * PIXELS);
      // Where the body's own x axis points, seen from above, as an angle on the screen.
      const [qx, qy, qz, qw] = [at[3], at[4], at[5], at[6]];
      sprite.rotation = Math.atan2(2 * (qx * qz - qw * qy), 1 - 2 * (qy * qy + qz * qz));
    }
    drawn = world.stepCount;
  });
}
```

`Math.atan2` is fine here: it is your drawing code, not the simulation, so it can't make two
machines' worlds differ (see [Determinism](API.md#determinism)).

## Winding

Winding steps at a fixed rate itself: `update` is called at 60 Hz, zero or more times a frame, and
`frame` once a frame with how far it sits between the last two steps. So there is no `advance`:
the world steps in `update`. Winding is right-handed and y-up, in metres, as Bearing is, and the
two share their conventions, so the numbers go straight across.

```js
function runWinding(world, nodes, engine, scene, camera) {
  const at = new Float64Array(7), q = [0, 0, 0, 1];
  let drawn = 0;
  engine.run(scene, camera, {
    update: (dt) => world.step(dt),
    frame: (alpha) => {
      for (const slot of world.moved(drawn)) {
        const node = nodes[slot];
        if (node === undefined) continue;
        blend(world, slot, alpha, at);
        node.setPosition(at[0], at[1], at[2]);
        for (let k = 0; k < 4; k++) q[k] = at[3 + k];
        node.setRotation(q);
      }
      drawn = world.stepCount;
    },
  });
}
```

Bearing's own demo (`demo/index.html`) draws this way, with Winding.

## Notes

- **Read `world.transforms` and `world.previous` every frame,** as `blend` does, rather than
  keeping them: both are replaced when the world's storage grows or shrinks, which adding and
  removing bodies can do.
- **A body added or moved by hand** is in `world.moved()` the next time it is asked, and a body
  moved by hand has `previous` moved too, so it is drawn where it lands rather than sliding there.
- **A removed body** isn't listed again. Remove its scene object when you remove the body; its
  slot may go to a body added later, which needs its own.
- **A body's origin** is what `transforms` holds, the point its shape and a model's file are
  measured from, so a model is drawn where its own file puts it, whatever its centre of mass.
