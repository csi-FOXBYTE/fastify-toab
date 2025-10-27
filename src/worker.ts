import {
  ConnectionOptions,
  Job,
  JobSchedulerTemplateOptions,
  Queue,
  QueueOptions,
  RepeatOptions,
  SandboxedJob,
  Worker,
  WorkerListener,
  WorkerOptions,
} from "bullmq";
import { ServiceContainer, ServiceRegistry } from "./service";

export interface WorkerContainer {
  get: WorkerRegistry["getWorker"];
}

export interface QueueContainer {
  get: WorkerRegistry["getQueue"];
}

type WithOpts<F extends (...args: any[]) => any> = (
  opts: {
    services: ServiceContainer;
    queues: QueueContainer;
    workers: WorkerContainer;
  },
  ...args: Parameters<F>
) => ReturnType<F>;

export interface WorkerCtx<
  Q extends Queue,
  W extends Worker,
  J extends Job | SandboxedJob
> {
  queueName: string;
  queueOptions?: QueueOptions;
  jobSchedulers: Parameters<
    WorkerC<"", Job<any, any, any>, null>["upsertJobScheduler"]
  >[];
  onHandlers: Parameters<WorkerC<"", Job<any, any, any>, null>["on"]>[];
  onceHandlers: Parameters<WorkerC<"", Job<any, any, any>, null>["on"]>[];
  isSandboxed: boolean;
  connection: ConnectionOptions;
  options?: Omit<WorkerOptions, "connection">;
  processor:
  | string
  | URL
  | ((
    job: Job<any, any, any>,
    ctx: {
      services: ReturnType<ServiceRegistry["resolve"]>;
      workers: WorkerContainer;
      queues: QueueContainer;
    },
    token?: string
  ) => Promise<any>);
  queue: Q; // only type
  worker: W; // only type
  job: J; // only type
}

export class WorkerRegistry {
  private readonly queues = new Map<string, Queue>();
  private readonly workers = new Map<string, Worker>();
  private readonly serviceRegistry: ServiceRegistry;

  constructor(serviceRegistry: ServiceRegistry) {
    this.serviceRegistry = serviceRegistry;
  }

  async register<
    Q extends Queue<any, any, any, any, any>,
    W extends Worker<any, any, any>,
    J extends Job<any, any, any> | SandboxedJob<any, any>
  >(workerCtx: WorkerCtx<Q, W, J>, dontInitializeWorkers?: boolean) {
    try {
      if (this.queues.has(workerCtx.queueName)) {
        throw new Error(
          `Queue with name "${workerCtx.queueName}" is already registered.`
        );
      }

      const queue = new Queue(workerCtx.queueName, {
        ...workerCtx.queueOptions,
        connection: workerCtx.connection,
      });

      await queue.pause();

      this.queues.set(queue.name, queue);

      for (const jobScheduler of workerCtx.jobSchedulers) {
        await queue.upsertJobScheduler(...jobScheduler);
      }

      if (dontInitializeWorkers) return;

      if (this.workers.has(workerCtx.queueName)) {
        throw new Error(
          `Queue with name "${workerCtx.queueName}" is already registered.`
        );
      }

      const worker = new Worker(
        workerCtx.queueName,
        typeof workerCtx.processor === "function"
          ? async (job, token) => {
            if (typeof workerCtx.processor !== "function")
              throw new Error(
                "Processor was not a function but was expected to be one."
              );

            try {
              const result = await workerCtx.processor(
                job,
                {
                  services: this.serviceRegistry.resolve(),
                  workers: {
                    get: this.getWorker.bind(this),
                  },
                  queues: {
                    get: this.getQueue.bind(this),
                  },
                },
                token
              );
              return result;
            } catch (e) {
              console.error(`Error in processor ${workerCtx.queueName}`, e);
              throw e;
            }
          }
          : workerCtx.processor,
        { ...workerCtx.options, connection: workerCtx.connection }
      );

      for (const onHandler of workerCtx.onHandlers) {
        worker.on(onHandler[0], async (...args: any[]) => {
          try {
            return await onHandler[1](
              {
                services: this.serviceRegistry.resolve(),
                workers: {
                  get: this.getWorker.bind(this),
                },
                queues: {
                  get: this.getQueue.bind(this),
                },
              },
              // @ts-expect-error wrong type
              ...args
            );
          } catch (e) {
            console.error(`Error in worker on "${onHandler[0]}" handler.`, e);
          }
        });
      }

      for (const onceHandler of workerCtx.onceHandlers) {
        worker.once(onceHandler[0], async (...args: any[]) => {
          try {
            return await onceHandler[1](
              {
                services: this.serviceRegistry.resolve(),
                workers: {
                  get: this.getWorker.bind(this),
                },
                queues: {
                  get: this.getQueue.bind(this),
                },
              },
              // @ts-expect-error wrong type
              ...args
            );
          } catch (e) {
            console.error(
              `Error in worker once "${onceHandler[0]}" handler.`,
              e
            );
          }
        });
      }

      this.workers.set(workerCtx.queueName, worker);
    } catch (e) {
      console.error(
        `There was an error while registering the worker for "${workerCtx.queueName}".`,
        e
      );
    }
  }

  async resumeQueues() {
    for (const queue of this.queues.values()) {
      await queue.resume();
    }
  }

  getQueue<Q extends Queue>(name: string) {
    const queue = this.queues.get(name);

    if (!queue) {
      throw new Error(`No queue named "${name}" found.`);
    }

    return queue as Q;
  }

