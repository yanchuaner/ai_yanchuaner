// 日志与事件脱敏：禁止输出消息正文、知识、上传、Cookie、Key 或 grant。

const SENSITIVE_KEY = /authorization|cookie|access.?key|grant|api.?key|secret|token|password|message|content|text|body|knowledge|upload|image|audio/i;

export function sanitizeForLog(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[DEPTH_LIMIT]";
  if (Array.isArray(value)) return value.map((item) => sanitizeForLog(item, depth + 1));
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (SENSITIVE_KEY.test(key)) {
        result[key] = "[REDACTED]";
      } else {
        result[key] = sanitizeForLog(item, depth + 1);
      }
    }
    return result;
  }
  return value;
}
