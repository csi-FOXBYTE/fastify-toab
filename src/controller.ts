import type { FastifyReply, FastifyRequest } from "fastify";
import {
  AnyMiddleware,
  createMiddleware,
  DeclaredGlobalMiddlewareContext,
  MergeMiddlewareContext,
  MiddlewareContext,
} from "./middleware.js";
import { createRoute, RouteC, RouteCtx } from "./route.js";
import { ServiceContainer, ServiceRegistry } from "./service.js";
import { QueueContainer, WorkerContainer } from "./worker.js";

export type HTTPMethods =
  | "SSE"
  | "GET"
  | "HEAD"
  | "POST"
  | "DELETE"
  | "PUT"
  | "PATCH"
  | "ALL";

export type HandlerOpts = {
  request: FastifyRequest;
  reply: FastifyReply;
  path: string;
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
  middlewares: AnyMiddleware[];
};

export interface ControllerC<Context extends MiddlewareContext> {
  /**
   * Sets the path prefix for all routes registered on this controller.
   */
  rootPath: (
    rootPath: `/${string}`
  ) => Pick<ControllerC<Context>, "addRoute" | "finish">;
  /**
   * Attaches a middleware to every route declared on this controller.
   */
  use: <
    NewContext extends MiddlewareContext,
    NextContext extends NewContext
  >(
    fn: ReturnType<typeof createMiddleware<NewContext, NextContext, Context>>
  ) => Pick<
    ControllerC<MergeMiddlewareContext<Context, NextContext>>,
    "use" | "rootPath"
  >;
  /**
   * Starts a typed route definition for the given method and path.
   */
  addRoute: <M extends HTTPMethods, Path extends `/${string}`>(
    method: M,
    path: Path
  ) => Omit<
    RouteC<
      M extends "GET" | "HEAD" | "SSE" | "ALL" ? "body" : "",
      unknown,
      unknown,
      unknown,
      Path,
      unknown,
      Context,
      M,
      unknown
    >,
    M extends "GET" | "HEAD" | "SSE" | "ALL" ? "body" : ""
  >;
  /**
   * DO NOT CALL THIS MANUALLY!
   * @returns
   */
  finish: (serviceRegistry: ServiceRegistry) => ControllerCtx;
}

/**
 * Creates a controller builder with typed middleware-aware route registration.
 *
 * @remarks
 * If an ambient `.d.ts` file augments `FastifyToabGlobals`, the controller
 * inherits the context produced by `globalMiddlewares` automatically.
 *
 * @example
 * ```ts
 * const userController = createController()
 *   .rootPath("/user");
 *
 * userController
 *   .addRoute("GET", "/:id")
 *   .params(Type.Object({ id: Type.String() }))
 *   .handler(async ({ params }) => {
 *     return { id: params.id };
 *   });
 * ```
 */
export function createController<
  Context extends MiddlewareContext = DeclaredGlobalMiddlewareContext
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
    addRoute<M extends HTTPMethods, Path extends `/${string}`>(
      method: M,
      path: Path
    ) {
      if (ctx.routes[method]?.[path])
        throw new Error(
          `${method} Route "${ctx.rootPath}${path}" already registered.`
        );
      if (!ctx.routes[method]) ctx.routes[method] = {};
      ctx.routes[method][path] = {
        middlewares: [],
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
        Path,
        unknown,
        Context,
        M,
        unknown
      >(ctx.routes[method][path]);
    },
    // @ts-expect-error wrong types
    use(fn) {
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

/**
 * Stores all controllers that should be registered by the TOAB runtime.
 *
 * @example
 * ```ts
 * const controllerRegistry = new ControllerRegistry(serviceRegistry);
 * controllerRegistry.register(userController);
 * ```
 */
export class ControllerRegistry {
  controllers = new Map<string, ControllerCtx>();
  private readonly serviceRegistry: ServiceRegistry;

  /**
   * Creates a controller registry bound to the current service registry.
   */
  constructor(serviceRegistry: ServiceRegistry) {
    this.serviceRegistry = serviceRegistry;
  }

  /**
   * Registers a controller so the runtime plugin can expose its routes.
   *
   * @example
   * ```ts
   * controllerRegistry.register(userController);
   * ```
   */
  register(controller: Pick<ControllerC<any>, "finish">) {
    const controllerCtx = controller.finish(this.serviceRegistry);

    if (this.controllers.has(controllerCtx.rootPath))
      throw new Error(
        `Controller with rootPath "${controllerCtx.rootPath}" already registered.`
      );

    this.controllers.set(controllerCtx.rootPath, controllerCtx);
  }
}
