import Fastify from "fastify";
import { fastifyStructured } from "../src/helpers";
import { getRegistries } from "./registries";

const fastify = Fastify({});

fastify.register(fastifyStructured, { getRegistries });

(async () => {
  await fastify.ready();

  await fastify.listen({
    port: 5000,
  });
})();
