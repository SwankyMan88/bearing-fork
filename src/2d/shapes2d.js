// What a flat shape encloses, and how hard it is to turn.
//
// Everything here is per unit density: its area, the centre of that area, and
// its second moment about that centre (the integral of r² over the area),
// which is the moment of inertia at a density of 1. A body multiplies them by
// its density, so one calculation serves `density` and `mass` alike, and a
// compound's parts, each with a density of their own, add up.
//
// A shape is drawn about its own origin. Box, circle and capsule are centred
// on it; a polygon's centre is wherever its points put it.
//
// Exact operations only (rule: bit-identical on every machine), but for the
// turn of a compound's part, which takes Bearing's own sine and cosine.

import { cos, sin } from '../core/math.js';

/**
 * The convex hull of flat points [x0, y0, x1, y1, ...], its corners as a flat
 * array, turning from +x toward +y (clockwise on a y-down screen), or null if
 * they span no area. Andrew's monotone chain: sorted by x then y, a lower and
 * an upper chain, each dropping any point that doesn't make a strict turn, so
 * points inside the hull or along its edges are left out.
 *
 * Why convex: every fast contact method leans on it, since two convex shapes
 * can be told apart by one line between them. A concave shape is a compound.
 */
export function convexHull(points) {
  const n = points.length / 2, order = new Array(n);
  for (let i = 0; i < n; i++) order[i] = i;
  // The index last, so equal points sort the same way on every engine.
  order.sort((a, b) => points[2 * a] - points[2 * b] || points[2 * a + 1] - points[2 * b + 1] || a - b);
  const chain = [];
  const turn = (o, a, b) => (points[2 * a] - points[2 * o]) * (points[2 * b + 1] - points[2 * o + 1])
    - (points[2 * a + 1] - points[2 * o + 1]) * (points[2 * b] - points[2 * o]);
  for (let i = 0; i < n; i++) {
    while (chain.length >= 2 && !(turn(chain[chain.length - 2], chain[chain.length - 1], order[i]) > 0)) chain.pop();
    chain.push(order[i]);
  }
  const lower = chain.length + 1;
  for (let i = n - 2; i >= 0; i--) {
    while (chain.length >= lower && !(turn(chain[chain.length - 2], chain[chain.length - 1], order[i]) > 0)) chain.pop();
    chain.push(order[i]);
  }
  chain.pop();   // the first point again
  if (chain.length < 3) return null;
  const out = new Array(2 * chain.length);
  chain.forEach((p, k) => { out[2 * k] = points[2 * p]; out[2 * k + 1] = points[2 * p + 1]; });
  return out;
}

/** { area, x, y, moment } of a convex polygon, flat corners in order; moment about (x, y). */
function polygon(v) {
  let area = 0, cx = 0, cy = 0, moment = 0;
  const ox = v[0], oy = v[1];
  // A fan of triangles from the first corner. Measured from there, a triangle
  // of corners 0, a, b has area (a × b) / 2, centre (a + b) / 3, and second
  // moment area (a·a + a·b + b·b) / 6.
  for (let i = 2; i + 3 < v.length; i += 2) {
    const ax = v[i] - ox, ay = v[i + 1] - oy, bx = v[i + 2] - ox, by = v[i + 3] - oy;
    const a = (ax * by - ay * bx) * 0.5;
    area += a;
    cx += a * (ax + bx) / 3;
    cy += a * (ay + by) / 3;
    moment += a * (ax * ax + ax * bx + bx * bx + ay * ay + ay * by + by * by) / 6;
  }
  cx /= area; cy /= area;
  return { area, x: ox + cx, y: oy + cy, moment: moment - area * (cx * cx + cy * cy) };
}

/**
 * A capsule along y, `height` long end to end: a rectangle 2r by L, L the
 * straight part, and a half disc on each end. A half disc's centre is 4r/3π
 * from its flat side. Its moment about its centre is the half disc's about the
 * flat side's middle, area r²/2, less area d²; carried to the capsule's centre
 * by the parallel axis, area (L/2 + d)².
 */
function capsule(radius, height) {
  const r = radius, L = height - 2 * r, half = Math.PI * r * r * 0.5, d = 4 * r / (3 * Math.PI);
  const box = 2 * r * L;
  const cap = half * r * r * 0.5 - half * d * d + half * (L * 0.5 + d) * (L * 0.5 + d);
  return { area: box + 2 * half, x: 0, y: 0, moment: box * (4 * r * r + L * L) / 12 + 2 * cap };
}

/** { area, x, y, moment } of one plain shape, at a density of 1. */
export function plain(shape, size, radius, height, vertices) {
  if (shape === 'circle') {
    const area = Math.PI * radius * radius;
    return { area, x: 0, y: 0, moment: area * radius * radius * 0.5 };
  }
  if (shape === 'capsule') return capsule(radius, height);
  if (shape === 'polygon') return polygon(vertices);
  const area = size[0] * size[1];
  return { area, x: 0, y: 0, moment: area * (size[0] * size[0] + size[1] * size[1]) / 12 };
}

/**
 * Mass, centre and moment of a compound's parts, each a plain shape placed at
 * its `position`, turned by its `angle`, at its own `density` or `density`.
 * The centre is the mean of theirs by mass, and each part's moment is carried
 * to it by the parallel axis.
 */
export function compound(parts, density) {
  let mass = 0, x = 0, y = 0;
  const each = parts.map((p) => {
    const m = plain(p.shape, p.size, p.radius, p.height, p.vertices), c = cos(p.angle), s = sin(p.angle);
    const at = { mass: m.area * (p.density ?? density), moment: m.moment * (p.density ?? density), x: p.position[0] + c * m.x - s * m.y, y: p.position[1] + s * m.x + c * m.y };
    mass += at.mass; x += at.mass * at.x; y += at.mass * at.y;
    return at;
  });
  x /= mass; y /= mass;
  let moment = 0;
  for (const p of each) moment += p.moment + p.mass * ((p.x - x) * (p.x - x) + (p.y - y) * (p.y - y));
  return { mass, x, y, moment };
}
