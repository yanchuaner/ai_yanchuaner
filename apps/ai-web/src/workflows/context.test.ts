import assert from "node:assert/strict";
import test from "node:test";
import {
  assembleContext,
  historyContributor,
  knowledgeContributor,
  memoryContributor,
  personaSnapshotContributor,
  systemPolicyContributor,
  worldSnapshotContributor,
  type ContextContribution,
} from "./context";

test("assembleContext orders by priority and respects budget", () => {
  const contributions: ContextContribution[] = [
    { source: "history", priority: 60, label: "历史", content: "h".repeat(200) },
    { source: "persona", priority: 90, label: "角色", content: "p".repeat(100) },
    { source: "system", priority: 100, label: "策略", content: "s".repeat(50) },
  ];
  const result = assembleContext(contributions, 250);
  assert.equal(result.blocks[0].startsWith("【策略】"), true);
  assert.equal(result.blocks[1].startsWith("【角色】"), true);
  assert.ok(result.totalChars <= 250);
});

test("assembleContext deduplicates identical content", () => {
  const result = assembleContext([
    { source: "memory", priority: 70, label: "记忆", content: "相同内容" },
    { source: "knowledge", priority: 50, label: "资料", content: "相同内容" },
  ]);
  assert.equal(result.blocks.length, 1);
});

test("contributors produce labelled blocks", () => {
  const persona = {
    id: "persona_1",
    name: "闵先生",
    description: "班主任",
    firstMessage: "同学们好。",
  };
  const contributions = [
    systemPolicyContributor(),
    personaSnapshotContributor(persona),
    worldSnapshotContributor({
      snapshot: { title: "燕川中学", description: "校园", timeline: "2025", outline: "日常" },
    }),
    historyContributor([{ role: "user", content: "你好" }]),
    memoryContributor({ summary: "记得生日" }),
    knowledgeContributor([{ documentName: "往事", text: "看星星" }]),
  ].filter((item): item is ContextContribution => item !== null);
  assert.equal(contributions.some((item) => item.source === "persona"), true);
  assert.equal(contributions.some((item) => item.source === "world"), true);
  assert.equal(contributions.some((item) => item.source === "memory"), true);
  assert.equal(contributions.some((item) => item.source === "knowledge"), true);
});
