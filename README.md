# Fastify TOAB (Typed OpenAPI + BullMQ)

**Fastify TOAB** is a plugin for [Fastify](https://www.fastify.io/) that provides strongly-typed OpenAPI route generation and seamless BullMQ worker integration. It comes with CLI code generation to scaffold controllers, services, middleware, and workers.

## Table of Contents

1. [Installation](#installation)
2. [Features](#features)
3. [Code Generation](#code-generation)
4. [Setup](#setup)
5. [Controller](#controller)
6. [Service](#service)
7. [Middleware](#middleware)
8. [Error Handling](#error-handling)
9. [Worker](#worker)
10. [Registries](#registries)
11. [Testing](#testing)
12. [Contributing](#contributing)
13. [License](#license)

---

## Installation

Install the package via npm or pnpm:

```bash
npm install @csi-foxbyte/fastify-toab
# or using pnpm
pnpm add @csi-foxbyte/fastify-toab
```

## Features

- **Typed Controllers & Routes** with built-in OpenAPI support
- **Service Container** for dependency injection
- **Middleware** creation with shared context
- **BullMQ Worker** registration and queue integration
- **CLI** for scaffolding boilerplate code

## Code Generation

Create a new project scaffold:

```bash
pnpm fastify-toab create
```

Add a service, controller, middleware, worker, or sandboxed worker to an existing project:

```bash
pnpm fastify-toab add service User
pnpm fastify-toab add controller User
pnpm fastify-toab add middleware Auth
pnpm fastify-toab add worker User DeleteUser
pnpm fastify-toab add sandboxedWorker User ExportUser
```

> **Note**: Workers are generated under `<service>/workers`.

## Setup

Configure TOAB with a `fastify-toab.config.ts` file:

```ts
import swagger from "@fastify/swagger";
import { defineConfig, definePlugin } from "@csi-foxbyte/fastify-toab";

export default defineConfig({
  rootDir: "src",
  globalMiddlewares: [],
  plugins: [
    definePlugin(swagger, {
      openapi: {
        info: {
          title: "My API",
          version: "1.0.0",
        },
      },
    }),
  ],
  server: {
    fastify: {
      host: "0.0.0.0",
      port: Number(process.env.PORT ?? 5000),
    },
  },
  onPreStart: async (fastify, registries) => {
    // register hooks, dashboards, health checks, etc.
  },
  onReady: async (fastify, registries) => {
    fastify.log.info("Server ready");
  },
});
```

Run the generated project:

```bash
pnpm fastify-toab rebuild
pnpm fastify-toab build
pnpm fastify-toab dev
```

Important config fields:

- **plugins**: Fastify plugins to register before TOAB, usually declared with `definePlugin(...)` to preserve option types.
- **globalMiddlewares**: Middleware chain that runs before controller and route middlewares.
- **includeGenericErrorResponses**: Adds the built-in generic error schemas to generated OpenAPI responses.
- **onRouteError**: Central hook for custom route error handling.
- **logLevel**: Logger level forwarded to the generated runner.
- **logSerializers**: Custom logger serializers for Fastify/Pino.
- **prefix**: Route prefix for the registered TOAB plugin.
- **rolldown**: Advanced bundler overrides for generated builds.
- **server.fastify**: Options forwarded to `fastify.listen(...)`.
- **server.spawn**: Spawn options used by the generated runner.
- **onPreStart**: Runs after `instrumentation.ts` and before TOAB registers configured Fastify plugins.
- **onReady**: Runs after `fastify.ready()`.
- **rootDir**: Source root that contains your generated `@internals` files and `instrumentation.ts`.

If you want to register the runtime plugin manually instead of using the generated runner, import the named export:

```ts
import { fastifyToab } from "@csi-foxbyte/fastify-toab";
```

To make the global middleware context available in `createController()` automatically, add a `fastify-toab.globals.d.ts` file next to your config:

```ts
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
```

With this file in place, the context produced by `globalMiddlewares` is inferred from `fastify-toab.config.ts` and becomes the default `ctx` type for `createController()`.

## Controller

Controllers define HTTP routes in a typed manner. Example:

```ts
import { createController } from "@csi-foxbyte/fastify-toab";
import { authMiddleware } from "../auth/auth.middleware.js";

export const userController = createController()
  .use(authMiddleware)
  .rootPath("/user");

userController
  .addRoute("GET", "/test")
  .use(async ({ ctx }, next) => {
    const nextCtx = { ...ctx, requestId: crypto.randomUUID() };

    await next({ ctx: nextCtx });

    return nextCtx;
  })
  .handler(async ({ ctx, request, reply }) => {
    return { message: "Hallo Welt!", requestId: ctx.requestId };
  });
```

Each controller must be exported and registered via the generated registries.
Supported route methods are `GET`, `HEAD`, `POST`, `DELETE`, `PUT`, `PATCH`, `ALL`, and `SSE`.
Middlewares can be attached at controller level via `controller.use(...)` or per route via `addRoute(...).use(...)`.
All middleware levels extend the same handler context and are merged in this order:

- global middlewares from `fastify-toab.config.ts`
- controller middlewares from `controller.use(...)`
- route middlewares from `addRoute(...).use(...)`

If multiple middlewares write the same key, the later middleware overrides that key in the resulting `ctx`.

Route handlers receive:

- `request` and `reply`
- `path`: The matched request path without the querystring
- `ctx`: The merged context from global, controller, and route middlewares
- `services`
- `signal`: Aborts when the client disconnects
- typed `body`, `params`, `querystring`, and `headers` when schemas are declared

Path params are strict. If a route path contains named params such as `/:id` or `/:id/:postId`, you must declare `.params(Type.Object(...))` before `.handler(...)`.

```ts
import { createController } from "@csi-foxbyte/fastify-toab";
import { Type } from "@sinclair/typebox";

const fileController = createController().rootPath("/files");

fileController
  .addRoute("GET", "/:id")
  .params(Type.Object({ id: Type.String() }))
  .handler(async ({ params, path }) => {
    params.id;
    path;

    return { id: params.id };
  });

fileController
  .addRoute("GET", "/*")
  .handler(async ({ path }) => {
    return { path };
  });
```

SSE routes use the `SSE` method and return an `AsyncIterable`:

```ts
import { createController } from "@csi-foxbyte/fastify-toab";
import { Type } from "@sinclair/typebox";

const eventsController = createController().rootPath("/events");

eventsController
  .addRoute("SSE", "/stream")
  .output(Type.Object({ message: Type.String() }))
  .handler(async function* ({ signal }) {
    while (!signal.aborted) {
      yield { message: "ping" };
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  });
```

## Service

Services encapsulate business logic and can depend on other services.

```ts
import {
  createService,
  InferService,
  ServiceContainer,
} from "@csi-foxbyte/fastify-toab";

export const userService = createService("user", async () => {
  // implement your service methods here
  return {
    getSession: async () => {
      /* ... */
    },
    // etc.
  };
});

export type UserService = InferService<typeof userService>;

export function getUserService(deps: ServiceContainer): Promise<UserService> {
  return deps.get(userService.name);
}
```

- **createService**: Define a new service namespace.
- **InferService**: Type helper to infer the service interface.
- **ServiceContainer**: Async DI container for accessing services.

Inside request-scoped services you can access the current Fastify request and reply via `getRequestContext()`:

```ts
import { createService, getRequestContext } from "@csi-foxbyte/fastify-toab";

export const auditService = createService(
  "audit",
  async () => {
    const { request } = getRequestContext();

    return {
      getRequestId() {
        return request.id;
      },
    };
  },
  { scope: "REQUEST" },
);
```

## Middleware

Middleware allows injecting shared context into routes.

```ts
import { createMiddleware, GenericRouteError } from "@csi-foxbyte/fastify-toab";
import { getAuthService } from "./auth.service.js";

export const authMiddleware = createMiddleware(
  async ({ ctx, services }, next) => {
    const auth = await getAuthService(services);
    const session = await auth.getSession();

    if (!session) {
      throw new GenericRouteError(
        "UNAUTHORIZED",
        "User must be authenticated",
        { session },
      );
    }

    // extend context with session
    await next({ ctx: { ...ctx, session } });
  },
);
```

- **createMiddleware**: Wraps route handlers to provide shared logic and context.
- **GenericRouteError**: Optional standardized error shape when you choose to use it.
- Middlewares can be reused globally in `fastify-toab.config.ts`, on controllers via `.use(...)`, or per route via `.addRoute(...).use(...)`.

Example with all three middleware levels:

```ts
import { createController, createMiddleware, defineConfig } from "@csi-foxbyte/fastify-toab";

const authMiddleware = createMiddleware(async ({ ctx }, next) => {
  const nextCtx = { ...ctx, session: { userId: "123" } };
  await next({ ctx: nextCtx });
  return nextCtx;
});

const controllerMiddleware = createMiddleware(async ({ ctx }, next) => {
  const nextCtx = { ...ctx, canReadUsers: true };
  await next({ ctx: nextCtx });
  return nextCtx;
});

const routeMiddleware = createMiddleware(async ({ ctx }, next) => {
  const nextCtx = { ...ctx, requestId: crypto.randomUUID() };
  await next({ ctx: nextCtx });
  return nextCtx;
});

export default defineConfig({
  globalMiddlewares: [authMiddleware],
});

const userController = createController()
  .use(controllerMiddleware)
  .rootPath("/user");

userController
  .addRoute("GET", "/me")
  .use(routeMiddleware)
  .handler(async ({ ctx }) => {
    ctx.session.userId;
    ctx.canReadUsers;
    ctx.requestId;

    return ctx;
  });
```

## Worker

Workers process background jobs using BullMQ.

```ts
import {
  createWorker,
  QueueContainer,
  WorkerContainer,
} from "@csi-foxbyte/fastify-toab";
import { Job } from "bullmq";

export const deleteUserWorker = createWorker()
  .queue("deleteUser-queue")
  .job<Job<{ userId: string }, void>>()
  .connection({
    /* BullMQ connection options */
  })
  .processor(async (job, { services, workers, queues }) => {
    // process job.data.userId
    return;
  });

export function getDeleteUserWorker(deps: WorkerContainer) {
  return deps.get(deleteUserWorker.queueName);
}

export function getDeleteUserWorkerQueue(deps: QueueContainer) {
  return deps.get(deleteUserWorker.queueName);
}
```

- **createWorker**: Starts a worker builder.
- **queue**: Sets the queue name.
- **job**: Defines job data and return types.
- **connection**: Configures Redis/BullMQ connection.
- **processor**: Job handler function.

## Error Handling

TOAB can either rethrow route errors to Fastify or handle them centrally with `onRouteError`.

```ts
import {
  defineConfig,
  genericRouteErrorHandler,
  type FastifyToabRouteErrorHandler,
} from "@csi-foxbyte/fastify-toab";

const onRouteError: FastifyToabRouteErrorHandler = async (ctx) => {
  if (ctx.reply.sent) return;

  return genericRouteErrorHandler(ctx);
};

export default defineConfig({
  includeGenericErrorResponses: true,
  onRouteError,
});
```

Available exports for custom error handling:

- `GenericRouteError`
- `isGenericError`
- `genericRouteErrorHandler`
- `FastifyToabRouteErrorContext`
- `FastifyToabRouteErrorHandler`

## Registries

Registries are auto-generated indexes of your controllers, services, and workers. They are written into `src/@internals/`.

```bash
pnpm fastify-toab rebuild
```

Key generated files:

- `src/@internals/registries.ts`: Creates and caches the service, worker, and controller registries.
- `src/@internals/index.ts`: Exposes inferred helper types and `get...` accessors for generated services and workers.
- `src/@internals/run.ts`: Bootstraps `startServer(...)` with your config and instrumentation module.

Your project should also provide an `src/instrumentation.ts` default export:

```ts
import type { InstrumentationInput } from "@csi-foxbyte/fastify-toab";

export default async function instrumentation({
  fastify,
  registries,
}: InstrumentationInput) {
  // optional startup wiring
}
```

## Testing

For examples and integration tests, refer to the `tests/` directory:

```bash
pnpm test
```

Ensure your generated code passes the existing test suite and add new tests for custom logic.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes with clear messages
4. Open a pull request and describe the feature / bugfix

Please follow the repository’s [code style guidelines](./CONTRIBUTING.md).

## License

LGPL3.0 © CSI Foxbyte
