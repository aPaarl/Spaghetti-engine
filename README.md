# The Spaghetti Engine

*Untangle complex systems, together.*

The Spaghetti Engine is a visual system modelling workspace for Fuzzy Cognitive Maps (FCMs) and nexus systems. It runs entirely in the browser: a model is built on a network canvas, simulated, and analyzed (equilibrium, scenarios, sensitivity, Monte Carlo, transition points, and transition pathways). Nothing is sent to a server, and the model is saved in the browser only.

Developer and contact: Alfred Paarlberg, Wageningen University & Research, alfred.paarlberg@wur.nl.

Version 0.4.0. The tool opens on an About & documentation page, which offers the user manual, the methodological annex, and the development log as PDF downloads.

## Running it

```bash
npm install
npm run dev        # development server with hot reload
npm run build      # production build into dist/
npm run preview    # serve the production build locally
```

If `npm run build` fails because the folder path contains an ampersand (as on the OneDrive copy), call Vite directly:

```bash
node node_modules/vite/bin/vite.js build
```

Netlify builds and deploys the site from the `main` branch.

## Layout

| Path | What is in it |
|---|---|
| `src/SpaghettiEngine.jsx` | The application: the simulation engine, the analyses, and every tab. |
| `src/AboutTab.jsx` | The About & documentation page (also exports `APP_VERSION` and `CONTACT`). |
| `src/brand.jsx` | Brand colors, the logo mark, and the hero artwork. |
| `src/docs-manifest.json` | Page count and size of each PDF, shown on the About page. Generated. |
| `src/index.css` | Tailwind theme: the `cobalt-*` and `citrus-*` scales, `ink`, `cloud`, `poppy-500`. |
| `public/docs/` | The three PDFs that the About page links to. |
| `public/favicon.svg`, `public/apple-touch-icon.png` | Site icons. |
| `brand-assets/` | Logo files (SVG and PNG) for use in documents and slides. Not deployed. |
| `tools/` | Scripts that produce the PDFs and the manifest (see below). |

## Releasing a new version

1. Raise `version` in `package.json` (the version chip, the About page, and the file names of the PDFs follow from it).
2. Update the three Word documents (user manual, methodological annex, development log).
3. Convert each Word file to a PDF and store it in `public/docs/`, named `The-Spaghetti-Engine-User-Manual-v<version>.pdf`, `The-Spaghetti-Engine-Methodological-Annex-v<version>.pdf`, and `The-Spaghetti-Engine-Development-Log-v<version>.pdf`:

   ```bash
   python tools/docx2pdf.py "<file>.docx" "The Spaghetti Engine - User Manual - version <version>" public/docs/The-Spaghetti-Engine-User-Manual-v<version>.pdf "The Spaghetti Engine - User Manual (version <version>)"
   ```

   The converter needs Python 3 with `python-docx` and `PyMuPDF`, and Edge or Chrome (set `EDGE_PATH` if the browser is not found). It adds the footer, page numbers on the contents page, bookmarks, and the document properties.
4. Rewrite the manifest: `python tools/make_docs_manifest.py`.
5. Build, check the About page downloads, and push.

## Colors

Cobalt `#2456D6` (primary), navy `#0F1B3D`, citrus `#FFD23F` (the one accent), deep citrus `#8A6B00` (yellow text on white), cloud `#F6F8FC`, poppy `#E5484D` (alerts only). Font: Inter.
