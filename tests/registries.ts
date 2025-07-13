import { ControllerRegistry } from "../src/controller";
import { ServiceRegistry } from "../src/service";
import { irrelevantService } from "./irrelevant/irrelevant.service";
import { testController } from "./test/test.controller";
import { testService } from "./test/test.service";
import { userService } from "./user/user.service";

const serviceRegistry = new ServiceRegistry();
serviceRegistry.register(testService);
serviceRegistry.register(userService);
serviceRegistry.register(irrelevantService);

const controllerRegistry = new ControllerRegistry(serviceRegistry);
controllerRegistry.register(testController);

export { controllerRegistry, serviceRegistry };
