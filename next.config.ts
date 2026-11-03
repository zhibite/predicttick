import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // QuickJS ships a WASM runtime and loads node:module internally. Keep it
  // outside the Turbopack server bundle so the standalone build can trace it.
  serverExternalPackages: [
    "quickjs-emscripten",
    "quickjs-emscripten-core",
    "@jitl/quickjs-wasmfile-release-sync",
  ],
  /* config options here */
  webpack(config) {
    config.module.rules.push({
      test: /\.svg$/,
      use: ["@svgr/webpack"],
    });
    return config;
  },
    
    turbopack: {
      rules: {
        '*.svg': {
          loaders: ['@svgr/webpack'],
          as: '*.js',
        },
      },
    },
  
};

export default nextConfig;
