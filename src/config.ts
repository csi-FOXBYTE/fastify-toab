import { SpawnOptions } from "child_process";
import { type FastifyInstance, type FastifyPluginAsync, type FastifyPluginCallback, type FastifyRegisterOptions, type FastifyListenOptions, type FastifyPluginOptions } from "fastify";
import path from "path";
import { pathToFileURL } from "url";
import { ServiceRegistry } from "./service.js";
import { WorkerRegistry } from "./worker.js";
import { InputOptions, OutputOptions, RolldownPluginOption } from "rolldown";
import { createJiti } from "jiti";
import { AnyMiddleware } from "./middleware.js";
import type { LevelWithSilent } from "pino";
import type { FastifyToabRouteErrorHandler } from "./routeError.js";

import type { FastifyCorsOptions as FastifyCorsPluginOptions } from "@fastify/cors";
import type { FastifyHelmetOptions as FastifyHelmetPluginOptions } from "@fastify/helmet";
import type { RateLimitPluginOptions as FastifyRateLimitPluginOptions } from "@fastify/rate-limit";
import { FastifyMultipartOptions } from "@fastify/multipart";
import { TObject, TOptional, TString } from "@sinclair/typebox";
import type { FastifyUnderPressureOptions } from "@fastify/under-pressure";
import { BoardOptions } from "@bull-board/api/typings/app";

type ToggleablePluginOptions<T> = T & { enabled?: boolean };

export type FastifyCorsOptions = FastifyCorsPluginOptions;
export type FastifyHelmetOptions = FastifyHelmetPluginOptions;
export type FastifyDynamicSwaggerOptions = Extract<
    Parameters<typeof import("@fastify/swagger").default>[1],
    { mode?: "dynamic" }
>;
export type FastifySwaggerUiOptions =
    Parameters<typeof import("@fastify/swagger-ui").default>[1];
export type RateLimitPluginOptions = FastifyRateLimitPluginOptions;

export type FastifyCorsConfigOptions = ToggleablePluginOptions<FastifyCorsOptions>;
export type FastifyHelmetConfigOptions = ToggleablePluginOptions<FastifyHelmetOptions>;
export type FastifySwaggerConfigOptions =
    ToggleablePluginOptions<FastifyDynamicSwaggerOptions>;
export type FastifySwaggerUiConfigOptions =
    ToggleablePluginOptions<FastifySwaggerUiOptions>;
export type FastifyRateLimitConfigOptions =
    ToggleablePluginOptions<RateLimitPluginOptions>;
export type FastifyMultipartConfigOptions = ToggleablePluginOptions<FastifyMultipartOptions>;
export type FastifyUnderPressureConfigOptions = ToggleablePluginOptions<FastifyUnderPressureOptions>;
export type FastifyBullBoardConfigOptions = ToggleablePluginOptions<BoardOptions>;

export type Registries = {
    serviceRegistry: ServiceRegistry,
    controllerRegistry: {
        controllers: Map<string, unknown>;
        register(controller: { finish(serviceRegistry: ServiceRegistry): unknown }): void;
    },
    workerRegistry: WorkerRegistry,
};

export type FastifyToabResolveOpts = {
    isDev: boolean;
}

