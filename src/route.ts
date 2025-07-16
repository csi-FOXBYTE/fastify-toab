import { TSchema, TObject, Static } from "@sinclair/typebox";
import type {
  RouteShorthandOptions,
  HTTPMethods,
  FastifyRequest,
  FastifyReply,
} from "fastify";
import { HandlerOpts } from "./controller";
import { ServiceContainer } from "./service";

export type RouteCtx = {
  body?: TSchema;
  output?: TSchema;
  querystring?: TObject;
  opts?: RouteShorthandOptions;
  headers?: TSchema;
  params?: TObject;
  handler: <Method extends HTTPMethods>(
    opts: HandlerOpts
  ) => Method extends "SSE" ? AsyncIterable<unknown> : Promise<unknown>;
};

export type RouteHandler<Context, QueryString, Params, Output, Headers> =
  (opts: {
    request: FastifyRequest;
    reply: FastifyReply;
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
  Params,
  Context,
  Method extends HTTPMethods,
  Headers
> {
  body: <B extends TSchema>(
    body: B
  ) => Omit<
    RouteC<
      "body" | Omitter,
      B,
      Output,
      QueryString,
      Params,
      Context,
      Method,
      Headers
    >,
    "body" | Omitter
  >;
  headers: <H extends TSchema>(
    headers: H
  ) => Omit<
    RouteC<
      "headers" | Omitter,
      Body,
      Output,
      QueryString,
      Params,
      Context,
      Method,
      Headers
    >,
    "headers" | Omitter
  >;
  output: <O extends TSchema>(
    output: O
  ) => Omit<
    RouteC<
      "output" | Omitter,
      Body,
      O,
      QueryString,
      Params,
      Context,
      Method,
      Headers
    >,
    "output" | Omitter
  >;
  querystring: <Q extends TObject>(
    querystring: Q
  ) => Omit<
    RouteC<
      "querystring" | Omitter,
      Body,
      Output,
      Q,
      Params,
      Context,
      Method,
      Headers
    >,
    "querystring" | Omitter
  >;
  handler: (
    fn: Method extends "SSE"
      ? SSERouteHandler<Context, QueryString, Params, Output, Headers>
      : RouteHandler<Context, QueryString, Params, Output, Headers>,
    opts?: RouteShorthandOptions
  ) => RouteCtx;
  params: <P extends TObject>(
    params: P
  ) => Omit<
    RouteC<
      "params" | Omitter,
      Body,
      Output,
      QueryString,
      P,
      Context,
      Method,
      Headers
    >,
    "params" | Omitter
  >;
}

export function createRoute<
  Omitter extends string,
  Body,
  Output,
  QueryString,
  Params,
  Context,
  Method extends HTTPMethods,
  Headers
>(
  ctx: RouteCtx
): RouteC<
  Omitter,
  Body,
  Output,
  QueryString,
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
