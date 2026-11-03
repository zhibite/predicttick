import { build } from "esbuild";
import fs from "node:fs";

fs.mkdirSync("dist", { recursive: true });

await build({
  entryPoints: ["scripts/jobs.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  outfile: "dist/jobs.mjs",
  alias: { "@": "./src" },
  external: [
    "quickjs-emscripten",
    "quickjs-emscripten-core",
    "@jitl/*",
  ],
  sourcemap: false,
  logLevel: "info",
});

console.log("[jobs] built dist/jobs.mjs");
