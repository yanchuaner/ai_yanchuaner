// JSONL 观测导出器：脱敏事件落盘，支持按 request_id 查询。

import { mkdir, readFile, appendFile, rename, stat } from "node:fs/promises";
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

function rotationConfig(): { maxBytes: number; keep: number } {
  const maxBytes = Number(process.env.AI_WEB_OBSERVABILITY_MAX_BYTES);
  const keep = Number(process.env.AI_WEB_OBSERVABILITY_KEEP_ROTATED);
  return {
    maxBytes: Number.isFinite(maxBytes) && maxBytes > 0 ? maxBytes : 50 * 1024 * 1024,
    keep: Number.isInteger(keep) && keep >= 1 && keep <= 20 ? keep : 5,
  };
}

async function rotateIfNeeded(filePath: string): Promise<void> {
  const { maxBytes, keep } = rotationConfig();
  try {
    const current = await stat(filePath);
    if (current.size < maxBytes) return;
  } catch {
    return;
  }
  for (let index = keep - 1; index >= 1; index -= 1) {
    const from = `${filePath}.${index}`;
    const to = `${filePath}.${index + 1}`;
    try {
      await rename(from, to);
    } catch {
      // 源文件不存在时忽略，保留更旧的轮转文件。
    }
  }
  try {
    await rename(filePath, `${filePath}.1`);
  } catch {
    // 竞态下文件已不存在时忽略。
  }
}

export function createJsonlObservabilityExporter(filePath: string): JsonlObservabilityExporter {
  return {
    async export(event) {
      const record = pick(event);
      await mkdir(path.dirname(filePath), { recursive: true });
      await rotateIfNeeded(filePath);
      await appendFile(filePath, JSON.stringify(record) + "\n", "utf8");
    },
    async queryByRequestId(requestId) {
      const events: ObservabilityEvent[] = [];
      const { keep } = rotationConfig();
      const files = [filePath, ...Array.from({ length: keep }, (_, index) => `${filePath}.${index + 1}`)];
      for (const file of files) {
        let raw = "";
        try {
          raw = await readFile(file, "utf8");
        } catch {
          continue;
        }
        for (const line of raw.split("\n")) {
          if (!line) continue;
          try {
            const event = JSON.parse(line) as ObservabilityEvent;
            if (event.requestId === requestId) events.push(event);
          } catch {
            // 单行损坏不影响其余事件查询。
          }
        }
      }
      return events;
    },
  };
}
