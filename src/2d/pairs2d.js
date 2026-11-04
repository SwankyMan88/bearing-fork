// Which bodies might touch, and what each such pair remembers.
//
// BROADPHASE. Testing every body against every other is n² tests; a pile of
// 5,000 shards is 12 million a step, nearly all of them between bodies nowhere
// near each other. So each body sits in a tree of boxes (tree.js, 3D's, used
// as it is with every box of no depth), in a FAT box a little bigger than it.
// While it stays inside that box nothing changes, so most steps touch the tree
// not at all. A body that leaves it is put back and asked what it now overlaps.
// Static bodies have a tree of their own, since nothing needs to ask them
// anything. The box doesn't reach ahead of the body, as 3D's does (AHEAD,
// broadphase.js), which suits a metre-wide crate: an 8 px shard falling 16
// steps ahead has a box 20 times itself, touching everything near it long after
// it stops. Measured on 5,000 shards landing: 105 ms a step and 210 pairs a
// shard with it, 25 ms and 10 pairs without, and a reach held to the body's own
// size was worse the longer it was.
//
// PAIRS are kept from step to step: a pair stays listed while its fat boxes
// overlap, and holds what it pushed with, so a stack starts each step from what
// held it (the warm start). `active` pairs come first; a pair of two sleeping
// bodies sits past them, and costs nothing.
//
// Each body keeps its pairs on a list threaded through the pair rows, an edge
// 2p for the pair's a and 2p + 1 for its b, so waking a body or dropping one
// walks only its own pairs, and finding a pair is a walk of a few.

import { Tree } from '../tree.js';
import { resized } from '../core/slots.js';

/** How much bigger a fat box is, of the body's thinnest width: 3D's measure (broadphase.js). */
const FAT = 1 / 4;

const NONE = -1;
const DYNAMIC = 0, STATIC = 1;

export class Pairs2D {
  constructor() {
    this.count = 0;
    this.active = 0;
    this.capacity = 0;
    this.a = null; this.b = null; this.touching = null;
    // What it pushed with last, by point name: -1 for no point.
    this.ids = null; this.normal = null; this.tangent = null; this.roll = null;
    // A pair of many rows (a level, a compound) keeps key, normal, tangent to a point.
    this.extra = [];
    this.extraCount = null;
    this.next = null; this.previous = null;   // each edge's along its body's list
    this.head = new Int32Array(0);            // by slot: 1 + its first edge, or 0
    this.tally = new Int32Array(0);           // by slot: how many pairs it is in
    this._alloc(16);
  }

  _alloc(c) {
    const grow = (name, Type, n) => { this[name] = this[name] ? resized(this[name], n) : new Type(n); };
    grow('a', Int32Array, c); grow('b', Int32Array, c); grow('touching', Uint8Array, c);
    grow('ids', Int32Array, 2 * c); grow('normal', Float64Array, 2 * c); grow('tangent', Float64Array, 2 * c);
    grow('roll', Float64Array, c); grow('extraCount', Int32Array, c); grow('next', Int32Array, 2 * c); grow('previous', Int32Array, 2 * c);
    this.capacity = c;
  }

  resize(capacity) {
    this.head = resized(this.head, capacity);
    this.tally = resized(this.tally, capacity);
  }

  /** The pair of slots a and b, or -1. Walks the shorter list: a floor is in thousands of pairs. */
  find(a, b) {
    const s = this.tally[a] <= this.tally[b] ? a : b, other = s === a ? b : a;
    for (let e = this.head[s] - 1; e >= 0; e = this.next[e] - 1) {
      const p = e >> 1;
      if (this.a[p] === other || this.b[p] === other) return p;
    }
    return NONE;
  }

  _link(e, s) {
    const first = this.head[s];
    this.next[e] = first;
    this.previous[e] = 0;
    if (first !== 0) this.previous[first - 1] = e + 1;
    this.head[s] = e + 1;
    this.tally[s]++;
  }

  _unlink(e, s) {
    const n = this.next[e], q = this.previous[e];
    if (q !== 0) this.next[q - 1] = n;
    else this.head[s] = n;
    if (n !== 0) this.previous[n - 1] = q;
    this.tally[s]--;
  }

