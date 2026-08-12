import { NextRequest, NextResponse } from "next/server";
import { getAiWebConfig } from "@/lib/config";
import { requireAiSession } from "@/lib/session-guard";

export const runtime = "nodejs";

type KeyItem = {
	id: number;
	name: string;
	key: string;
	status: number;
	model_limits_enabled: boolean;
	model_limits: string;
	remain_quota: number;
	unlimited_quota: boolean;
	expired_time: number;
	created_time: number;
};

type KeyListResponse = {
	success?: boolean;
	data?: { items?: KeyItem[] };
};

type KeyCreateResponse = {
	success?: boolean;
	message?: string;
	data?: { key?: string; token?: KeyItem };
};

async function yanCoreKeysFetch(config: ReturnType<typeof getAiWebConfig>, grant: string, path: string, init?: RequestInit) {
	const upstream = await fetch(new URL(`/api/yancore/me/keys${path}`, config.yanCoreApiBaseUrl), {
		cache: "no-store",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${grant}`,
			...(init?.headers ?? {}),
		},
		...init,
		signal: AbortSignal.timeout(10_000),
	});
	return upstream;
}

export async function GET(request: NextRequest) {
	const guard = requireAiSession(request);
	if (guard.response) return guard.response;
	const config = getAiWebConfig();
	try {
		const upstream = await yanCoreKeysFetch(config, guard.session.grant, "?page=1&pageSize=50");
		const body = (await upstream.json().catch(() => null)) as KeyListResponse | null;
		if (!upstream.ok || !body?.success || !Array.isArray(body.data?.items)) {
			return NextResponse.json({ error: "Key 列表暂时不可用。" }, { status: 502 });
		}
		return NextResponse.json({ keys: body.data.items });
	} catch {
		return NextResponse.json({ error: "Key 列表暂时不可用。" }, { status: 502 });
	}
}

export async function POST(request: NextRequest) {
	const guard = requireAiSession(request);
	if (guard.response) return guard.response;
	const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
	if (!body || typeof body !== "object") {
		return NextResponse.json({ error: "请求格式无效。" }, { status: 400 });
	}
	const name = typeof body.name === "string" ? body.name.trim() : "";
	const models = typeof body.models === "string" ? body.models.trim() : "";
	const remainQuota = Number(body.remainQuota);
	const expiredTime = Number(body.expiredTime);
	if (!name || !models || !Number.isInteger(remainQuota) || remainQuota <= 0 || !Number.isInteger(expiredTime) || expiredTime <= 0) {
		return NextResponse.json({ error: "请填写名称、模型、预算和有效期。" }, { status: 400 });
	}
	const config = getAiWebConfig();
	try {
		const upstream = await yanCoreKeysFetch(config, guard.session.grant, "", {
			method: "POST",
			body: JSON.stringify({
				name,
				expired_time: expiredTime,
				remain_quota: remainQuota,
				unlimited_quota: false,
				model_limits_enabled: true,
				model_limits: models,
			}),
		});
		const result = (await upstream.json().catch(() => null)) as KeyCreateResponse | null;
		if (!upstream.ok || !result?.success || !result.data?.key || !result.data.token) {
			return NextResponse.json({ error: result?.message || "Key 创建失败。" }, { status: 502 });
		}
		return NextResponse.json({ key: result.data.key, token: result.data.token });
	} catch {
		return NextResponse.json({ error: "Key 创建服务暂时不可用。" }, { status: 502 });
	}
}
