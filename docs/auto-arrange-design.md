# Smart Auto Arrange: design of the FCM layout engine

The Network tab's Auto Arrange menu now offers four smart layouts (Readable, Systems thinking, Cluster view and Centrality view) above the classic ones. This note covers the architecture, the algorithm, the libraries, the implementation and the code changes, together with measured performance.

## 1. Architecture

```
Network tab (SpaghettiEngine.jsx)
  Auto Arrange menu ──► smartLayout(mode)
        │  card sizes from the current map style (estimateNodeSize)
        ▼
  runFcmLayoutOffThread ──► Web Worker (src/layout/fcmLayout.worker.js)
        │                       └─► runFcmLayout / computeFcmLayout (src/layout/fcmLayout.js)
        ▼                           pure, deterministic, no React or DOM
  animateTo(next)   650 ms ease in-out, drawn from temporary positions
        ▼
  applyBulkPositions(next)   one model change, one undo step
        ▼
  figure routing (bends and label placement) recomputed once the cards land
```

- **Engine.** `fcmLayout.js` is framework-free, so the same code runs in the worker, on the main thread (as a fallback) and in node tests.
- **Off the main thread.** A single long-lived worker keeps the engine warmed up between runs, and the map stays responsive while large models are arranged.
- **Rendering.** React Flow is kept for drawing. The existing figure routing (lines bowed around cards, labels kept clear) completes the readability work after placement.
- **Libraries.** `d3-force` is kept for the force simulations. ELK was tried as a layered seed for Systems thinking but was dropped (see section 3).

## 2. Algorithm (hybrid, Steps A to E)

1. **Metrics** for every concept:
   - indegree and outdegree;
   - weighted in- and outdegree (sums of |w|);
   - betweenness centrality (Brandes, directed);
   - eigenvector centrality (power iteration on the undirected |w| graph, because the directed version is zero on maps without cycles);
   - strongly connected components (Tarjan), which give the feedback structures.

   From these the engine derives:
   - **drive** = (out - in) / (out + in), ranging from +1 for a pure driver to -1 for a pure outcome;
   - **centrality** = 0.6 eigenvector + 0.4 betweenness.
2. **Step A, communities.** Louvain modularity on the undirected |w| graph, followed by Leiden's connectivity guarantee: each community is split into its connected parts. Isolated concepts form one group. Cluster view uses the model's own modules when there are at least two.
3. **Step D, inside each community.** A force simulation over the community's internal relationships. The mode adds extra pulls:
   - drivers towards the left (strong in Systems thinking, gentle in Readable);
   - central concepts towards the middle of their community;
   - feedback loops of 3 to 7 concepts pulled onto a ring, so the loop reads as a circle.
4. **Steps B and C, between communities.** One disc per community, sized to fit its layout, placed by a force simulation over the community graph (links weighted by the summed |w| between communities). Discs are then pushed apart until none overlap. The mode shapes this step too:
   - Systems thinking pulls driver communities left;
   - Centrality view pulls central communities inward;
   - Cluster view uses wider gaps.
5. **Assembly.** Each community is rotated (12 angles) and reflected to face the communities it is linked to. Systems thinking only reflects top to bottom, so drivers stay on the left. A short global force pass then lets concepts drift towards their cross-community partners while staying in their own area.
6. **Step E, local search.** Overlaps are removed first. A local search then moves nodes, trying:
   - eight directions at two step sizes;
   - the barycentre of the node's neighbours, and halfway to it;
   - swaps with the six nearest similar-sized concepts in the same community.

   A move is kept when it lowers the node's local share of the objective. Only nodes that have a problem (a crossing, a line through a card, an overlap or a label clash) are tried. The search is bounded by a fixed amount of work rather than the clock, so the same model always gives the same picture. A wall-clock deadline acts only as a safety net on slow machines.
7. **Candidates.** Up to three placements are tried (anchored to the community plan, loose, and in between), and the one with the best score is kept.

**Objective.** The score is your formula. Two definitions are mine:
- an edge running straight through an unrelated card counts as a crossing;
- edge length is the mean length in card-widths, so the term does not grow with model size.

The remaining terms are:
- cluster separation = distance between nearest community centres relative to community spread (capped at 3);
- centrality visibility = centrality-weighted closeness to the map's middle;
- hierarchy visibility = correlation of drive with position towards the top-left.

## 3. Results (synthetic FCMs with planted clusters, drivers and loops; `node tests/test_fcm_layout.mjs`)

Crossings (lines through cards included), compared with a plain d3 force layout:

| Concepts | Plain force | Readable | Systems | Cluster | Centrality |
|---|---|---|---|---|---|
| 20 | 16 | 2 | 3 | 2 | 2 |
| 50 | 46 | 37 | 85 | 53 | 54 |
| 100 | 250 | 122 | 189 | 139 | 152 |
| 200 | 1215 | 952 | 1054 | 984 | 965 |

- None of the layouts had overlapping cards.
- Systems thinking places drivers left of outcomes at every size.
- On the 40-concept water-energy-food example, Readable reduces crossings from 514 (the example's own arrangement) to about 100, in 0.4 s.
- **Time** on this laptop (which was running about 1.4 to 2 times slower than usual): about 0.2 to 0.4 s for 20 concepts, 0.4 to 0.6 s for 50, about 1 s for 100 and about 2 to 3 s for 200. The test scales its limits to the measured machine speed.

**Known trade-offs.**
- Systems thinking pins drivers left and outcomes right, so feedback running back right to left costs crossings (about twice the plain layout at 50 concepts). That is the price of the left-to-right reading.
- An ELK layered seed was tested for this mode. It was not better on maps with large feedback components and cost an extra 0.5 s, so it was removed.

## 4. TypeScript

The project is plain JavaScript (Vite, no `tsconfig`), so the engine is written in JavaScript with JSDoc types (`LayoutInput`, `LayoutResult`, `LayoutScore`, `LayoutMode`). Editors type-check it as is, and moving to TypeScript only needs a rename to `.ts` and a `tsconfig`. I did not add TypeScript to the build without asking.

## 5. Code changes

- `src/layout/fcmLayout.js` (new): the engine. It exports `computeFcmLayout`, `runFcmLayout`, `FCM_LAYOUT_MODES`, `computeNodeMetrics`, `stronglyConnected`, `louvain`, `scoreLayout` and `removeBoxOverlaps`.
- `src/layout/fcmLayout.worker.js` (new): the worker wrapper.
- `src/SpaghettiEngine.jsx`:
  - `runFcmLayoutOffThread` (a persistent worker, with fallback to the main thread);
  - in `NetworkTabInner`: `smartLayout`, `animateTo`, the `animPositions` and `layoutReport` state, the "Smart layouts" section in the Auto Arrange menu, and a one-line report under the toolbar (crossings, overlaps, groups, feedback structures, time; hover for the full score);
  - the interim "Figure layout" menu item is removed (Cluster view supersedes it).
- `tests/test_fcm_layout.mjs` (new): tests for Louvain, betweenness, eigenvector centrality and SCC detection, plus quality, determinism and time checks at 20, 50, 100 and 200 concepts in every mode.
- No new dependencies. The worker bundles to about 30 kB including `d3-force`.
