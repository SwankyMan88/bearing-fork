// Types for bearing-physics/2d. Written by hand, as bearing.d.ts is.

/** [x, y]: any array-like of numbers. */
export type Vec2 = ArrayLike<number>;

export type BodyType2D = 'dynamic' | 'static' | 'kinematic';
export type ShapeType2D = 'box' | 'circle' | 'capsule' | 'polygon' | 'compound' | 'tilemap' | 'chain';

/** One piece of a compound, placed from the body's origin. */
export interface Part2D {
  /** Default 'box'. */
  shape?: 'box' | 'circle' | 'capsule' | 'polygon';
  size?: Vec2;
  radius?: number;
  height?: number;
  vertices?: ArrayLike<number>;
  position?: Vec2;
  angle?: number;
  /** kg/px². Default the body's. */
  density?: number;
}

export interface BodyOptions2D {
  /** Default 'dynamic'. */
  type?: BodyType2D;
  /** Default 'box'. */
  shape?: ShapeType2D;
  /** A box's width and height, px. Default [100, 100]. */
  size?: Vec2;
  /** A circle's or capsule's, px. Default 50. */
  radius?: number;
  /** A capsule's, end to end, px. Default 200. */
  height?: number;
  /** A polygon's points, [x0, y0, x1, y1, ...], px: it takes their convex hull. */
  vertices?: ArrayLike<number>;
  /** A compound's parts. */
  parts?: readonly Part2D[];
  /** A tilemap's tile, px. Default [16, 16]. */
  tileSize?: Vec2;
  /** A tilemap's width in tiles. Default 1. */
  columns?: number;
  /** A tilemap's height in tiles. Default 1. */
  rows?: number;
  /** columns x rows ids, row by row from the top-left: 0 is empty. */
  tiles?: ArrayLike<number>;
  /** kg/px². Default 0.1. */
  density?: number;
  /** kg, instead of density. */
  mass?: number;
  /** kg·px². Default from the shape; null follows it again. */
  inertia?: number | null;
  /** Where it balances, px, in its own frame. Default the shape's centre; null is that again. */
  centerOfMass?: Vec2 | null;
  /** 0 or more. Default 0.5. */
  friction?: number;
  /** 0 to 1. Default 0. */
  restitution?: number;
  /** 1/s. Default 0. */
  damping?: number;
  /** 1/s. Default 0. */
  angularDamping?: number;
  /** Default 1. */
  gravityScale?: number;
  /** Which of 32 layers it is in, as bits. Default 1. */
  layers?: number;
  /** Which layers it collides with, as bits. Default 0xffffffff. */
  mask?: number;
  /** Bodies of the same group never collide with each other; any whole number. Default 0, none. */
  group?: number;
  /** Whether it never turns. Default false. */
  lockRotation?: boolean;
  /** The axes it never moves along, x and y. Default [false, false]. */
  lockPosition?: readonly [boolean, boolean];
  /** Its origin, px. Default [0, 0]. */
  position?: Vec2;
  /** Radians. Default 0. */
  angle?: number;
  /** px/s. Default [0, 0]. */
  velocity?: Vec2;
  /** rad/s. Default 0. */
  angularVelocity?: number;
}

/** What world.bodyOf returns: a copy, in the form addBody takes. */
export interface BodyInfo2D {
  type: BodyType2D;
  shape: ShapeType2D;
  size?: [number, number];
  radius?: number;
  height?: number;
  vertices?: number[];
  parts?: Part2D[];
  tileSize?: [number, number];
  columns?: number;
  rows?: number;
  tiles?: Uint32Array;
  density?: number;
  mass?: number;
  /** Absent for a tilemap or chain. */
  inertia?: number | null;
  /** Absent for a tilemap or chain. */
  centerOfMass?: [number, number] | null;
  friction: number;
  restitution: number;
  damping: number;
  angularDamping: number;
  gravityScale: number;
  /** Unsigned. */
  layers: number;
  /** Unsigned. */
  mask: number;
  group: number;
  lockRotation: boolean;
  lockPosition: [boolean, boolean];
  position: [number, number];
  /** Absent for a tilemap or chain. */
  angle?: number;
  /** Absent for a static body. */
  velocity?: [number, number];
  /** Absent for a static body. */
  angularVelocity?: number;
}

export interface WorldOptions2D {
  /** px/s². Default [0, 980]. */
  gravity?: Vec2;
  /** Default 8. */
  substeps?: number;
  /** Whether bodies at rest go to sleep. Default true. */
  sleeping?: boolean;
}

export class World2D {
  constructor(options?: WorldOptions2D);
  /** px/s²: a frozen copy; assign to change it. */
  get gravity(): readonly [number, number];
  set gravity(value: Vec2);
  substeps: number;
  sleeping: boolean;
  readonly bodyCount: number;
  readonly stepCount: number;
  /** x, y, angle, per slot. */
  readonly transforms: Float32Array;
  /** As the last step began. */
  readonly previous: Float32Array;
  addBody(options?: BodyOptions2D): Body2D;
  setBody(body: Body2D, changes: BodyOptions2D): void;
  bodyOf(body: Body2D): BodyInfo2D;
  remove(handle: Body2D): void;
  /** Tile (x, y) of a tilemap, 0 for empty. */
  setTile(body: Body2D, x: number, y: number, id: number): void;
  tileAt(body: Body2D, x: number, y: number): number;
  body(id: number): Body2D;
  /** The slots of bodies that moved since step `since`. */
  moved(since: number): Int32Array;
  step(dt: number): void;
  destroy(): void;
}

export class Body2D {
  readonly world: World2D;
  readonly id: number;
  readonly slot: number;
  readonly alive: boolean;
  readonly asleep: boolean;
  readonly mass: number;
  readonly inertia: number;
  readonly position: readonly [number, number];
  readonly angle: number;
  readonly worldCenterOfMass: readonly [number, number];
  readonly velocity: readonly [number, number];
  readonly angularVelocity: number;
  setPosition(x: number, y: number): this;
  setAngle(radians: number): this;
  setVelocity(x: number, y: number): this;
  setAngularVelocity(radians: number): this;
  /** The velocities that bring its origin to `position`, turned to `angle` (null: as it is), over the next step of `dt` s. */
  moveTo(position: Vec2, angle: number | null, dt: number): this;
  applyForce(force: Vec2, point?: Vec2): this;
  applyTorque(torque: number): this;
  applyImpulse(impulse: Vec2, point?: Vec2): this;
  applyAngularImpulse(impulse: number): this;
  destroy(): void;
}
