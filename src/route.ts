import { TSchema, TObject, Static } from "@sinclair/typebox";
import type {
  RouteShorthandOptions,
  HTTPMethods,
  FastifyRequest,
  FastifyReply,
} from "fastify";
import { HandlerOpts } from "./controller.js";
import {
  AnyMiddleware,
  createMiddleware,
  MergeMiddlewareContext,
  MiddlewareContext,
} from "./middleware.js";
import { ServiceContainer } from "./service.js";

export type RouteCtx = {
  body?: TSchema;
  output?: TSchema;
  querystring?: TObject;
  opts?: RouteShorthandOptions;
  headers?: TSchema;
  params?: TObject;
  middlewares: AnyMiddleware[];
  handler: <Method extends HTTPMethods>(
    opts: HandlerOpts,
  ) => Method extends "SSE" ? AsyncIterable<unknown> : Promise<unknown>;
};

type PathParamNames<Path extends string> =
  Path extends `${string}:${infer Rest}`
    ? Rest extends `${infer Param}/${infer Tail}`
      ? Param | PathParamNames<`/${Tail}`>
      : Rest
    : never;

type SchemaKeys<Schema extends TObject> = keyof Schema["properties"] & string;

type MissingPathParams<Path extends string, Params> = Params extends TObject
  ? Exclude<PathParamNames<Path>, SchemaKeys<Params>>
  : PathParamNames<Path>;

type ValidatePathParamsSchema<Path extends string, Schema extends TObject> =
  MissingPathParams<Path, Schema> extends never
    ? Schema
    : Schema & {
        __fastify_toab_path_params_error__: `Missing path params in schema: ${MissingPathParams<Path, Schema>}`;
      };

type MissingPathParamsHandler<Path extends string, Missing extends string> = (
  ...args: [`Route path "${Path}" requires .params(...) for: ${Missing}`]
) => never;

export type RouteHandler<Context, Body, QueryString, Params, Output, Headers> =
  (opts: {
    request: FastifyRequest;
    reply: FastifyReply;
    path: string;
    ctx: Context;
    services: ServiceContainer;
    querystring: QueryString extends TObject ? Static<QueryString> : void;
    params: Params extends TSchema ? Static<Params> : void;
    body: Body extends TSchema ? Static<Body> : void;
    headers: Headers extends TObject ? Static<Headers> : void;
    signal: AbortSignal;
  }) => Promise<Output extends TSchema ? Static<Output> : void>;

export type SSERouteHandler<Context, QueryString, Params, Output, Headers> =
  (opts: {
    request: FastifyRequest;
    reply: FastifyReply;
    path: string;
    ctx: Context;
    signal: AbortSignal;
    services: ServiceContainer;
    querystring: QueryString extends TObject ? Static<QueryString> : void;
    params: Params extends TSchema ? Static<Params> : void;
    headers: Headers extends TObject ? Static<Headers> : void;
  }) => AsyncIterable<Output extends TSchema ? Static<Output> : unknown>;

export interface RouteC<
  Omitter extends string,
  Body,
  Output,
  QueryString,
  Path extends string,
  Params,
  Context extends MiddlewareContext,
  Method extends HTTPMethods,
  Headers,
> {
  /**
   * Declares the request body schema for this route.
   */
  body: <B extends TSchema>(
    body: B,
  ) => Omit<
    RouteC<
      "body" | Omitter,
      B,
      Output,
      QueryString,
      Path,
      Params,
      Context,
      Method,
      Headers
    >,
    "body" | Omitter
  >;
  /**
   * Declares the request headers schema for this route.
   */
  headers: <H extends TSchema>(
    headers: H,
  ) => Omit<
    RouteC<
      "headers" | Omitter,
      Body,
      Output,
      QueryString,
      Path,
      Params,
      Context,
      Method,
      H
    >,
    "headers" | Omitter
  >;
  /**
   * Declares the success response schema for this route.
   */
  output: <O extends TSchema>(
    output: O,
  ) => Omit<
    RouteC<
      "output" | Omitter,
      Body,
      O,
      QueryString,
      Path,
      Params,
      Context,
      Method,
      Headers
    >,
    "output" | Omitter
  >;
  /**
   * Declares the querystring schema for this route.
   */
  querystring: <Q extends TObject>(
    querystring: Q,
  ) => Omit<
    RouteC<
      "querystring" | Omitter,
      Body,
      Output,
      Q,
      Path,
      Params,
      Context,
      Method,
      Headers
    >,
    "querystring" | Omitter
  >;
  /**
   * Attaches a middleware that only runs for this route.
   */
  use: <
    NewContext extends MiddlewareContext,
    NextContext extends NewContext
  >(
    fn: ReturnType<typeof createMiddleware<NewContext, NextContext, Context>>
  ) => Omit<
    RouteC<
      Omitter,
      Body,
      Output,
      QueryString,
      Path,
      Params,
      MergeMiddlewareContext<Context, NextContext>,
      Method,
      Headers
    >,
    Omitter
  >;
  /**
   * Finalizes the route by attaching its handler function.
   *
   * @remarks
   * If the path contains named params, `.params(...)` must be declared before
   * this method becomes callable.
   */
  handler: [MissingPathParams<Path, Params>] extends [never]
    ? (
        fn: Method extends "SSE"
          ? SSERouteHandler<Context, QueryString, Params, Output, Headers>
          : RouteHandler<Context, Body, QueryString, Params, Output, Headers>,
        opts?: RouteShorthandOptions,
      ) => RouteCtx
    : MissingPathParamsHandler<
        Path,
        Extract<MissingPathParams<Path, Params>, string>
      >;
  /**
   * Declares the path params schema for this route.
   */
  params: <P extends TObject>(
    params: ValidatePathParamsSchema<Path, P>,
  ) => Omit<
    RouteC<
      "params" | Omitter,
      Body,
      Output,
      QueryString,
      Path,
      P,
      Context,
      Method,
      Headers
    >,
    "params" | Omitter
  >;
}

/**
 * Internal route builder used by `createController().addRoute(...)`.
 *
 * @remarks
 * Most consumers should start from `createController()` instead of calling this directly.
 */
export function createRoute<
  Omitter extends string,
  Body,
  Output,
  QueryString,
  Path extends string,
  Params,
  Context extends MiddlewareContext,
  Method extends HTTPMethods,
  Headers,
>(
  ctx: RouteCtx,
): RouteC<
  Omitter,
  Body,
  Output,
  QueryString,
  Path,
  Params,
  Context,
  Method,
  Headers
> {
  const routerHandler: RouteC<
    Omitter,
    Body,
    Output,
    QueryString,
    Path,
    Params,
    Context,
    Method,
    Headers
  > = {
    // @ts-expect-error wrong types
    body(body) {
      ctx.body = body;
      return proxy;
    },
    // @ts-expect-error wrong types
    output(output) {
      ctx.output = output;
      return proxy;
    },
    // @ts-expect-error wrong types
    params(params) {
      ctx.params = params;
      return proxy;
    },
    // @ts-expect-error wrong types
    headers(headers) {
      ctx.headers = headers;
      return proxy;
    },
    // @ts-expect-error wrong types
    querystring(querystring) {
      ctx.querystring = querystring;
      return proxy;
    },
    // @ts-expect-error wrong types
    use(fn) {
      ctx.middlewares.push(fn);
      return proxy;
    },
    // @ts-expect-error wrong types
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
