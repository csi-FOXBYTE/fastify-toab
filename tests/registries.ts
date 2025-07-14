import {
  ControllerRegistry,
  ServiceRegistry,
  WorkerRegistry,
} from "../src/index";
import { irrelevantService } from "./irrelevant/irrelevant.service";
import { testController } from "./test/test.controller";
import { testService } from "./test/test.service";
import { test0Worker } from "./test/workers/test0.worker";
import { test1Worker } from "./test/workers/test1.worker";
import { userService } from "./user/user.service";

export async function getRegistries() {
  try {
    let workerRegistryRef: { current: WorkerRegistry | null } = {
      current: null,
    };

    const serviceRegistry = new ServiceRegistry(workerRegistryRef);
    serviceRegistry.register(testService);
    serviceRegistry.register(userService);
    serviceRegistry.register(irrelevantService);

    const workerRegistry = new WorkerRegistry(serviceRegistry);
    await workerRegistry.register(test0Worker);
    await workerRegistry.register(test1Worker);

    workerRegistryRef.current = workerRegistry;

    const controllerRegistry = new ControllerRegistry(serviceRegistry);
    controllerRegistry.register(testController);

    return { controllerRegistry, serviceRegistry, workerRegistry };
  } catch (e) {
    console.error("UNKNOWN ERROR", e);
    throw e;
  }
}
