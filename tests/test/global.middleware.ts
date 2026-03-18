import { createMiddleware } from "@csi-foxbyte/fastify-toab";

export const globalOrderMiddleware = createMiddleware(async ({ ctx }, next) => {
  const nextCtx = {
    ...ctx,
    order: [...((ctx as { order?: string[] }).order ?? []), "global"],
  };

  await next({ ctx: nextCtx });

  return nextCtx;
});
