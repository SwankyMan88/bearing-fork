// Where two flat shapes touch.
//
// One routine for every pair, because every shape is the same thing: a convex
// CORE of 1, 2 or more corners, and a RADIUS rounding it. A box or a polygon
// is its corners with radius 0; a circle one point; a capsule a line. So "how
// far apart" is always the distance between cores less the two radii, and
// there are no special cases by shape (Box2D 3 builds its capsules and rounded
// polygons the same way).
//
// A contact is a MANIFOLD: one direction, the normal, from a to b, and one or
// two points, each with a separation, negative when overlapping. Two points
// because a box lying on a floor is held at two places: at one it would tip.
// Points a little apart are kept too, "speculative" ones: the solver lets them
// close to exactly touching, so a fast body stops at a surface, not past it.
//
// Finding it, three cases:
//
//   apart     the cores don't overlap, so the nearest points of the two say
//             the normal. If the two are near flat against each other, a side
//             of one is the reference: clipped, below, for two points. Else
//             they meet corner on, at one point.
//   overlap   the side of least overlap is the reference (separating axes:
//             two convex shapes are apart if some side of one has every
//             corner of the other past it, and if none does, the side that
//             comes nearest says how to part them).
//   clip      the reference side's slab cuts the other shape's most facing
//             side down to the part over it. Its two ends are the points.
//
// Points are named by the corner they sit at, whichever shape is the
// reference, so a point keeps its name, and its warm start, when two near-flat
// shapes swap which is the reference (the buzzing that cost the 3D solver a
// ragdoll, CLAUDE.md, "Whichever face is the reference").

/** A shape's core, in its body's frame, with the centre of mass at (0, 0). */
export class Core {
  /** @param corners flat [x0, y0, ...], turning from +x to +y; @param radius rounding, px. */
  constructor(corners, radius) {
    const n = corners.length / 2;
    this.n = n;
    this.x = new Float64Array(n);
    this.y = new Float64Array(n);
    // A side's outward normal: side k runs from corner k to the next. A
    // capsule's two sides are its line, each way; a point has none.
    this.nx = new Float64Array(n);
    this.ny = new Float64Array(n);
    for (let k = 0; k < n; k++) { this.x[k] = corners[2 * k]; this.y[k] = corners[2 * k + 1]; }
    if (n >= 2) {
      for (let k = 0; k < n; k++) {
        const j = (k + 1) % n, dx = this.x[j] - this.x[k], dy = this.y[j] - this.y[k], l = Math.sqrt(dx * dx + dy * dy);
        this.nx[k] = dy / l; this.ny[k] = -dx / l;
      }
    }
    this.radius = radius;
    // Its centre among the body's, how far it reaches from there, and its
    // thinnest width: for telling a compound's parts apart, and for tolerances.
    let ox = 0, oy = 0;
    for (let k = 0; k < n; k++) { ox += this.x[k]; oy += this.y[k]; }
    this.ox = ox / n; this.oy = oy / n;
    let far = 0;
    for (let k = 0; k < n; k++) far = Math.max(far, (this.x[k] - this.ox) * (this.x[k] - this.ox) + (this.y[k] - this.oy) * (this.y[k] - this.oy));
    this.reach = Math.sqrt(far) + radius;
    let width = Infinity;
    if (n >= 3) {
      for (let k = 0; k < n; k++) {
        let most = 0;
        for (let j = 0; j < n; j++) most = Math.max(most, -((this.x[j] - this.x[k]) * this.nx[k] + (this.y[j] - this.y[k]) * this.ny[k]));
        width = Math.min(width, most);
      }
    }
    this.size = n >= 3 ? width + 2 * radius : 2 * radius;
  }
}

/** One side of a pair: its core, placed. World corners and normals are scratch: a step isn't re-entered. */
class Placed {
  constructor() {
    this.core = null; this.n = 0; this.r = 0;
    this.x = new Float64Array(8); this.y = new Float64Array(8);
    this.nx = new Float64Array(8); this.ny = new Float64Array(8);
  }

