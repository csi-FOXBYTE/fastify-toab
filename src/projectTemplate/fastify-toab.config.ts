//@ts-check
import { defineConfig } from "@csi-foxbyte/fastify-toab";
import { Type } from "@sinclair/typebox";

export default defineConfig({
  plugins: [],
  rootDir: "src",
  env: Type.Object({
    PORT: Type.String({ default: "5000" }),
  }),
});