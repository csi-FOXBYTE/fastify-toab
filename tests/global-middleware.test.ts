import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { ControllerRegistry, createController } from "../src/controller";
import { fastifyToab } from "../src/helpers";
import { ServiceRegistry } from "../src/service";
import { WorkerRegistry } from "../src/worker";
import { Type } from "@sinclair/typebox";

async function getRegistries() {
  const workerRegistryRef: { current: WorkerRegistry | null } = {
    current: null,
  };

  const serviceRegistry = new ServiceRegistry(workerRegistryRef);
  const workerRegistry = new WorkerRegistry(serviceRegistry);
  workerRegistryRef.current = workerRegistry;

  const controllerRegistry = new ControllerRegistry(serviceRegistry);

  const firstController = createController().rootPath("/first");
  firstController
    .addRoute("GET", "/")
    .output(Type.Object({ order: Type.Optional(Type.Array(Type.String())) }))
    .handler(async ({ ctx }) => {
      return { order: (ctx as { order?: string[] }).order ?? [] };
    });
  controllerRegistry.register(firstController);

  const secondController = createController()
    .use(async ({ ctx }, next) => {
      await next({
        ctx: {
          ...(ctx as Record<string, unknown>),
          order: [...((ctx as { order?: string[] }).order ?? []), "controller"],
        },
      });

      return ctx;
    })
    .rootPath("/second");

  secondController
    .addRoute("GET", "/")
    .output(Type.Object({ order: Type.Optional(Type.Array(Type.String())) }))
    .handler(async ({ ctx }) => {
      return { order: (ctx as { order?: string[] }).order ?? [] };
    });
  controllerRegistry.register(secondController);

  return { controllerRegistry, serviceRegistry, workerRegistry };
}

test("fastifyToab applies global middlewares to all controllers", async () => {
  const fastify = Fastify();

  fastify.register(fastifyToab, {
    getRegistries,
    globalMiddlewares: [
      async ({ ctx }, next) => {
        await next({
          ctx: {
            ...(ctx as Record<string, unknown>),
            order: [...((ctx as { order?: string[] }).order ?? []), "global"],
          },
        });

        return ctx;
      },
    ],
  });

  await fastify.ready();

  const firstResponse = await fastify.inject({
    method: "GET",
    url: "/first",
  });

  const secondResponse = await fastify.inject({
    method: "GET",
    url: "/second",
  });

  assert.equal(firstResponse.statusCode, 200);
  assert.deepEqual(firstResponse.json().order, ["global"]);

  assert.equal(secondResponse.statusCode, 200);
  assert.deepEqual(secondResponse.json().order, ["global", "controller"]);

  await fastify.close();
});
