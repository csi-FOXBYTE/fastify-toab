import type { Options } from "tsup";

export const tsup: Options = {
  splitting: true,
  sourcemap: true,
  platform: "node",
  minify: true,
  dts: { 
    entry: "src/index.ts"
  },
  target: "es2020",
  format: ["esm"],
  bundle: true,
  clean: true,
  treeshake: true,
  entry: ["src/index.ts", "src/generate.ts"],
  noExternal: [],
};
