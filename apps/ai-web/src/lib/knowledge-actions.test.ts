import assert from "node:assert/strict";
import test from "node:test";
import {
  addPersonaKnowledgeFile,
  addPersonaKnowledgeText,
  addUserKnowledgeFile,
  addUserKnowledgeText,
  deleteAllUserKnowledge,
  deletePersonaKnowledge,
  deletePersonaKnowledgeDocument,
  deleteUserKnowledgeDocument,
  getPersonaKnowledge,
  getUserKnowledge,
} from "./knowledge-actions";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const summary = {
  knowledgeBase: { id: "kb1", name: "资料库" },
  documents: [
    {
      id: "d1",
      kbId: "kb1",
      name: "资料",
      source: "paste",
      status: "ready",
      createdAt: 1700000000,
      updatedAt: 1700000000,
      chunkCount: 1,
      tokenCount: 10,
    },
  ],
  chunkCount: 1,
};

test("getUserKnowledge parses the summary", async () => {
  const result = await getUserKnowledge(async () => json(summary));
  assert.equal(result.knowledgeBase?.id, "kb1");
  assert.equal(result.documents[0].id, "d1");
  assert.equal(result.chunkCount, 1);
});

test("addUserKnowledgeText posts JSON", async () => {
  let seenBody = "";
  const fetcher: typeof fetch = async (_input, init) => {
    seenBody = String(init?.body);
    return json({ document: { id: "d1" } });
  };
  await addUserKnowledgeText("资料", "内容", fetcher);
  assert.deepEqual(JSON.parse(seenBody), { name: "资料", text: "内容", source: "paste" });
});

test("addUserKnowledgeFile posts a FormData body", async () => {
  let seenBody: unknown;
  const fetcher: typeof fetch = async (_input, init) => {
    seenBody = init?.body;
    return json({ document: { id: "d1" } });
  };
  const file = new File(["内容"], "a.txt", { type: "text/plain" });
  await addUserKnowledgeFile(file, fetcher);
  assert.ok(seenBody instanceof FormData);
  assert.equal((seenBody as FormData).has("file"), true);
});

test("deleteUserKnowledgeDocument sends DELETE", async () => {
  let seenUrl = "";
  let seenMethod = "";
  const fetcher: typeof fetch = async (input, init) => {
    seenUrl = String(input);
    seenMethod = init?.method ?? "";
    return json({ success: true });
  };
  await deleteUserKnowledgeDocument("d1", fetcher);
  assert.equal(seenUrl, "/api/me/knowledge/documents/d1");
  assert.equal(seenMethod, "DELETE");
});

test("deleteAllUserKnowledge sends DELETE to the user knowledge root", async () => {
  let seenUrl = "";
  const fetcher: typeof fetch = async (input, init) => {
    seenUrl = String(input);
    return json({ success: true });
  };
  await deleteAllUserKnowledge(fetcher);
  assert.equal(seenUrl, "/api/me/knowledge");
});

test("getPersonaKnowledge and add text use the persona path", async () => {
  const result = await getPersonaKnowledge("p1", async () => json(summary));
  assert.equal(result.documents.length, 1);
  let seenUrl = "";
  const fetcher: typeof fetch = async (input) => {
    seenUrl = String(input);
    return json({ document: { id: "d2" } });
  };
  await addPersonaKnowledgeText("p1", "资料", "内容", fetcher);
  assert.equal(seenUrl, "/api/personas/p1/knowledge");
});

test("persona knowledge file, document delete and whole delete use correct paths", async () => {
  let seenUrl = "";
  const fileFetcher: typeof fetch = async (input) => {
    seenUrl = String(input);
    return json({ document: { id: "d2" } });
  };
  await addPersonaKnowledgeFile("p1", new File(["x"], "a.txt"), fileFetcher);
  assert.equal(seenUrl, "/api/personas/p1/knowledge");
  await deletePersonaKnowledgeDocument("p1", "d2", async (input) => {
    seenUrl = String(input);
    return json({ success: true });
  });
  assert.equal(seenUrl, "/api/personas/p1/knowledge/documents/d2");
  await deletePersonaKnowledge("p1", async (input) => {
    seenUrl = String(input);
    return json({ success: true });
  });
  assert.equal(seenUrl, "/api/personas/p1/knowledge");
});
