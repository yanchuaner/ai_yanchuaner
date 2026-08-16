import { NextRequest, NextResponse } from "next/server";
import { getAiWebConfig } from "@/lib/config";
import { requireAiSession } from "@/lib/session-guard";
import { createYanCoreGateway } from "@/lib/yancore-gateway";
import { yanCoreErrorResponse } from "@/lib/yancore-http";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
	const guard = requireAiSession(request);
	if (guard.response) return guard.response;
	const config = getAiWebConfig();
	const page = Math.max(1, Number(request.nextUrl.searchParams.get("page") || 1));
	const pageSize = Math.min(50, Math.max(1, Number(request.nextUrl.searchParams.get("pageSize") || 20)));
	try {
		const result = await createYanCoreGateway(config.yanCoreApiBaseUrl).ledger(guard.session.grant, page, pageSize);
		return NextResponse.json({
			entries: result.entries,
			total: result.total,
			page,
			pageSize,
		});
	} catch (error) {
		return yanCoreErrorResponse(error);
	}
}
