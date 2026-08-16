// JSONL 观测导出器：脱敏事件落盘，支持按 request_id 查询。

import { mkdir, readFile, appendFile } from "node:fs/promises";
import path from "node:path";
import { sanitizeForLog } from "@/observability/sanitize";
import type { ObservabilityEvent } from "@/observability/port";

const ALLOWED_FIELDS = new Set([
  "schemaVersion",
  "eventId",
  "entity",
  "phase",
  "runId",
  "stepId",
  "messageId",
  "capabilityId",
  "traceId",
  "clientRequestId",
  "requestId",
  "timestamp",
  "errorCode",
  "durationMs",
  "outcome",
  "conversationId",
]);

function pick(event: ObservabilityEvent): Record<string, unknown> {
  const sanitized = sanitizeForLog(event) as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const key of ALLOWED_FIELDS) {
    if (sanitized[key] !== undefined) result[key] = sanitized[key];
  }
  return result;
}

export type JsonlObservabilityExporter = {
  export(event: ObservabilityEvent): Promise<void>;
  queryByRequestId(requestId: string): Promise<ObservabilityEvent[]>;
};

export function createJsonlObservabilityExporter(filePath: string): JsonlObservabilityExporter {
  return {
    async export(event) {
      const record = pick(event);
      await mkdir(path.dirname(filePath), { recursive: true });
      await appendFile(filePath, JSON.stringify(record) + "\n", "utf8");
    },
    async queryByRequestId(requestId) {
      let raw = "";
      try {
        raw = await readFile(filePath, "utf8");
      } catch {
        return [];
      }
      return raw
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as ObservabilityEvent)
        .filter((event) => event.requestId === requestId);
    },
  };
}
