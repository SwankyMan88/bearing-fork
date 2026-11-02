# Benchmark results

From `bench/compare.html`: the same scenes through Bearing, Rapier, Jolt and cannon-es in one
page, taking turns in blocks of 10 steps, medians of 3 runs. 1 m boxes of 1,000 kg, friction 0.5,
restitution 0, steps of 1/60 s. Each engine's own solver settings; cannon-es given its
sweep-and-prune broadphase and sleeping, as its docs advise for many bodies. Lower is better for
ms per step; for a stack, less strayed and sank is better, and "stands" means every box ended
within 10 cm of where it started.

To run it: `node serve.js`, open <http://localhost:8080/bench/compare.html>, press Run, and paste
the result here. `?scene=stack,pyramid,pile` runs those only, `&auto=1` starts at once; in a
browser with less memory to spare, run a scene or two per page load.

## Laptop: Intel i7-1260P, Iris Xe

2026-11-02, on the charger, after pose motors, joint forces and the joints on workers (milestones
17 to 19): Bearing at commit `82b6a59`, with workers ('auto') and on one thread (`workers: 0`);
Rapier 0.21.0, SIMD build; Jolt 1.1.0, single-threaded; cannon-es 0.20.0. Run in the Claude
desktop app's browser pane (Chrome 152), in view and cross-origin isolated, one page load per
scene or three; the rays alone, and the 10,000-box pile without cannon-es, as on 2026-10-29.

### 10-box stack, 10 s

| Engine | ms per step | stands | strayed | sank |
|---|---|---|---|---|
| Bearing | 0.0204 | yes | 0.00 mm | 6.57 mm |
| Bearing (1 thread) | 0.0154 | yes | 0.00 mm | 6.57 mm |
| Rapier | 0.0143 | yes | 9.54 mm | 23.9 mm |
| Jolt | 0.00305 | yes | 20.0 mm | 13.1 mm |
| cannon-es | 0.0976 | **no** | 294.9 mm | 49.0 mm |

### 210-box pyramid, 10 s

| Engine | ms per step | stands | strayed | sank |
|---|---|---|---|---|
| Bearing | 0.381 | yes | 0.08 mm | 7.34 mm |
| Bearing (1 thread) | 0.397 | yes | 0.08 mm | 7.34 mm |
| Rapier | 0.0638 | yes | 11.1 mm | 27.3 mm |
| Jolt | 0.0726 | yes | 6.38 mm | 25.3 mm |
| cannon-es | 4.79 | **no** | 320.4 mm | 91.9 mm |

### 1,000-box pile, 10 s

| Engine | ms per step, 0–5 s | ms per step, 5–10 s | asleep at 10 s | fell through |
|---|---|---|---|---|
| Bearing | 6.53 | 4.97 | 101 of 1,000 | 0 |
| Bearing (1 thread) | 12.7 | 9.33 | 101 of 1,000 | 0 |
| Rapier | 2.37 | 1.36 | 1,000 of 1,000 | 0 |
| Jolt | 5.78 | 4.87 | 107 of 1,000 | 0 |
| cannon-es | 23.1 | 24.1 | 451 of 1,000 | 0 |

### 10,000 rays into 1,000 boxes

From above into the 1,000-box pile as it starts, each the nearest hit within 100 m; each engine's
own nearest-hit query.

| Engine | ms for all 10,000 | rays that hit |
|---|---|---|
| Bearing | 28.9 | 10,000 |
| Bearing (1 thread) | 32.6 | 10,000 |
| Rapier | 18.6 | 10,000 |
| Jolt | 251 | 10,000 |
| cannon-es | 380 | 10,000 |

### 32 ragdolls, 8 s

| Engine | ms per step, 0–4 s | ms per step, 4–8 s | widest joint gap at the end | asleep at the end | fell through |
|---|---|---|---|---|---|
| Bearing | 4.71 | 3.14 | 0.00 mm | 88 of 352 | 0 |
| Bearing (1 thread) | 8.27 | 5.82 | 0.00 mm | 88 of 352 | 0 |
| Rapier | 1.50 | 0.971 | 7.08 mm | 11 of 352 | 0 |
| Jolt | 3.49 | 0.00108 | 0.10 mm | 352 of 352 | 0 |
| cannon-es | 7.95 | 5.06 | 5.25 mm | 149 of 352 | 0 |

### 1,000-hull pile, 10 s

