import { build } from "esbuild";
import fs from "node:fs";

fs.mkdirSync("dist", { recursive: true });

const common = {
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  alias: { "@": "./src" },
  sourcemap: false,
  logLevel: "info",
};

await build({
  ...common,
  entryPoints: ["scripts/jobs.ts"],
  outfile: "dist/jobs.mjs",
  external: [
    "quickjs-emscripten",
    "quickjs-emscripten-core",
    "@jitl/*",
  ],
});

await build({
  ...common,
  entryPoints: ["scripts/collector.ts"],
  outfile: "dist/collector.mjs",
});

console.log("[jobs] built dist/jobs.mjs");
console.log("[collector] built dist/collector.mjs");