  /** A new pair, last of the active ones: anything new is looked at this step. */
  add(a, b) {
    if (this.count === this.capacity) this._alloc(2 * this.capacity);
    let p = this.count++;
    if (this.active < p) { this._move(this.active, p); p = this.active; }
    this.active++;
    this.a[p] = a; this.b[p] = b; this.touching[p] = 0; this.roll[p] = 0; this.extraCount[p] = 0;
    const p2 = 2 * p;
    this.ids[p2] = NONE; this.ids[p2 + 1] = NONE;
    this.normal[p2] = 0; this.normal[p2 + 1] = 0; this.tangent[p2] = 0; this.tangent[p2 + 1] = 0;
    this._link(p2, a); this._link(p2 + 1, b);
    return p;
  }

  /** One kept push of a many-row pair; its list grows by doubling, and is reused. */
  keep(p, key, normal, tangent) {
    let list = this.extra[p], n = this.extraCount[p];
    if (list === undefined || list === null || n + 3 > list.length) {
      const longer = new Float64Array(list ? 2 * list.length : 12);
      if (list) longer.set(list);
      list = this.extra[p] = longer;
    }
    list[n] = key; list[n + 1] = normal; list[n + 2] = tangent;
    this.extraCount[p] = n + 3;
  }

  /** Copies row `from` over row `to`, carrying its links; `to` must be unlinked or dead. */
  _move(from, to) {
    this.a[to] = this.a[from]; this.b[to] = this.b[from]; this.touching[to] = this.touching[from]; this.roll[to] = this.roll[from];
    this.extraCount[to] = this.extraCount[from];
    const held = this.extra[to];
    this.extra[to] = this.extra[from];
    this.extra[from] = held;
    const f = 2 * from, t = 2 * to;
    for (let k = 0; k < 2; k++) {
      this.ids[t + k] = this.ids[f + k]; this.normal[t + k] = this.normal[f + k]; this.tangent[t + k] = this.tangent[f + k];
      const n = this.next[f + k], q = this.previous[f + k];
      this.next[t + k] = n; this.previous[t + k] = q;
      if (q !== 0) this.next[q - 1] = t + k + 1;
      else this.head[k === 0 ? this.a[to] : this.b[to]] = t + k + 1;
      if (n !== 0) this.previous[n - 1] = t + k + 1;
    }
  }

  /** Swaps two rows, links and all, through a spare row past the end. */
  _swap(i, j) {
    if (i === j) return;
    if (this.count === this.capacity) this._alloc(2 * this.capacity);
    const spare = this.count;
    this._move(i, spare);
    this._move(j, i);
    this._move(spare, j);
  }

  /** Out of the list altogether. Row p then holds what was last active, and past it what was last. */
  drop(p) {
    this._unlink(2 * p, this.a[p]);
    this._unlink(2 * p + 1, this.b[p]);
    const last = --this.count;
    if (p < this.active) {
      const tail = --this.active;
      if (p !== tail) this._move(tail, p);
      if (tail !== last) this._move(last, tail);
    } else if (p !== last) {
      this._move(last, p);
    }
  }

  /** In among the active pairs, if it isn't: they are looked at this step. */
  wake(p) {
    if (p >= this.active) this._swap(p, this.active++);
  }

  /** Out from among the active pairs. */
  rest(p) {
    if (p < this.active) this._swap(p, --this.active);
  }

  /** Gives storage back by the 1/4 rule, as the world's columns. */
  trim() {
    if (this.capacity <= 16 || this.count > this.capacity / 4) return;
    let c = 16;
    while (c < this.count) c *= 2;
    this._alloc(c);
  }
}

export class Broad2D {
  constructor() {
    this.trees = [new Tree(), new Tree()];
    this.leaf = new Int32Array(0);
    this.home = new Uint8Array(0);            // which tree: 0 moving, 1 static
    this.marked = new Uint8Array(0);          // on `moved`
    this.moved = new Int32Array(0);
    this.movedCount = 0;
  }

  resize(capacity) {
    this.leaf = resized(this.leaf, capacity);
    this.home = resized(this.home, capacity);
    this.marked = resized(this.marked, capacity);
    this.moved = resized(this.moved, capacity);
    this.movedCount = Math.min(this.movedCount, capacity);
  }

