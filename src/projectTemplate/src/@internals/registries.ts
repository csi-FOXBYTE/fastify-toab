import { ControllerRegistry, ServiceRegistry, WorkerRegistry } from "@csi-foxbyte/fastify-toab";

let serviceRegistry: ServiceRegistry | null = null;
let workerRegistry: WorkerRegistry | null = null;
let controllerRegistry: ControllerRegistry | null = null;

export async function getRegistries() {
    if (serviceRegistry !== null && workerRegistry !== null && controllerRegistry !== null) return { controllerRegistry, serviceRegistry, workerRegistry };

    let workerRegistryRef: { current: WorkerRegistry | null } = {
        current: null,
    };

    serviceRegistry = new ServiceRegistry(workerRegistryRef);

    workerRegistry = new WorkerRegistry(serviceRegistry);

    workerRegistryRef.current = workerRegistry;

    controllerRegistry = new ControllerRegistry(serviceRegistry);

    return { controllerRegistry, serviceRegistry, workerRegistry };
}