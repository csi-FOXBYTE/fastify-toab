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
  entry: ["src/cli.ts", "src/index.ts"],
  publint: true,
  copy: [
    {
      from: "src/projectTemplate", to: "dist",
    }
  ],
  deps: {
    neverBundle: ["fastify", "@sinclair/typebox", "bullmq", "tsdown"],
  }
});