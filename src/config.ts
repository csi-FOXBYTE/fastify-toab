import { SpawnOptions } from "child_process";
import type { FastifyInstance, FastifyPluginAsync, FastifyPluginCallback, FastifyRegisterOptions, FastifyListenOptions, FastifyPluginOptions } from "fastify";
import path from "path";
import { ServiceRegistry } from "./service.js";
import { WorkerRegistry } from "./worker.js";
import { InputOptions, OutputOptions, RolldownPluginOption } from "rolldown";
import { createJiti } from "jiti";
import { AnyMiddleware } from "./middleware.js";
import type { LevelWithSilent } from "pino";
import type { FastifyToabRouteErrorHandler } from "./routeError.js";

export type Registries = {
    serviceRegistry: ServiceRegistry,
    controllerRegistry: {
        controllers: Map<string, unknown>;
        register(controller: { finish(serviceRegistry: ServiceRegistry): unknown }): void;
    },
    workerRegistry: WorkerRegistry,
};

export type FastifyToabConfigOptions = {
    plugins?: (readonly [FastifyPluginAsync | FastifyPluginCallback, FastifyPluginOptions | undefined])[],
    onReady?: (fastify: FastifyInstance, registries: Registries) => Promise<void>;
    onPreStart?: (fastify: FastifyInstance, registries: Registries) => Promise<void>;
    server?: {
        fastify?: FastifyListenOptions;
        spawn?: SpawnOptions;
    };
    globalMiddlewares?: AnyMiddleware[],
    rootDir?: string;
    includeGenericErrorResponses?: boolean;
    onRouteError?: FastifyToabRouteErrorHandler;
    logLevel?: LevelWithSilent;
    logSerializers?: Record<string, (value: any) => string>;
    prefix?: string;
    rolldown?: {
        inputObject?: Record<string, string>,
        plugins?: RolldownPluginOption[],
        external?: string[],
        output?: Omit<OutputOptions, "dir" | "format" | "cleanDir" | "strict" | "esModule" | "codeSplitting" | "preserverModules" | "banner">,
    } & Omit<InputOptions, "input" | "platform">
}

export type FastifyToabConfigOptionsDefaulted = Awaited<ReturnType<typeof defineConfig>>;

export async function loadConfig() {
    const jiti = createJiti(import.meta.url);

    const configModule = await jiti.import(path.join(process.cwd(), "./fastify-toab.config.ts")) as FastifyToabConfigOptionsDefaulted;
    return configModule;
}

export function definePlugin<Opt extends FastifyPluginOptions>(plugin: FastifyPluginAsync<Opt, any> | FastifyPluginCallback<Opt>, opts?: FastifyRegisterOptions<Opt>) {
    return [plugin, opts] as const;
}

export function defineConfig<const Opt extends FastifyToabConfigOptions>(opts: Opt) {
    return {
        rootDir: opts.rootDir ?? "src",
        workDir: path.join(
            process.cwd(),
            opts.rootDir ?? "src",
        ),
        ...opts,
    }
};
