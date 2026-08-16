import assert from "node:assert/strict";
import test from "node:test";
import { getFavoritePersonaIds, setFavoritePersonaIds } from "./preferences-actions";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

test("getFavoritePersonaIds parses the preference list", async () => {
  const result = await getFavoritePersonaIds(
    async () => json({ preferences: { favoritePersonaIds: ["p1", "p2"] } }),
  );
  assert.deepEqual(result, ["p1", "p2"]);
});

test("setFavoritePersonaIds sends the full list", async () => {
  let seenBody = "";
  const fetcher: typeof fetch = async (_input, init) => {
    seenBody = String(init?.body);
    return json({ preferences: { favoritePersonaIds: ["p1"] } });
  };
  await setFavoritePersonaIds(["p1"], fetcher);
  assert.deepEqual(JSON.parse(seenBody), { favoritePersonaIds: ["p1"] });
});
