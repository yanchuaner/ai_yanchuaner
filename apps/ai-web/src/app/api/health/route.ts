import { NextResponse } from "next/server";
import { getAiWebConfig } from "@/lib/config";

export function GET() {
  try {
    getAiWebConfig();
    return NextResponse.json({ status: "ok", service: "yanchuaner-ai-web" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ status: "unconfigured", service: "yanchuaner-ai-web" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
