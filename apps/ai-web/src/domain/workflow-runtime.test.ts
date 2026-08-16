import assert from "node:assert/strict";
import test from "node:test";
import { runWorkflow, WorkflowRuntimeError } from "./workflow-runtime";

test("runWorkflow emits run and step lifecycle events on success", async () => {
  const events: string[] = [];
  await runWorkflow({
    workflowId: "chat/v1",
    version: "1.0.0",
    runId: "run_123456",
    onEvent: (event) => events.push(`${event.entity}.${event.phase}`),
    steps: [{ id: "step_123456", run: async () => {} }],
  });
  assert.deepEqual(events, [
    "run.started",
    "step.started",
    "step.completed",
    "run.completed",
  ]);
});

test("runWorkflow emits failed events and rethrows step errors", async () => {
  const events: string[] = [];
  await assert.rejects(
    runWorkflow({
      workflowId: "chat/v1",
      version: "1.0.0",
      runId: "run_123456",
      onEvent: (event) => events.push(`${event.entity}.${event.phase}`),
      steps: [
        {
          id: "step_123456",
          run: async () => {
            throw new Error("boom");
          },
        },
      ],
    }),
    /boom/,
  );
  assert.deepEqual(events, ["run.started", "step.started", "step.failed", "run.failed"]);
});

test("runWorkflow emits cancelled events when the signal aborts", async () => {
  const controller = new AbortController();
  const events: string[] = [];
  const promise = runWorkflow({
    workflowId: "chat/v1",
    version: "1.0.0",
    runId: "run_123456",
    signal: controller.signal,
    onEvent: (event) => events.push(`${event.entity}.${event.phase}`),
    steps: [
      {
        id: "step_123456",
        run: async (context) => {
          await new Promise((_resolve, reject) => {
            context.signal?.addEventListener("abort", () => {
              reject(new DOMException("aborted", "AbortError"));
            });
          });
        },
      },
    ],
  });
  queueMicrotask(() => controller.abort());
  await assert.rejects(promise, (error: unknown) => error instanceof WorkflowRuntimeError && error.code === "cancelled");
  assert.deepEqual(events, ["run.started", "step.started", "step.cancelled", "run.cancelled"]);
});

test("runWorkflow emits timeout failure when the deadline passes", async () => {
  const events: string[] = [];
  await assert.rejects(
    runWorkflow({
      workflowId: "chat/v1",
      version: "1.0.0",
      runId: "run_123456",
      timeoutMs: 10,
      onEvent: (event) => events.push(`${event.entity}.${event.phase}:${event.errorCode ?? ""}`),
      steps: [
        {
          id: "step_123456",
          run: async (context) => {
            await new Promise((_resolve, reject) => {
              context.signal?.addEventListener("abort", () => {
                reject(new DOMException("timeout", "TimeoutError"));
              });
            });
          },
        },
      ],
    }),
    (error: unknown) => error instanceof WorkflowRuntimeError && error.code === "timeout",
  );
  assert.deepEqual(events, [
    "run.started:",
    "step.started:",
    "step.failed:timeout",
    "run.failed:timeout",
  ]);
});
