import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    watch: {
      // This project lives inside a OneDrive-synced folder. OneDrive's
      // background sync periodically touches files on its own schedule
      // (writing content, then updating sync-status metadata a moment
      // later) with no real edit behind it. Chokidar (Vite's file watcher)
      // was picking these up as genuine changes and pushing a live
      // hot-reload into the page at effectively random moments — including,
      // by pure bad luck, sometimes mid-drag on the Network canvas, which
      // is what was making the graph seem to "disappear when moving
      // components" even when nobody had touched the code. awaitWriteFinish
      // makes chokidar wait for a file to stop changing for a short window
      // before treating it as a real change, which filters out that
      // touch-then-metadata-update pattern while still picking up an actual
      // save (which settles well within the window) normally.
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100,
      },
    },
  },
  // Pre-bundle every heavy dependency up front, at server start, instead of
  // letting Vite discover them lazily as modules are imported. When Vite
  // discovers a new dependency mid-session it re-optimizes and forces a
  // reload, and in this project that repeatedly left the running page
  // holding references to dependency chunks the server had already replaced
  // — which showed up as the Network canvas rendering its concept boxes but
  // none of its relationships (React Flow silently drops edges whose handle
  // lookups resolve against a mismatched copy of the library). Listing them
  // explicitly means the optimizer's work is finished before the app ever
  // loads, so there's nothing left to discover and re-optimize later.
  // This is a dev-server concern only; a production build bundles
  // everything ahead of time regardless.
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "@xyflow/react",
      "recharts",
      "lucide-react",
      "d3-force",
      "elkjs/lib/elk.bundled.js",
      "exceljs",
      "html-to-image",
    ],
  },
});
