import { defineConfig } from "@csi-foxbyte/fastify-toab";
import { globalOrderMiddleware } from "./tests/test/global.middleware.js";
import { Type } from "@sinclair/typebox";

export default defineConfig({
  rootDir: "tests",
  globalMiddlewares: [globalOrderMiddleware],
  env: Type.Object({
    PORT: Type.String(),
  })
});