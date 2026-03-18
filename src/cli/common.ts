import * as p from "@clack/prompts";
import pc from "picocolors";

/**
 * Prints the CLI banner shown at startup.
 */
export function printHeader() {
    p.intro(`${pc.bgCyan(pc.black(" fastify-toab-cli "))}`);
}
