import { SpawnOptions } from "child_process";
import type { FastifyInstance, FastifyPluginAsync, FastifyPluginCallback, FastifyRegisterOptions, FastifyListenOptions, FastifyPluginOptions } from "fastify";
import path from "path";
import type { InlineConfig } from "tsdown";
import { pathToFileURL } from "url";
import { ServiceRegistry } from "./service.js";
import { ControllerRegistry } from "./controller.js";
import { WorkerRegistry } from "./worker.js";
import { InputOptions, OutputOptions, RolldownPluginOption } from "rolldown";

export type Registries = { serviceRegistry: ServiceRegistry, controllerRegistry: ControllerRegistry, workerRegistry: WorkerRegistry };

export type FastifyToabConfigOptions = {
    plugins?: (readonly [FastifyPluginAsync | FastifyPluginCallback, FastifyPluginOptions | undefined])[],
    onReady?: (fastify: FastifyInstance, registries: Registries) => Promise<void>;
    onPreStart?: (fastify: FastifyInstance, registries: Registries) => Promise<void>;
    server?: {
        fastify?: FastifyListenOptions;
        spawn?: SpawnOptions;
    };
    rootDir?: string;
    rolldown?: {
        inputObject?: Record<string, string>,
        plugins?: RolldownPluginOption[],
        external?: string[],
        output?: Omit<OutputOptions, "dir" | "format" | "cleanDir" | "strict" | "esModule" | "codeSplitting" | "preserverModules" | "banner">,
    } & Omit<InputOptions, "input" | "platform">
}

export async function loadConfig() {
    const configModule = await import(pathToFileURL(path.join(process.cwd(), "./fastify-toab.config.mjs")).href);

    const config = configModule.default as FastifyToabConfigOptions;

    return setDefaultsForConfig(config);
}


export function definePlugin<Opt extends FastifyPluginOptions>(plugin: FastifyPluginAsync<Opt, any> | FastifyPluginCallback<Opt>, opts?: FastifyRegisterOptions<Opt>) {
    return [plugin, opts] as const;
}

export function defineConfig(opts: FastifyToabConfigOptions) {
    return opts;
};

export function setDefaultsForConfig(opts: FastifyToabConfigOptions) {
    return {
        rootDir: opts.rootDir ?? "src",
        ...opts,
    }
}