import type { FastifyReply, FastifyRequest } from "fastify";
import { QueueContainer, WorkerContainer } from "./worker.js";
import { ServiceContainer } from "./service.js";

declare global {
  interface FastifyToabGlobals {}
}

export type MiddlewareContext = Record<string, unknown>;

export type MiddlewareOpts<Context extends MiddlewareContext> = {
  ctx: Context;
  request: FastifyRequest;
  reply: FastifyReply;
  workers: WorkerContainer;
  services: ServiceContainer;
  queues: QueueContainer;
};

export type Middleware<
  Context extends MiddlewareContext = MiddlewareContext,
  NewContext extends MiddlewareContext = MiddlewareContext,
  NextContext extends NewContext = NewContext,
> = (
  opts: MiddlewareOpts<Context>,
  next: (opts: { ctx: NewContext }) => Promise<void>
) => Promise<NextContext>;

export type AnyMiddleware = Middleware<any, any, any>;

export type MergeMiddlewareContext<
  Current extends MiddlewareContext,
  Next extends MiddlewareContext,
> = Omit<Current, keyof Next> & Next;

export type InferMiddlewareContext<
  Middlewares,
  Current extends MiddlewareContext = {},
> = Middlewares extends readonly [infer First, ...infer Rest]
  ? InferMiddlewareContext<
      Rest,
      First extends Middleware<any, any, infer NextContext>
        ? MergeMiddlewareContext<Current, NextContext>
        : Current
    >
  : Current;

export type DeclaredGlobalMiddlewares =
  FastifyToabGlobals extends {
    globalMiddlewares: infer Middlewares extends readonly AnyMiddleware[];
  }
    ? Middlewares
    : [];

export type DeclaredGlobalMiddlewareContext =
  InferMiddlewareContext<DeclaredGlobalMiddlewares>;

export type ConfiguredGlobalMiddlewares =
  DeclaredGlobalMiddlewares extends readonly []
    ? AnyMiddleware[]
    : DeclaredGlobalMiddlewares;

export function createMiddleware<
  NewContext extends MiddlewareContext,
  NextContext extends NewContext,
  Context extends MiddlewareContext = {}
>(
  fn: Middleware<Context, NewContext, NextContext>
) {
  return fn;
}
