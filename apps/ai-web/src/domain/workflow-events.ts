// 工作流领域事件：run/step/message/capability 生命周期事件。

export const WORKFLOW_EVENT_SCHEMA_VERSION = "1.0";

export type WorkflowEventEntity = "run" | "step" | "message" | "capability";
export type WorkflowEventPhase = "started" | "completed" | "failed" | "cancelled" | "degraded";
export type WorkflowOutcome = "success" | "failure" | "cancelled" | "degraded" | "unknown";

export type WorkflowEvent = {
  schemaVersion: typeof WORKFLOW_EVENT_SCHEMA_VERSION;
  eventId: string;
  entity: WorkflowEventEntity;
  phase: WorkflowEventPhase;
  runId: string;
  stepId?: string;
  messageId?: string;
  capabilityId?: string;
  traceId?: string;
  clientRequestId?: string;
  requestId?: string;
  timestamp: string;
  errorCode?: string;
  message?: string;
  durationMs?: number;
  outcome?: WorkflowOutcome;
  attributes: Record<string, string | number | boolean | null>;
};

export class WorkflowEventValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowEventValidationError";
  }
}

const OPAQUE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function assertOpaqueId(value: unknown, field: string): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length < 6 ||
    value.length > 128 ||
    !OPAQUE_ID_PATTERN.test(value)
  ) {
    throw new WorkflowEventValidationError(`${field} 必须是 6-128 位不透明 ID。`);
  }
}

function assertOptionalOpaqueId(value: unknown, field: string): asserts value is string | undefined {
  if (value === undefined) return;
  assertOpaqueId(value, field);
}

function assertTimestamp(value: unknown): asserts value is string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new WorkflowEventValidationError("timestamp 必须是合法时间戳。");
  }
}

export function parseWorkflowEvent(value: unknown): WorkflowEvent {
  if (!isRecord(value)) throw new WorkflowEventValidationError("工作流事件必须是对象。");
  if (value.schemaVersion !== WORKFLOW_EVENT_SCHEMA_VERSION) {
    throw new WorkflowEventValidationError("工作流事件 schema 版本不受支持。");
  }
  assertOpaqueId(value.eventId, "eventId");
  assertOpaqueId(value.runId, "runId");
  assertTimestamp(value.timestamp);
  if (!["run", "step", "message", "capability"].includes(String(value.entity))) {
    throw new WorkflowEventValidationError("entity 无效。");
  }
  if (!["started", "completed", "failed", "cancelled", "degraded"].includes(String(value.phase))) {
    throw new WorkflowEventValidationError("phase 无效。");
  }
  const stepId = value.stepId;
  const messageId = value.messageId;
  const capabilityId = value.capabilityId;
  const traceId = value.traceId;
  const clientRequestId = value.clientRequestId;
  const requestId = value.requestId;
  assertOptionalOpaqueId(stepId, "stepId");
  assertOptionalOpaqueId(messageId, "messageId");
  assertOptionalOpaqueId(capabilityId, "capabilityId");
  assertOptionalOpaqueId(traceId, "traceId");
  assertOptionalOpaqueId(clientRequestId, "clientRequestId");
  assertOptionalOpaqueId(requestId, "requestId");
  if (value.attributes !== undefined && !isRecord(value.attributes)) {
    throw new WorkflowEventValidationError("attributes 必须是对象。");
  }
  const event: WorkflowEvent = {
    schemaVersion: WORKFLOW_EVENT_SCHEMA_VERSION,
    eventId: value.eventId,
    entity: value.entity as WorkflowEventEntity,
    phase: value.phase as WorkflowEventPhase,
    runId: value.runId,
    timestamp: value.timestamp,
    attributes: (value.attributes as WorkflowEvent["attributes"]) ?? {},
  };
  if (stepId !== undefined) event.stepId = stepId;
  if (messageId !== undefined) event.messageId = messageId;
  if (capabilityId !== undefined) event.capabilityId = capabilityId;
  if (traceId !== undefined) event.traceId = traceId;
  if (clientRequestId !== undefined) event.clientRequestId = clientRequestId;
  if (requestId !== undefined) event.requestId = requestId;
  if (value.errorCode !== undefined) {
    if (typeof value.errorCode !== "string") throw new WorkflowEventValidationError("errorCode 无效。");
    event.errorCode = value.errorCode;
  }
  if (value.message !== undefined) {
    if (typeof value.message !== "string") throw new WorkflowEventValidationError("message 无效。");
    event.message = value.message;
  }
  if (value.durationMs !== undefined) {
    if (typeof value.durationMs !== "number" || !Number.isInteger(value.durationMs) || value.durationMs < 0) {
      throw new WorkflowEventValidationError("durationMs 无效。");
    }
    event.durationMs = value.durationMs;
  }
  if (value.outcome !== undefined) {
    if (
      value.outcome !== "success" &&
      value.outcome !== "failure" &&
      value.outcome !== "cancelled" &&
      value.outcome !== "degraded" &&
      value.outcome !== "unknown"
    ) {
      throw new WorkflowEventValidationError("outcome 无效。");
    }
    event.outcome = value.outcome;
  }
  return event;
}

export type CreateWorkflowEventInput = {
  eventId?: string;
  entity: WorkflowEventEntity;
  phase: WorkflowEventPhase;
  runId: string;
  stepId?: string;
  messageId?: string;
  capabilityId?: string;
  traceId?: string;
  clientRequestId?: string;
  requestId?: string;
  timestamp?: string;
  errorCode?: string;
  message?: string;
  durationMs?: number;
  outcome?: WorkflowOutcome;
  attributes?: WorkflowEvent["attributes"];
};

export function createWorkflowEvent(input: CreateWorkflowEventInput): WorkflowEvent {
  return parseWorkflowEvent({
    schemaVersion: WORKFLOW_EVENT_SCHEMA_VERSION,
    eventId: input.eventId ?? crypto.randomUUID(),
    entity: input.entity,
    phase: input.phase,
    runId: input.runId,
    stepId: input.stepId,
    messageId: input.messageId,
    capabilityId: input.capabilityId,
    traceId: input.traceId,
    clientRequestId: input.clientRequestId,
    requestId: input.requestId,
    timestamp: input.timestamp ?? new Date().toISOString(),
    errorCode: input.errorCode,
    message: input.message,
    durationMs: input.durationMs,
    outcome: input.outcome,
    attributes: input.attributes ?? {},
  });
}
