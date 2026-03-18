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

/**
 * Creates a typed middleware that can enrich the shared route context.
 *
 * @remarks
 * The middleware can be used globally in `fastify-toab.config.ts`, on a controller
 * via `.use(...)`, or on a single route via `.addRoute(...).use(...)`.
 *
 * @example
 * ```ts
 * const authMiddleware = createMiddleware(async ({ ctx }, next) => {
 *   const nextCtx = { ...ctx, session: { userId: "123" } };
 *   await next({ ctx: nextCtx });
 *   return nextCtx;
 * });
 * ```
 */
export function createMiddleware<
  NewContext extends MiddlewareContext,
  NextContext extends NewContext,
  Context extends MiddlewareContext = {}
>(
  fn: Middleware<Context, NewContext, NextContext>
) {
  return fn;
}
