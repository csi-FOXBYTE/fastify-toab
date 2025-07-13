import { Static, TObject, TSchema } from "@sinclair/typebox";
import { FastifyReply, FastifyRequest, RouteShorthandOptions } from "fastify";
import { ServiceContainer, ServiceRegistry } from "./service";

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
  ctx: unknown;
  services: ServiceContainer;
};

export type RouteCtx = {
  body?: TSchema;
  output?: TSchema;
  querystring?: TObject;
  opts?: RouteShorthandOptions;
  params?: TObject;
  handler: (opts: HandlerOpts) => Promise<unknown>;
};

export type ControllerCtx = {
  rootPath: string;
  routes: Record<string, Record<string, RouteCtx>>;
  middleWares: ((
    opts: { ctx: unknown; request: FastifyRequest; reply: FastifyReply },
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
    fn: (
      opts: { ctx: Context },
      next: (opts: { ctx: NewContext }) => Promise<void>
    ) => Promise<NextContext>
  ) => Pick<ControllerC<NextContext>, "use" | "rootPath">;
  addRoute: <M extends HTTPMethods>(
    method: M,
    path: `/${string}`
  ) => Omit<
    RouteC<
      M extends "GET" | "HEAD" ? "body" : "",
      unknown,
      unknown,
      unknown,
      unknown,
      Context,
      M
    >,
    M extends "GET" | "HEAD" ? "body" : ""
  >;
  /**
   * DO NOT CALL THIS MANUALLY!
   * @returns
   */
  finish: (serviceRegistry: ServiceRegistry) => ControllerCtx;
}

interface RouteC<
  Omitter extends string,
  Body,
  Output,
  QueryString,
  Params,
  Context,
  Method extends HTTPMethods
> {
  body: <B extends TSchema>(
    body: B
  ) => Omit<
    RouteC<"body" | Omitter, B, Output, QueryString, Params, Context, Method>,
    "body" | Omitter
  >;
  output: <O extends TSchema>(
    output: O
  ) => Omit<
    RouteC<"output" | Omitter, Body, O, QueryString, Params, Context, Method>,
    "output" | Omitter
  >;
  querystring: <Q extends TObject>(
    querystring: Q
  ) => Omit<
    RouteC<"querystring" | Omitter, Body, Output, Q, Params, Context, Method>,
    "querystring" | Omitter
  >;
  handler: (
    fn: (
      opts: {
        request: FastifyRequest;
        reply: FastifyReply;
        ctx: Context;
        services: ServiceContainer;
      } & (QueryString extends TSchema
        ? { querystring: Static<QueryString> }
        : void) &
        (Params extends TSchema ? { params: Static<Params> } : void) &
        (Method extends "GET" | "HEAD"
          ? void
          : { body: Body extends TSchema ? Static<Body> : void })
    ) => Promise<Output extends TSchema ? Static<Output> : void>,
    opts?: RouteShorthandOptions
  ) => RouteCtx;
  params: <P extends TObject>(
    params: P
  ) => Omit<
    RouteC<"params" | Omitter, Body, Output, QueryString, P, Context, Method>,
    "params" | Omitter
  >;
}

function createRoute<
  Omitter extends string,
  Body,
  Output,
  QueryString,
  Params,
  Context,
  Method extends HTTPMethods
>(
  ctx: RouteCtx
): RouteC<Omitter, Body, Output, QueryString, Params, Context, Method> {
  const routerHandler: RouteC<
    Omitter,
    Body,
    Output,
    QueryString,
    Params,
    Context,
    Method
  > = {
    body(body) {
      ctx.body = body;
      return proxy;
    },
    output(output) {
      ctx.output = output;
      return proxy;
    },
    params(params) {
      ctx.params = params;
      return proxy;
    },
    querystring(querystring) {
      ctx.querystring = querystring;
      return proxy;
    },
    handler(handler: (...args: any[]) => any, opts: RouteShorthandOptions) {
      ctx.handler = handler;
      ctx.opts = opts;
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

export function createController<
  Context extends Record<string, unknown> = {}
>(): ControllerC<Context> {
  const ctx: ControllerCtx = {
    rootPath: "",
    middleWares: [],
    routes: {},
  };

  const routerHandler: ControllerC<Context> = {
    rootPath(rootPath: string) {
      ctx.rootPath = rootPath;

      return proxy;
    },
    addRoute<M extends HTTPMethods>(method: M, path: string) {
      if (ctx.routes[method]?.[path])
        throw new Error(
          `${method} Route "${ctx.rootPath}${path}" already registered.`
        );
      if (!ctx.routes[method]) ctx.routes[method] = {};
      ctx.routes[method][path] = {
        handler: async () => {
          throw new Error("Not implemented!");
        },
      };

      return createRoute<"", unknown, unknown, unknown, unknown, Context, M>(
        ctx.routes[method][path]
      );
    },
    use(fn) {
      ctx.middleWares.push(fn);
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
