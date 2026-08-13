import assert from "node:assert/strict";
import test from "node:test";
import { generateConversationMemory } from "./memory-generator";

test("memory generator sends a bounded transcript and keeps the key server-side", async () => {
  let seenBody = "";
  let seenAuthorization = "";
  const messages = Array.from({ length: 60 }, (_, index) => ({
    role: index % 2 === 0 ? "user" : "assistant",
    content: `消息${index}`,
  }));
  const fetcher: typeof fetch = async (_input, init) => {
    seenAuthorization = new Headers(init?.headers).get("authorization") ?? "";
    seenBody = String(init?.body);
    return Response.json({
      choices: [{ message: { role: "assistant", content: "角色记住了用户的生日。" } }],
    });
  };
  const result = await generateConversationMemory(
    new URL("https://api.example.test"),
    `sk-yc_${"a".repeat(64)}`,
    "deepseek-chat",
    messages,
    fetcher,
  );
  assert.equal(result.summary, "角色记住了用户的生日。");
  assert.equal(seenAuthorization, `Bearer sk-yc_${"a".repeat(64)}`);
  const parsed = JSON.parse(seenBody);
  assert.equal(parsed.stream, false);
  assert.match(parsed.messages[1].content, /消息20/);
  assert.doesNotMatch(parsed.messages[1].content, /消息0/);
  assert.doesNotMatch(seenBody, /sk-yc_/);
});

test("memory generator rejects empty or failed responses", async () => {
  await assert.rejects(
    () =>
      generateConversationMemory(
        new URL("https://api.example.test"),
        "sk",
        "deepseek-chat",
        [{ role: "user", content: "你好" }],
        async () => Response.json({ choices: [{ message: { content: "" } }] }),
      ),
    /failed/,
  );
  await assert.rejects(
    () =>
      generateConversationMemory(
        new URL("https://api.example.test"),
        "sk",
        "deepseek-chat",
        [{ role: "user", content: "你好" }],
        async () => Response.json({ error: "no quota" }, { status: 402 }),
      ),
    /failed/,
  );
});
