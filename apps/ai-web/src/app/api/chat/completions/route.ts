import { NextRequest } from "next/server";
import { handleChatCompletion } from "@/lib/chat-handler";
import { getAiWebConfig } from "@/lib/config";

export const runtime = "nodejs";

export function POST(request: NextRequest) {
  return handleChatCompletion(request, getAiWebConfig());
}
