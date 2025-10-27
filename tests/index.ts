import Fastify from "fastify";
import { fastifyToab } from "../src/helpers";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
import { getRegistries } from "./registries";

const fastify = Fastify({});

fastify.register(fastifySwagger, {});
fastify.register(fastifySwaggerUi, {
  routePrefix: "/docs",
});

fastify.register(fastifyToab, { getRegistries });

(async () => {
  await fastify.ready();

  fastify.swagger();

  await fastify.listen({
    port: 5000,
  });
})();
