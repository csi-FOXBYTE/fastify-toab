import type { FastifyReply, FastifyRequest } from "fastify";
import { QueueContainer, WorkerContainer } from "./worker.js";
import { ServiceContainer } from "./service.js";

export function createMiddleware<
  NewContext extends Record<string, unknown>,
  NextContext extends NewContext,
  Context extends Record<string, unknown> = {}
>(
  fn: (
    opts: {
      ctx: Context;
      request: FastifyRequest;
      reply: FastifyReply;
      workers: WorkerContainer;
      services: ServiceContainer;
      queues: QueueContainer;
    },
    next: (opts: { ctx: NewContext }) => Promise<void>
  ) => Promise<NextContext>
) {
  return fn;
}
