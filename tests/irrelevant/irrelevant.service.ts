import {
  createService,
  InferService,
  ServiceContainer,
} from "../../src/index";
import { getUserService } from "../user/user.service";

const irrelevantService = createService("irrelevant", async ({ services }) => {
  return {
    async log(msg: string) {
      const userService = await getUserService(services);

      console.log("ALORA", msg, await userService.user());
    },
  };
});

// Auto generated part please dont change anything below!
export { irrelevantService };
export function getIrrelevantService(deps: ServiceContainer) {
  return deps.get<IrrelevantService>(irrelevantService.name);
}
export type IrrelevantService = InferService<typeof irrelevantService>;
