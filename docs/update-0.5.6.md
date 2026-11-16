# Documentation text for version 0.5.6

This file holds the text that version 0.5.6 adds to the three documents. The User Manual and the Methodological Annex each receive a chapter "Update for Version 0.5.6", placed after the chapter "Update for Version 0.5.5" and in the same style. The Development Log for 0.5.6 replaces the 0.5.5 log. Version 0.5.6 covers pull requests #13 to #16 (12 to 15 November 2026).

---

## User Manual: Update for Version 0.5.6

This chapter describes the changes in version 0.5.6. Like the chapters on versions 0.5.4 and 0.5.5, it takes precedence over the later sections where they differ. The analyses and their results are unchanged.

### U.10 A new look

The tool has a new palette, a new logo and a redesigned About & documentation page.

- **Palette.** Lagoon (teal) is the main colour and coral the single accent. Each step of the side menu has its own colour: Model building lagoon, Structural analysis green, State and scenario analysis sky blue, Transition analyses violet and Sensitivity analyses amber.
- **Logo.** A feedback loop of three concepts, with the concept in focus in coral.
- **Top bar.** The top bar is light, with a thin line in lagoon and coral along its lower edge. Its menus are never covered by the content.
- **About & documentation.** The page opens with a short introduction and two buttons of equal size, *Start building a map* and *Read the documentation*. It then explains what the tool is, gives three steps to a first map, offers the Getting started guide and the Meinweg game, lists the three documents with *Download PDF* and *Read online*, shows four audiences and ends with the contact details. A label above the documents states whether they describe the current version.
- **Welcome back.** When a saved model is reopened, a single line shows its name with two buttons, *Other model* and *New model*, and a close button.
- **Text size.** The smallest text in the tool is one step larger, and the text inside fold-out boxes is larger, with more line spacing.

### U.11 Five steps in the side menu

The side menu now lists five steps instead of four. Model building is split into two steps, and both are available without *Advanced tools*:

| Step | Tabs |
|---|---|
| 1. Model building | Model editor, Network |
| 2. Structural analysis | Influence Metrics, Influence Routes |
| 3. State and scenario analysis | Baseline Equilibrium, Scenarios & Simulation |
| 4. Transition analyses | Transition Point Analysis, Transition Pathways |
| 5. Sensitivity analyses | Sensitivity Analysis, Monte Carlo |

Steps 4 and 5 remain under *Advanced tools*. On phones the steps are shown as rows of tabs, as before. The Help menu holds the Getting started guide, the Meinweg game and About & documentation; the item on building a map is removed. The keyboard shortcuts of the Network tab are unchanged (section 4.1).

### U.12 The same order of fold-out boxes in every tab

Every analysis tab now shows its parts in the same order: the results, then *Advanced results*, then *Method & diagnostics*, and last the box that explains the tab (for example *How these metrics are computed* or *How it works*). On the Baseline Equilibrium tab, *Advanced diagnostics* is renamed *Advanced results*.

### U.13 A simpler Influence Metrics tab

The tab opens with three cards that name the main findings. Click a name to select that concept on the map.

| Card | Concepts shown |
|---|---|
| Strongest levers | The three concepts with the highest influence score: pushing them moves the rest of the map most. |
| Most affected | The three concepts with the highest sensitivity score: they respond most when other concepts change. |
| Key broker | The concept with the highest betweenness: it lies on the most routes between other concepts. |

The table shows five columns: concept, module, role, influence score and sensitivity score, with a small bar for each score. *Show all measures* brings back the full set of eleven measures (section 6.2). *The map as a whole* shows the size of the map and its feedback loops; the four measures of its shape (density, centralization, clustering and modularity) are under *Advanced results*.

### U.14 A simpler Influence Routes tab

The tables are shorter and each has a *Show all* button. Bridge concepts shows the first 5 rows and the table of module-to-module transmission the first 6. Strongest routes shows 10 routes and Feedback loops the strongest 5; the columns for length, crossings and modules are removed from these two tables. The loop tables per module are under *Advanced results*, and the method for finding loops is in a fold-out box at the end of the tab.

### U.15 Baseline Equilibrium: by module or all concepts

*How the system settles* and *Where each concept settles* each have a switch, *By module* or *All concepts*. *By module* shows one panel per module, as before. *All concepts* draws every concept in one panel, coloured by module and with a key of the modules; the bars of *Where each concept settles* are then sorted from highest to lowest. The browser remembers the choice. The labels at the end of the convergence lines no longer overlap when many concepts share a panel.

### U.16 Editing and exporting tables

Every results table in the tool can now be edited and exported. Move the pointer over a table and an *Edit & export table* button appears below it. It opens an editor with a live preview, in which you can:

