import {
  createWorker,
  QueueContainer,
  WorkerContainer,
  Job,
} from "../../../src/index";

const test0Worker = createWorker()
  .queue("test-queue-0")
  .job<Job<{ test: string }, {}>>()
  .once("completed", (job) => {
    console.log(job.data.test);
  })
  .connection({
    host: "localhost",
    port: 6379,
  })
  .processor(async () => {
    console.log("HI from worker0");
    return {};
  });

export { test0Worker };
export type Test0Worker = (typeof test0Worker)["worker"];
export type Test0WorkerQueue = (typeof test0Worker)["queue"];

export function getTest0Worker(deps: WorkerContainer) {
  return deps.get<Test0Worker>(test0Worker.queueName);
}
export function getTest0WorkerQueue(deps: QueueContainer) {
  return deps.get<Test0WorkerQueue>(test0Worker.queueName);
}
