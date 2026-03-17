import "dotenv/config";
import Fastify from "fastify";
import { FastifyToabConfigOptionsDefaulted } from "./config.js";
import { fastifyToab } from "./helpers.js";
import { InstrumentationInput } from "./instrumentation.js";

export async function startServer(registriesPath: string, instrumentationPath: string, config: FastifyToabConfigOptionsDefaulted) {
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

    if (config.onPreStart) await config.onPreStart(fastify, registries);

    for (const [plugin, pluginOpts] of config.plugins ?? []) {
        fastify.register(plugin, pluginOpts ?? {});
    }

    fastify.register(fastifyToab, {
        getRegistries: async () => registries,
    });

    await fastify.ready();

    if (config.onReady) await config.onReady(fastify, registries);

    await fastify.listen({
        port: 5000,
        ...config.server?.fastify,
    }).then((f) => fastify.log.info(`Listening on ${f}`));
}