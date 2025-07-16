import { AsyncLocalStorage } from "async_hooks";
import type { FastifyReply, FastifyRequest } from "fastify";

const contextLocalStorage = new AsyncLocalStorage<{
  request: FastifyRequest;
  reply: FastifyReply;
}>();

export function getRequestContext() {
  const store = contextLocalStorage.getStore();
  if (!store)
    throw new Error(
      "No context set, are you trying to access the context outside of a service function?"
    );

  return store;
}

export function setRequestContext(ctx: {
  request: FastifyRequest;
  reply: FastifyReply;
}) {
  return contextLocalStorage.enterWith(ctx);
}
