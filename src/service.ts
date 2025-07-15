import { FastifyReply, FastifyRequest } from "fastify";
import { getRequestContext } from "./context";
import { QueueContainer, WorkerContainer, WorkerRegistry } from "./worker";

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
  get<T>(name: string): Promise<T>;
};

export type InferService<S> = S extends {
  name: string;
  factory: ServiceFactory<infer T, infer S>;
}
  ? T
  : never;

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

  constructor(workerRegistryRef: { current: WorkerRegistry | null }) {
    this.workerRegistryRef = workerRegistryRef;
  }

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

  async initializeInstant() {
    for (const [name, { buildTime }] of this.factories.entries()) {
      if (buildTime === "INSTANT") {
        await this.resolve().get(name);
        console.log("INITIALIZED", name);
      }
    }
  }

  resolve(): ServiceContainer {
    const requestScopedInstances = new Map<string, any>();
    const resolving = new Set<string>();

    const container: ServiceContainer = {
      get: async <T>(name: string): Promise<T> => {
        if (!this.workerRegistryRef.current)
          throw new Error("Worker registry not registered yet!");

        const definition = this.factories.get(name);
        if (!definition) {
          throw new Error(`No service named "${name}" found!`);
        }

        const { factory, scope } = definition;

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

        let instance: any;

        resolving.add(name);
        if (scope === "REQUEST") {
          instance = await factory({
            services: container,
            workers: { get: this.workerRegistryRef.current.getWorker },
            queues: { get: this.workerRegistryRef.current.getQueue },
            ...getRequestContext(),
          });
        } else {
          instance = await factory({
            services: container,
            workers: { get: this.workerRegistryRef.current.getWorker },
            queues: { get: this.workerRegistryRef.current.getQueue },
          });
        }
        resolving.delete(name);

        cache.set(name, instance);
        return instance;
      },
    };

    return container;
  }
}

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
