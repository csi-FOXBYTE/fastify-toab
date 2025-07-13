import { getContext } from "../../src/context";
import {
  createService,
  InferService,
  ServiceContainer,
} from "../../src/service";
import { getUserService } from "../user/user.service";

const testService = createService("test", async ({ services }) => {
  return {
    async log(msg: string) {
      const ctx = getContext();
      const userService = await getUserService(services);

      console.log("ALORA", msg, await userService.user());
    },
  };
});

// Auto generated part please dont change anything below!
export { testService };
export function getTestService(deps: ServiceContainer) {
  return deps.get<TestService>(testService.name);
}
export type TestService = InferService<typeof testService>;