  place(core, px, py, c, s) {
    const n = core.n;
    if (n > this.x.length) {
      this.x = new Float64Array(n); this.y = new Float64Array(n);
      this.nx = new Float64Array(n); this.ny = new Float64Array(n);
    }
    this.core = core; this.n = n; this.r = core.radius;
    const x = core.x, y = core.y, nx = core.nx, ny = core.ny;
    for (let k = 0; k < n; k++) {
      this.x[k] = px + c * x[k] - s * y[k];
      this.y[k] = py + s * x[k] + c * y[k];
      this.nx[k] = c * nx[k] - s * ny[k];
      this.ny[k] = s * nx[k] + c * ny[k];
    }
  }
}

const A = new Placed(), B = new Placed();

/** What collide() finds: up to two points. */
export class Manifold2 {
  constructor() {
    this.count = 0;
    this.nx = 0; this.ny = 0;   // a to b
    this.x = new Float64Array(2); this.y = new Float64Array(2);   // midway between the two surfaces
    this.separation = new Float64Array(2);
    this.id = new Int32Array(2);
  }
}

// A point's name: the corner it sits at, and whose. a's corners from 0, b's from OF_B.
export const OF_B = 65536;

/** The side of `p` that every corner of `q` stands furthest past, as bestSide, and how far; -Infinity with no sides. */
let bestSide = -1;
function furthest(p, q) {
  let best = -Infinity;
  bestSide = -1;
  if (p.n < 2) return best;
  for (let k = 0; k < p.n; k++) {
    const nx = p.nx[k], ny = p.ny[k], ox = p.x[k], oy = p.y[k];
    let least = Infinity;
    for (let j = 0; j < q.n; j++) {
      const d = (q.x[j] - ox) * nx + (q.y[j] - oy) * ny;
      if (d < least) least = d;
    }
    if (least > best) { best = least; bestSide = k; }
  }
  return best;
}

/**
 * How far every corner of `q` stands past either end of the line `p`: a line's
 * two sides don't cover what lies beyond its tips, as a polygon's sides do, so
 * two capsules end to end have no side between them. -Infinity for any other core.
 */
function pastEnds(p, q) {
  if (p.n !== 2) return -Infinity;
  const dx = p.x[1] - p.x[0], dy = p.y[1] - p.y[0], l = Math.sqrt(dx * dx + dy * dy), tx = dx / l, ty = dy / l;
  let beyond = Infinity, before = Infinity;
  for (let j = 0; j < q.n; j++) {
    const up = (q.x[j] - p.x[1]) * tx + (q.y[j] - p.y[1]) * ty, down = (p.x[0] - q.x[j]) * tx + (p.y[0] - q.y[j]) * ty;
    if (up < beyond) beyond = up;
    if (down < before) before = down;
  }
  return beyond > before ? beyond : before;
}

// The nearest points of two cores: nearX/Y on a, on b.
let nearAx = 0, nearAy = 0, nearBx = 0, nearBy = 0, nearCornerA = -1, nearCornerB = -1;

/** Shortest squared distance so far, from corners of `p` to the sides of `q`; `swap` when p is b. */
function corners(p, q, swap, best) {
  for (let i = 0; i < p.n; i++) {
    const x = p.x[i], y = p.y[i];
    // A core of one corner has no sides, but a corner to reach.
    const sides = q.n === 1 ? 1 : q.n;
    for (let k = 0; k < sides; k++) {
      const j = (k + 1) % q.n, ox = q.x[k], oy = q.y[k], dx = q.x[j] - ox, dy = q.y[j] - oy;
      const len = dx * dx + dy * dy;
      let t = len > 0 ? ((x - ox) * dx + (y - oy) * dy) / len : 0;
      let corner = -1;
      if (t <= 0) { t = 0; corner = k; } else if (t >= 1) { t = 1; corner = j; }
      const qx = ox + t * dx, qy = oy + t * dy, ex = x - qx, ey = y - qy, d = ex * ex + ey * ey;
      if (d < best) {
        best = d;
        if (swap) { nearBx = x; nearBy = y; nearAx = qx; nearAy = qy; nearCornerB = i; nearCornerA = corner; }
        else { nearAx = x; nearAy = y; nearBx = qx; nearBy = qy; nearCornerA = i; nearCornerB = corner; }
      }
    }
  }
  return best;
}

