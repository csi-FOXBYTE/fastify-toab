import { AsyncLocalStorage } from "async_hooks";
import type { FastifyReply, FastifyRequest } from "fastify";

const contextLocalStorage = new AsyncLocalStorage<{
  request: FastifyRequest;
  reply: FastifyReply;
}>();

/**
 * Returns the Fastify request/reply pair for the current request scope.
 *
 * @remarks
 * This is primarily intended for request-scoped services that need access to the
 * active request without having it threaded through every call manually.
 *
 * @throws Error
 * Thrown when called outside of a request scope.
 *
 * @example
 * ```ts
 * const auditService = createService(
 *   "audit",
 *   async () => {
 *     const { request } = getRequestContext();
 *     return { requestId: request.id };
 *   },
 *   { scope: "REQUEST" },
 * );
 * ```
 */
export function getRequestContext() {
  const store = contextLocalStorage.getStore();
  if (!store)
    throw new Error(
      "No context set, are you trying to access the context outside of a service function?"
    );

  return store;
}

/**
 * Sets the current Fastify request/reply pair for downstream request-scoped consumers.
 *
 * @remarks
 * This is used internally by the runtime before route handlers and services execute.
 * Most applications should not call this directly.
 */
export function setRequestContext(ctx: {
  request: FastifyRequest;
  reply: FastifyReply;
}) {
  return contextLocalStorage.enterWith(ctx);
}
