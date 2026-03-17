import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { ControllerRegistry, createController } from "../src/controller.js";
import { GenericRouteError } from "../src/errors.js";
import { fastifyToab } from "../src/helpers.js";
import { ServiceRegistry } from "../src/service.js";
import { WorkerRegistry } from "../src/worker.js";

async function getRegistries() {
  const workerRegistryRef: { current: WorkerRegistry | null } = {
    current: null,
  };

  const serviceRegistry = new ServiceRegistry(workerRegistryRef);
  const workerRegistry = new WorkerRegistry(serviceRegistry);
  workerRegistryRef.current = workerRegistry;

  const controllerRegistry = new ControllerRegistry(serviceRegistry);
  const controller = createController().rootPath("/errors");

  controller.addRoute("GET", "/throw").handler(async () => {
    throw new Error("boom");
  });

  controllerRegistry.register(controller);

  return { controllerRegistry, serviceRegistry, workerRegistry };
}

test("fastifyToab rethrows route errors by default", async () => {
  const fastify = Fastify();

  fastify.register(fastifyToab, { getRegistries });

  await fastify.ready();

  const response = await fastify.inject({
    method: "GET",
    url: "/errors/throw",
  });

  assert.equal(response.statusCode, 500);

  const payload = response.json();

  assert.equal(payload.error, "Internal Server Error");
  assert.equal(payload.message, "boom");
  assert.equal("status" in payload, false);

  await fastify.close();
});

test("fastifyToab supports custom route error handlers", async () => {
  const fastify = Fastify();

  fastify.register(fastifyToab, {
    getRegistries,
    onRouteError: async ({ error, reply }) => {
      if (error instanceof Error) {
        return new GenericRouteError("BAD_REQUEST", error.message).send(reply);
      }

      return new GenericRouteError(
        "INTERNAL_ERROR",
        "Unexpected non-error value thrown.",
      ).send(reply);
    },
  });

  await fastify.ready();

  const response = await fastify.inject({
    method: "GET",
    url: "/errors/throw",
  });

  assert.equal(response.statusCode, 400);

  const payload = response.json();

  assert.equal(payload.status, "BAD_REQUEST");
  assert.equal(payload.message, "boom");

  await fastify.close();
});
