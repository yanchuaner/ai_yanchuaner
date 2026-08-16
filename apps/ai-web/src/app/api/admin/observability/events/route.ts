import { NextRequest, NextResponse } from "next/server";
import { createJsonlObservabilityExporter } from "@/observability/jsonl-exporter";
import { requireAiSession } from "@/lib/session-guard";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const guard = requireAiSession(request);
  if (guard.response) return guard.response;
  if (guard.session.identity.role !== "admin") {
    return NextResponse.json({ error: "仅管理员可查询观测事件。" }, { status: 403 });
  }
  const requestId = request.nextUrl.searchParams.get("requestId");
  if (!requestId) return NextResponse.json({ error: "缺少 requestId。" }, { status: 400 });
  const filePath = process.env.AI_WEB_OBSERVABILITY_FILE?.trim() || "/data/observability/events.jsonl";
  const events = await createJsonlObservabilityExporter(filePath).queryByRequestId(requestId);
  return NextResponse.json({ events });
}
