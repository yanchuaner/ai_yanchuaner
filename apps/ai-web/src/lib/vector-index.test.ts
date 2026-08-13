import assert from "node:assert/strict";
import test from "node:test";
import { cosineSimilarity, searchVectors } from "./vector-index";

test("cosine similarity ranks related vectors above unrelated ones", () => {
  assert.equal(cosineSimilarity([1, 0], [1, 0]), 1);
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
  assert.ok(cosineSimilarity([1, 1], [1, 0.9]) > cosineSimilarity([1, 1], [-1, 0.9]));
  assert.equal(cosineSimilarity([], []), 0);
  assert.equal(cosineSimilarity([1, 0], [1, 0, 0]), 0);
});

test("searchVectors keeps top matches above the threshold", () => {
  const items = [
    { id: "a", vector: [1, 0] },
    { id: "b", vector: [0.9, 0.1] },
    { id: "c", vector: [-1, 0] },
  ];
  const result = searchVectors([1, 0], items, 2, 0.5);
  assert.deepEqual(result, [
    { id: "a", score: 1 },
    { id: "b", score: 0.9938837346736189 },
  ]);
  assert.equal(searchVectors([1, 0], items, 2, 0.999).length, 1);
});
