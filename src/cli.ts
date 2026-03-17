import { Argument, Command, Option } from "commander";
import { writeFile, mkdir, cp } from "fs/promises";
import path from "path";
import { createInternals, createRegistries, createRun } from "./generate/index.js";
import { capitalize, uncapitalize } from "./helpers.js";
import { ControllerTemplate, MiddlewareTemplate, SandboxedWorkerTemplate0, SandboxedWorkerTemplate1, ServiceTemplate, TestTemplate, WorkerTemplate } from "./generate/templates.js";
import { ChildProcess, spawn } from "child_process";
import { loadConfig } from "./config.js";
import { startBuild } from "./build.js";
import * as p from "@clack/prompts";
import pc from "picocolors";

const program = new Command();

program
  .name("fastify-toab")
  .description("CLI to create services, workers and controllers easily.")
  .version("0.2.0");

program
  .command("scaffold")
  .description("create project boilerplate")
  .action(async () => {
    console.clear();

    p.intro(`${pc.bgCyan(pc.black(' create-fastify-toab '))}`);

    const project = await p.group({
      name: () =>
        p.text({
          message: 'Whats the name of your project?',
          placeholder: 'my-awesome-fastify-toab-app',
          defaultValue: "my-awesome-fastify-toab-app"
        }),
    }, {
      onCancel: () => {
        p.cancel('Operation cancelled.');
        process.exit(0);
      },
    })

    const name = project.name;
    const projectPath = path.resolve(project.name);

    const s = p.spinner();
    s.start("Copying boilerplate...");
    await cp(path.join(import.meta.dirname, "projectTemplate"), projectPath, {
      recursive: true
    });
    s.message("Writing package.json...");
    await writeFile(path.resolve(projectPath, "package.json"), `{
  "name": "${name}",
  "version": "0.0.0",
  "author": "",
  "dependencies": {
    "@csi-foxbyte/fastify-toab": "^0.2.0"
  }
}`)
    s.message("Running pnpm install...");
    await new Promise((resolve, reject) => {
      const child = spawn("pnpm", ["install"], {
        stdio: "inherit",
        detached: false,
        cwd: projectPath,
        shell: true,
      });

      child.on("exit", resolve);
      child.on("error", (error) => { console.error(error); reject(error); });
      child.on("close", resolve);
      child.on("disconnect", resolve);
    });
    s.message("Initializing git...");
    await new Promise((resolve, reject) => {
      const child = spawn("git", ["init"], {
        stdio: "inherit",
        detached: false,
        cwd: projectPath,
        shell: true,
      });

      child.on("exit", resolve);
      child.on("error", (error) => { console.error(error); reject(error); });
      child.on("close", resolve);
      child.on("disconnect", resolve);
    });
    s.stop(`Project created in ${pc.green(projectPath)}`);
    p.outro(`Done! Run ${pc.yellow(`cd ${path.relative(process.cwd(), projectPath)}`)} to start`);
  });

program
  .command("build")
  .description("run build")
  .action(async () => {
    const config = await loadConfig();

    await startBuild(config, false, ".build");

    console.log("Finished building...");
  });

program
  .command("dev")
  .description("run dev server")
  .action(async () => {
    let serverProcessRef: { current: ChildProcess | null } = { current: null };

    const config = await loadConfig();

    let startedOnce = false;

    async function startServer() {
      console.log(`Build complete, ${startedOnce ? "re" : ""}starting server...`)

      if (serverProcessRef.current && serverProcessRef.current.exitCode === null) {
        await new Promise<void>((resolve) => {
          serverProcessRef.current?.once('exit', resolve);
          serverProcessRef.current?.kill("SIGKILL");
        });
      }

      serverProcessRef.current = spawn(
        'node',
        [
          path.join(".dev", "@internals", "run.js"),
        ],
        {
          stdio: "inherit",
          env: {
            ...process.env,
            NODE_ENV: "development",
          },
          detached: false,
        }
      );

      serverProcessRef.current.on('exit', () => {
        serverProcessRef.current = null;
      });

      serverProcessRef.current.on('error', (err) => {
        console.error('Failed to start server process:', err);
        serverProcessRef.current = null;
      });
    }

    await startBuild(config, true, ".dev", startServer);
  })

