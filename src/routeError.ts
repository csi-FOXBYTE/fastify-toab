import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

export type FastifyToabRouteErrorContext = {
  error: unknown;
  fastify: FastifyInstance;
  composedPath: string;
  request: FastifyRequest;
  reply: FastifyReply;
};

export type FastifyToabRouteErrorHandler = (
  ctx: FastifyToabRouteErrorContext
) => Promise<void> | void;
