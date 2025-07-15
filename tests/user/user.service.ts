import { createService, InferService, ServiceContainer } from "../../src/index";

const userService = createService(
  "user",
  async ({ services }) => ({
    async user() {
      return { name: "Tobi", id: "abc" };
    },
  }),
  { buildTime: "INSTANT" }
);

// Auto generated part please dont change anything below!
export { userService };
export function getUserService(deps: ServiceContainer) {
  return deps.get<UserService>(userService.name);
}
export type UserService = InferService<typeof userService>;
