import Fastify from "fastify";
import { fastifyToab } from "../src/helpers";
import { getRegistries } from "./registries";

const fastify = Fastify({});

fastify.register(fastifyToab, { getRegistries });

(async () => {
  await fastify.ready();

  await fastify.listen({
    port: 5000,
  });
})();
