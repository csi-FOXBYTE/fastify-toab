import type {
    FastifyInstance,
    FastifyPluginAsync,
    FastifyReply,
    FastifyRequest,
} from "fastify";
import { setRequestContext } from "./context.js";
import {
    ControllerRegistry,
    HandlerOpts,
    HTTPMethods,
} from "./controller.js";
import { ServiceContainer, ServiceRegistry } from "./service.js";
import { QueueContainer, WorkerContainer, WorkerRegistry } from "./worker.js";
import {
    fastifyGenericErrorResponsesRefs,
    fastifyGenericErrorResponsesSchemas,
    handleRouteError as sendGenericRouteError,
} from "./errors.js";
import { Type, TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import {
    AnyMiddleware,
    MiddlewareContext,
} from "./middleware.js";
import {
    FastifyToabRouteErrorHandler,
} from "./routeError.js";

/**
 * Creates an OpenAPI response schema for Server-Sent Events endpoints.
 *
 * @remarks
 * This is used internally for `SSE` routes and can also be reused when you need
 * the generated event-stream schema directly.
 *
 * @example
 * ```ts
 * const schema = SSEOf(Type.Object({ message: Type.String() }));
 * ```
 */
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

export type FastifyToabOptions = {
    getRegistries: () => Promise<{
        controllerRegistry: ControllerRegistry;
        serviceRegistry: ServiceRegistry;
        workerRegistry: WorkerRegistry;
    }>;
    globalMiddlewares?: readonly AnyMiddleware[];
    onRouteError?: FastifyToabRouteErrorHandler;
    includeGenericErrorResponses?: boolean;
};

/**
 * Default route error handler that renders TOAB's generic error response format.
 *
 * @example
 * ```ts
 * export default defineConfig({
 *   onRouteError: genericRouteErrorHandler,
 * });
 * ```
 */
export const genericRouteErrorHandler: FastifyToabRouteErrorHandler = ({
    error,
    reply,
}) => {
    sendGenericRouteError(error, reply);
};

function toError(e: unknown): Error {
    if (e instanceof Error) return e;
    if (typeof e === "string") return new Error(e);

    return new Error(`Unexpected non-error value thrown: ${String(e)}`);
}

async function handleRouteError(
    e: unknown,
    fastify: FastifyInstance,
    composedPath: string,
    request: FastifyRequest,
    reply: FastifyReply,
    onRouteError?: FastifyToabRouteErrorHandler
) {
    fastify.log.error(e, `Error in ${composedPath}.`);

    if (onRouteError) {
        await onRouteError({
            error: e,
            fastify,
            composedPath,
            request,
            reply,
        });
    }

    if (reply.sent) return;

    throw toError(e);
}

function composeMiddlewares(
    middlewares: readonly AnyMiddleware[]
): (
    ctx: MiddlewareContext,
    request: FastifyRequest,
    reply: FastifyReply,
    services: ServiceContainer,
    workers: WorkerContainer,
    queues: QueueContainer
) => Promise<MiddlewareContext> {
    return async (initialCtx, request, reply, services, workers, queues) => {
        let index = -1;
        let finalCtx = initialCtx;

        const dispatch = async (
            i: number,
            ctx: MiddlewareContext
        ): Promise<void> => {
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

/**
 * Fastify plugin that registers all generated TOAB controllers and routes.
 *
 * @remarks
 * Use this if you want to wire the runtime manually instead of relying on the
 * generated `startServer(...)` entrypoint.
 *
 * @example
 * ```ts
 * fastify.register(fastifyToab, {
 *   getRegistries: async () => registries,
 * });
 * ```
 */
export const fastifyToab: FastifyPluginAsync<FastifyToabOptions> = async (
    fastify,
    {
        getRegistries,
        globalMiddlewares = [],
        onRouteError,
        includeGenericErrorResponses = false,
    }
) => {
    if (includeGenericErrorResponses) {
        for (const errorEntry of Object.entries(
            fastifyGenericErrorResponsesSchemas
        )) {
            fastify.addSchema(errorEntry[1]);
        }
    }

    const genericErrorResponses = includeGenericErrorResponses
        ? fastifyGenericErrorResponsesRefs
        : {};

    const { controllerRegistry, serviceRegistry, workerRegistry } =
        await getRegistries();

    await serviceRegistry.initializeInstant();

    for (const controller of controllerRegistry.controllers.values()) {
        for (const [method, routes] of Object.entries(controller.routes)) {
            for (const [path, route] of Object.entries(routes)) {
                try {
                    const middlewareChain = composeMiddlewares([
                        ...globalMiddlewares,
                        ...controller.middlewares,
                        ...route.middlewares,
                    ]);

                    const composedPath = `${controller.rootPath}${path === "/" ? "" : path
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
                                ...(route.querystring ? { querystring: route.querystring } : {}),
                                ...(route.headers ? { headers: route.headers } : {}),
                                response: route.output
                                    ? {
                                        200: route.output,
                                        ...genericErrorResponses,
                                    }
                                    : {
                                        204: {},
                                        ...genericErrorResponses,
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

                                if (result === undefined) return reply.raw.end();

                                return result;
                            } catch (e) {
                                return handleRouteError(
                                    e,
                                    fastify,
                                    composedPath,
                                    request,
                                    reply,
                                    onRouteError
                                );
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
                                        return handleRouteError(
                                            e,
                                            fastify,
                                            composedPath,
                                            request,
                                            reply,
                                            onRouteError
                                        );
                                    }
                                }
                            );
                            break;
                        default:
                            throw new Error(`No handler for "${method}" found.`);
                    }
                } catch (e) {
                    fastify.log.error(
                        `Route ${`${controller.rootPath}${path === "/" ? "" : path
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
    const path = request.url.split("?")[0] ?? request.url;

    return {
        ctx,
        path,
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

/**
 * Uppercases the first character of a word.
 */
export function capitalize(word: string) {
    return word.charAt(0).toUpperCase() + word.slice(1);
}

/**
 * Lowercases the first character of a word.
 */
export function uncapitalize(word: string) {
    return word.charAt(0).toLowerCase() + word.slice(1);
}
