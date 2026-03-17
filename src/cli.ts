import { Argument, Command } from "commander";
import { writeFile, cp } from "fs/promises";
import path from "path";
import { ChildProcess, spawn } from "child_process";
import { loadConfig } from "./config.js";
import { startBuild } from "./build.js";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { addComponent } from "./cli/addComponent.js";
import { rebuild } from "./cli/rebuild.js";
import { printHeader } from "./cli/common.js";
import ts from "typescript";

const program = new Command();

program.hook("preAction", () => {
  printHeader();
});

program
  .name("fastify-toab")
  .description("CLI to create services, workers and controllers easily.")
  .version("0.2.0");

program
  .command("create")
  .description("create project boilerplate")
  .action(async () => {
    const project = await p.group(
      {
        name: () =>
          p.text({
            message: "Whats the name of your project?",
            placeholder: "my-awesome-fastify-toab-app",
            defaultValue: "my-awesome-fastify-toab-app",
          }),
      },
      {
        onCancel: () => {
          p.cancel("Operation cancelled.");
          process.exit(0);
        },
      },
    );

    const name = project.name;
    const projectPath = path.resolve(project.name);

    const s = p.spinner();
    s.start("Copying boilerplate...");
    await cp(path.join(import.meta.dirname, "projectTemplate"), projectPath, {
      recursive: true,
    });
    s.message("Writing package.json...");
    await writeFile(
      path.resolve(projectPath, "package.json"),
      `{
  "name": "${name}",
  "version": "0.0.0",
  "author": "",
  "dependencies": {
    "@csi-foxbyte/fastify-toab": "^0.2.0",
    "typescript": "^6.0.0"
  }
}`,
    );
    s.message("Running pnpm install...");
    await new Promise((resolve, reject) => {
      const child = spawn("pnpm", ["install"], {
        stdio: "inherit",
        detached: false,
        cwd: projectPath,
        shell: true,
      });

      child.on("exit", resolve);
      child.on("error", (error) => {
        console.error(error);
        reject(error);
      });
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
      child.on("error", (error) => {
        console.error(error);
        reject(error);
      });
      child.on("close", resolve);
      child.on("disconnect", resolve);
    });
    s.stop(`Project created in ${pc.green(projectPath)}`);
    p.outro(
      `Done! Run ${pc.yellow(`cd ${path.relative(process.cwd(), projectPath)}`)} to start`,
    );
  });

program
  .command("build")
  .description("run build")
  .action(async () => {
    const config = await loadConfig();

    const s = p.spinner();

    s.start("Linting...");

    const configPath = "tsconfig.json";

    const configFile = ts.readConfigFile(configPath, ts.sys.readFile);

    if (configFile.error) {
      const message = ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n');
      throw new Error(`Config Error: ${message}`);
    }

    const configParseResult = ts.parseJsonConfigFileContent(
      configFile.config,
      ts.sys,
      path.dirname(configPath)
    );

    const program = ts.createProgram(
      configParseResult.fileNames,
      configParseResult.options,
    );

    const diagnostics = ts.getPreEmitDiagnostics(program);

    if (diagnostics.length > 0) {
      const formatHost = {
        getCanonicalFileName: (path: string) => path,
        getCurrentDirectory: ts.sys.getCurrentDirectory,
        getNewLine: () => ts.sys.newLine,
      };

      // Using built-in formatter for a pretty terminal output
      const message = ts.formatDiagnosticsWithColorAndContext(diagnostics, formatHost);
      p.log.error(message);
      process.exit(1);
    } else {
      p.log.message("Type check passed using tsconfig settings!");
    }

    s.message("Building...");

    await startBuild(config, false, ".build");
    s.stop("Finished building!");
  });

program
  .command("dev")
  .description("run dev server")
  .action(async () => {
    let serverProcessRef: { current: ChildProcess | null } = { current: null };

    const config = await loadConfig();

    let startedOnce = false;

    async function startServer() {
      console.log(
        `Build complete, ${startedOnce ? "re" : ""}starting server...`,
      );

      if (
        serverProcessRef.current &&
        serverProcessRef.current.exitCode === null
      ) {
        await new Promise<void>((resolve) => {
          serverProcessRef.current?.once("exit", resolve);
          serverProcessRef.current?.kill("SIGKILL");
        });
      }

      serverProcessRef.current = spawn(
        "node",
        [path.join(".dev", "@internals", "run.js")],
        {
          stdio: "inherit",
          env: {
            ...process.env,
            NODE_ENV: "development",
          },
          detached: false,
        },
      );

      serverProcessRef.current.on("exit", () => {
        serverProcessRef.current = null;
      });

      serverProcessRef.current.on("error", (err) => {
        console.error("Failed to start server process:", err);
        serverProcessRef.current = null;
      });
    }

    await startBuild(config, true, ".dev", startServer);
  });

program
  .command("rebuild")
  .description("rebuild registries")
  .action(async () => {
    await rebuild();

    p.text({ message: "Rebuilt successfully!" });
  });

program
  .command("add")
  .description("create a component")
  .addArgument(
    new Argument("[component]", "component to create").choices([
      "service",
      "controller",
      "worker",
      "sandboxedWorker",
      "middleware",
    ]),
  )
  .addArgument(
    new Argument("[nameOrParent]", "component name or worker parent"),
  )
  .addArgument(new Argument("[workerName]", "worker name").argOptional())
  .action(async (component, nameOrParent, workerName) => {
    if (!component) component = String(await p.select({
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
    }));

    if (!nameOrParent && component !== "worker" && component !== "sandboxedWorker") nameOrParent = String(await p.text({ message: `Whats the name of the ${component}?: ` }));
    if (!nameOrParent && (component === "worker" || component === "sandboxedWorker")) nameOrParent = String(await p.text({ message: `Whats the name of the parent for the worker?: ` }));

    if (
      (component === "worker" || component === "sandboxedWorker") &&
      !workerName
    )
      workerName = String(await p.text({ message: `Whats the name of the worker?: ` }));

    if (!nameOrParent || !component || (!workerName && component === "worker")) throw new Error("Not all variables supplied!");


    return await addComponent(component, nameOrParent, workerName);
  });

program.parse();
