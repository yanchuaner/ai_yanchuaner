import { NextRequest, NextResponse } from "next/server";
import { getAiWebConfig } from "@/lib/config";
import { requireAiSession } from "@/lib/session-guard";

export const runtime = "nodejs";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const guard = requireAiSession(request);
	if (guard.response) return guard.response;
	const { id } = await params;
	const config = getAiWebConfig();
	try {
		const upstream = await fetch(new URL(`/api/yancore/me/keys/${id}`, config.yanCoreApiBaseUrl), {
			method: "DELETE",
			cache: "no-store",
			headers: { Authorization: `Bearer ${guard.session.grant}` },
			signal: AbortSignal.timeout(10_000),
		});
		if (!upstream.ok) {
			return NextResponse.json({ error: "Key 删除失败。" }, { status: 502 });
		}
		return NextResponse.json({ success: true });
	} catch {
		return NextResponse.json({ error: "Key 删除服务暂时不可用。" }, { status: 502 });
	}
}
