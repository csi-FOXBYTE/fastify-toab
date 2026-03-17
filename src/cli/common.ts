import * as p from "@clack/prompts";
import pc from "picocolors";

export function printHeader() {
    p.intro(`${pc.bgCyan(pc.black(" fastify-toab-cli "))}`);
}