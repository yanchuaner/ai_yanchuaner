import assert from "node:assert/strict";
import test from "node:test";
import {
  createWorkflowEvent,
  parseWorkflowEvent,
  WorkflowEventValidationError,
} from "./workflow-events";

for (const entity of ["run", "step", "message", "capability"] as const) {
  for (const phase of ["started", "completed", "failed", "cancelled", "degraded"] as const) {
    test(`createWorkflowEvent builds ${entity}.${phase}`, () => {
      const event = createWorkflowEvent({
        eventId: "evt_123456",
        entity,
        phase,
        runId: "run_123456",
        stepId: entity === "step" ? "step_123456" : undefined,
        messageId: entity === "message" ? "msg_123456" : undefined,
        capabilityId: entity === "capability" ? "text.chat.general" : undefined,
        timestamp: "2026-08-16T12:00:00Z",
        attributes: {},
      });
      assert.equal(parseWorkflowEvent(event).entity, entity);
      assert.equal(parseWorkflowEvent(event).phase, phase);
    });
  }
}

test("parseWorkflowEvent rejects invalid entity and phase", () => {
  const base = {
    schemaVersion: "1.0",
    eventId: "evt_123456",
    runId: "run_123456",
    timestamp: "2026-08-16T12:00:00Z",
    attributes: {},
  };
  assert.throws(() => parseWorkflowEvent({ ...base, entity: "task", phase: "started" }), WorkflowEventValidationError);
  assert.throws(() => parseWorkflowEvent({ ...base, entity: "run", phase: "paused" }), WorkflowEventValidationError);
});

test("parseWorkflowEvent rejects invalid run id and duration", () => {
  const base = {
    schemaVersion: "1.0",
    eventId: "evt_123456",
    entity: "run",
    phase: "completed",
    timestamp: "2026-08-16T12:00:00Z",
    attributes: {},
  };
  assert.throws(() => parseWorkflowEvent({ ...base, runId: "x" }), WorkflowEventValidationError);
  assert.throws(() => parseWorkflowEvent({ ...base, runId: "run_123456", durationMs: -1 }), WorkflowEventValidationError);
});

test("workflow event keeps optional trace and request ids", () => {
  const event = createWorkflowEvent({
    eventId: "evt_123456",
    entity: "capability",
    phase: "completed",
    runId: "run_123456",
    capabilityId: "text.chat.general",
    traceId: "tr_123456",
    clientRequestId: "client_123456",
    requestId: "req_123456",
    timestamp: "2026-08-16T12:00:00Z",
    attributes: {},
  });
  assert.equal(event.traceId, "tr_123456");
  assert.equal(event.requestId, "req_123456");
});
