// Level geometry: a tilemap, and a chain of lines.
//
// A level isn't a body with one shape: it is touched in many places at once, by
// many bodies, and must not cost for its size. So a body asks only for the bit
// under it, and a pair with a level gives several manifolds.
//
// A TILEMAP is Winding's: `tileSize`, `columns`, `rows`, `tiles`, row by row from
// the top-left, 0 for empty, placed by its top-left corner. A Terraria-sized map
// of 20 million tiles is one body and one array, a body looks at the few cells
// under it, and `setTile` is one store.
//
// SEAMS. Two tiles side by side are two boxes, and a box sliding along a floor of
// boxes catches on the corner of each next one, the "ghost collision" every
// tile game fights. Here tiles aren't boxes. Under a body, the map finds the
// sides that are exposed, solid on one hand and empty on the other, and joins
// neighbouring ones along a row or column into one line. A floor is one line,
// so there is no seam to catch on, and every corner a body meets is a real one.
// A line is only pushed from its open side, so a body can't be sucked through.
//
// A CHAIN is a line of points, one-sided: its front is on the left of the way
// it is drawn, on a y-down screen, so drawn left to right it faces up. Its
// joints mustn't catch either. A contact at a joint is kept only if the joint
// sticks out and the normal lies between the two lines' normals; at a flat or
// inward joint the next line's face holds the body, as a seam's does in 3D
// (mesh.js, triangle.js beside).

import { Core, Manifold2, collide, collideSide, fromFront } from './collide2d.js';

export class Tilemap {
  constructor(tileSize, columns, rows, tiles) {
    this.tw = tileSize[0]; this.th = tileSize[1];
    this.columns = columns; this.rows = rows;
    this.tiles = tiles;
  }

  /** Whether cell (c, r) is solid. Outside the map is empty. */
  solid(c, r) {
    return c >= 0 && r >= 0 && c < this.columns && r < this.rows && this.tiles[r * this.columns + c] !== 0;
  }
}

export class Chain {
  /** @param points flat [x0, y0, ...], in the body's frame. */
  constructor(points) {
    const n = points.length / 2;
    this.n = n;
    this.points = points;
    // Each line's front normal, and at each inner joint whether it sticks out.
    this.nx = new Float64Array(n - 1); this.ny = new Float64Array(n - 1);
    this.convex = new Uint8Array(n);
    for (let k = 0; k + 1 < n; k++) {
      const dx = points[2 * k + 2] - points[2 * k], dy = points[2 * k + 3] - points[2 * k + 1], l = Math.sqrt(dx * dx + dy * dy);
      this.nx[k] = dy / l; this.ny[k] = -dx / l;
    }
    for (let k = 1; k + 1 < n; k++) {
      // Turning toward its back from one line to the next, the joint sticks out to the front.
      this.convex[k] = this.nx[k - 1] * this.ny[k] - this.ny[k - 1] * this.nx[k] > FLAT ? 1 : 0;
    }
    this.convex[0] = 1; this.convex[n - 1] = 1;   // its ends are real corners
  }
}

/** Lines straighter than this at a joint are flat: rounding, as FLAT in 3D (mesh.js), 2^-20. */
const FLAT = 9.5367431640625e-7;

const found = new Manifold2();

/** Tells `emit` about every manifold body `a`'s cores make with one exposed line. */
function line(core, bx, by, c, s, x1, y1, x2, y2, fx, fy, margin, tolerance, key, emit) {
  if (collideSide(core, bx, by, c, s, x1, y1, x2, y2, margin, tolerance, found) === 0) return;
  // From the body to the line: it must come at the open side.
  if (found.nx * fx + found.ny * fy >= 0 && fromFront(margin, found) === 0) return;
  emit(found, key);
}

/**
 * The exposed lines of tilemap `map`, at (ox, oy), within the box around (px,
 * py) of half-width `reach`, a cell wider so that no line ends near the body
 * but at a real corner.
 */
