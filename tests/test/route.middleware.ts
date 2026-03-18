import { createMiddleware } from "@csi-foxbyte/fastify-toab";

export const routeOtherMiddleware = createMiddleware(async ({ ctx }, next) => {
    const nextCtx = {
        ...ctx,
        other: "stuff"
    };

    await next({ ctx: nextCtx });

    return nextCtx;
});
