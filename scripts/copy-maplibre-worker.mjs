// MapLibre GL 6 loads its web worker relative to its own module URL, which breaks once a bundler
// moves the module into a hashed chunk. Serve the worker files from /public and point MapLibre at them.
import { copyFileSync, mkdirSync } from "node:fs";
const src = new URL("../node_modules/maplibre-gl/dist/", import.meta.url);
const dst = new URL("../public/vendor/", import.meta.url);
mkdirSync(dst, { recursive: true });
for (const f of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) copyFileSync(new URL(f, src), new URL(f, dst));
console.log("copied MapLibre worker files to public/vendor");
