import type { FastifyReply, FastifyRequest } from "fastify";
import { getRequestContext } from "./context.js";
import { QueueContainer, WorkerContainer, WorkerRegistry } from "./worker.js";
import { AsyncLocalStorage } from "async_hooks";

type ServiceScope = "REQUEST" | "SINGLETON";
type ServiceBuildTime = "DYNAMIC" | "INSTANT";

type ServiceFactory<T, S extends ServiceScope> = (
  opts: S extends "SINGLETON"
    ? {
      services: ServiceContainer;
      workers: WorkerContainer;
      queues: QueueContainer;
    }
    : {
      services: ServiceContainer;
      request: FastifyRequest;
      reply: FastifyReply;
      workers: WorkerContainer;
      queues: QueueContainer;
    }
) => Promise<T>;
type Service<T, S extends ServiceScope> = {
  name: string;
  factory: ServiceFactory<T, S>;
  scope: ServiceScope;
  buildTime: ServiceBuildTime;
};
export type ServiceContainer = {
  /**
   * Resolves a registered service by name.
   */
  get<T>(name: string): Promise<T>;
};

export type InferService<S> = S extends {
  name: string;
  factory: ServiceFactory<infer T, infer S>;
}
  ? T
  : never;

const resolveLocalStorage = new AsyncLocalStorage<{
  visitedSet: Set<string>;
  resolutionStack: Array<{ name: string; scope: ServiceScope }>;
}>();

/**
 * Registry and resolver for TOAB services.
 *
 * @remarks
 * Services are resolved lazily and support singleton and request scopes.
 *
 * @example
 * ```ts
 * const serviceRegistry = new ServiceRegistry(workerRegistryRef);
 * serviceRegistry.register(userService);
 * ```
 */
export class ServiceRegistry {
  private readonly factories = new Map<
    string,
    {
      factory: ServiceFactory<any, any>;
      scope: ServiceScope;
      buildTime: ServiceBuildTime;
    }
  >();
  private readonly singletonInstances = new Map<string, any>();
  private readonly workerRegistryRef: { current: WorkerRegistry | null };

  /**
   * Creates a service registry bound to the current worker registry reference.
   */
  constructor(workerRegistryRef: { current: WorkerRegistry | null }) {
    this.workerRegistryRef = workerRegistryRef;
  }

  /**
   * Registers a service definition under its unique name.
   *
   * @example
   * ```ts
   * serviceRegistry.register(userService);
   * ```
   */
  register<T, S extends ServiceScope>({
    name,
    factory,
    scope,
    buildTime,
  }: Service<T, S>): void {
    if (this.factories.has(name)) {
      throw new Error(`Service "${name}" already registered.`);
    }
    this.factories.set(name, { factory, scope, buildTime });
  }

  /**
   * Eagerly resolves all services marked with `buildTime: "INSTANT"`.
   */
  async initializeInstant() {
    for (const [name, { buildTime }] of this.factories.entries()) {
      if (buildTime === "INSTANT") {
        await this.resolve().get(name);
      }
    }
  }

  /**
   * Creates a dependency container for resolving registered services.
   *
   * @example
   * ```ts
   * const services = serviceRegistry.resolve();
 * const userService = await services.get<UserService>("user");
   * ```
   */
  resolve(): ServiceContainer {
    const requestScopedInstances = new Map<string, any>();
    const resolving = new Set<string>();

    const container: ServiceContainer = {
      get: async <T>(name: string): Promise<T> => {
        let store = resolveLocalStorage.getStore();

        if (!store) {
          store = { visitedSet: new Set(), resolutionStack: [] };
          resolveLocalStorage.enterWith(store);
        }

        store.visitedSet.add(name);

        if (!this.workerRegistryRef.current)
          throw new Error("Worker registry not registered yet!");

        const definition = this.factories.get(name);
        if (!definition) {
          throw new Error(`No service named "${name}" found!`);
        }

        const { factory, scope } = definition;

        const topOfStack =
          store.resolutionStack[store.resolutionStack.length - 1];
        if (scope === "REQUEST" && topOfStack?.scope === "SINGLETON") {
          throw new Error(
            `Request scoped service "${name}" cannot be resolved from singleton service "${topOfStack.name}".`
          );
        }

        const cache =
          scope === "SINGLETON"
            ? this.singletonInstances
            : requestScopedInstances;

        if (cache.has(name)) {
          return cache.get(name);
        }

        if (resolving.has(name)) {
          throw new Error(
            `Circular dependency detected while resolving "${name}"`
          );
        }

        store.resolutionStack.push({ name, scope });
        resolving.add(name);
        try {
          let instance: any;
          if (scope === "REQUEST") {
            instance = await factory({
              services: container,
              workers: {
                get: this.workerRegistryRef.current.getWorker.bind(
                  this.workerRegistryRef.current
                ),
              },
              queues: {
                get: this.workerRegistryRef.current.getQueue.bind(
                  this.workerRegistryRef.current
                ),
              },
              ...getRequestContext(),
            });
          } else {
            instance = await factory({
              services: container,
              workers: {
                get: this.workerRegistryRef.current.getWorker.bind(
                  this.workerRegistryRef.current
                ),
              },
              queues: {
                get: this.workerRegistryRef.current.getQueue.bind(
                  this.workerRegistryRef.current
                ),
              },
            });
          }
          cache.set(name, instance);
          return instance;
        } finally {
          store.resolutionStack.pop();
          resolving.delete(name);
        }
      },
    };

    return container;
  }
}

/**
 * Declares a service that can later be registered in a {@link ServiceRegistry}.
 *
 * @remarks
 * The returned definition is typically exported from a module and picked up by
 * generated registries.
 *
 * @example
 * ```ts
 * export const userService = createService("user", async () => {
 *   return {
 *     findById(id: string) {
 *       return { id };
 *     },
 *   };
 * });
 * ```
 */
export function createService<T, S extends ServiceScope>(
  name: string,
  factory: ServiceFactory<T, S>,
  opts?: S extends "SINGLETON"
    ? { scope?: S; buildTime?: ServiceBuildTime }
    : { scope?: S; buildTime?: undefined }
): Service<T, S> {
  return {
    name,
    factory,
    scope: opts?.scope ?? ("SINGLETON" as S),
    buildTime: opts?.buildTime ?? "DYNAMIC",
  };
}