program
  .command("rebuild")
  .description("rebuild registries")
  .addOption(
    new Option(
      "-w, --workdir <path>",
      "workdir to operate in is src at default."
    )
  )
  .action(async (options) => {
    const config = await loadConfig();

    const workdir = path.join(
      process.cwd(),
      options.workdir ?? config.rootDir ?? "src"
    );

    const internals = await createInternals(workdir);

    await mkdir(path.join(workdir, "@internals"), { recursive: true });

    await writeFile(path.join(workdir, "@internals", "index.ts"), internals);

    const run = await createRun();

    await writeFile(path.join(workdir, "@internals", "run.ts"), run);

    const registries = await createRegistries(
      workdir,
    );

    await writeFile(path.join(workdir, "@internals/registries.ts"), registries);
  });

program
  .command("create")
  .description("create a component")
  .addArgument(
    new Argument("[component]", "component to create").choices([
      "service",
      "controller",
      "worker",
      "sandboxedWorker",
      "middleware",
    ])
  )
  .addArgument(
    new Argument("[nameOrParent]", "component name or worker parent")
  )
  .addArgument(new Argument("[workerName]", "worker name").argOptional())
  .addOption(
    new Option(
      "-w, --workdir <path>",
      "workdir to operate in is src at default."
    )
  )
  .action(async (component, nameOrParent, workerName, options) => {
    if (!component) component = await p.select({
      message: "Select a compoent", options: [{
        label: "service",
        value: "service",
      }, {
        label: "controller",
        value: "controller",
      }, {
        label: "worker",
        value: "worker",
      }, {
        label: "sandboxedWorker",
        value: "sandboxedWorker",
      }, {
        label: "middleware",
        value: "middleware",
      }],
    })

    if (!nameOrParent && component !== "worker" && component !== "sandboxedWorker") nameOrParent = await p.text({ message: `Whats the name of the ${component}?: ` });
    if (!nameOrParent && (component === "worker" || component === "sandboxedWorker")) nameOrParent = await p.text({ message: `Whats the name of the parent for the worker?: ` })

    if (
      (component === "worker" || component === "sandboxedWorker") &&
      !workerName
    )
      workerName = await p.text({ message: `Whats the name of the worker?: ` })

    const config = await loadConfig();

    const workdir = path.join(
      process.cwd(),
      options.workdir ?? config.rootDir ?? "src"
    );

    await mkdir(path.join(workdir, nameOrParent), { recursive: true });

    const run = await createRun();

    await writeFile(path.join(workdir, "@internals", "run.ts"), run);

    switch (component) {
      case "controller": {
        const cname = capitalize(nameOrParent);
        const lname = uncapitalize(nameOrParent);
        const template = ControllerTemplate({ cname, lname });
        await writeFile(
          path.join(workdir, nameOrParent, `${lname}.controller.ts`),
          template
        );
        await writeFile(
          path.join(workdir, nameOrParent, `${lname}.dto.ts`),
          `import { Static, Type } from "@sinclair/typebox";\n\n`
        );
        break;
      }
      case "service": {
        const cname = capitalize(nameOrParent);
        const lname = uncapitalize(nameOrParent);
        const template = ServiceTemplate({ cname, lname });
        const testTemplate = TestTemplate({ lname });

        await writeFile(path.join(workdir, nameOrParent, `${lname}.test.ts`), testTemplate);

        await writeFile(
          path.join(workdir, nameOrParent, `${lname}.service.ts`),
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
        await mkdir(path.join(workdir, nameOrParent, "workers"), {
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
          path.join(workdir, nameOrParent, "workers", `${lname}.worker.ts`),
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
            workdir,
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
        await mkdir(path.join(workdir, nameOrParent, "workers"), {
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
          path.join(workdir, nameOrParent, "workers", `${lname}.worker.ts`),
          template
        );
        break;
      }
      case "middleware": {
        const cname = capitalize(nameOrParent);
        const lname = uncapitalize(nameOrParent);
        const template = MiddlewareTemplate({ cname, lname });
        await writeFile(
          path.join(workdir, nameOrParent, `${lname}.middleware.ts`),
          template
        );
        break;
      }
    }

    const internals = await createInternals(workdir);

    await mkdir(path.join(workdir, "@internals"), { recursive: true });

    await writeFile(path.join(workdir, "@internals", "index.ts"), internals);

    const registries = await createRegistries(
      workdir,
    );

    await writeFile(path.join(workdir, "@internals/registries.ts"), registries);
  });

program.parse();
