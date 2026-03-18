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

/**
 * Loads `fastify-toab.config.ts` from the current working directory.
 *
 * @remarks
 * This is used by the generated CLI/runtime entrypoints and resolves the config
 * with `jiti`, so TypeScript configs can be consumed without a separate build step.
 *
 * @example
 * ```ts
 * const config = await loadConfig();
 * console.log(config.rootDir);
 * ```
 */
export async function loadConfig() {
    const jiti = createJiti(import.meta.url);

    const configModule = await jiti.import(path.join(process.cwd(), "./fastify-toab.config.ts")) as FastifyToabConfigOptionsDefaulted;
    return configModule;
}

/**
 * Wraps a Fastify plugin together with its registration options.
 *
 * @remarks
 * Use this inside `defineConfig({ plugins: [...] })` so plugin options stay typed.
 *
 * @example
 * ```ts
 * definePlugin(swagger, { openapi: { info: { title: "API", version: "1.0.0" } } })
 * ```
 */
export function definePlugin<Opt extends FastifyPluginOptions>(plugin: FastifyPluginAsync<Opt, any> | FastifyPluginCallback<Opt>, opts?: FastifyRegisterOptions<Opt>) {
    return [plugin, opts] as const;
}

/**
 * Declares the TOAB runtime configuration for a project.
 *
 * @remarks
 * The returned object is also used for type inference by helpers like
 * `fastify-toab.globals.d.ts`.
 *
 * @example
 * ```ts
 * export default defineConfig({
 *   rootDir: "src",
 *   globalMiddlewares: [],
 * });
 * ```
 */
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
