import { NextRequest, NextResponse } from "next/server";
import { getAiWebConfig } from "@/lib/config";
import { requireAiSession } from "@/lib/session-guard";

export const runtime = "nodejs";

type LedgerEntry = {
	id: number;
	entry_type: string;
	funding_source: string;
	amount: number;
	balance_after: number;
	reason: string;
	request_id: string;
	created_at: number;
};

type LedgerResponse = {
	success?: boolean;
	data?: {
		items?: LedgerEntry[];
		total?: number;
	};
};

export async function GET(request: NextRequest) {
	const guard = requireAiSession(request);
	if (guard.response) return guard.response;
	const config = getAiWebConfig();
	const page = Math.max(1, Number(request.nextUrl.searchParams.get("page") || 1));
	const pageSize = Math.min(50, Math.max(1, Number(request.nextUrl.searchParams.get("pageSize") || 20)));
	const endpoint = new URL("/api/yancore/me/ledger", config.yanCoreApiBaseUrl);
	endpoint.searchParams.set("page", String(page));
	endpoint.searchParams.set("pageSize", String(pageSize));
	try {
		const upstream = await fetch(endpoint, {
			cache: "no-store",
			headers: { Authorization: `Bearer ${guard.session.grant}` },
			signal: AbortSignal.timeout(8_000),
		});
		const body = (await upstream.json().catch(() => null)) as LedgerResponse | null;
		if (upstream.status === 401) {
			const response = NextResponse.json({ error: "登录会话已失效。" }, { status: 401 });
			response.cookies.set("yc_ai_session", "", { httpOnly: true, secure: config.publicUrl.protocol === "https:", sameSite: "lax", path: "/", maxAge: 0 });
			return response;
		}
		if (!upstream.ok || !body?.success || !Array.isArray(body.data?.items)) {
			return NextResponse.json({ error: "额度流水暂时不可用。" }, { status: 502 });
		}
		return NextResponse.json({
			entries: body.data.items,
			total: body.data.total ?? body.data.items.length,
			page,
			pageSize,
		});
	} catch {
		return NextResponse.json({ error: "额度流水暂时不可用。" }, { status: 502 });
	}
}
