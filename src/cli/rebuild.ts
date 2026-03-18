import { mkdir, writeFile } from "fs/promises";
import { createInternals, createRegistries, createRun } from "../generate/index.js";
import path from "path";
import { loadConfig } from "../config.js";

/**
 * Regenerates the internal registry and runtime entrypoint files for the current project.
 */
export async function rebuild() {
    const config = await loadConfig();

    const internals = await createInternals(config.workDir);

    await mkdir(path.join(config.workDir, "@internals"), { recursive: true });

    await writeFile(
        path.join(config.workDir, "@internals", "index.ts"),
        internals,
    );

    const run = await createRun();

    await writeFile(path.join(config.workDir, "@internals", "run.ts"), run);

    const registries = await createRegistries(config.workDir);

    await writeFile(
        path.join(config.workDir, "@internals/registries.ts"),
        registries,
    );
}
