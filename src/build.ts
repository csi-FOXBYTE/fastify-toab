import { InputOptions, OutputOptions, rolldown, watch } from "rolldown";
import fg from "fast-glob";
import type { FastifyToabConfigOptions, FastifyToabConfigOptionsResolved } from "./config.js";
import path from "path";

/**
 * Builds the generated TOAB runtime output with Rolldown.
 *
 * @remarks
 * This powers the CLI build/dev workflow and writes the generated runtime bundle
 * to the provided output directory.
 */
export async function startBuild(
    config: FastifyToabConfigOptionsResolved,
    isWatch: boolean,
    outDir: string,
    onBuildDone = async () => { },
) {
    const entries = await fg([
        `${config.rootDir}/@internals/*.ts`,
        `${config.rootDir}/**/*.sandboxedWorker.ts`,
        `${config.rootDir}/instrumentation.ts`,
    ]);

    const inputObject = Object.fromEntries(
        entries.map((file) => {
            const relativePath = path.relative(config.rootDir!, file);
            const normalizedPath = relativePath.replace(/\\/g, "/");
            const chunkName = normalizedPath.replace(/\.[^/.]+$/, "");
            return [chunkName, file];
        }),
    );

    const inputOptions = {
        ...config.rolldown,
        input: { ...inputObject, ...config.rolldown?.inputObject },
        logLevel: "silent" as const,
        platform: "node",
        plugins: [
            ...(config.rolldown?.plugins ?? []),
            {
                name: "on-build-done-hooke",
                writeBundle: async () => {
                    await onBuildDone();
                },
            },
        ],
        external: [
            ...(config.rolldown?.external ?? []),
            "bullmq",
            "fastify",
            "@bull-board/api",
            "@bull-board/fastify",
            "@bull-board/ui",
            "@fastify/swagger-ui",
            "@csi-foxbyte/fastify-toab",
            "@fastify/rate-limit",
            "@fastify/cors",
            "@fastify/multipart",
            "@fastify/under-pressure",
            "avvio",
        ],
    } satisfies InputOptions;

    const outputOptions = {
        ...config.rolldown?.output,
        dir: outDir,
        format: "esm",
        cleanDir: true,
        minify: true,
        strict: true,
        codeSplitting: true,
        esModule: true,
        preserveModules: false,
        banner: `import { fileURLToPath as __fileURLToPath } from 'node:url';
import { dirname as __dirnameFn } from 'node:path';
const __filename = __fileURLToPath(import.meta.url);
const __dirname = __dirnameFn(__filename);`,
    } satisfies OutputOptions;

    if (isWatch) {
        const watcher = watch({
            ...inputOptions,
            output: outputOptions,
        });

        await new Promise<void>((resolve, reject) => {
            watcher.on("event", async (event) => {
                switch (event.code) {
                    case "BUNDLE_END":
                        return await event.result.close();
                    case "END":
                        return resolve();
                    case "ERROR":
                        return reject(event.error);
                }
            });
        });
    } else {
        const bundle = await rolldown(inputOptions);

        await bundle.write(outputOptions);

        await bundle.close();
    }
}
