import { createController } from "@csi-foxbyte/fastify-toab";
import { Type } from "@sinclair/typebox";
import { controllerTestMiddleware } from "./controller.middlware.js";
import { routeOtherMiddleware } from "./route.middleware.js";

const testController = createController().use(controllerTestMiddleware).rootPath("/test");

testController
  .addRoute("GET", "/")
  .use(routeOtherMiddleware)
  .headers(Type.Object({ a: Type.String() }))
  .handler(async ({ headers, ctx }) => {
    headers.a;
    ctx.other;
    ctx.order;
    ctx.test;
  });

testController
  .addRoute("GET", "/")
  .handler(async ({ path }) => {
    path;
  });

testController
  .addRoute("GET", "/")
  .handler(async () => {

  })

export default testController;
