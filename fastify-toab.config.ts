import { defineConfig } from "@csi-foxbyte/fastify-toab";
import { globalOrderMiddleware } from "./tests/test/global.middleware.js";

export default defineConfig({
  rootDir: "tests",
  globalMiddlewares: [globalOrderMiddleware],
});
