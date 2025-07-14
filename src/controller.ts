import { FastifyReply, FastifyRequest } from "fastify";
import { createMiddleware } from "./middleware";
import { createRoute, RouteC, RouteCtx } from "./route";
import { ServiceContainer, ServiceRegistry } from "./service";
import { QueueContainer, WorkerContainer } from "./worker";

export type HTTPMethods =
  | "SSE"
  | "GET"
  | "HEAD"
  | "POST"
  | "DELETE"
  | "PUT"
  | "PATCH";

export type HandlerOpts = {
  request: FastifyRequest;
  reply: FastifyReply;
  body?: unknown;
  params?: unknown;
  querystring?: unknown;
  headers?: unknown;
  ctx: unknown;
  services: ServiceContainer;
  workers: WorkerContainer;
  queues: QueueContainer;
  signal: AbortSignal;
};

export type ControllerCtx = {
  rootPath: string;
  routes: Record<string, Record<string, RouteCtx>>;
  middlewares: ((
    opts: {
      ctx: unknown;
      request: FastifyRequest;
      reply: FastifyReply;
      services: ServiceContainer;
      workers: WorkerContainer;
      queues: QueueContainer;
    },
    next: (opts: { ctx: unknown }) => Promise<void>
  ) => Promise<unknown>)[];
};

interface ControllerC<Context extends Record<string, unknown>> {
  rootPath: (
    rootPath: `/${string}`
  ) => Pick<ControllerC<Context>, "addRoute" | "finish">;
  use: <
    NewContext extends Record<string, unknown>,
    NextContext extends NewContext
  >(
    fn: ReturnType<typeof createMiddleware<NewContext, NextContext, Context>>
  ) => Pick<ControllerC<NextContext>, "use" | "rootPath">;
  addRoute: <M extends HTTPMethods>(
    method: M,
    path: `/${string}`
  ) => Omit<
    RouteC<
      M extends "GET" | "HEAD" | "SSE" ? "body" : "",
      unknown,
      unknown,
      unknown,
      unknown,
      Context,
      M,
      unknown
    >,
    M extends "GET" | "HEAD" | "SSE" ? "body" : ""
  >;
  /**
   * DO NOT CALL THIS MANUALLY!
   * @returns
   */
  finish: (serviceRegistry: ServiceRegistry) => ControllerCtx;
}

export function createController<
  Context extends Record<string, unknown> = {}
>(): ControllerC<Context> {
  const ctx: ControllerCtx = {
    rootPath: "",
    middlewares: [],
    routes: {},
  };

  const routerHandler: ControllerC<Context> = {
    rootPath(rootPath: string) {
      ctx.rootPath = rootPath;

      return proxy;
    },
    // @ts-expect-error wrong types
    addRoute<M extends HTTPMethods>(method: M, path: string) {
      if (ctx.routes[method]?.[path])
        throw new Error(
          `${method} Route "${ctx.rootPath}${path}" already registered.`
        );
      if (!ctx.routes[method]) ctx.routes[method] = {};
      ctx.routes[method][path] = {
        // @ts-expect-error wrong type
        handler: async () => {
          throw new Error("Not implemented!");
        },
      };

      return createRoute<
        "",
        unknown,
        unknown,
        unknown,
        unknown,
        Context,
        M,
        unknown
      >(ctx.routes[method][path]);
    },
    // @ts-expect-error wrong types
    use(fn) {
      // @ts-expect-error wrong types
      ctx.middlewares.push(fn);
      return proxy;
    },
    finish() {
      return ctx;
    },
  };

  const proxy = new Proxy(routerHandler, {
    get(target, p, receiver) {
      return Reflect.get(target, p, receiver);
    },
  });

  return routerHandler;
}

export class ControllerRegistry {
  controllers = new Map<string, ControllerCtx>();
  private readonly serviceRegistry: ServiceRegistry;

  constructor(serviceRegistry: ServiceRegistry) {
    this.serviceRegistry = serviceRegistry;
  }

  register(controller: Pick<ControllerC<{}>, "finish">) {
    const controllerCtx = controller.finish(this.serviceRegistry);

    if (this.controllers.has(controllerCtx.rootPath))
      throw new Error(
        `Controller with rootPath "${controllerCtx.rootPath}" already registered.`
      );

    this.controllers.set(controllerCtx.rootPath, controllerCtx);
  }
}