export function touchTiles(map, ox, oy, core, bx, by, c, s, px, py, reach, margin, tolerance, part, emit) {
  const tw = map.tw, th = map.th, X = px - ox, Y = py - oy;
  const c0 = Math.floor((X - reach) / tw) - 1, c1 = Math.floor((X + reach) / tw) + 1;
  const r0 = Math.floor((Y - reach) / th) - 1, r1 = Math.floor((Y + reach) / th) + 1;
  const near0 = (X - reach) / tw, near1 = (X + reach) / tw, nearY0 = (Y - reach) / th, nearY1 = (Y + reach) / th;
  // Rows of lines, each between rows r - 1 and r, that the body's box reaches.
  for (let r = Math.max(0, Math.ceil(nearY0)); r <= Math.min(map.rows, Math.floor(nearY1)); r++) {
    for (let face = 0; face < 2; face++) {
      let start = -1;
      for (let k = c0; k <= c1 + 1; k++) {
        const on = k <= c1 && (face === 0 ? map.solid(k, r) && !map.solid(k, r - 1) : map.solid(k, r - 1) && !map.solid(k, r));
        if (on && start === NONE) start = k;
        if (!on && start !== NONE) {
          const y = oy + r * th, x1 = ox + start * tw, x2 = ox + k * tw, key = part + 2 * (r * 2 + face) + 0;
          if (face === 0) line(core, bx, by, c, s, x1, y, x2, y, 0, -1, margin, tolerance, key, emit);
          else line(core, bx, by, c, s, x2, y, x1, y, 0, 1, margin, tolerance, key, emit);
          start = NONE;
        }
      }
    }
  }
  for (let q = Math.max(0, Math.ceil(near0)); q <= Math.min(map.columns, Math.floor(near1)); q++) {
    for (let face = 0; face < 2; face++) {
      let start = -1;
      for (let k = r0; k <= r1 + 1; k++) {
        const on = k <= r1 && (face === 0 ? map.solid(q, k) && !map.solid(q - 1, k) : map.solid(q - 1, k) && !map.solid(q, k));
        if (on && start === NONE) start = k;
        if (!on && start !== NONE) {
          const x = ox + q * tw, y1 = oy + start * th, y2 = oy + k * th, key = part + 2 * (q * 2 + face) + 1;
          if (face === 0) line(core, bx, by, c, s, x, y2, x, y1, -1, 0, margin, tolerance, key, emit);
          else line(core, bx, by, c, s, x, y1, x, y2, 1, 0, margin, tolerance, key, emit);
          start = NONE;
        }
      }
    }
  }
}
const NONE = -1;

/** The chain's lines under the box, each kept to what its joints allow. */
export function touchChain(chain, ox, oy, core, bx, by, c, s, px, py, reach, margin, tolerance, part, emit) {
  const v = chain.points;
  // ponytail: every line, O(n) a body; a tree of lines if chains grow to thousands.
  for (let k = 0; k + 1 < chain.n; k++) {
    const x1 = ox + v[2 * k], y1 = oy + v[2 * k + 1], x2 = ox + v[2 * k + 2], y2 = oy + v[2 * k + 3];
    if (Math.min(x1, x2) > px + reach || Math.max(x1, x2) < px - reach || Math.min(y1, y2) > py + reach || Math.max(y1, y2) < py - reach) continue;
    if (collideSide(core, bx, by, c, s, x1, y1, x2, y2, margin, tolerance, found) === 0) continue;
    const fx = chain.nx[k], fy = chain.ny[k];
    if (found.nx * fx + found.ny * fy >= 0 && fromFront(margin, found) === 0) continue;
    // Off the line's own normal, at one of its ends: met at a joint, however
    // the point is named (a box's front corner reaching a joint names itself).
    // Off by more than a tilt that moves a point a tolerance across the body:
    // less is a body lying flat on it, a few µrad off by rounding.
    const ox2 = -found.nx, oy2 = -found.ny, dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy, near = tolerance * tolerance / l2;
    if (Math.abs(ox2 * fy - oy2 * fx) * core.reach > tolerance) {
      let kept = true;
      for (let q = 0; q < found.count && kept; q++) {
        const t = ((found.x[q] - x1) * dx + (found.y[q] - y1) * dy) / l2;
        if (t * t > near && (1 - t) * (1 - t) > near && t > 0 && t < 1) continue;
        const joint = t < 0.5 ? k : k + 1;
        if (chain.convex[joint] === 0) { kept = false; break; }
        if (joint > 0 && joint + 1 < chain.n) {
          // Outward lies between the two lines' normals, or the face of one holds it.
          const a = joint - 1, inA = chain.nx[a] * oy2 - chain.ny[a] * ox2, inB = chain.nx[joint] * oy2 - chain.ny[joint] * ox2;
          if (!(inA <= FLAT && inB >= -FLAT) && !(inA >= -FLAT && inB <= FLAT)) kept = false;
        }
      }
      if (!kept) continue;
    }
    emit(found, part + k);
  }
}

/** Plain cores pair by pair, `found` for each: compounds, cheap to reject by their parts' reach. */
export function touchCores(coreA, ax, ay, ac, as, coreB, bx, by, bc, bs, margin, tolerance, key, emit) {
  if (collide(coreA, ax, ay, ac, as, coreB, bx, by, bc, bs, margin, tolerance, found) > 0) emit(found, key);
}

export { Core };
