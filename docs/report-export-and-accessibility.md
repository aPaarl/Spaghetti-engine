# Report export and accessibility

This file holds the text for the next documentation release, together with `docs/backcasting-and-empirical-data.md` and `docs/staged-interventions-and-saved-results.md`. The User Manual receives sections U.28 and U.29, and the Development Log the rows at the end. The report is checked by `tests/test_analysis_report.mjs`.

---

## User Manual

### U.28 The analysis report

The model menu offers two ways to write up an analysis:

- **Export report (.docx)** downloads a Word document.
- **Print report or save as PDF** opens the same report in a new tab and starts the print dialog. Choose *Save as PDF* as the printer to obtain a PDF.

The report contains:

1. The title, the date, the version of the tool and a note that the results are implications of the map, not forecasts.
2. The model: the number of concepts, relationships and modules, the simulation settings, a table of the concepts (module, start value, definition) and a table of the relationships (weight and, where used, delay).
3. One section for each analysis that has been run: Baseline Equilibrium, Scenarios & Simulation, Sensitivity, Monte Carlo, Transition Point Analysis and Transition Pathways. Each section has a short text, a numbered table and, where the figure has been shown on screen, a numbered figure with a caption.
4. Method and sources: a pointer to the User Manual, the Methodological Annex and the Analysis Workbook.

An analysis that has not been run is left out. A result that was computed before the model last changed is included with a note that it is out of date. The report covers the analysis scope that is active, as the Analysis Workbook does. The figures are the ones last drawn on screen, so open a tab once before exporting if its figure should appear. All numbers, with the full results of each analysis, remain available in the Analysis Workbook.

The report is written in the language of the interface. Text and tables can be edited in Word before the report is shared.

### U.29 Accessibility

The interface was checked with the automated accessibility test axe-core on all twelve tabs. Every control now has a name that a screen reader announces, the page has a main region, a header and a footer, and every text on a coloured button meets the contrast ratio of 4.5 to 1 of WCAG 2.1 level AA. The scenarios on the Scenarios tab can be selected with the keyboard (Tab, then Enter or Space). Long concept names in the bar figures wrap onto up to three lines instead of being cut off, so the full name stays readable on screen and in exported figures.

---

## Development Log

| Change | Detail |
|---|---|
| Analysis report | `src/analysisReport.js` builds the report as a list of blocks (headings, paragraphs, numbered tables and figures) and writes it as HTML for printing or as .docx with the `docx` library (9.15.3, loaded only when a report is exported). Figures come from the same chart cache as the Analysis Workbook. |
| Figure labels | `labelLines()` in `src/AnalysisFigures.jsx` wraps concept names in the steady-state, scenario and ranked bar figures (at most three lines, an ellipsis only on the last). Row heights follow the number of lines. |
| Translation check | `npm run i18n:check` (`tools/check_translations.mjs`) lists every `tr("…")` text without a Dutch entry; `--unused` lists entries no longer used, `--strict` makes the command fail when a text is missing. At release: 0 missing. |
| Accessibility | Audit with axe-core 4.14.0 (rules WCAG 2.0 and 2.1 A and AA, and best practice) on all tabs with the worked example loaded. Fixed: main, header and footer landmarks, a level-one heading per tab (for screen readers), labels on the Monte Carlo settings and the backcasting model choice, the structure and keyboard use of the scenario tabs, and the contrast of white text on coral buttons (now `coral-700`). Open: heading levels within tabs skip from one to three (moderate, best practice). |
| Prototype note | The note at the foot of the window now says that results are kept and that a report can be exported. |

Verification: all thirteen test files pass (357 checks), the production build succeeds, and in a browser the report was exported as .docx and opened in the print view (four tables, two figures) for a model with a long concept name and a scenario. No errors appeared in the console.
