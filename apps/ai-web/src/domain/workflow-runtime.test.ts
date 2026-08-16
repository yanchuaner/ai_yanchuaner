import assert from "node:assert/strict";
import test from "node:test";
import { runWorkflow, WorkflowRuntimeError } from "./workflow-runtime";

test("runWorkflow emits run and step lifecycle events on success", async () => {
  const events: Array<{ entity: string; phase: string; durationMs?: number; outcome?: string }> = [];
  await runWorkflow({
    workflowId: "chat/v1",
    version: "1.0.0",
    runId: "run_123456",
    onEvent: (event) => events.push({ entity: event.entity, phase: event.phase, durationMs: event.durationMs, outcome: event.outcome }),
    steps: [{ id: "step_123456", run: async () => {} }],
  });
  assert.deepEqual(events.map((event) => `${event.entity}.${event.phase}`), [
    "run.started",
    "step.started",
    "step.completed",
    "run.completed",
  ]);
  assert.equal(events[2].outcome, "success");
  assert.equal(events[3].outcome, "success");
  assert.ok(Number.isInteger(events[2].durationMs) && (events[2].durationMs ?? 0) >= 0);
  assert.ok(Number.isInteger(events[3].durationMs) && (events[3].durationMs ?? 0) >= 0);
  assert.ok((events[3].durationMs ?? 0) >= (events[2].durationMs ?? 0));
});

test("runWorkflow emits failed events and rethrows step errors", async () => {
  const events: Array<{ entity: string; phase: string; errorCode?: string; durationMs?: number; outcome?: string }> = [];
  await assert.rejects(
    runWorkflow({
      workflowId: "chat/v1",
      version: "1.0.0",
      runId: "run_123456",
      onEvent: (event) => events.push({ entity: event.entity, phase: event.phase, errorCode: event.errorCode, durationMs: event.durationMs, outcome: event.outcome }),
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
  assert.deepEqual(events.map((event) => `${event.entity}.${event.phase}`), ["run.started", "step.started", "step.failed", "run.failed"]);
  assert.equal(events[2].outcome, "failure");
  assert.equal(events[3].outcome, "failure");
  assert.equal(events[3].errorCode, "step_failed");
  assert.ok(Number.isInteger(events[3].durationMs) && (events[3].durationMs ?? 0) >= 0);
});

test("runWorkflow emits cancelled events when the signal aborts", async () => {
  const controller = new AbortController();
  const events: Array<{ entity: string; phase: string; durationMs?: number; outcome?: string }> = [];
  const promise = runWorkflow({
    workflowId: "chat/v1",
    version: "1.0.0",
    runId: "run_123456",
    signal: controller.signal,
    onEvent: (event) => events.push({ entity: event.entity, phase: event.phase, durationMs: event.durationMs, outcome: event.outcome }),
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
  assert.deepEqual(events.map((event) => `${event.entity}.${event.phase}`), ["run.started", "step.started", "step.cancelled", "run.cancelled"]);
  assert.equal(events[2].outcome, "cancelled");
  assert.equal(events[3].outcome, "cancelled");
  assert.ok(Number.isInteger(events[3].durationMs) && (events[3].durationMs ?? 0) >= 0);
});

test("runWorkflow emits timeout failure when the deadline passes", async () => {
  const events: Array<{ entity: string; phase: string; errorCode?: string; durationMs?: number; outcome?: string }> = [];
  await assert.rejects(
    runWorkflow({
      workflowId: "chat/v1",
      version: "1.0.0",
      runId: "run_123456",
      timeoutMs: 10,
      onEvent: (event) => events.push({ entity: event.entity, phase: event.phase, errorCode: event.errorCode, durationMs: event.durationMs, outcome: event.outcome }),
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
  assert.deepEqual(events.map((event) => `${event.entity}.${event.phase}:${event.errorCode ?? ""}`), [
    "run.started:",
    "step.started:",
    "step.failed:timeout",
    "run.failed:timeout",
  ]);
  assert.equal(events[2].outcome, "failure");
  assert.equal(events[3].outcome, "failure");
  assert.ok(Number.isInteger(events[3].durationMs) && (events[3].durationMs ?? 0) >= 0);
});
