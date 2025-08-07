import { Type } from "@sinclair/typebox";
import { createController, createMiddleware } from "../../src/index";
import { getTestService } from "./test.service";

const testController = createController()
  .use(
    createMiddleware(async ({ ctx }, next) => {
      const newCtx = { ...ctx, ab: true };

      console.time("TOOK");
      await next({ ctx: newCtx });
      console.timeEnd("TOOK");

      return newCtx;
    })
  )
  .use(
    createMiddleware(async ({ ctx }, next) => {
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const newCtx = { ...ctx, ba: true };

      await next({ ctx: newCtx });

      return newCtx;
    })
  )
  .rootPath("/events");

testController.addRoute("POST", "/abc").body(Type.Object({ a: Type.String() })).handler(async (opts) => {
  opts.body
});

testController
  .addRoute("GET", "/test")
  .output(Type.Object({ test: Type.String() }))
  .handler(async (opts) => {
    try {
      const testService = await getTestService(opts.services);

      console.log({ testService });

      await testService.log("HALLO");

      return { test: "succeeded" };
    } catch (e) {
      throw e;
    }
  });

testController
  .addRoute("SSE", "/sse")
  .output(Type.Object({ alles: Type.Boolean() }))
  .handler(async function* (opts) {
    let counter = 0;
    for (let i = 0; i < 512; i++) {
      // if (opts.signal.aborted) break;
      yield { alles: true };
      await new Promise((resolve) => setTimeout(resolve, 500));
      if (counter++ > 10) throw new Error("NONONO");
    }
  });

export { testController };
