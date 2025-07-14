import { Queue, Worker, QueueOptions, Job, SandboxedJob, WorkerOptions, ConnectionOptions, RepeatOptions, JobSchedulerTemplateOptions, WorkerListener } from 'bullmq';
export { Job, Queue } from 'bullmq';
import { FastifyRequest, FastifyReply, RouteShorthandOptions, HTTPMethods as HTTPMethods$1 } from 'fastify';
import { TSchema, TObject, Static } from '@sinclair/typebox';

type ServiceScope = "REQUEST" | "SINGLETON";
type ServiceFactory<T, S extends ServiceScope> = (opts: S extends "SINGLETON" ? {
    services: ServiceContainer;
    workers: WorkerContainer;
    queues: QueueContainer;
} : {
    services: ServiceContainer;
    request: FastifyRequest;
    reply: FastifyReply;
    workers: WorkerContainer;
    queues: QueueContainer;
}) => Promise<T>;
type Service<T, S extends ServiceScope> = {
    name: string;
    factory: ServiceFactory<T, S>;
    scope: ServiceScope;
};
type ServiceContainer = {
    get<T>(name: string): Promise<T>;
};
type InferService<S> = S extends {
    name: string;
    factory: ServiceFactory<infer T, infer S>;
} ? T : never;
declare class ServiceRegistry {
    private readonly factories;
    private readonly singletonInstances;
    private readonly workerRegistryRef;
    constructor(workerRegistryRef: {
        current: WorkerRegistry | null;
    });
    register<T, S extends ServiceScope>({ name, factory, scope, }: Service<T, S>): void;
    resolve(): ServiceContainer;
}
declare function createService<T, S extends ServiceScope>(name: string, factory: ServiceFactory<T, S>, scope?: S): {
    name: string;
    factory: ServiceFactory<T, S>;
    scope: S;
};

interface WorkerContainer {
    get: WorkerRegistry["getWorker"];
}
interface QueueContainer {
    get: WorkerRegistry["getQueue"];
}
interface WorkerCtx<Q extends Queue, W extends Worker> {
    queueName: string;
    queueOptions?: QueueOptions;
    jobSchedulers: Parameters<WorkerC<"", Job<any, any, any>, null>["upsertJobScheduler"]>[];
    onHandlers: Parameters<WorkerC<"", Job<any, any, any>, null>["on"]>[];
    onceHandlers: Parameters<WorkerC<"", Job<any, any, any>, null>["on"]>[];
    isSandboxed: boolean;
    connection: ConnectionOptions;
    options?: WorkerOptions;
    processor: string | URL | ((job: Job<any, any, any>, ctx: {
        services: ReturnType<ServiceRegistry["resolve"]>;
        workers: WorkerContainer;
        queues: QueueContainer;
    }, token?: string) => Promise<any>);
    queue: Q;
    worker: W;
}
declare class WorkerRegistry {
    private readonly queues;
    private readonly workers;
    private readonly serviceRegistry;
    constructor(serviceRegistry: ServiceRegistry);
    register<Q extends Queue<any, any, any, any, any>, W extends Worker<any, any, any>>(workerCtx: WorkerCtx<Q, W>): Promise<void>;
    getQueue<Q extends Queue>(name: string): Q;
    getWorker<W extends Worker>(name: string): W;
}
interface WorkerC<Omitter extends string, J extends Job<any, any, any> | null, SJ extends SandboxedJob<any, any> | null> {
    queue: (queueName: string, queueOptions?: QueueOptions) => Pick<WorkerC<Omitter | "queue" | "processor", J, SJ>, "sandboxedJob" | "job">;
    job<NewJob extends Job<any, any, any>>(): Omit<WorkerC<Omitter | "job" | "sandboxedJob", NewJob, SJ>, Omitter | "job" | "sandboxedJob">;
    sandboxedJob<NewSandboxedJob extends SandboxedJob<any, any>>(): Omit<WorkerC<Omitter | "sandboxedJob" | "job", J, NewSandboxedJob>, Omitter | "sandboxedJob" | "job">;
    options: (options: WorkerOptions) => Omit<WorkerC<Omitter | "options", J, SJ>, Omitter | "options">;
    connection: (connection: ConnectionOptions) => Pick<WorkerC<Omitter | "connection", J, SJ>, "processor">;
    processor: J extends Job<infer T, infer R, infer N> ? (processor: (job: Job<T, R, N>, ctx: {
        services: ServiceContainer;
        workers: {
            get: WorkerRegistry["getWorker"];
        };
        queues: {
            get: WorkerRegistry["getQueue"];
        };
    }, token?: string) => Promise<R>) => WorkerCtx<Queue<T, R, N>, Worker<T, R, string>> : SJ extends SandboxedJob<infer T, infer R> ? (url: string | URL) => WorkerCtx<Queue<T, R, string>, Worker<T, R, string>> : never;
    upsertJobScheduler: J extends Job<infer T, infer R, infer N> ? (jobSchedulerId: string, repeatOpts: Omit<RepeatOptions, "key">, jobTemplate?: {
        name?: N;
        data?: T;
        opts?: JobSchedulerTemplateOptions;
    }) => Omit<WorkerC<Omitter, J, SJ>, Omitter> : SJ extends SandboxedJob<infer T> ? (jobSchedulerId: string, repeatOpts: Omit<RepeatOptions, "key">, jobTemplate?: {
        name?: string;
        data?: T;
        opts?: JobSchedulerTemplateOptions;
    }) => Omit<WorkerC<Omitter, J, SJ>, Omitter> : never;
    on: J extends Job<any, any, any> ? <Key extends keyof WorkerListener<J>>(event: Key, listener: WorkerListener<J>[Key]) => Omit<WorkerC<Omitter, J, SJ>, Omitter> : SJ extends SandboxedJob<infer T, infer R> ? <Key extends keyof WorkerListener<Job<T, R, string>>>(event: Key, listener: WorkerListener<Job<T, R, string>>[Key]) => Omit<WorkerC<Omitter, J, SJ>, Omitter> : never;
    once: J extends Job<any, any, any> ? <Key extends keyof WorkerListener<J>>(event: Key, listener: WorkerListener<J>[Key]) => Omit<WorkerC<Omitter, J, SJ>, Omitter> : SJ extends SandboxedJob<infer T, infer R> ? <Key extends keyof WorkerListener<Job<T, R, string>>>(event: Key, listener: WorkerListener<Job<T, R, string>>[Key]) => Omit<WorkerC<Omitter, J, SJ>, Omitter> : never;
}
declare function createWorker<Omitter extends string = "">(): Pick<WorkerC<Omitter, null, null>, "queue">;

