import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { handleChatCompletion } from "@/lib/chat-handler";
import { seal, type AiSession } from "@/lib/session";

const sessionSecret = "01234567890123456789012345678901";

const config = {
  publicUrl: new URL("https://ai.example.test"),
  sessionSecret,
  yanCoreApiBaseUrl: new URL("https://api.example.test"),
};

function authenticatedRequest(path: string, body?: unknown, origin = "https://ai.example.test") {
  const expiresAt = Math.floor(Date.now() / 1000) + 600;
  const session: AiSession = {
    identity: { sub: "member-1", name: "Member", role: "alumni" },
    subject: { userId: 7, application: "ai-web", audience: "yanchuaner-ai", scopes: "chat:read chat:write" },
    grant: "grant",
    grantExpiresAt: expiresAt,
    credential: {
      accessKey: `sk-yc_${"a".repeat(64)}`,
      models: ["deepseek-chat"],
      quotaUnits: 50000,
      expiresAt,
    },
  };
  const headers = new Headers({ Cookie: `yc_ai_session=${seal(session, sessionSecret)}`, Origin: origin });
  if (body !== undefined) headers.set("Content-Type", "application/json");
  return new NextRequest(`https://ai.example.test${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

test("chat route authenticates the encrypted session without exposing its key", async () => {
  let authorization = "";
  const fetcher: typeof fetch = async (_input, init) => {
    authorization = new Headers(init?.headers).get("authorization") ?? "";
    return new Response("data: [DONE]\n\n", { headers: { "Content-Type": "text/event-stream" } });
  };
  const response = await handleChatCompletion(authenticatedRequest("/api/chat/completions", {
    model: "deepseek-chat",
    messages: [{ role: "user", content: "hello" }],
  }), config, fetcher);
  assert.equal(response.status, 200);
  assert.equal(authorization, `Bearer sk-yc_${"a".repeat(64)}`);
  assert.doesNotMatch(await response.text(), /sk-yc_/);
});

test("chat route rejects a cross-origin request before forwarding", async () => {
  const response = await handleChatCompletion(authenticatedRequest("/api/chat/completions", {
    model: "deepseek-chat",
    messages: [{ role: "user", content: "hello" }],
  }, "https://evil.example.test"), config);
  assert.equal(response.status, 403);
});