- change the title and add a note below the table;
- choose, rename and reorder the columns;
- sort by any column, keep only the first rows and set the number of decimals;
- click any cell in the preview to change its text;
- choose a style (*Academic (lines only)*, *Grid* or *Striped rows*), a font and a text size.

The table can be exported as an Excel file, a CSV file or a PNG image, or copied for Word, where it is pasted as a real table. The editor uses the rows that are visible on screen: if a table is shortened, click *Show all* first. The changes in the editor apply to the export only; the model and its results are not changed.

### U.17 More options in the figure editor

The four steps of the figure editor (section U.5) are unchanged. Under *Fine-tune* you can now also:

- click any colour of the figure and replace it with another;
- rename labels for the export only, with a search field; the concepts in the model keep their names;
- centre the title and set its size;
- choose three more fonts: Calibri, Garamond and a monospace font.

### U.18 The Meinweg game

The Veldmeer game (sections U.3 and U.8) is replaced by the Meinweg game, opened from the Help menu with *Play the Meinweg game*. The player is the analyst of a fictional park board for the Meinweg, a national park in Limburg, and the problem is the drying out of the wet heath and fens. The people and events are invented. Saved progress from the Veldmeer game is not carried over.

**Case.** The game sets the system boundaries: the park and its edge, the next 20 years, outside drivers such as climate, national nitrogen rules and farm prices, and a map of 6 to 12 concepts. Five interviews, with a dairy farmer, the owner of a holiday park, a heathland ecologist, the regional water board and an alderman, provide the evidence. The game prescribes no concepts. The board asks three questions: what causes the drying out, which intervention would help most and who bears its costs, and what the map leaves out.

**Chapters.** The game takes about 30 minutes in eight chapters:

| Chapter | Minutes | Exercises |
|---|---|---|
| 1. Your assignment | 3 | Two quiz questions on the case. |
| 2. Fuzzy cognitive maps in three minutes | 3 | Two quiz questions on concepts, weighted arrows and feedback loops. |
| 3. Listen to the stakeholders | 4 | 3.1 Read the five interviews. 3.2 Write at least five quantities in the notebook. |
| 4. Map the concepts | 5 | 4.1 Create the game map. 4.2 Add 6 to 12 concepts. 4.3 Sort them into at least 2 modules. |
| 5. Connect cause and effect | 7 | 5.1 Draw at least 8 relationships. 5.2 Include at least 1 negative relationship. 5.3 Connect every concept. 5.4 Make sure the map contains a feedback loop. |
| 6. Run your map | 3 | 6.1 Give at least 2 concepts a starting value. 6.2 Run the baseline. 6.3 Answer board question 1. |
| 7. Test an intervention | 3 | 7.1 Make a scenario for one measure. 7.2 Run it and compare it with the baseline. 7.3 Answer board question 2. |
| 8. Advise the board | 2 | 8.1 Answer board question 3. 8.2 Download the advice. |

**Exercises.** Each chapter opens with a goal and a bar that shows how many of its tasks are done. Each exercise lists the clicks to make as numbered steps, followed by a live check that states what is done and what is still missing. The checks read the player's own model, which is kept separate from the player's other models.

**Layout.** The reading chapters (1, 2, 3 and 8) fill the whole screen in a centred column. In the hands-on chapters (4 to 7) the game sits beside the tool, and the side menu is hidden while the game is open.

**Ending.** The game ends with points (at most 325), a rank and an advice note to the board that can be downloaded. The advice note lists the feedback loops of the player's map automatically.

---

## Methodological Annex: Update for Version 0.5.6

This chapter describes the changes in version 0.5.6 that bear on the methods. No formula, default setting or numerical result changes; the changes concern how results are grouped, summarized and exported.

### U.8 Structural analysis as a separate step

Influence Metrics and Influence Routes form a step of their own, Structural analysis, between Model building and State and scenario analysis. The grouping reflects the distinction between the analysis of the graph (sections 5 to 8), which needs no simulation, and the analyses that iterate the update rule (sections 9 to 13). The computations are unchanged.

### U.9 Headline findings on Influence Metrics

The three cards at the top of the Influence Metrics tab summarize measures that the tab already computes:

- **Strongest levers**: the three concepts with the highest perturbation-based influence score (section 6), among those with a score above zero.
- **Most affected**: the three concepts with the highest perturbation-based sensitivity score (section 6), among those with a score above zero.
- **Key broker**: the concept with the highest betweenness centrality (section 5.4).

Ties are broken by the order of the concepts in the model. The cards depend on the analysis scope in the same way as the table (section 4). The shape measures of the network as a whole (sections 5.5 to 5.7) are reported under *Advanced results*; their values are unchanged.

### U.10 Shortened tables on Influence Routes

The tables of bridge concepts, module-to-module transmission, strongest routes and feedback loops show only their first rows by default (5, 6, 10 and 5 rows). The rows are the same and in the same order as before; *Show all* restores the full table. The enumeration of routes and loops (sections 8.1 and 5.10) is unchanged.