declare function createMiddleware<NewContext extends Record<string, unknown>, NextContext extends NewContext, Context extends Record<string, unknown> = {}>(fn: (opts: {
    ctx: Context;
}, next: (opts: {
    ctx: NewContext;
}) => Promise<void>) => Promise<NextContext>): (opts: {
    ctx: Context;
}, next: (opts: {
    ctx: NewContext;
}) => Promise<void>) => Promise<NextContext>;

type RouteCtx = {
    body?: TSchema;
    output?: TSchema;
    querystring?: TObject;
    opts?: RouteShorthandOptions;
    params?: TObject;
    handler: (opts: HandlerOpts) => Promise<unknown>;
};
interface RouteC<Omitter extends string, Body, Output, QueryString, Params, Context, Method extends HTTPMethods$1> {
    body: <B extends TSchema>(body: B) => Omit<RouteC<"body" | Omitter, B, Output, QueryString, Params, Context, Method>, "body" | Omitter>;
    output: <O extends TSchema>(output: O) => Omit<RouteC<"output" | Omitter, Body, O, QueryString, Params, Context, Method>, "output" | Omitter>;
    querystring: <Q extends TObject>(querystring: Q) => Omit<RouteC<"querystring" | Omitter, Body, Output, Q, Params, Context, Method>, "querystring" | Omitter>;
    handler: (fn: (opts: {
        request: FastifyRequest;
        reply: FastifyReply;
        ctx: Context;
        services: ServiceContainer;
    } & (QueryString extends TSchema ? {
        querystring: Static<QueryString>;
    } : void) & (Params extends TSchema ? {
        params: Static<Params>;
    } : void) & (Method extends "GET" | "HEAD" ? void : {
        body: Body extends TSchema ? Static<Body> : void;
    })) => Promise<Output extends TSchema ? Static<Output> : void>, opts?: RouteShorthandOptions) => RouteCtx;
    params: <P extends TObject>(params: P) => Omit<RouteC<"params" | Omitter, Body, Output, QueryString, P, Context, Method>, "params" | Omitter>;
}

type HTTPMethods = "SSE" | "GET" | "HEAD" | "POST" | "DELETE" | "PUT" | "PATCH";
type HandlerOpts = {
    request: FastifyRequest;
    reply: FastifyReply;
    body?: unknown;
    params?: unknown;
    querystring?: unknown;
    ctx: unknown;
    services: ServiceContainer;
    workers: WorkerContainer;
    queues: QueueContainer;
};
type ControllerCtx = {
    rootPath: string;
    routes: Record<string, Record<string, RouteCtx>>;
    middlewares: ((opts: {
        ctx: unknown;
        request: FastifyRequest;
        reply: FastifyReply;
    }, next: (opts: {
        ctx: unknown;
    }) => Promise<void>) => Promise<unknown>)[];
};
interface ControllerC<Context extends Record<string, unknown>> {
    rootPath: (rootPath: `/${string}`) => Pick<ControllerC<Context>, "addRoute" | "finish">;
    use: <NewContext extends Record<string, unknown>, NextContext extends NewContext>(fn: ReturnType<typeof createMiddleware<NewContext, NextContext, Context>>) => Pick<ControllerC<NextContext>, "use" | "rootPath">;
    addRoute: <M extends HTTPMethods>(method: M, path: `/${string}`) => Omit<RouteC<M extends "GET" | "HEAD" ? "body" : "", unknown, unknown, unknown, unknown, Context, M>, M extends "GET" | "HEAD" ? "body" : "">;
    /**
     * DO NOT CALL THIS MANUALLY!
     * @returns
     */
    finish: (serviceRegistry: ServiceRegistry) => ControllerCtx;
}
declare function createController<Context extends Record<string, unknown> = {}>(): ControllerC<Context>;
declare class ControllerRegistry {
    controllers: Map<string, ControllerCtx>;
    private readonly serviceRegistry;
    constructor(serviceRegistry: ServiceRegistry);
    register(controller: Pick<ControllerC<{}>, "finish">): void;
}

export { ControllerRegistry, type InferService, type QueueContainer, type ServiceContainer, ServiceRegistry, type WorkerContainer, WorkerRegistry, createController, createMiddleware, createService, createWorker };
