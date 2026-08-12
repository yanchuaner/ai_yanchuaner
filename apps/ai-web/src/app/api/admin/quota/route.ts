import { NextRequest, NextResponse } from "next/server";
import { getAiWebConfig } from "@/lib/config";
import { requireAiSession } from "@/lib/session-guard";

export const runtime = "nodejs";

type QuotaResponse = {
	success?: boolean;
	message?: string;
	data?: {
		entry_id?: number;
		balance_after?: number;
		idempotency_key?: string;
	};
};

export async function POST(request: NextRequest) {
	const guard = requireAiSession(request);
	if (guard.response) return guard.response;
	if (guard.session.identity.role !== "admin") {
		return NextResponse.json({ error: "仅管理员可发放额度。" }, { status: 403 });
	}
	const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
	if (!body || typeof body !== "object") {
		return NextResponse.json({ error: "请求格式无效。" }, { status: 400 });
	}
	const userId = Number(body.userId);
	const amount = Number(body.amount);
	const action = body.action === "grant" ? "grant" : "adjust";
	const reason = typeof body.reason === "string" ? body.reason.trim() : "";
	const reference = typeof body.reference === "string" ? body.reference.trim() : "";
	if (!Number.isInteger(userId) || userId <= 0 || !Number.isInteger(amount) || amount === 0 || !reason || !reference) {
		return NextResponse.json({ error: "请填写目标用户、金额、原因和收款凭证。" }, { status: 400 });
	}
	const config = getAiWebConfig();
	try {
		const upstream = await fetch(new URL("/api/yancore/admin/quota", config.yanCoreApiBaseUrl), {
			method: "POST",
			cache: "no-store",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${guard.session.grant}`,
			},
			body: JSON.stringify({ user_id: userId, action, amount, reason, reference }),
			signal: AbortSignal.timeout(10_000),
		});
		const result = (await upstream.json().catch(() => null)) as QuotaResponse | null;
		if (!upstream.ok || !result?.success || !result.data) {
			return NextResponse.json({ error: result?.message || "额度发放失败。" }, { status: upstream.status === 409 ? 409 : 502 });
		}
		return NextResponse.json({
			entryId: result.data.entry_id,
			balanceAfter: result.data.balance_after,
			idempotencyKey: result.data.idempotency_key,
		});
	} catch {
		return NextResponse.json({ error: "额度发放服务暂时不可用。" }, { status: 502 });
	}
}
