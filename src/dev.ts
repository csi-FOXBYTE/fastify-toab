process.env.NODE_ENV = "development";

import path from "path";
import { startServer } from "./run.js";
import { pathToFileURL } from "url";


startServer(
    pathToFileURL(path.join(process.cwd(), ".dev", "@internals", "registries.mjs")).href,
    pathToFileURL(path.join(process.cwd(), ".dev", "instrumentation.mjs")).href
).catch((err) => {
    console.error(err);
    process.exit(1)
});