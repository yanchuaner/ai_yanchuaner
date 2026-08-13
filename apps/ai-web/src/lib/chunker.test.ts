import assert from "node:assert/strict";
import test from "node:test";
import { chunkText } from "./chunker";

test("chunkText merges short paragraphs into one chunk", () => {
  const chunks = chunkText("第一段。\n\n第二段。");
  assert.equal(chunks.length, 1);
  assert.match(chunks[0], /第一段。/);
  assert.match(chunks[0], /第二段。/);
});

test("chunkText splits long text by sentences and stays under the limit", () => {
  const text = Array.from({ length: 80 }, (_, index) => `第${index}句。`).join("");
  const chunks = chunkText(text, { maxChars: 240, minChars: 120, overlap: 0 });
  assert.ok(chunks.length >= 2);
  for (const chunk of chunks) {
    assert.ok(chunk.length <= 240, `chunk too long: ${chunk.length}`);
    assert.ok(chunk.length > 0);
  }
  assert.equal(chunks.join(""), text);
});

test("chunkText hard-splits a single oversized sentence with overlap", () => {
  const text = "很".repeat(500);
  const chunks = chunkText(text, { maxChars: 200, minChars: 100, overlap: 40 });
  assert.ok(chunks.length >= 3);
  for (const chunk of chunks) {
    assert.ok(chunk.length <= 200);
  }
  assert.ok(chunks[0].endsWith(chunks[1].slice(0, 40)), "相邻片段应保留重叠");
});

test("chunkText merges short fragments", () => {
  const chunks = chunkText("短。\n\n另一段短。", { maxChars: 200, minChars: 100 });
  assert.equal(chunks.length, 1);
});

test("chunkText returns empty for blank input", () => {
  assert.deepEqual(chunkText("   \n\n  "), []);
});
