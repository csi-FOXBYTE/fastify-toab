import { createMiddleware } from "@csi-foxbyte/fastify-toab";

export const controllerTestMiddleware = createMiddleware(async ({ ctx }, next) => {
    const nextCtx = {
        ...ctx,
        test: true
    };

    await next({ ctx: nextCtx });

    return nextCtx;
});
