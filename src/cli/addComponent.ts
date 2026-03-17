import path from "path";
import { loadConfig } from "../config.js";
import { mkdir, writeFile } from "fs/promises";
import { createInternals, createRegistries, createRun } from "../generate/index.js";
import { capitalize, uncapitalize } from "../helpers.js";
import { ControllerTemplate, MiddlewareTemplate, SandboxedWorkerTemplate0, SandboxedWorkerTemplate1, ServiceTemplate, TestTemplate, WorkerTemplate } from "../generate/templates.js";

export async function addComponent(component: string, nameOrParent: string, workerName: string) {
    const config = await loadConfig();

    await mkdir(path.join(config.workDir, nameOrParent), { recursive: true });

    const run = await createRun();

    await writeFile(path.join(config.workDir, "@internals", "run.ts"), run);

    switch (component) {
        case "controller": {
            const cname = capitalize(nameOrParent);
            const lname = uncapitalize(nameOrParent);
            const template = ControllerTemplate({ cname, lname });
            await writeFile(
                path.join(config.workDir, nameOrParent, `${lname}.controller.ts`),
                template
            );
            await writeFile(
                path.join(config.workDir, nameOrParent, `${lname}.dto.ts`),
                `import { Static, Type } from "@sinclair/typebox";\n\n`
            );
            break;
        }
        case "service": {
            const cname = capitalize(nameOrParent);
            const lname = uncapitalize(nameOrParent);
            const template = ServiceTemplate({ cname, lname });
            const testTemplate = TestTemplate({ lname });

            await writeFile(path.join(config.workDir, nameOrParent, `${lname}.test.ts`), testTemplate);

            await writeFile(
                path.join(config.workDir, nameOrParent, `${lname}.service.ts`),
                template
            );
            break;
        }
        case "sandboxedWorker":
            const cname = capitalize(workerName);
            const lname = uncapitalize(workerName);
            const mlname = uncapitalize(nameOrParent);
            const tname = capitalize(nameOrParent) + cname;
            const qname = `{${mlname}-${lname}-queue}`;
            await mkdir(path.join(config.workDir, nameOrParent, "workers"), {
                recursive: true,
            });
            const template0 = SandboxedWorkerTemplate0({
                cname,
                lname,
                qname,
                tname,
                mlname,
            });
            await writeFile(
                path.join(config.workDir, nameOrParent, "workers", `${lname}.worker.ts`),
                template0
            );
            const template1 = SandboxedWorkerTemplate1({
                cname,
                lname,
                mlname,
                qname,
                tname,
            });
            await writeFile(
                path.join(
                    config.workDir,
                    nameOrParent,
                    "workers",
                    `${lname}.sandboxedWorker.ts`
                ),
                template1
            );
            break;
        case "worker": {
            const cname = capitalize(workerName);
            const lname = uncapitalize(workerName);
            const mlname = uncapitalize(nameOrParent);
            const qname = `{${mlname}-${lname}-queue}`;
            const tname = capitalize(nameOrParent) + cname;
            await mkdir(path.join(config.workDir, nameOrParent, "workers"), {
                recursive: true,
            });
            const template = WorkerTemplate({
                cname,
                lname,
                mlname,
                tname,
                qname,
            });
            await writeFile(
                path.join(config.workDir, nameOrParent, "workers", `${lname}.worker.ts`),
                template
            );
            break;
        }
        case "middleware": {
            const cname = capitalize(nameOrParent);
            const lname = uncapitalize(nameOrParent);
            const template = MiddlewareTemplate({ cname, lname });
            await writeFile(
                path.join(config.workDir, nameOrParent, `${lname}.middleware.ts`),
                template
            );
            break;
        }
    }

    const internals = await createInternals(config.workDir);

    await mkdir(path.join(config.workDir, "@internals"), { recursive: true });

    await writeFile(path.join(config.workDir, "@internals", "index.ts"), internals);

    const registries = await createRegistries(
        config.workDir,
    );

    await writeFile(path.join(config.workDir, "@internals/registries.ts"), registries);
}