  mark(s) {
    if (this.marked[s] === 0) { this.marked[s] = 1; this.moved[this.movedCount++] = s; }
  }

  /** Slot s's fat box, into the tree it belongs in. */
  add(world, s) {
    const tree = world._type[s] === STATIC ? 1 : 0;
    this.home[s] = tree;
    fat(world, s);
    this.leaf[s] = this.trees[tree].insert(s, X0, Y0, 0, X1, Y1, 0);
    this.mark(s);
  }

  remove(s) {
    this.trees[this.home[s]].remove(this.leaf[s]);
    this.leaf[s] = NONE;
    this.marked[s] = 0;
  }

  refile(world, s) {
    this.trees[this.home[s]].remove(this.leaf[s]);
    this.add(world, s);
  }

  /** Puts back whichever awake bodies have left their fat boxes. */
  update(world) {
    const list = world._awakeList, n = world._awakeCount, p = world._position, reach = world._reach, motion = world._motion;
    const moving = this.trees[0], box = moving.box, leaf = this.leaf;
    for (let i = 0; i < n; i++) {
      const s = list[i], s2 = 2 * s, n6 = 6 * leaf[s], x = p[s2], y = p[s2 + 1], r = reach[s], m = motion[s];
      if (this.home[s] !== 0) continue;
      if (x - r - m < box[n6] || x + r + m > box[n6 + 3] || y - r - m < box[n6 + 1] || y + r + m > box[n6 + 4]) {
        fat(world, s);
        moving.move(leaf[s], X0, Y0, 0, X1, Y1, 0);
        this.mark(s);
      }
    }
  }

  /** Asks the trees what each marked body now overlaps, and lists what is new. */
  candidates(world, pairs) {
    for (let i = 0; i < this.movedCount; i++) {
      const s = this.moved[i];
      this.marked[s] = 0;
      if (this.leaf[s] === NONE) continue;
      const n6 = 6 * this.leaf[s], tree = this.trees[this.home[s]], b = tree.box;
      const x0 = b[n6], y0 = b[n6 + 1], x1 = b[n6 + 3], y1 = b[n6 + 4];
      self = s; asking = world; list = pairs;
      this.trees[0].query(x0, y0, 0, x1, y1, 0, meetLeaf);
      if (this.home[s] === 0) this.trees[1].query(x0, y0, 0, x1, y1, 0, meetLeaf);
    }
    this.movedCount = 0;
    asking = null; list = null;
  }

  /** Whether two slots' fat boxes overlap: a pair past that is dropped. */
  overlap(a, b) {
    const ba = this.trees[this.home[a]].box, bb = this.trees[this.home[b]].box, x = 6 * this.leaf[a], y = 6 * this.leaf[b];
    return ba[x] <= bb[y + 3] && bb[y] <= ba[x + 3] && ba[x + 1] <= bb[y + 4] && bb[y + 1] <= ba[x + 4];
  }

  /** Gives back tree storage; a tree trimmed is rebuilt, its leaves renumbered. */
  trim() {
    for (const tree of this.trees) {
      const leaves = tree.trim();
      if (leaves) for (const [s, n] of leaves) this.leaf[s] = n;
    }
  }
}

// The box fat() works out, and query's callback's state: a step isn't re-entered.
let X0 = 0, Y0 = 0, X1 = 0, Y1 = 0, self = 0, asking = null, list = null;

function fat(world, s) {
  const s2 = 2 * s, x = world._position[s2], y = world._position[s2 + 1];
  const r = world._reach[s] + world._motion[s] + FAT * world._size[s];
  X0 = x - r; X1 = x + r; Y0 = y - r; Y1 = y + r;
}

function meetLeaf(other) {
  if (other === self) return;
  if (!pairable(asking, self, other) || list.find(self, other) !== NONE) return;
  list.add(self < other ? self : other, self < other ? other : self);
}

/** Whether two slots are ever paired: one dynamic, each in the other's mask, not of one group. */
export function pairable(w, a, b) {
  if (w._type[a] !== DYNAMIC && w._type[b] !== DYNAMIC) return false;
  if ((w._layers[a] & w._mask[b]) === 0 || (w._layers[b] & w._mask[a]) === 0) return false;
  const g = w._group[a];
  return g === 0 || g !== w._group[b];
}
