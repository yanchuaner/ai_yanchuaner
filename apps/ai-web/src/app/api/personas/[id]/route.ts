import { NextRequest, NextResponse } from "next/server";
import { deletePersona, updatePersona } from "@/lib/persona-library";
import { requireAiSession } from "@/lib/session-guard";

export const runtime = "nodejs";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = requireAiSession(request);
  if (guard.response) return guard.response;
  const { id } = await params;
  try {
    await deletePersona(guard.session.subject.userId, id);
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
		const persona = await updatePersona(guard.session.subject.userId, id, input);
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
