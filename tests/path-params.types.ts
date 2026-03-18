import { createController } from "@csi-foxbyte/fastify-toab";
import { Type } from "@sinclair/typebox";

const strictController = createController().rootPath("/strict");

strictController
  .addRoute("GET", "/:id")
  // @ts-expect-error route params must be declared via .params(...)
  .handler(async () => {
    return;
  });

strictController
  .addRoute("GET", "/:id/:postId")
  // @ts-expect-error params schema must include every path param
  .params(Type.Object({ id: Type.String() }))
  // @ts-expect-error handler stays locked until all path params are declared
  .handler(async () => {
    return;
  });

strictController
  .addRoute("GET", "/:id")
  .params(Type.Object({ id: Type.String(), slug: Type.String() }))
  .handler(async ({ params }) => {
    params.id;
    params.slug;

    return;
  });

export {};
