import { NextRequest, NextResponse } from "next/server";
import { getAiWebConfig } from "@/lib/config";
import { createYanCoreGateway } from "@/lib/yancore-gateway";
import { yanCoreErrorResponse } from "@/lib/yancore-http";
import { requireAiSession } from "@/lib/session-guard";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const guard = requireAiSession(request);
  if (guard.response) return guard.response;
  try {
    const keys = await createYanCoreGateway(getAiWebConfig().yanCoreApiBaseUrl).keys(guard.session.grant);
    return NextResponse.json({ keys });
  } catch (error) {
    return yanCoreErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  const guard = requireAiSession(request);
  if (guard.response) return guard.response;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const models = typeof body?.models === "string" ? body.models.trim() : "";
  const remainQuota = Number(body?.remainQuota);
  const expiredTime = Number(body?.expiredTime);
  if (!name || !models || !Number.isInteger(remainQuota) || remainQuota <= 0 || !Number.isInteger(expiredTime) || expiredTime <= 0) return NextResponse.json({ error: "请填写名称、模型、预算和有效期。" }, { status: 400 });
  try {
    const result = await createYanCoreGateway(getAiWebConfig().yanCoreApiBaseUrl).createKey(guard.session.grant, { name, models, remainQuota, expiredTime });
    return NextResponse.json(result);
  } catch (error) {
    return yanCoreErrorResponse(error);
  }
}