### U.11 Convergence of all concepts in one panel

With *All concepts*, the Baseline Equilibrium tab draws the trajectories of every concept in one panel and the equilibrium values as one bar chart sorted from highest to lowest. The equilibrium is the same as with *By module* (section 3.4). The end labels of the trajectories are spaced so that they do not overlap; a label can therefore sit slightly above or below the end of its line.

### U.12 Table export

The table editor reads a table as it is shown on screen: its header and the text of its cells. Numbers are therefore exported as displayed, and the setting for decimals rounds the displayed value, not the underlying result. For full precision, use the CSV exports of each tab or the Export Analysis Workbook (User Manual, section 14.3). Edits made in the table editor apply to the exported table only.

### U.13 Figure export

Renamed labels and replaced colours in the figure editor apply to the exported figure only; the model, its concept names and the results are not changed. A replaced colour applies to every element that uses it in the figure, so a colour that encodes a module or a sign should be replaced consistently with the key of the figure.

### U.14 The Meinweg game

The Meinweg game replaces the Veldmeer game (section U.4). Its didactic design is unchanged: the game sets the boundaries and the questions, offers stakeholder interviews as evidence and prescribes no concepts, so the map reflects the player's own reading of the case. The checks of the exercises are computed from the player's model: the number of concepts, modules, relationships and negative relationships, whether every concept is connected, whether the map contains a directed cycle (section 5.10), the number of starting values, and whether a baseline and a scenario have been run. The game is a teaching aid; its case and its stakeholders are fictional and are not a model of the Meinweg.

---

## Development Log, version 0.5.6

### Title table

| Field | Value |
|---|---|
| Version | 0.5.6 (prototype) |
| Log entry date | 16 November 2026 |
| Status | Released by the merge of the branch docs-0.5.6 into the GitHub main branch, together with the 0.5.6 documents and this log. Netlify deploys the site automatically. |
| Live URL | spaghetti-engine.netlify.app (Netlify, auto-deployed from the GitHub main branch) |
| Source repository | github.com/aPaarl/Spaghetti-engine, main branch |
| Previous version | 0.5.5, 12 November 2026, pull request #12 (commit 56f2f36) |
| Prepared by | A. Paarlberg |

### 1. Purpose of This Log

This Development Log records the changes from version 0.5.5 (12 November 2026) to version 0.5.6 of The Spaghetti Engine. Version 0.5.6 brings together pull requests #13 to #16: a new visual identity and About page, a separate step for structural analysis with simpler tabs, an editor for results tables, more options in the figure editor, and the Meinweg game, which replaces the Veldmeer game. The code changes were deployed between 12 and 15 November 2026; this release adds the documents that describe them and raises the version number.

The log documents what changed and why, how existing results are affected, how the changes were checked, and the deployment status.

### 2. Summary of Version 0.5.6

| Area | Change |
|---|---|
| Visual identity | New palette (lagoon and coral), new logo, light top bar, redesigned About & documentation page, a one-line welcome-back bar. The affiliation is removed from the site. |
| Side menu | Five steps: Model building and Structural analysis are separate, and both are available without Advanced tools. "Building a map" is removed from the Help menu. |
| Readability | Larger small text and fold-out text; the same order of fold-out boxes in every analysis tab. |
| Structural analysis | Influence Metrics opens with three headline cards and a five-column table; Influence Routes shows shortened tables with Show all. |
| Baseline Equilibrium | A By module / All concepts switch for both figures; end labels no longer overlap. |
| Table editor | Every results table can be edited and exported as Excel, CSV or PNG, or copied for Word. |
| Figure editor | Colour replacement, labels renamed for the export, title alignment and size, three more fonts. |
| Meinweg game | A fictional national park in Limburg replaces the Veldmeer; numbered exercises with live checks; about 30 minutes in eight chapters; full-screen reading chapters. |

### 3. The Changes in Detail

