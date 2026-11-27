# Metro map of the backcasting paths

This file holds the text for the next documentation release, together with the other files in `docs/`. The Methodological Annex receives section U.24, the User Manual section U.30, and the Development Log the row at the end. The behaviour is checked by `tests/test_backcasting.mjs`.

---

## Methodological Annex

### U.24 Alternative paths in backcasting

**Motivation.** The backcasting search of section U.19 reports one path: the order of steps that brings today's system closest to the vision. While searching, it keeps the best few paths at every stage (the search width). These alternatives show where the order of steps matters and where it does not, which the single path hides. They are now kept and drawn as a metro map, in the style of the Transition Pathways map (chapter 13) and the adaptation pathways maps of Haasnoot et al. (2012, 2013).

**Alternatives.** At stage k the search keeps the w paths of k steps that come closest to the vision, where w is the search width. Every path kept at some stage is listed once. A path of k steps grows out of a path of k − 1 steps that is also listed, so the alternatives form a tree that starts from today. With a search width of 1 the tree is the single path and its shorter stages. The closest path is the one the search reports; no alternative comes closer.

**The map.** Each path is a row. The horizontal axis counts the steps, so a path of k steps runs from today (0) to k. Steps are phases, not periods of time. Each step has its own colour, and a path of several steps is dashed in the colour of each step. A path that continues another starts at the end of its first step, and a vertical line joins it to the path it continues. A path ends with a filled circle, or with a bar where at least one outcome ends further from the vision than it is today. The scorecard gives, for each path, the share of the distance to the vision that it closes (section U.19) and the settled value of each outcome at its end, with the value in the vision under each outcome's name. The map shows the eight paths that close most of the distance, the path that is opened, and every shorter path they grow out of.

**Interpretation.** Paths that differ only in their first step and reach the same share show that the opening move is interchangeable. A path that ends with a bar closes much of the distance on average but moves at least one outcome the wrong way, which may matter more to participants than the average. The share of the distance is a mean over the chosen outcomes, so the scorecard should be read per outcome as well.

---

## User Manual

### U.30 Metro map of the paths to the vision

After *Find the path* on the Backcasting tab, a metro map appears above the path. Each row is a path that the search kept, read from today on the left, one step at a time. The percentage after a path and the first column of the scorecard give the share of the distance to the vision that the path closes; the other columns give each outcome at the end of the path. The closest path is in bold.

Click a path to show its steps in the section below. The heading then reads *Another path from today to the vision*; *Show the closest path* returns to the path the search recommends. For an alternative path the column *needed* is not shown, because it is computed only for the closest path. A larger search width (3 or 5) gives more alternatives; with width 1 the map shows a single path. *Export figure* saves the map as PNG, SVG or PDF, and *Text* sets its text size.

---

## Development Log

| Change | Detail |
|---|---|
| Backcasting alternatives | `backcast()` returns `alternatives` (every path the beam kept, with its steps, share closed and end state) and `bestId`. `backcastMetroCandidates()` turns them into routes for `metroRows()`, with one stage per step. |
| Metro map component | `PathwayMetroMap` takes optional texts, route labels, scorecard values and an axis in whole steps, so the Transition Pathways and Backcasting tabs share it. The Transition Pathways map is unchanged. |

Verification: all twelve test files pass (347 checks; `test_backcasting.mjs` has 12 new checks), the production build succeeds, and in a browser the worked example drew nine paths; clicking one opened its steps, and *Show the closest path* returned to the closest one. No errors appeared in the console.
