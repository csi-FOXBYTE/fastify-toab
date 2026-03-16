//@ts-check
import fastifySwagger from "@fastify/swagger";
import { defineConfig, definePlugin } from "./dist/index.mjs";
import fastifySwaggerUi from "@fastify/swagger-ui";

export default defineConfig({
  plugins: [
    definePlugin(fastifySwagger, {}),
    definePlugin(fastifySwaggerUi, { routePrefix: "/docs" }),
  ],
  rootDir: "tests",
  onPreStart: async (fastify) => {},
  onReady: async (fastify) => {
    fastify.swagger();
  },
  tsdown: {
    deps: {
      neverBundle: ["semver"],
    },
  },
});
