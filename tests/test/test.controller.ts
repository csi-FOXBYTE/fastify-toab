import { createController } from "@csi-foxbyte/fastify-toab";
import { Type } from "@sinclair/typebox";

const testController = createController().rootPath("/test");

testController
  .addRoute("GET", "/")
  .headers(Type.Object({ a: Type.String() }))
  .handler(async ({ headers }) => {
    headers.a;
  });

export default testController;
