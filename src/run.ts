import "dotenv/config";
import Fastify from "fastify";
import { loadConfig } from "./config.js";
import { fastifyToab } from "./helpers.js";

export async function startServer(registriesPath: string, instrumentationPath: string) {
    const config = await loadConfig();

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

    await instrumentationModule.default(fastify, registries);

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