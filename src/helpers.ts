import { FastifyPluginCallback, FastifyReply, FastifyRequest } from "fastify";
import {
    ControllerCtx,
    ControllerRegistry,
    HandlerOpts
} from "./controller";
import { ServiceRegistry } from "./service";
import { setContext } from "./context";

function composeMiddlewares(
  middlewares: ControllerCtx["middleWares"]
): (ctx: unknown, request: FastifyRequest, reply: FastifyReply) => Promise<unknown> {
  return async (initialCtx, request, reply) => {
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

      await fn({ ctx, request, reply }, (nextCtx) => dispatch(i + 1, nextCtx.ctx));
    };

    await dispatch(0, initialCtx);
    return finalCtx;
  };
}

export const fastifyStructured: FastifyPluginCallback<{
  controllerRegistry: ControllerRegistry;
  serviceRegistry: ServiceRegistry;
}> = (fastify, { controllerRegistry, serviceRegistry }, done) => {
  for (const controller of controllerRegistry.controllers.values()) {
    const middlewareChain = composeMiddlewares(controller.middleWares);

    for (const [method, routes] of Object.entries(controller.routes)) {
      for (const [path, route] of Object.entries(routes)) {
        const composedPath = `${controller.rootPath}${path}`;

        switch (method) {
          case "GET":
            fastify.get(
              composedPath,
              route.opts ?? {
                schema: {
                  ...(route.body ? { body: route.body } : {}),
                  ...(route.params ? { params: route.params } : {}),
                  ...(route.querystring ? { body: route.querystring } : {}),
                  response: route.output
                    ? {
                        200: route.output,
                      }
                    : {
                        204: {},
                      },
                },
              },
              async (request, reply) => {
                try {
                  const ctx = await middlewareChain({}, request, reply);

                  const handlerOpts = await createHandlerOpts({
                    ctx,
                    reply,
                    request,
                    serviceRegistry,
                  });

                  setContext({ ctx, request, reply });

                  const result = await route.handler(handlerOpts);

                  if (!result) return reply.raw.end();

                  return result;
                } catch (e) {}
              }
            );
            break;
        }
      }
    }
  }

  done();
};

async function createHandlerOpts({
  ctx,
  serviceRegistry,
  reply,
  request,
}: {
  ctx: unknown;
  serviceRegistry: ServiceRegistry;
  reply: FastifyReply;
  request: FastifyRequest;
}): Promise<HandlerOpts> {
  return {
    ctx,
    reply,
    request,
    services: await serviceRegistry.resolve(),
    body: request.body,
    params: request.params,
    querystring: request.query,
  };
}
