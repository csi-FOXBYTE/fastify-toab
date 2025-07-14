import {
  createService,
  InferService,
  ServiceContainer,
} from "../../src/index";
import { getUserService } from "../user/user.service";
import { getTest0Worker, getTest0WorkerQueue } from "./workers/test0.worker";

const testService = createService(
  "test",
  async ({ services, request, reply, queues }) => {
    return {
      async log(msg: string) {
        console.log(request, reply);
        const userService = await getUserService(services);

        const queue0 = getTest0WorkerQueue(queues);

        queue0.add("name", { test: "abc"})

        console.log("ALORA", msg, await userService.user());
      },
    };
  },
  "REQUEST"
);

// Auto generated part please dont change anything below!
export { testService };
export function getTestService(deps: ServiceContainer) {
  return deps.get<TestService>(testService.name);
}
export type TestService = InferService<typeof testService>;