export type FastifyToabConfigOptions = {
    env: TObject<Record<string, TString | TOptional<TString>>>;
    plugins?: ReturnType<typeof definePlugin>[],
    onReady?: (fastify: FastifyInstance, registries: Registries) => Promise<void>;
    onPreStart?: (fastify: FastifyInstance, registries: Registries) => Promise<void>;
    fastify?: (opts: FastifyToabResolveOpts) => {
        cors?: FastifyCorsConfigOptions;
        helmet?: FastifyHelmetConfigOptions;
        swagger?: FastifySwaggerConfigOptions;
        swaggerUi?: FastifySwaggerUiConfigOptions;
        rateLimit?: FastifyRateLimitConfigOptions;
        multipart?: FastifyMultipartConfigOptions;
        underPressure?: FastifyUnderPressureConfigOptions;
        bullBoard?: FastifyBullBoardConfigOptions;
    };
    server?: {
        fastify?: {
            listen?: FastifyListenOptions;
        }
        spawn?: SpawnOptions;
        disableWorkers?: boolean;
    };
    globalMiddlewares?: readonly AnyMiddleware[],
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

export type FastifyToabConfigOptionsDefaulted = Awaited<ReturnType<typeof loadConfig>>;

export interface FastifyToabConfigOptionsResolved extends Omit<FastifyToabConfigOptions, 'fastify' | 'server'> {
    rootDir: string;
    workDir: string;
    logLevel: LevelWithSilent;
    includeGenericErrorResponses: boolean;
    server: {
        fastify: {
            listen: FastifyListenOptions;
        };
        disableWorkers: boolean;
        spawn?: SpawnOptions;
    };
    fastify: {
        cors: FastifyCorsOptions & { enabled: boolean };
        helmet: FastifyHelmetOptions & { enabled: boolean };
        swagger: FastifyDynamicSwaggerOptions & { enabled: boolean };
        swaggerUi: FastifySwaggerUiOptions & { enabled: boolean };
        rateLimit: RateLimitPluginOptions & { enabled: boolean };
        multipart: FastifyMultipartOptions & { enabled: boolean };
        underPressure: FastifyUnderPressureOptions & { enabled: boolean };
        bullBoard: Exclude<BoardOptions, "uiBasePath"> & { enabled: boolean, uiBasePath: string };
    };
}

/**
 * Normalizes a user config object into the runtime shape used by the generated server.
 *
 * @remarks
 * This applies defaults for built-in Fastify integrations, logger settings, listen
 * options, and worker startup flags. It does not execute any plugin registration.
 */
export async function resolveConfig(
    opts: FastifyToabConfigOptions,
    cwd = process.cwd()
): Promise<FastifyToabConfigOptionsResolved> {
    const isDev = process.env.NODE_ENV === "development";

    const packageJsonUrl = pathToFileURL(path.join(cwd, "package.json")).href;
    const { default: pkg } = await import(packageJsonUrl, {
        with: { type: "json" }
    });

    const version = pkg.version;
    const name = pkg.name;
    const rootDir = opts.rootDir ?? "src";

    const fastifyOpts = opts.fastify?.({ isDev });

    return {
        ...opts,
        logLevel: opts.logLevel ?? (isDev ? "debug" : "info"),
        includeGenericErrorResponses: opts.includeGenericErrorResponses ?? true,
        server: {
            fastify: {
                listen: {
                    port: opts.server?.fastify?.listen?.port ?? 5000,
                    host: opts.server?.fastify?.listen?.host ?? "0.0.0.0",
                    ...opts.server?.fastify?.listen,
                }
            },
            disableWorkers: opts.server?.disableWorkers ?? false,
            spawn: opts.server?.spawn,
        },
        rootDir,
        workDir: path.join(cwd, rootDir),
        fastify: {
            cors: {
                enabled: fastifyOpts?.cors?.enabled ?? !isDev,
                origin: fastifyOpts?.cors?.origin ?? true,
                allowedHeaders: fastifyOpts?.cors?.allowedHeaders ?? ["Content-Type", "Authorization", "X-Requested-With"],
                methods: fastifyOpts?.cors?.methods ?? ["GET", "PUT", "POST", "DELETE", "PATCH"],
            },
            underPressure: {
                enabled: fastifyOpts?.underPressure?.enabled ?? true,
                ...fastifyOpts?.underPressure,
            },
            helmet: {
                enabled: fastifyOpts?.helmet?.enabled ?? true,
                contentSecurityPolicy: fastifyOpts?.helmet?.contentSecurityPolicy ?? (isDev ? false : undefined),
                ...fastifyOpts?.helmet,
            },
            swagger: {
                enabled: fastifyOpts?.swagger?.enabled ?? isDev,
                openapi: {
                    info: {
                        title: name,
                        version: version,
                        ...fastifyOpts?.swagger?.openapi?.info,
                    },
                    ...fastifyOpts?.swagger?.openapi,
                },
            },
            swaggerUi: {
                enabled: fastifyOpts?.swaggerUi?.enabled ?? isDev,
                routePrefix: fastifyOpts?.swaggerUi?.routePrefix ?? "/docs",
                ...fastifyOpts?.swaggerUi,
            },
            rateLimit: {
                enabled: fastifyOpts?.rateLimit?.enabled ?? !isDev,
                max: fastifyOpts?.rateLimit?.max ?? 100,
                timeWindow: fastifyOpts?.rateLimit?.timeWindow ?? "1 minute",
                ...fastifyOpts?.rateLimit,
            },
            multipart: {
                enabled: fastifyOpts?.multipart?.enabled ?? true,
                ...fastifyOpts?.multipart,
            },
            bullBoard: {
                enabled: fastifyOpts?.bullBoard?.enabled ?? isDev,
                uiBasePath: fastifyOpts?.bullBoard?.uiBasePath ?? "/bullMQ",
                ...fastifyOpts?.bullBoard,
            }
        },
    };
}

/**
 * Loads `fastify-toab.config.ts` from the current working directory.
 *
 * @remarks
 * This is used by the generated CLI/runtime entrypoints and resolves the config
 * with `jiti`, so TypeScript configs can be consumed without a separate build step.
 * The loaded config is then normalized through {@link resolveConfig}.
 *
 * @example
 * ```ts
 * const config = await loadConfig();
 * console.log(config.rootDir);
 * ```
 */
export async function loadConfig(): Promise<FastifyToabConfigOptionsResolved> {
    const jiti = createJiti(import.meta.url);

    const opts = await jiti.import(path.join(process.cwd(), "./fastify-toab.config.ts")) as FastifyToabConfigOptions;

    return resolveConfig(opts);
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
 * The returned object is also used for type inference by ambient helper files,
 * for example a generated `src/@internals/globals.d.ts` that augments
 * `FastifyToabGlobals` or `NodeJS.ProcessEnv`.
 *
 * @example
 * ```ts
 * export default defineConfig({
 *   env: Type.Object({}),
 *   rootDir: "src",
 *   globalMiddlewares: [],
 * });
 * ```
 */
export function defineConfig<const T extends FastifyToabConfigOptions>(opts: T): T {
    return opts;
};
