import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  addKnowledgeDocument,
  addUserKnowledgeDocument,
  deleteKnowledgeDocument,
  deletePersonaKnowledge,
  deleteUserKnowledge,
  getPersonaKnowledgeSummary,
  getUserKnowledgeSummary,
  listDocumentChunks,
  searchPersonaKnowledge,
  searchUserKnowledge,
} from "./knowledge-library";

async function withDataDir(run: () => Promise<void>) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ai-web-knowledge-"));
  const previous = process.env.AI_WEB_DATA_DIR;
  process.env.AI_WEB_DATA_DIR = dir;
  try {
    await run();
  } finally {
    if (previous === undefined) delete process.env.AI_WEB_DATA_DIR;
    else process.env.AI_WEB_DATA_DIR = previous;
    await rm(dir, { recursive: true, force: true });
  }
}

function fakeEmbedder(texts: string[]): Promise<number[][]> {
  return Promise.resolve(
    texts.map((text) => [
      text.includes("星河") ? 1 : 0,
      text.includes("校园") ? 1 : 0,
      text.includes("往事") ? 1 : 0,
    ]),
  );
}

test("knowledge documents are chunked, embedded, persisted and searchable", async () => {
  await withDataDir(async () => {
    const added = await addKnowledgeDocument(
      7,
      "preset-star-traveler",
      "星河旅者",
      { name: "旅途见闻", text: "她曾横跨银河。\n\n在校园时代，她最怀念的是看星星的往事。" },
      "BAAI/bge-m3",
      fakeEmbedder,
    );
    assert.equal(added.document.chunkCount, 1);
    assert.equal(added.model, "BAAI/bge-m3");

    const summary = await getPersonaKnowledgeSummary(7, "preset-star-traveler");
    assert.equal(summary.documents.length, 1);
    assert.equal(summary.chunkCount, 1);
    assert.equal(summary.knowledgeBase?.embeddingModel, "BAAI/bge-m3");
    assert.equal((await getPersonaKnowledgeSummary(8, "preset-star-traveler")).documents.length, 0);

    const chunks = await listDocumentChunks(7, added.document.id);
    assert.equal(chunks.length, 1);
    assert.ok(chunks[0].text.length > 0);

    const hits = await searchPersonaKnowledge(7, "preset-star-traveler", [0, 1, 1], 2, 0.1);
    assert.ok(hits.length >= 1);
    assert.equal(hits[0].documentName, "旅途见闻");
    assert.match(hits[0].text, /校园|往事/);

    await deleteKnowledgeDocument(7, added.document.id);
    const after = await getPersonaKnowledgeSummary(7, "preset-star-traveler");
    assert.equal(after.documents.length, 0);
    assert.equal(after.chunkCount, 0);
  });
});

test("knowledge validates inputs and rejects empty or oversized documents", async () => {
  await withDataDir(async () => {
    await assert.rejects(
      () =>
        addKnowledgeDocument(
          7,
          "persona-1",
          "角色",
          { name: "", text: "内容" },
          "BAAI/bge-m3",
          fakeEmbedder,
        ),
      /name is invalid/,
    );
    await assert.rejects(
      () =>
        addKnowledgeDocument(
          7,
          "persona-1",
          "角色",
          { name: "太大", text: "x".repeat(200_001) },
          "BAAI/bge-m3",
          fakeEmbedder,
        ),
      /too large/,
    );
  });
});

test("deleting a persona removes its knowledge base", async () => {
  await withDataDir(async () => {
    await addKnowledgeDocument(
      9,
      "persona-9",
      "角色九",
      { name: "资料", text: "这是角色九的一段背景。" },
      "BAAI/bge-m3",
      fakeEmbedder,
    );
    await deletePersonaKnowledge(9, "persona-9");
    const summary = await getPersonaKnowledgeSummary(9, "persona-9");
    assert.equal(summary.knowledgeBase, null);
    assert.equal(summary.documents.length, 0);
    assert.equal(summary.chunkCount, 0);
    await assert.rejects(() => deleteKnowledgeDocument(9, "doc-missing"), /not found/);
  });
});

test("user knowledge is user-scoped and independent from persona knowledge", async () => {
  await withDataDir(async () => {
    await addUserKnowledgeDocument(
      7,
      { name: "我的经历", text: "我从小在海边长大，有一段难忘的往事，喜欢收集贝壳。" },
      "BAAI/bge-m3",
      fakeEmbedder,
    );
    const summary = await getUserKnowledgeSummary(7);
    assert.equal(summary.knowledgeBase?.scope, "user");
    assert.equal(summary.knowledgeBase?.name, "我的资料");
    assert.equal(summary.documents.length, 1);
    assert.equal(summary.chunkCount, 1);
    assert.equal((await getUserKnowledgeSummary(8)).documents.length, 0);

    const hits = await searchUserKnowledge(7, [0, 0, 1], 2, 0.1);
    assert.ok(hits.length >= 1);
    assert.match(hits[0].text, /海边/);

    const personaSummary = await getPersonaKnowledgeSummary(7, "any-persona");
    assert.equal(personaSummary.documents.length, 0);

    await deleteUserKnowledge(7);
    assert.equal((await getUserKnowledgeSummary(7)).documents.length, 0);
  });
});
