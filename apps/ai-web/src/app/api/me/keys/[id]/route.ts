import { NextRequest, NextResponse } from "next/server";
import { getAiWebConfig } from "@/lib/config";
import { createYanCoreGateway } from "@/lib/yancore-gateway";
import { yanCoreErrorResponse } from "@/lib/yancore-http";
import { requireAiSession } from "@/lib/session-guard";

export const runtime = "nodejs";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = requireAiSession(request);
  if (guard.response) return guard.response;
  try {
    await createYanCoreGateway(getAiWebConfig().yanCoreApiBaseUrl).revokeKey(guard.session.grant, (await params).id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return yanCoreErrorResponse(error);
  }
}
