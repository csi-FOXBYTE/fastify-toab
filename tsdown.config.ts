import { defineConfig } from "tsdown";

export default defineConfig({
  sourcemap: false,
  platform: "node",
  minify: true,
  dts: true,
  target: "es2020",
  banner: "#!/usr/bin/env node\n",
  format: ["esm"],
  unbundle: false,
  clean: true,
  exports: true,
  treeshake: true,
  entry: ["src/cli.ts", "src/index.ts", "src/dev.ts"],
  publint: true,
  deps: {
    neverBundle: ["fastify", "@sinclair/typebox", "bullmq", "tsdown", "./fastify-toab.config.mjs"],
  }
});