  getWorker<W extends Worker>(name: string) {
    const worker = this.workers.get(name);

    if (!worker) {
      throw new Error(`No Worker named "${name}" found.`);
    }

    return worker as W;
  }
}

export interface WorkerC<
  Omitter extends string,
  J extends Job<any, any, any> | null,
  SJ extends SandboxedJob<any, any> | null
> {
  queue: (
    queueName: string,
    queueOptions?: QueueOptions
  ) => Pick<
    WorkerC<Omitter | "queue" | "processor", J, SJ>,
    "sandboxedJob" | "job"
  >;
  job<NewJob extends Job<any, any, any>>(): Omit<
    WorkerC<Omitter | "job" | "sandboxedJob", NewJob, SJ>,
    Omitter | "job" | "sandboxedJob"
  >;
  sandboxedJob<NewSandboxedJob extends SandboxedJob<any, any>>(): Omit<
    WorkerC<Omitter | "sandboxedJob" | "job", J, NewSandboxedJob>,
    Omitter | "sandboxedJob" | "job"
  >;
  options: (
    options: Omit<WorkerOptions, "connection">
  ) => Omit<WorkerC<Omitter | "options", J, SJ>, Omitter | "options">;
  connection: (
    connection: ConnectionOptions
  ) => Pick<WorkerC<Omitter | "connection", J, SJ>, "processor">;
  processor: J extends Job<infer T, infer R, infer N>
  ? (
    processor: (
      job: Job<T, R, N>,
      ctx: {
        services: ServiceContainer;
        workers: {
          get: WorkerRegistry["getWorker"];
        };
        queues: {
          get: WorkerRegistry["getQueue"];
        };
      },
      token?: string
    ) => Promise<R>
  ) => WorkerCtx<Queue<T, R, N>, Worker<T, R, string>, J>
  : SJ extends SandboxedJob<infer T, infer R>
  ? (
    url: string | URL
  ) => WorkerCtx<Queue<T, R, string>, Worker<T, R, string>, SJ>
  : never;
  upsertJobScheduler: J extends Job<infer T, infer _, infer N>
  ? (
    jobSchedulerId: string,
    repeatOpts: Omit<RepeatOptions, "key">,
    jobTemplate?: {
      name?: N;
      data?: T;
      opts?: JobSchedulerTemplateOptions;
    }
  ) => Omit<WorkerC<Omitter, J, SJ>, Omitter>
  : SJ extends SandboxedJob<infer T>
  ? (
    jobSchedulerId: string,
    repeatOpts: Omit<RepeatOptions, "key">,
    jobTemplate?: {
      name?: string;
      data?: T;
      opts?: JobSchedulerTemplateOptions;
    }
  ) => Omit<WorkerC<Omitter, J, SJ>, Omitter>
  : never;
  on: J extends Job<infer T, infer R, infer N>
  ? <Key extends keyof WorkerListener<T, R, N>>(
    event: Key,
    listener: WithOpts<WorkerListener<T, R, N>[Key]>
  ) => Omit<WorkerC<Omitter, J, SJ>, Omitter>
  : SJ extends SandboxedJob<infer T, infer R>
  ? <Key extends keyof WorkerListener<T, R, string>>(
    event: Key,
    listener: WithOpts<WorkerListener<T, R>[Key]>
  ) => Omit<WorkerC<Omitter, J, SJ>, Omitter>
  : never;
  once: J extends Job<infer T, infer R, infer N>
  ? <Key extends keyof WorkerListener<T, R, N>>(
    event: Key,
    listener: WithOpts<WorkerListener<T, R, N>[Key]>
  ) => Omit<WorkerC<Omitter, J, SJ>, Omitter>
  : SJ extends SandboxedJob<infer T, infer R>
  ? <Key extends keyof WorkerListener<T, R, string>>(
    event: Key,
    listener: WithOpts<WorkerListener<T, R>[Key]>
  ) => Omit<WorkerC<Omitter, J, SJ>, Omitter>
  : never;
}

export function createWorker<Omitter extends string = "">(): Pick<
  WorkerC<Omitter, null, null>,
  "queue"
> {
  const ctx: WorkerCtx<any, any, any> = {
    queueName: "",
    jobSchedulers: [],
    onceHandlers: [],
    queue: null,
    connection: {},
    worker: null,
    processor: "",
    onHandlers: [],
    isSandboxed: false,
    job: null,
  };

  const workerHandler: WorkerC<Omitter, Job<any, any, any>, null> = {
    // @ts-expect-error wrong types
    queue(queueName, queueOptions) {
      ctx.queueOptions = queueOptions;
      ctx.queueName = queueName;
      return proxy;
    },
    connection(connection) {
      ctx.connection = connection;
      return proxy;
    },
    // @ts-expect-error wrong types
    job() {
      ctx.isSandboxed = false;
      return proxy;
    },
    on(...args) {
      ctx.onHandlers.push(args);
      return proxy;
    },
    once(...args) {
      ctx.onceHandlers.push(args);
      return proxy;
    },
    // @ts-expect-error wrong types
    options(options) {
      ctx.options = options;
      return proxy;
    },
    processor(processor) {
      ctx.processor = processor;
      return ctx;
    },
    // @ts-expect-error wrong types
    sandboxedJob() {
      ctx.isSandboxed = true;
      return proxy;
    },
    upsertJobScheduler(...args) {
      ctx.jobSchedulers.push(args);
      return proxy;
    },
  };

  const proxy = new Proxy(workerHandler, {
    get(target, p, receiver) {
      return Reflect.get(target, p, receiver);
    },
  });

  return workerHandler;
}
