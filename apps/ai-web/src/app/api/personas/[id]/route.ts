import { NextRequest, NextResponse } from "next/server";
import { createFilePersonaRepository } from "@/lib/persona-file-repository";
import { personaToCharaCardV3 } from "@/lib/chara-card";
import { requireAiSession } from "@/lib/session-guard";

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = requireAiSession(request);
  if (guard.response) return guard.response;
  const { id } = await params;
  const personas = await createFilePersonaRepository().list(guard.session.subject.userId);
  const persona = personas.find((item) => item.id === id);
  if (!persona) return NextResponse.json({ error: "角色不存在。" }, { status: 404 });
  const card = personaToCharaCardV3(persona);
  const filename = encodeURIComponent(`${persona.name}.json`);
  return new NextResponse(JSON.stringify(card, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = requireAiSession(request);
  if (guard.response) return guard.response;
  const { id } = await params;
  try {
    await createFilePersonaRepository().delete(guard.session.subject.userId, id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "角色不存在。" }, { status: 404 });
	}
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const guard = requireAiSession(request);
	if (guard.response) return guard.response;
	const { id } = await params;
	const body = (await request.json().catch(() => null)) as unknown;
	const input =
		body && typeof body === "object" && !Array.isArray(body)
			? (body as Record<string, unknown>).persona
			: undefined;
	try {
		const persona = await createFilePersonaRepository().update(guard.session.subject.userId, id, input);
		return NextResponse.json({ persona });
	} catch (error) {
		const message = error instanceof Error ? error.message : "";
		if (message === "persona not found") {
			return NextResponse.json({ error: "角色不存在。" }, { status: 404 });
		}
		return NextResponse.json(
			{ error: message === "persona input is invalid" ? "角色设定无效。" : "保存角色失败。" },
			{ status: 400 },
		);
	}
}
