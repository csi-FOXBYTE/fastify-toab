import Fastify from "fastify";
import { fastifyStructured } from "../src/helpers";
import { controllerRegistry, serviceRegistry } from "./registries";

const fastify = Fastify({});

fastify.register(fastifyStructured, { controllerRegistry, serviceRegistry });

(async () => {
  await fastify.ready();

  await fastify.listen({
    port: 5000,
  });
})();
