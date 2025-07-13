import { lockService, unlockService } from "./context";

type ServiceScope = "REQUEST" | "SINGLETON";

type ServiceFactory<T> = (opts: { services: ServiceContainer }) => Promise<T>;
type Service<T> = {
  name: string;
  factory: ServiceFactory<T>;
  scope: ServiceScope;
};
export type ServiceContainer = {
  get<T>(name: string): Promise<T>;
};

export type InferService<S> = S extends {
  name: string;
  factory: ServiceFactory<infer T>;
}
  ? T
  : never;

export class ServiceRegistry {
  private readonly factories = new Map<
    string,
    { factory: ServiceFactory<any>; scope: ServiceScope }
  >();
  private readonly instances = new Map<string, any>();
  private resolving = new Set<string>();

  register<T>({ name, factory, scope }: Service<T>): void {
    if (this.factories.has(name)) {
      throw new Error(`Service "${name}" already registered.`);
    }
    this.factories.set(name, { factory, scope });
  }

  private readonly singletonInstances = new Map<string, any>();

  async resolve(): Promise<ServiceContainer> {
    const requestScopedInstances = new Map<string, any>();
    const resolving = new Set<string>();

    const container: ServiceContainer = {
      get: async <T>(name: string): Promise<T> => {
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

        resolving.add(name);
        const instance = await factory({ services: container });
        resolving.delete(name);

        cache.set(name, instance);
        return instance;
      },
    };

    return container;
  }
}

export function createService<T>(
  name: string,
  factory: ServiceFactory<T>,
  scope: ServiceScope = "SINGLETON"
) {
  return { name, factory, scope };
}
