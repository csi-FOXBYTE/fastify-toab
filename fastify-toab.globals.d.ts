import config from "./fastify-toab.config.js";

type GlobalMiddlewares = typeof config extends {
  globalMiddlewares: infer Middlewares;
}
  ? NonNullable<Middlewares>
  : [];

declare global {
  interface FastifyToabGlobals {
    globalMiddlewares: GlobalMiddlewares;
  }
}

export {};
