import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import multipart from "@fastify/multipart";
import underPressure from "@fastify/under-pressure";
import {
    FastifyToabConfigOptions,
    FastifyToabConfigOptionsResolved,
    resolveConfig,
} from "./config.js";
import { fastifyToab } from "./helpers.js";
import { InstrumentationInput } from "./instrumentation.js";
import { AssertError, Value } from "@sinclair/typebox/value";
import { ServiceRegistry } from "./service.js";
import { ControllerRegistry } from "./controller.js";
import { WorkerRegistry } from "./worker.js";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { FastifyAdapter } from "@bull-board/fastify";

function withoutEnabled<T extends { enabled: boolean }>(
    options: T
): Omit<T, "enabled"> {
    const { enabled: _enabled, ...pluginOptions } = options;

    return pluginOptions;
}

/**
 * Registers TOAB's built-in Fastify integrations from `config.fastify`.
 *
 * @remarks
 * Duplicate registrations are rejected when the same plugin is also present in
 * `config.plugins`, since those integrations are meant to be configured in one place.
 */
async function registerBuiltInPlugins(
    fastify: ReturnType<typeof Fastify>,
    config: FastifyToabConfigOptionsResolved
) {
    if ((config.plugins ?? []).find(p => p[0] === cors)) throw new Error("CORS already registered!");
    if (config.fastify.cors.enabled) {

        await fastify.register(cors, withoutEnabled(config.fastify.cors));
    }

    if ((config.plugins ?? []).find(p => p[0] === helmet)) throw new Error("Helmet already registered!");
    if (config.fastify.helmet.enabled) {
        await fastify.register(helmet, withoutEnabled(config.fastify.helmet));
    }

    if ((config.plugins ?? []).find(p => p[0] === rateLimit)) throw new Error("RateLimit already registered!");
    if (config.fastify.rateLimit.enabled) {
        await fastify.register(rateLimit, withoutEnabled(config.fastify.rateLimit));
    }

    if ((config.plugins ?? []).find(p => p[0] === swagger)) throw new Error("Swagger already registered!");
    if (config.fastify.swagger.enabled) {
        await fastify.register(swagger, withoutEnabled(config.fastify.swagger));
    }

    if ((config.plugins ?? []).find(p => p[0] === swaggerUi)) throw new Error("SwaggerUI already registered!");
    if (config.fastify.swaggerUi.enabled) {
        await fastify.register(swaggerUi, withoutEnabled(config.fastify.swaggerUi));
    }

    if ((config.plugins ?? []).find(p => p[0] === multipart)) throw new Error("Multipart already registered!");
    if (config.fastify.multipart.enabled) {
        await fastify.register(multipart, withoutEnabled(config.fastify.multipart));
    }

    if ((config.plugins ?? []).find(p => p[0] === underPressure)) throw new Error("UnderPressure already registered!");
    if (config.fastify.underPressure.enabled) {
        await fastify.register(underPressure, withoutEnabled(config.fastify.underPressure));
    }
}

/**
 * Boots a Fastify server from generated registries, instrumentation, and config.
 *
 * @remarks
 * This is the runtime entrypoint used by generated projects. Most applications
 * will call this through the generated `src/@internals/run.ts`.
 *
 * Before Fastify starts listening, TOAB validates `process.env` against the
 * configured TypeBox schema, resolves config defaults, registers built-in Fastify
 * plugins from `config.fastify`, then registers additional plugins from
 * `config.plugins`.
 *
 * @example
 * ```ts
 * await startServer(
 *   import.meta.resolve("./@internals/registries.js"),
 *   import.meta.resolve("./instrumentation.js"),
 *   config,
 * );
 * ```
 */
export async function startServer(
    registriesPath: string,
    instrumentationPath: string,
    config: FastifyToabConfigOptions
) {
    try {
        Value.Assert(config.env, process.env);
    } catch (error) {
        console.error("Error while validating env variables!");

        if (error instanceof AssertError) {
            for (const err of error.Errors()) {
                console.error(`${err.path.slice(1)}: ${err.message}`);
            }
        };
        process.exit(1);
    }

    const resolvedConfig = await resolveConfig(config);

    const fastify = Fastify({
        logger: process.env.NODE_ENV === "development" ? {
            transport: {
                target: "pino-pretty",
                options: {
                    translateTime: "HH:MM:ss Z",
                    ignore: "pid,hostname",
                },
            },
        } : true,
    });

    const registriesModule = await import(registriesPath) as { getRegistries: (dontInitializeWorkers?: boolean) => Promise<{ serviceRegistry: ServiceRegistry, controllerRegistry: ControllerRegistry, workerRegistry: WorkerRegistry }> }

    const registries = await registriesModule.getRegistries(resolvedConfig.server.disableWorkers);

    if (resolvedConfig.fastify.bullBoard.enabled) {
        const serverAdapter = new FastifyAdapter();

        createBullBoard({
            queues: Array.from(registries.workerRegistry.queues.values()).map(
                (queue) => new BullMQAdapter(queue),
            ),
            serverAdapter,
            options: {
                uiBasePath: resolvedConfig.fastify.bullBoard.uiBasePath
            }
        });
        serverAdapter.setBasePath(resolvedConfig.fastify.bullBoard.uiBasePath);

        fastify.register(serverAdapter.registerPlugin(), { prefix: "/bullMQ" });
    }

    const instrumentationModule = await import(instrumentationPath);

    await instrumentationModule.default({ fastify, registries } satisfies InstrumentationInput);

    await registerBuiltInPlugins(fastify, resolvedConfig);

    if (resolvedConfig.onPreStart) {
        await resolvedConfig.onPreStart(fastify, registries);
    }

    for (const [plugin, pluginOpts] of resolvedConfig.plugins ?? []) {
        fastify.register(plugin, pluginOpts ?? {});
    }

    fastify.register(fastifyToab, {
        getRegistries: async () => registries,
        globalMiddlewares: resolvedConfig.globalMiddlewares,
        includeGenericErrorResponses: resolvedConfig.includeGenericErrorResponses,
        onRouteError: resolvedConfig.onRouteError,
        logLevel: resolvedConfig.logLevel,
        logSerializers: resolvedConfig.logSerializers,
        prefix: resolvedConfig.prefix,
    });

    await fastify.ready();

    if (resolvedConfig.fastify.swagger.enabled) fastify.swagger();

    if (resolvedConfig.onReady) await resolvedConfig.onReady(fastify, registries);

    await fastify.listen(resolvedConfig.server.fastify.listen).then((f) => fastify.log.info(`Listening on ${f}`));
}
