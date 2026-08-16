// 观测端口：统一事件发布，导出器失败不阻断主链。

import type { WorkflowEvent } from "@/domain/workflow-events";
import { sanitizeForLog } from "@/observability/sanitize";

export type ObservabilityEvent = WorkflowEvent & {
  conversationId?: string;
  outcome?: "success" | "failure" | "cancelled" | "degraded" | "unknown";
};

export type ObservabilityExporter = {
  export(event: ObservabilityEvent): Promise<void> | void;
};

export type ObservabilityHub = {
  publish(event: ObservabilityEvent): void;
  sink(event: WorkflowEvent & { conversationId?: string }): void;
};

export function createObservabilityHub(exporters: ObservabilityExporter[]): ObservabilityHub {
  function publish(event: ObservabilityEvent): void {
    for (const exporter of exporters) {
      try {
        void Promise.resolve(exporter.export(event)).catch(() => {
          // 导出器失败不阻断主链。
        });
      } catch {
        // 同步异常同样吞掉。
      }
    }
  }
  return {
    publish,
    sink(event) {
      publish(sanitizeForLog(event) as ObservabilityEvent);
    },
  };
}
