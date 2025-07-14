import {
  FastifyInstance,
  FastifyPluginAsync,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import { setRequestContext } from "./context";
import {
  ControllerCtx,
  ControllerRegistry,
  HandlerOpts,
  HTTPMethods,
} from "./controller";
import { ServiceContainer, ServiceRegistry } from "./service";
import { QueueContainer, WorkerContainer, WorkerRegistry } from "./worker";
import {
  fastifyGenericErrorResponses,
  GenericRouteError,
  isGenericError,
} from "./errors";

function handleRouteError(
  e: unknown,
  fastify: FastifyInstance,
  composedPath: string,
  reply: FastifyReply
) {
  fastify.log.error(e, `Error in ${composedPath}.`);
  if (isGenericError(e)) {
    e.send(reply);
    return;
  }
  if (e instanceof Error) {
    GenericRouteError.fromError(
      e,
      "INTERNAL_ERROR",
      "Unknown internal error."
    ).send(reply);
    return;
  }
  new GenericRouteError("INTERNAL_ERROR", "Unknown internal error.", {
    error: String(e),
  }).send(reply);
  return;
}

function composeMiddlewares(
  middlewares: ControllerCtx["middlewares"]
): (
  ctx: unknown,
  request: FastifyRequest,
  reply: FastifyReply,
  services: ServiceContainer,
  workers: WorkerContainer,
  queues: QueueContainer
) => Promise<unknown> {
  return async (initialCtx, request, reply, services, workers, queues) => {
    let index = -1;
    let finalCtx = initialCtx;

    const dispatch = async (i: number, ctx: unknown): Promise<void> => {
      if (i <= index) {
        throw new Error("next() called multiple times");
      }

      index = i;
      finalCtx = ctx;

      const fn = middlewares[i];
      if (!fn) return;

      await fn({ ctx, request, reply, queues, workers, services }, (nextCtx) =>
        dispatch(i + 1, nextCtx.ctx)
      );
    };

    await dispatch(0, initialCtx);
    return finalCtx;
  };
}

export const fastifyToab: FastifyPluginAsync<{
  getRegistries: () => Promise<{
    controllerRegistry: ControllerRegistry;
    serviceRegistry: ServiceRegistry;
    workerRegistry: WorkerRegistry;
  }>;
}> = async (fastify, { getRegistries }) => {
  const { controllerRegistry, serviceRegistry, workerRegistry } =
    await getRegistries();

  for (const controller of controllerRegistry.controllers.values()) {
    let middlewareChain: ReturnType<typeof composeMiddlewares>;
    try {
      middlewareChain = composeMiddlewares(controller.middlewares);
    } catch (e) {
      fastify.log.error(e, "Error in middleware chain!");
      throw e;
    }

    for (const [method, routes] of Object.entries(controller.routes)) {
      for (const [path, route] of Object.entries(routes)) {
        const composedPath = `${controller.rootPath}${path}`;

        const payload = [
          composedPath,
          route.opts ?? {
            schema: {
              ...(route.body ? { body: route.body } : {}),
              ...(route.params ? { params: route.params } : {}),
              ...(route.querystring ? { body: route.querystring } : {}),
              response: route.output
                ? {
                    200: route.output,
                    ...fastifyGenericErrorResponses,
                  }
                : {
                    204: {},
                    ...fastifyGenericErrorResponses,
                  },
            },
          },
          async (request: FastifyRequest, reply: FastifyReply) => {
            try {
              setRequestContext({ request, reply });
              const ctx = await middlewareChain(
                {},
                request,
                reply,
                serviceRegistry.resolve(),
                { get: workerRegistry.getWorker },
                { get: workerRegistry.getQueue }
              );

              const handlerOpts = await createHandlerOpts({
                ctx,
                reply,
                request,
                serviceRegistry,
                workerRegistry,
              });

              try {
                const result = await route.handler(handlerOpts);

                if (!result) return reply.raw.end();

                return result;
              } catch (e) {
                return handleRouteError(e, fastify, composedPath, reply);
              }
            } catch (e) {
              return handleRouteError(e, fastify, composedPath, reply);
            }
          },
        ] as const;

        switch (method as HTTPMethods) {
          case "GET":
            fastify.get(...payload);
            break;
          case "PATCH":
            fastify.patch(...payload);
            break;
          case "DELETE":
            fastify.delete(...payload);
            break;
          case "HEAD":
            fastify.head(...payload);
            break;
          case "POST":
            fastify.post(...payload);
            break;
          case "PUT":
            fastify.put(...payload);
            break;
          case "SSE":
            throw new Error("Not implemented yet!");
            fastify.get(...payload);
            break;
        }
      }
    }
  }
};

async function createHandlerOpts({
  ctx,
  serviceRegistry,
  reply,
  request,
  workerRegistry,
}: {
  ctx: unknown;
  serviceRegistry: ServiceRegistry;
  workerRegistry: WorkerRegistry;
  reply: FastifyReply;
  request: FastifyRequest;
}): Promise<HandlerOpts> {
  return {
    ctx,
    reply,
    request,
    services: serviceRegistry.resolve(),
    workers: {
      get: workerRegistry.getWorker,
    },
    queues: {
      get: workerRegistry.getQueue,
    },
    body: request.body,
    params: request.params,
    querystring: request.query,
  };
}