| Engine | ms per step, 0–5 s | ms per step, 5–10 s | asleep at the end | fell through |
|---|---|---|---|---|
| Bearing | 14.1 | 1.72 | 1,000 of 1,000 | 0 |
| Bearing (1 thread) | 18.0 | 1.98 | 1,000 of 1,000 | 0 |
| Rapier | 3.21 | 0.240 | 1,000 of 1,000 | 0 |
| Jolt | 7.07 | 0.286 | 1,000 of 1,000 | 0 |
| cannon-es | 259 | 357 | 107 of 1,000 | 0 |

### 10,000-box pile, 1 s

| Engine | ms per step, 0–1 s | asleep at the end | fell through |
|---|---|---|---|
| Bearing | 37.3 | 0 of 10,000 | 0 |
| Bearing (1 thread) | 82.2 | 0 of 10,000 | 0 |
| Rapier | 21.8 | 0 of 10,000 | 0 |
| Jolt | 34.2 | 0 of 10,000 | 0 |

### Since 2026-10-29

The ragdolls are what moved: with workers 7.73 / 5.45 to 4.71 / 3.14 ms a step, now faster than
cannon-es's 7.95 / 5.06; on one thread about even (7.65 / 5.95 to 8.27 / 5.82), joint forces'
bookkeeping taking back what milestone 19's single-thread work gained. The box scenes, rays and
hulls are within a few percent, as milestones 17 to 19 didn't touch them. The 10,000-box pile with
workers read 37.3 ms (52.0 then), and Rapier and Jolt read 12 to 18% faster on it too: most of
that is the run, not the code. The other engines' ragdolls read 20 to 30% slower than on
2026-10-29, so the ragdoll figures sit high across the board.

### Against the goals

- **Faster than cannon-es on every scene:** met with workers, the ragdolls now included (3.14
  against 5.06 ms in the last 4 s). On one thread cannon-es is still 1.04 to 1.15 times faster on
  the ragdolls, holding its joints far looser (5.25 mm against 0.00).
- **100 active ragdolls in 8 ms:** not a scene in this page; measured in Node at about 6 ms with
  workers, 18 to 21 on one thread (milestone 19).
- **Stacks stand wherever they stand in Rapier and Jolt:** met, and held tightest of the four.

Rapier, for the record (no longer a goal): the stack 1.1× on one thread, the rays 1.6×, the
10,000-box pile 1.7× with workers (Jolt's 1.1×), the box pile 2.8 to 3.7×, the ragdolls 3.1 to
3.2×, the hulls 4.4 to 7.2×, the pyramid 6×.

## Earlier run

2026-10-29, on the charger, after contact recycling and per-body freezing: Bearing at commit
`25db6d7`, with workers ('auto') and on one thread (`workers: 0`); Rapier 0.21.0, SIMD build; Jolt
1.1.0, single-threaded; cannon-es 0.20.0. Run in the Claude desktop app's browser pane (Chrome
152), in view and cross-origin isolated, one page load per scene or three; the rays alone, as
sharing a page with the ragdolls slowed every engine's rays 1.5 to 5 times. The 10,000-box pile
ran without cannon-es, which lost the page twice. This replaces a run of the same morning at
`3346a58`, whose 10,000-box pile read twice as slow for every engine.

### 10-box stack, 10 s

| Engine | ms per step | stands | strayed | sank |
|---|---|---|---|---|
| Bearing | 0.0200 | yes | 0.00 mm | 6.57 mm |
| Bearing (1 thread) | 0.0153 | yes | 0.00 mm | 6.57 mm |
| Rapier | 0.0127 | yes | 9.54 mm | 23.9 mm |
| Jolt | 0.00328 | yes | 20.0 mm | 13.1 mm |
| cannon-es | 0.0966 | **no** | 294.9 mm | 49.0 mm |

### 210-box pyramid, 10 s

| Engine | ms per step | stands | strayed | sank |
|---|---|---|---|---|
| Bearing | 0.411 | yes | 0.08 mm | 7.34 mm |
| Bearing (1 thread) | 0.415 | yes | 0.08 mm | 7.34 mm |
| Rapier | 0.0767 | yes | 11.1 mm | 27.3 mm |
| Jolt | 0.0746 | yes | 6.38 mm | 25.3 mm |
| cannon-es | 6.78 | **no** | 320.4 mm | 91.9 mm |

### 1,000-box pile, 10 s