/**
 * Cuts q's side most against the unit normal (nx, ny) by the slab of p's side
 * `side`, and writes the ends within `margin`. `flip` when p is b: the
 * manifold's normal stays a to b. Returns the points written.
 */
function clip(p, q, side, nx, ny, flip, margin, m) {
  const v1 = side, v2 = (side + 1) % p.n, x1 = p.x[v1], y1 = p.y[v1], x2 = p.x[v2], y2 = p.y[v2];
  // The side of q facing it most. A one-corner q has no side.
  let i1 = 0, i2 = 0;
  if (q.n >= 2) {
    let least = Infinity, k = 0;
    for (let e = 0; e < q.n; e++) {
      const d = q.nx[e] * nx + q.ny[e] * ny;
      if (d < least) { least = d; k = e; }
    }
    i1 = k; i2 = (k + 1) % q.n;
  }
  let ax = q.x[i1], ay = q.y[i1], bx = q.x[i2], by = q.y[i2];
  let idA = i1 + (flip ? 0 : OF_B), idB = i2 + (flip ? 0 : OF_B);   // q's corners
  const pOwner = flip ? OF_B : 0;
  // Along p's side, from x1 to x2.
  const tx = x2 - x1, ty = y2 - y1;
  const lo = 0, hi = tx * tx + ty * ty;
  let ta = (ax - x1) * tx + (ay - y1) * ty, tb = (bx - x1) * tx + (by - y1) * ty;
  if (q.n >= 2) {
    if (ta < lo && tb < lo) return 0;
    if (ta > hi && tb > hi) return 0;
    // Where the slab's edges cut it, a point takes the name of p's corner there.
    const cut = (limit, from, to) => (limit - from) / (to - from);
    if (ta < lo) { const f = cut(lo, ta, tb); ax += f * (bx - ax); ay += f * (by - ay); ta = lo; idA = v1 + pOwner; }
    else if (ta > hi) { const f = cut(hi, ta, tb); ax += f * (bx - ax); ay += f * (by - ay); ta = hi; idA = v2 + pOwner; }
    if (tb < lo) { const f = cut(lo, tb, ta); bx += f * (ax - bx); by += f * (ay - by); tb = lo; idB = v1 + pOwner; }
    else if (tb > hi) { const f = cut(hi, tb, ta); bx += f * (ax - bx); by += f * (ay - by); tb = hi; idB = v2 + pOwner; }
  }
  m.nx = flip ? -nx : nx; m.ny = flip ? -ny : ny;
  let count = 0;
  const write = (x, y, id) => {
    const c = (x - x1) * nx + (y - y1) * ny, s = c - p.r - q.r;
    if (s > margin) return;
    // Midway between the two surfaces.
    const back = (c - p.r + q.r) * 0.5;
    m.x[count] = x - nx * back; m.y[count] = y - ny * back;
    m.separation[count] = s; m.id[count] = id; count++;
  };
  write(ax, ay, idA);
  if (q.n >= 2) write(bx, by, idB);
  return count;
}

/**
 * The manifold between two cores placed at (px, py) turned (c, s): into m, and
 * its point count. `margin` is how far apart a point may be and still be kept;
 * `tolerance` how near flat two sides must lie to be taken as flat. Nothing
 * here allocates, but for the scratch of a polygon past eight corners.
 */
export function collide(coreA, ax, ay, ac, as, coreB, bx, by, bc, bs, margin, tolerance, m) {
  A.place(coreA, ax, ay, ac, as);
  B.place(coreB, bx, by, bc, bs);
  return placed(ax, ay, margin, tolerance, m);
}

