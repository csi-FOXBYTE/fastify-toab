import {
  ControllerRegistry,
  ServiceRegistry,
  WorkerRegistry,
} from "./src/index";

import { irrelevantService } from "./tests/irrelevant/irrelevant.service";
import { testService } from "./tests/test/test.service";
import { userService } from "./tests/user/user.service";
import { test0Worker } from "./tests/test/workers/test0.worker";
import { test1Worker } from "./tests/test/workers/test1.worker";
import { testController } from "./tests/test/test.controller";

export async function getRegistries() {
  let workerRegistryRef: { current: WorkerRegistry | null } = {
    current: null,
  };

  const serviceRegistry = new ServiceRegistry(workerRegistryRef);
  serviceRegistry.register(irrelevantService);
  serviceRegistry.register(testService);
  serviceRegistry.register(userService);

  const workerRegistry = new WorkerRegistry(serviceRegistry);
  await workerRegistry.register(test0Worker);
  await workerRegistry.register(test1Worker);

  const controllerRegistry = new ControllerRegistry(serviceRegistry);
  controllerRegistry.register(testController);

  return { controllerRegistry, serviceRegistry, workerRegistry };
}