| Engine | ms per step, 0–5 s | ms per step, 5–10 s | asleep at 10 s | fell through |
|---|---|---|---|---|
| Bearing | 6.59 | 4.80 | 101 of 1,000 | 0 |
| Bearing (1 thread) | 12.6 | 8.85 | 101 of 1,000 | 0 |
| Rapier | 2.22 | 1.30 | 1,000 of 1,000 | 0 |
| Jolt | 5.45 | 4.62 | 107 of 1,000 | 0 |
| cannon-es | 21.0 | 22.6 | 451 of 1,000 | 0 |

Bearing's pile is all asleep at about 10.5 s, just past this scene's end (14 s before freezing).

### 10,000 rays into 1,000 boxes

| Engine | ms for all 10,000 | rays that hit |
|---|---|---|
| Bearing | 28.6 | 10,000 |
| Bearing (1 thread) | 28.7 | 10,000 |
| Rapier | 15.4 | 10,000 |
| Jolt | 238 | 10,000 |
| cannon-es | 389 | 10,000 |

### 32 ragdolls, 8 s

| Engine | ms per step, 0–4 s | ms per step, 4–8 s | widest joint gap at the end | asleep at the end | fell through |
|---|---|---|---|---|---|
| Bearing | 7.73 | 5.45 | 0.00 mm | 88 of 352 | 0 |
| Bearing (1 thread) | 7.65 | 5.95 | 0.00 mm | 88 of 352 | 0 |
| Rapier | 1.17 | 0.912 | 7.08 mm | 11 of 352 | 0 |
| Jolt | 2.93 | 0.00123 | 0.10 mm | 352 of 352 | 0 |
| cannon-es | 5.96 | 4.85 | 5.25 mm | 149 of 352 | 0 |

### 1,000-hull pile, 10 s

| Engine | ms per step, 0–5 s | ms per step, 5–10 s | asleep at the end | fell through |
|---|---|---|---|---|
| Bearing | 15.0 | 1.81 | 1,000 of 1,000 | 0 |
| Bearing (1 thread) | 19.7 | 2.16 | 1,000 of 1,000 | 0 |
| Rapier | 3.52 | 0.249 | 1,000 of 1,000 | 0 |
| Jolt | 8.03 | 0.305 | 1,000 of 1,000 | 0 |
| cannon-es | 269 | 381 | 107 of 1,000 | 0 |

### 10,000-box pile, 1 s

| Engine | ms per step, 0–1 s | asleep at the end | fell through |
|---|---|---|---|
| Bearing | 52.0 | 0 of 10,000 | 0 |
| Bearing (1 thread) | 84.8 | 0 of 10,000 | 0 |
| Rapier | 24.9 | 0 of 10,000 | 0 |
| Jolt | 41.5 | 0 of 10,000 | 0 |

### Since 2026-10-22

Bearing on one thread, then and now: the pile 17.5 / 20.6 to 12.6 / 8.85 ms a step, the pyramid
1.16 to 0.415, the ragdolls 9.35 / 8.87 to 7.65 / 5.95, the hull pile 32.8 / 39.5 to 19.7 / 2.16
with all 1,000 hulls asleep by 10 s (40 then), the rays 33.7 to 28.7 ms, the 10,000-box pile 121
to 84.8 ms. With workers the pile's last 5 s are 4.80 ms, Jolt's 4.62, and the 10,000-box pile
52.0 against Jolt's 41.5. Its stack and pyramid stray 0.00 and 0.08 mm (0.88 and 0.96 then). The
other engines' times moved by a few percent.

### Against the goals

- **Faster than cannon-es on every scene:** every scene but the ragdolls, where cannon-es is 1.1
  to 1.3 times faster (4.85 against 5.45 ms in the last 4 s) and holds its joints far looser
  (5.25 mm against 0.00).
- **Within 2× of Rapier's time per step:** met on the stack (1.2× on one thread) and the rays
  (1.9×), nearly on the 10,000-box pile (2.1× with workers); not on the rest: 3 to 4× on the
  box pile, 4 to 7× on the hulls and ragdolls, 5× on the pyramid. Settled scenes are where
  Bearing still loses most: Rapier and Jolt put the pyramid and ragdolls to sleep, Bearing keeps
  solving them (its sleep rule is stricter by design; see the findings of 2026-10-28).
- **Stacks stand wherever they stand in Rapier and Jolt:** met, and held tightest of the four.

## Desktop: Ryzen 5 5500

Not run yet.
