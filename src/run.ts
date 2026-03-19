import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import {
    FastifyToabConfigOptions,
    FastifyToabConfigOptionsResolved,
    resolveConfig,
} from "./config.js";
import { fastifyToab } from "./helpers.js";
import { InstrumentationInput } from "./instrumentation.js";

function isResolvedConfig(
    config: FastifyToabConfigOptions | FastifyToabConfigOptionsResolved
): config is FastifyToabConfigOptionsResolved {
    return "workDir" in config;
}

function withoutEnabled<T extends { enabled: boolean }>(
    options: T
): Omit<T, "enabled"> {
    const { enabled: _enabled, ...pluginOptions } = options;
    return pluginOptions;
}

async function registerBuiltInPlugins(
    fastify: ReturnType<typeof Fastify>,
    config: FastifyToabConfigOptionsResolved
) {
    if (config.fastify.cors.enabled) {
        await fastify.register(cors, withoutEnabled(config.fastify.cors));
    }

    if (config.fastify.helmet.enabled) {
        await fastify.register(helmet, withoutEnabled(config.fastify.helmet));
    }

    if (config.fastify.rateLimit.enabled) {
        await fastify.register(rateLimit, withoutEnabled(config.fastify.rateLimit));
    }

    if (config.fastify.swagger.enabled) {
        await fastify.register(swagger, withoutEnabled(config.fastify.swagger));
    }

    if (config.fastify.swaggerUi.enabled) {
        await fastify.register(swaggerUi, withoutEnabled(config.fastify.swaggerUi));
    }
}

/**
 * Boots a Fastify server from generated registries, instrumentation, and config.
 *
 * @remarks
 * This is the runtime entrypoint used by generated projects. Most applications
 * will call this through the generated `src/@internals/run.ts`.
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
    config: FastifyToabConfigOptions | FastifyToabConfigOptionsResolved
) {
    const resolvedConfig = isResolvedConfig(config)
        ? config
        : await resolveConfig(config);

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

    const registriesModule = await import(registriesPath);

    const registries = await registriesModule.getRegistries();

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

    // Todo check correct activation of plugins

    if (resolvedConfig.onReady) await resolvedConfig.onReady(fastify, registries);

    await fastify.listen(resolvedConfig.server.fastify.listen).then((f) => fastify.log.info(`Listening on ${f}`));
}
