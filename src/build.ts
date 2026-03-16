import { build } from "tsdown";
import type { FastifyToabConfigOptions } from "./config.js";

export async function startBuild(config: FastifyToabConfigOptions, watch: boolean, outDir: string, onBuildDone = async () => { }) {
    await build({
        ...config.tsdown,
        config: false,
        exports: false,
        publint: false,
        logLevel: "error",
        outDir,
        format: ["esm"],
        watch,
        dts: false,
        entry: [config.rootDir + "/**/*.ts"],
        unbundle: true,
        hooks: {
            "build:done": onBuildDone,
        }
    });
}