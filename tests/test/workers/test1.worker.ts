import {
  createWorker,
  QueueContainer,
  WorkerContainer,
  Job,
} from "../../../src/index";
import { defaultConnection } from "../../connections";
import { getTest0WorkerQueue } from "./test0.worker";

const test1Worker = createWorker()
  .queue("test-queue-1")
  .job<Job<{}, {}>>()
  .upsertJobScheduler("test-scheduler", {
    every: 500,
  })
  .connection(defaultConnection)
  .processor(async (job, { queues }) => {
    const worker0Queue = getTest0WorkerQueue(queues);

    await worker0Queue.add("test", { test: "asdas" });

    console.log("HI from worker1");
    return {};
  });

// Auto generated dont remove this
export { test1Worker };
export type Test1Worker = (typeof test1Worker)["worker"];
export type Test1WorkerQueue = (typeof test1Worker)["queue"];
export type Test1WorkerJob = (typeof test1Worker)["job"];

export function getTest1Worker(deps: WorkerContainer) {
  return deps.get<Test1Worker>(test1Worker.queueName);
}
export function getTest1WorkerQueue(deps: QueueContainer) {
  return deps.get<Test1WorkerQueue>(test1Worker.queueName);
}
