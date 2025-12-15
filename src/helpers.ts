import type {
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
  fastifyGenericErrorResponsesRefs,
  fastifyGenericErrorResponsesSchemas,
  GenericRouteError,
  isGenericError,
} from "./errors";
import { Type, TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

export function SSEOf<T extends TSchema>(
  schema: T,
  example?: unknown
): TSchema {
  const ex = example ?? Value.Create(schema as any);

  const msg = `data: ${JSON.stringify(ex)}`;
  const ping = `:ok`;
  const err = `error: ${JSON.stringify({
    code: "INTERNAL_ERROR",
    message: "Something went wrong",
  })}`;

  return {
    description:
      'Server-Sent Events stream. Each message is UTF-8 text containing lines like "data: <JSON>".',
    content: {
      "text/event-stream": {
        schema: Type.String({
          examples: [msg, ping, err],
          description:
            'Server-Sent Events stream. Each message is UTF-8 text containing lines like "data: <JSON>".',
        }),
      },
    },
  } as unknown as TSchema;
}

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
  for (const errorEntry of Object.entries(
    fastifyGenericErrorResponsesSchemas
  )) {
    fastify.addSchema(errorEntry[1]);
  }

  const { controllerRegistry, serviceRegistry, workerRegistry } =
    await getRegistries();

  await serviceRegistry.initializeInstant();

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
        try {
          const composedPath = `${controller.rootPath}${
            path === "/" ? "" : path
          }`;
          const payload = [
            composedPath,
            {
              ...route.opts,
              schema: {
                ...route.opts?.schema,
                tags: [controller.rootPath.substring(1)],
                ...(route.body ? { body: route.body } : {}),
                ...(route.params ? { params: route.params } : {}),
                ...(route.querystring ? { body: route.querystring } : {}),
                ...(route.headers ? { headers: route.headers } : {}),
                response: route.output
                  ? {
                      200: route.output,
                      ...fastifyGenericErrorResponsesRefs,
                    }
                  : {
                      204: {},
                      ...fastifyGenericErrorResponsesRefs,
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

                const abortController = new AbortController();

                request.raw.on("close", () => {
                  abortController.abort("User disconnect.");
                });

                const handlerOpts = await createHandlerOpts({
                  ctx,
                  reply,
                  request,
                  serviceRegistry,
                  signal: abortController.signal,
                  workerRegistry,
                });

                const result = await route.handler(handlerOpts);

                if (!result) return reply.raw.end();

                return result;
              } catch (e) {
                return handleRouteError(e, fastify, composedPath, reply);
              }
            },
          ] as const;

          switch (method as HTTPMethods) {
            case "GET":
              fastify.get(...payload);
              break;
            case "ALL":
              fastify.all(...payload);
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
              fastify.get(
                payload[0],
                {
                  ...payload[1],
                  schema: {
                    ...payload[1].schema,
                    response: {
                      ...payload[1].schema?.response,
                      200: SSEOf(route.output ?? Type.Void()),
                    },
                  },
                },
                async (request, reply) => {
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

                    const abortController = new AbortController();

                    const handlerOpts = await createHandlerOpts({
                      ctx,
                      reply,
                      request,
                      serviceRegistry,
                      signal: abortController.signal,
                      workerRegistry,
                    });

                    const pingInterval = setInterval(() => {
                      reply.raw.write(":ok\n\n");
                    }, 5_000);

                    request.raw.on("close", () => {
                      clearInterval(pingInterval);
                      abortController.abort("User disconnect.");
                    });

                    reply.raw.writeHead(200, "OK", {
                      "content-type": "text/event-stream; charset=utf-8",
                      connection: "keep-alive",
                      "cache-control": "no-cache,no-transform",
                      "x-no-compression": 1,
                    });

                    try {
                      for await (const part of route.handler<"SSE">(
                        handlerOpts
                      )) {
                        if (abortController.signal.aborted) break;
                        reply.raw.write(`data: ${JSON.stringify(part)}\n\n`);
                      }
                    } catch (e) {
                      reply.raw.write(`error: ${JSON.stringify(e)}\n\n`);
                    }

                    clearInterval(pingInterval);
                    reply.raw.end();
                  } catch (e) {
                    return handleRouteError(e, fastify, composedPath, reply);
                  }
                }
              );
              break;
            default:
              throw new Error(`No handler for "${method}" found.`);
          }
        } catch (e) {
          fastify.log.error(
            `Route ${`${controller.rootPath}${
              path === "/" ? "" : path
            }`} had an error.`,
            e
          );
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
  signal,
}: {
  ctx: unknown;
  serviceRegistry: ServiceRegistry;
  workerRegistry: WorkerRegistry;
  reply: FastifyReply;
  request: FastifyRequest;
  signal: AbortSignal;
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
    headers: request.headers,
    signal,
  };
}
