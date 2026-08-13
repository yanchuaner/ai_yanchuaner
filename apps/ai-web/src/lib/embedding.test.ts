import assert from "node:assert/strict";
import test from "node:test";
import { pickEmbeddingModel, requestEmbeddings } from "./embedding";

test("requestEmbeddings sends the application key to api.* and sorts by index", async () => {
  let seenAuthorization = "";
  let seenBody = "";
  const fetcher: typeof fetch = async (_input, init) => {
    seenAuthorization = new Headers(init?.headers).get("authorization") ?? "";
    seenBody = String(init?.body);
    return Response.json({
      object: "list",
      model: "BAAI/bge-m3",
      data: [
        { index: 1, embedding: [0, 1] },
        { index: 0, embedding: [1, 0] },
      ],
      usage: { prompt_tokens: 10, total_tokens: 10 },
    });
  };
  const result = await requestEmbeddings(
    new URL("https://api.example.test"),
    `sk-yc_${"a".repeat(64)}`,
    "BAAI/bge-m3",
    ["甲", "乙"],
    fetcher,
  );
  assert.equal(seenAuthorization, `Bearer sk-yc_${"a".repeat(64)}`);
  assert.deepEqual(JSON.parse(seenBody), { model: "BAAI/bge-m3", input: ["甲", "乙"] });
  assert.deepEqual(result.vectors, [[1, 0], [0, 1]]);
  assert.equal(result.usage.total_tokens, 10);
});

test("requestEmbeddings rejects invalid responses without leaking keys", async () => {
  const fetcher: typeof fetch = async () => Response.json({ data: [] });
  await assert.rejects(
    () =>
      requestEmbeddings(
        new URL("https://api.example.test"),
        `sk-yc_${"a".repeat(64)}`,
        "BAAI/bge-m3",
        ["甲"],
        fetcher,
      ),
    /invalid/,
  );
  const failed: typeof fetch = async () => Response.json({ error: "no quota" }, { status: 402 });
  await assert.rejects(
    () =>
      requestEmbeddings(
        new URL("https://api.example.test"),
        `sk-yc_${"a".repeat(64)}`,
        "BAAI/bge-m3",
        ["甲"],
        failed,
      ),
    /402/,
  );
});

test("pickEmbeddingModel prefers configured model and falls back to naming", () => {
  assert.equal(pickEmbeddingModel(["deepseek-chat", "BAAI/bge-m3"], "BAAI/bge-m3"), "BAAI/bge-m3");
  assert.equal(pickEmbeddingModel(["deepseek-chat", "text-embedding-3-small"]), "text-embedding-3-small");
  assert.equal(pickEmbeddingModel(["deepseek-chat", "BAAI/bge-m3"], "missing"), "BAAI/bge-m3");
  assert.equal(pickEmbeddingModel(["deepseek-chat"]), null);
});
