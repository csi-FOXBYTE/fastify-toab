import { TSchema, TObject, Static } from "@sinclair/typebox";
import {
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
  params?: TObject;
  handler: (opts: HandlerOpts) => Promise<unknown>;
};

export interface RouteC<
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

export function createRoute<
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