**3.1 Visual identity (pull requests #13 and #14).** The palette uses lagoon as the primary colour and coral as the single accent, with cool greys. The logo is a feedback loop of three concepts with the concept in focus in coral; the favicon, the touch icon and the files in brand-assets follow it. The About & documentation page was rebuilt around a short introduction, three start steps, cards for the guide and the game, the document cards and the contact block. The affiliation was removed from the site and the README; the contact address is unchanged.

**3.2 Side menu and readability (pull request #14).** The step Model building was split into Model building (Model editor, Network) and Structural analysis (Influence Metrics, Influence Routes). Every analysis tab orders its fold-out boxes as results, Advanced results, Method & diagnostics and the explanation of the tab. The smallest text sizes and the text inside fold-out boxes were raised.

**3.3 Structural analysis tabs (pull request #14).** Influence Metrics shows headline cards for the strongest levers, the most affected concepts and the key broker, and a table of five columns, with the full set of eleven measures behind Show all measures. Influence Routes shows shortened tables, removes the columns for length, crossings and modules from the routes and loops tables, and moves the loop tables per module to Advanced results.

**3.4 Baseline Equilibrium (pull request #13).** Both figures have a By module / All concepts switch, stored in the browser. In All concepts the convergence chart draws every concept in one panel, coloured by module, and the bars are sorted.

**3.5 Table editor (pull request #14).** A shared component reads any rendered results table (26 tables across the analysis tabs) and offers column selection, renaming and ordering, sorting, row limits, rounding, cell edits, three styles, and export to Excel, CSV, PNG or the clipboard as a Word table.

**3.6 Figure editor (pull request #14).** Under Fine-tune: replacement of any colour in the figure, labels renamed for the export only, title alignment and size, and the fonts Calibri, Garamond and a monospace font.

**3.7 Meinweg game (pull requests #14, #15 and #16).** The case was rewritten for the fictional Meinweg park board, with five new interviews and new quiz questions. Each chapter has a goal and a progress bar, and the missions became numbered exercises (3.1 to 8.2) with numbered steps and live checks. The game was then fitted to 30 minutes: chapter times of 3, 3, 4, 5, 7, 3, 3 and 2 minutes, lighter targets (6 to 12 concepts, 2 modules, 8 relationships, 1 negative relationship, 2 starting values), shorter texts, three quizzes and one written answer removed, and three board questions instead of four. The reading chapters fill the screen; in the hands-on chapters the game sits beside the tool and the side menu is hidden.

### 4. Implementation Choices

| Topic | Choice in the tool | Reason |
|---|---|---|
| Table editor | Reads the table as rendered on screen. | One editor covers every table without changes to the tabs; the exported table matches what the user sees. |
| Headline cards | Summaries of measures already computed. | Non-experts see the main findings first; no new measure needs to be explained or validated. |
| Shortened tables | First rows by default, Show all for the rest. | The tabs were visually crowded; the full results stay one click away. |
| Game targets | 6 to 12 concepts, 8 relationships. | A first playthrough took about 50 minutes; lighter targets fit the stated 30 minutes. |
| Game storage | New storage key for the Meinweg game. | Saved Veldmeer progress does not match the new chapters and exercises. |

### 5. Effect on Existing Results

No analysis result changes. The headline cards, the shortened tables and the All concepts view present existing results. Exports from the table editor are rounded as displayed. Version raised from 0.5.5 to 0.5.6 in package.json and package-lock.json.

### 6. Defects Found and Fixed

The end labels of the convergence chart overlapped when many concepts shared a panel; they are now spaced apart.

### 7. Verification

- Tests: the six automated tests pass.
- Build: the production build completes without errors.
- Website: for each of pull requests #13 to #16, every tab was opened in a browser, every figure and CSV export and the model-menu exports (JSON and the Analysis Workbook) were run, and a full playthrough of the game was completed without page errors and without sideways scrolling at phone width. For pull request #16 the points of a full playthrough add up to the maximum of 325.

### 8. Deployment Status

The code changes were deployed by the merges of pull requests #13 (12 November 2026), #14 (13 November), #15 (14 November) and #16 (15 November). Version 0.5.6 and its documents are deployed by the merge of the branch docs-0.5.6 into main. Netlify rebuilds the site automatically.

Documents: the 0.5.6 User Manual and Methodological Annex start from the 0.5.5 Word files, with an update chapter for 0.5.6 added.

### 9. Prototype Scope and Known Limitations

- All limitations listed in the 0.4.0 to 0.5.5 logs still apply.
- The table editor exports the rows shown on screen; a shortened table must be expanded with Show all before it is exported in full.
- The body chapters of the User Manual still describe the Veldmeer game and four steps in the side menu; the update chapters take precedence.

### 10. Related Documentation

| Document | Covers |
|---|---|
| The Spaghetti Engine - User Manual (version 0.5.6) | How to use every feature; the chapters Update for Version 0.5.4 to 0.5.6 describe the latest changes. |
| The Spaghetti Engine - Methodological Annex (version 0.5.6) | The methods; sections U.8 to U.14 cover the structural analysis step, the headline cards, the shortened tables, the All concepts view, table and figure export, and the Meinweg game. |
| Development Log version 0.5.5 | The 0.5.5 release: faster loading, readable imports and corrections. |
| This Development Log | What changed in 0.5.6 and the technical work behind it. |

### 11. Next Steps

- Integrate the update chapters into the body of the User Manual and the Methodological Annex at the next full revision, with new screenshots.
- Wrap long concept names in figures instead of shortening them.
- Continue with the roadmap: version 0.6.0 (modelling made easier).
