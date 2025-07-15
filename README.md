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
8. [Worker](#worker)
9. [Registries](#registries)
10. [Testing](#testing)
11. [Contributing](#contributing)
12. [License](#license)

---

## Installation

Install the package via npm or pnpm:

```bash
npm install @csi-foxbyte/fastify-toab
# or using pnpm
pnpm add @csi-foxbyte/fastify-toab
```

## Features

* **Typed Controllers & Routes** with built-in OpenAPI support
* **Service Container** for dependency injection
* **Middleware** creation with shared context
* **BullMQ Worker** registration and queue integration
* **CLI** for scaffolding boilerplate code

## Code Generation

Generate a new controller or service:

```bash
pnpm fastify-toab create <controller|service> <Name>
```

Generate a new worker under an existing service:

```bash
pnpm fastify-toab create worker <ParentService> <Name>
```

Generate a middleware template:

```bash
pnpm fastify-toab create middleware <Name>
```

> **Note**: Workers must live under a service component. Create the service first before adding workers.

## Setup

Register the plugin in your Fastify application:

```ts
import Fastify from "fastify";
import fastifyToab from "@csi-foxbyte/fastify-toab";
import { getRegistries } from "./registries.js";

const fastify = Fastify();

fastify.register(fastifyToab, { getRegistries });

(async () => {
  await fastify.ready();

  await fastify.listen({
    host: "0.0.0.0",
    port: Number(process.env.PORT ?? 5000),
  });
})();
```

* **getRegistries**: Function that returns all registered controllers, services, middleware, and workers (auto-generated).

## Controller

Controllers define HTTP routes in a typed manner. Example:

```ts
import { createController } from "@csi-foxbyte/fastify-toab";
import { authMiddleware } from "../auth/auth.middleware.js";

export const userController = createController()
  .use(authMiddleware)
  .rootPath("/user");

userController.addRoute("GET", "/test").handler(async (req, res) => {
  // req and res are strongly typed based on OpenAPI schemas
  return { message: "Hallo Welt!" };
});
```

Each controller must be exported and registered via the generated registries.

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
    getSession: async () => { /* ... */ },
    // etc.
  };
});

export type UserService = InferService<typeof userService>;

export function getUserService(deps: ServiceContainer): UserService {
  return deps.get(userService.name);
}
```

* **createService**: Define a new service namespace.
* **InferService**: Type helper to infer the service interface.
* **ServiceContainer**: DI container for accessing services.

## Middleware

Middleware allows injecting shared context into routes.

```ts
import { createMiddleware, GenericRouteError } from "@csi-foxbyte/fastify-toab";
import { getAuthService } from "./auth.service.js";

export const authMiddleware = createMiddleware(async ({ ctx, services }, next) => {
  const auth = getAuthService(services);
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
});
```

* **createMiddleware**: Wraps route handlers to provide shared logic and context.
* **GenericRouteError**: Standardized error for HTTP responses.

## Worker

Workers process background jobs using BullMQ.

```ts
import {
  createWorker,
  QueueContainer,
  WorkerContainer,
  Job,
} from "@csi-foxbyte/fastify-toab";

export const deleteUserWorker = createWorker()
  .queue("deleteUser-queue")
  .job<Job<{ userId: string }, void>>()
  .connection({ /* BullMQ connection options */ })
  .processor(async (job) => {
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

* **createWorker**: Starts a worker builder.
* **queue**: Sets the queue name.
* **job**: Defines job data and return types.
* **connection**: Configures Redis/BullMQ connection.
* **processor**: Job handler function.

## Registries

Registries are auto-generated indexes of all controllers, services, middleware, and workers. They live in `./src/registries.js` (or `.ts`).

```bash
pnpm fastify-toab rebuild
```

This command regenerates the registries after creating new artifacts.

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
