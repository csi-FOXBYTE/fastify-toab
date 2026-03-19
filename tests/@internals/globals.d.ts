import type { Static, TSchema } from "@sinclair/typebox";

type GlobalMiddlewares = typeof config extends {
    globalMiddlewares: infer Middlewares;
}
    ? NonNullable<Middlewares>
    : [];

type EnvSchema = typeof config extends {
    env: infer Envs extends TSchema;
}
    ? Envs
    : never;

type EnvVariables = Static<EnvSchema>;

declare global {
    interface FastifyToabGlobals {
        globalMiddlewares: GlobalMiddlewares;
    }

    namespace NodeJS {
        interface ProcessEnv extends EnvVariables { }
    }
}