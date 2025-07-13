import { Type } from "@sinclair/typebox";
import { createController } from "../../src/controller";
import { getTestService } from "./test.service";

const testController = createController()
  .use(async ({ ctx }, next) => {
    const newCtx = { ...ctx, ab: true };

    console.time("TOOK");
    await next({ ctx: newCtx });
    console.timeEnd("TOOK");

    return newCtx;
  })
  .use(async ({ ctx }, next) => {
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const newCtx = { ...ctx, ba: true };

    await next({ ctx: newCtx });

    return newCtx;
  })
  .rootPath("/events");

testController.addRoute("GET", "/abc").handler(async (opts) => {});

testController
  .addRoute("GET", "/test")
  .output(Type.Object({ test: Type.String() }))
  .handler(async (opts) => {
    try {
      const testService = await getTestService(opts.services);

      testService.log("HALLO");

      return { test: "succeeded" };
    } catch (e) {
      throw e;
    }
  });

export { testController };
