// 最小工作流运行时：生命周期、步骤、超时、取消与事件发布。

import { createWorkflowEvent, type WorkflowEvent, type WorkflowEventPhase } from "@/domain/workflow-events";

export type WorkflowStepContext = {
  stepId: string;
  signal?: AbortSignal;
  emit: (entity: WorkflowEvent["entity"], phase: WorkflowEventPhase, extra?: Partial<WorkflowEvent>) => void;
};

export type WorkflowStepDefinition = {
  id: string;
  run: (context: WorkflowStepContext) => Promise<void>;
};

export type WorkflowRunInput = {
  workflowId: string;
  version: string;
  runId: string;
  traceId?: string;
  clientRequestId?: string;
  requestId?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  onEvent: (event: WorkflowEvent) => void;
  steps: WorkflowStepDefinition[];
};

export class WorkflowRuntimeError extends Error {
  constructor(
    message: string,
    public readonly code: "timeout" | "cancelled" | "step_failed" = "step_failed",
  ) {
    super(message);
    this.name = "WorkflowRuntimeError";
  }
}

function eventId(): string {
  return `evt_${crypto.randomUUID().replaceAll("-", "")}`;
}

export async function runWorkflow(input: WorkflowRunInput): Promise<void> {
  const controller = new AbortController();
  const timeoutHandle = input.timeoutMs
    ? setTimeout(() => controller.abort(new DOMException("工作流超时。", "TimeoutError")), input.timeoutMs)
    : undefined;
  const signal = input.signal ? AbortSignal.any([input.signal, controller.signal]) : controller.signal;
  const emit = (entity: WorkflowEvent["entity"], phase: WorkflowEventPhase, extra: Partial<WorkflowEvent> = {}) => {
    input.onEvent(
      createWorkflowEvent({
        eventId: eventId(),
        entity,
        phase,
        runId: input.runId,
        traceId: input.traceId,
        clientRequestId: input.clientRequestId,
        requestId: input.requestId,
        ...extra,
      }),
    );
  };

  emit("run", "started", { stepId: undefined });
  try {
    for (const step of input.steps) {
      const context: WorkflowStepContext = {
        stepId: step.id,
        signal,
        emit: (entity, phase, extra = {}) => emit(entity, phase, { stepId: step.id, ...extra }),
      };
      emit("step", "started", { stepId: step.id });
      try {
        await step.run(context);
        emit("step", "completed", { stepId: step.id });
      } catch (error) {
        const isAbort =
          error instanceof DOMException && (error.name === "AbortError" || error.name === "TimeoutError");
        const timedOut = Boolean(controller.signal.aborted && !input.signal?.aborted);
        if (isAbort && timedOut) {
          emit("step", "failed", { stepId: step.id, errorCode: "timeout", message: "工作流步骤超时。" });
          emit("run", "failed", { errorCode: "timeout", message: "工作流超时。" });
          throw new WorkflowRuntimeError("工作流超时。", "timeout");
        }
        if (isAbort && error.name === "TimeoutError") {
          emit("step", "failed", { stepId: step.id, errorCode: "timeout", message: "工作流步骤超时。" });
          emit("run", "failed", { errorCode: "timeout", message: "工作流超时。" });
          throw new WorkflowRuntimeError("工作流超时。", "timeout");
        }
        if (isAbort) {
          emit("step", "cancelled", { stepId: step.id });
          emit("run", "cancelled");
          throw new WorkflowRuntimeError("工作流已取消。", "cancelled");
        }
        const message = error instanceof Error ? error.message : "工作流步骤失败。";
        emit("step", "failed", { stepId: step.id, errorCode: "step_failed", message });
        emit("run", "failed", { errorCode: "step_failed", message });
        throw error instanceof Error ? error : new WorkflowRuntimeError(message);
      }
    }
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
  emit("run", "completed");
}
