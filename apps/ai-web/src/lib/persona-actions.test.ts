import assert from "node:assert/strict";
import test from "node:test";
import {
  createPersona,
  deletePersona,
  exportPersonaCard,
  importPersonaCard,
  listPersonas,
  updatePersona,
} from "./persona-actions";

const json = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

const persona = {
  id: "p1",
  name: "闵先生",
  description: "班主任",
  firstMessage: "同学们好。",
};

test("listPersonas parses the persona list", async () => {
  const result = await listPersonas(async () => json({ personas: [persona] }));
  assert.equal(result[0].id, "p1");
});

test("createPersona posts the persona input", async () => {
  let seenBody = "";
  const fetcher: typeof fetch = async (_input, init) => {
    seenBody = String(init?.body);
    return json({ persona });
  };
  const result = await createPersona(
    { name: "闵先生", description: "班主任", firstMessage: "同学们好。" },
    fetcher,
  );
  assert.deepEqual(JSON.parse(seenBody), { persona: { name: "闵先生", description: "班主任", firstMessage: "同学们好。" } });
  assert.equal(result.id, "p1");
});

test("updatePersona sends PUT and returns the updated persona", async () => {
  let seenUrl = "";
  let seenMethod = "";
  const fetcher: typeof fetch = async (input, init) => {
    seenUrl = String(input);
    seenMethod = init?.method ?? "";
    return json({ persona });
  };
  await updatePersona("p1", { name: "闵先生", description: "班主任", firstMessage: "同学们好。" }, fetcher);
  assert.equal(seenUrl, "/api/personas/p1");
  assert.equal(seenMethod, "PUT");
});

test("deletePersona sends DELETE", async () => {
  let seenUrl = "";
  let seenMethod = "";
  const fetcher: typeof fetch = async (input, init) => {
    seenUrl = String(input);
    seenMethod = init?.method ?? "";
    return json({ success: true });
  };
  await deletePersona("p1", fetcher);
  assert.equal(seenUrl, "/api/personas/p1");
  assert.equal(seenMethod, "DELETE");
});

test("importPersonaCard posts the card and returns a persona", async () => {
  let seenBody = "";
  const fetcher: typeof fetch = async (_input, init) => {
    seenBody = String(init?.body);
    return json({ persona }, 201);
  };
  const result = await importPersonaCard({ spec: "chara_card_v3" }, fetcher);
  assert.deepEqual(JSON.parse(seenBody), { card: { spec: "chara_card_v3" } });
  assert.equal(result.id, "p1");
});

test("exportPersonaCard returns text and decoded filename", async () => {
  const result = await exportPersonaCard(
    "p1",
    async () =>
      new Response('{"spec":"chara_card_v3"}', {
        headers: {
          "content-type": "application/json",
          "content-disposition": "attachment; filename*=UTF-8''%E9%97%B5%E5%85%88%E7%94%9F.json",
        },
      }),
  );
  assert.equal(result.text, '{"spec":"chara_card_v3"}');
  assert.equal(result.filename, "闵先生.json");
});
