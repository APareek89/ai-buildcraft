import { Queue } from "bullmq";
import IORedis from "ioredis";
import { EVAL_QUEUE } from "@blindspot/shared";
import { runEval, type EvalJob, type EvalResult } from "./runner";

let queue: Queue<EvalJob> | null = null;

export function evalExecutionMode(): "inline" | "queued" {
  const configured = process.env.BLINDSPOT_EVAL_MODE?.trim().toLowerCase();
  if (configured === "inline") return "inline";
  if (configured && configured !== "queued") {
    // Unknown overrides fail safe: do not contact a retained remote Redis URL because of a typo.
    return "inline";
  }
  return process.env.REDIS_URL ? "queued" : "inline";
}

function getQueue(): Queue<EvalJob> | null {
  if (evalExecutionMode() === "inline") return null;
  const url = process.env.REDIS_URL;
  if (!url) return null;
  if (!queue) {
    queue = new Queue<EvalJob>(EVAL_QUEUE, {
      connection: new IORedis(url, { maxRetriesPerRequest: null }),
    });
  }
  return queue;
}

export type EnqueueResult =
  | { mode: "queued"; jobId: string | undefined }
  | { mode: "inline"; result: EvalResult };

/**
 * Enqueue when Redis is enabled, otherwise run inline. BLINDSPOT_EVAL_MODE=inline is an
 * explicit local override so a retained REDIS_URL cannot accidentally leave the laptop.
 */
export async function enqueueEval(job: EvalJob): Promise<EnqueueResult> {
  const q = getQueue();
  if (q) {
    const added = await q.add("eval", job, { removeOnComplete: true, removeOnFail: 100 });
    return { mode: "queued", jobId: added.id };
  }
  const result = await runEval(job);
  return { mode: "inline", result };
}