/** As collide(), with b a bare line from (x1, y1) to (x2, y2): a side of a level. */
export function collideSide(coreA, ax, ay, ac, as, x1, y1, x2, y2, margin, tolerance, m) {
  A.place(coreA, ax, ay, ac, as);
  const dx = x2 - x1, dy = y2 - y1, l = Math.sqrt(dx * dx + dy * dy), nx = dy / l, ny = -dx / l;
  B.n = 2; B.r = 0;
  B.x[0] = x1; B.y[0] = y1; B.x[1] = x2; B.y[1] = y2;
  B.nx[0] = nx; B.ny[0] = ny; B.nx[1] = -nx; B.ny[1] = -ny;
  return placed(ax, ay, margin, tolerance, m);
}

/**
 * After collideSide() found its normal on the line's closed side: the manifold
 * again, the line's open side the reference, whatever the corners say. A heap
 * can press a small body past a floor line, centre and all, and a one-sided
 * line that let go then would let it fall for good: it goes on being pushed
 * back out the way it came.
 */
export function fromFront(margin, m) {
  return (m.count = clip(B, A, 0, B.nx[0], B.ny[0], true, margin, m));
}

function placed(ax, ay, margin, tolerance, m) {
  const radii = A.r + B.r;
  const sa = furthest(A, B), sideA = bestSide, sb = furthest(B, A), sideB = bestSide;
  // A's side unless B's is better by more than a sliver: flipping back and
  // forth at a tie is what loses warm starts, names or no names.
  const useB = sb > sa + 0.1 * tolerance;
  const best = useB ? sb : sa;
  if (best - radii > margin) return (m.count = 0);

  if (best > 0 || (A.n === 1 && B.n === 1) || pastEnds(A, B) > 0 || pastEnds(B, A) > 0) {
    // Cores apart: their nearest points say the normal.
    let d = corners(A, B, false, Infinity);
    d = corners(B, A, true, d);
    d = Math.sqrt(d);
    if (d - radii > margin) return (m.count = 0);
    if (d > 0) {
      // Near flat: the side stands within a tolerance of the true distance,
      // so its normal is off by less than can be seen, and it gives two points.
      if (A.n >= 2 && B.n >= 2 && d - best <= tolerance) {
        const p = useB ? B : A, q = useB ? A : B, side = useB ? sideB : sideA;
        // Nothing over the side, or nothing as near as the corners are, means
        // they meet past its end: then corner on.
        const count = clip(p, q, side, p.nx[side], p.ny[side], useB, margin, m);
        const least = count === 2 && m.separation[1] < m.separation[0] ? m.separation[1] : m.separation[0];
        if (count > 0 && least <= d - radii + tolerance) return (m.count = count);
      }
      const nx = (nearBx - nearAx) / d, ny = (nearBy - nearAy) / d, s = d - radii;
      // On a's surface and on b's, and midway.
      const hx = nearAx + nx * A.r, hy = nearAy + ny * A.r, jx = nearBx - nx * B.r, jy = nearBy - ny * B.r;
      m.nx = nx; m.ny = ny;
      m.x[0] = (hx + jx) * 0.5; m.y[0] = (hy + jy) * 0.5;
      m.separation[0] = s;
      m.id[0] = nearCornerA >= 0 ? nearCornerA : nearCornerB + OF_B;
      return (m.count = 1);
    }
  }
  // Cores overlap: the side of least overlap. A one-corner core has no sides,
  // so a point inside a shape is parted by the shape's side.
  if (sideA < 0 && sideB < 0) {
    // Two points at the same place: any way will do, and +x is the same every time.
    m.nx = 1; m.ny = 0; m.x[0] = ax; m.y[0] = ay; m.separation[0] = -radii; m.id[0] = 0;
    return (m.count = 1);
  }
  const p = useB || sideA < 0 ? B : A, q = p === B ? A : B, side = p === B ? sideB : sideA;
  return (m.count = clip(p, q, side, p.nx[side], p.ny[side], p === B, margin, m));
}
