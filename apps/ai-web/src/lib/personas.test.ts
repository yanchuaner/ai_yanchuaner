import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPersona,
  isValidPersona,
  isValidPersonaInput,
  personaSystemPrompt,
  PRESET_PERSONAS,
} from "./personas";

test("preset personas are valid and produce a complete system prompt", () => {
  for (const persona of PRESET_PERSONAS) {
    assert.ok(isValidPersona(persona), `${persona.id} should be valid`);
  }
  const prompt = personaSystemPrompt(PRESET_PERSONAS[0]);
  assert.match(prompt, /燕中学伴/);
  assert.match(prompt, /【角色卡】/);
  assert.match(prompt, /用中文回复/);
});

test("persona input accepts optional DIY sections and rejects invalid fields", () => {
  const input = {
    name: "星河向导",
    description: "一位熟悉星图的老向导。",
    firstMessage: "欢迎登舰。",
    style: "平静",
    world: "飞船时代",
    scenario: "初次见面",
    plot: "寻找失落星图",
    tags: ["科幻", "旅行"],
  };
  assert.ok(isValidPersonaInput(input));
  assert.ok(!isValidPersona(input), "缺少 id 时不能作为完整角色卡");
  assert.ok(isValidPersona({ id: "preset-star-guide", ...input }));
  assert.ok(!isValidPersonaInput({ ...input, name: " " }));
  assert.ok(!isValidPersonaInput({ ...input, description: "x".repeat(4001) }));
  assert.ok(!isValidPersonaInput({ ...input, style: "x".repeat(601) }));
  assert.ok(!isValidPersonaInput({ ...input, tags: ["", "x".repeat(21)] }));
  assert.ok(!isValidPersonaInput({ ...input, tags: Array.from({ length: 9 }, () => "标签") }));
});

test("buildPersona trims fields, drops empty optional sections and deduplicates tags", () => {
  const persona = buildPersona("custom-1", {
    name: " 向导 ",
    description: " 描述 ",
    firstMessage: " 你好 ",
    style: " ",
    world: undefined,
    tags: [" 科幻 ", "", "科幻"],
  });
  assert.equal(persona.name, "向导");
  assert.equal(persona.description, "描述");
  assert.equal(persona.firstMessage, "你好");
  assert.equal(persona.style, undefined);
  assert.equal(persona.world, undefined);
  assert.deepEqual(persona.tags, ["科幻"]);
});

test("system prompt omits empty optional sections", () => {
  const prompt = personaSystemPrompt({
    id: "x",
    name: "向导",
    description: "描述",
    firstMessage: "你好",
  });
  assert.doesNotMatch(prompt, /【世界观】/);
  assert.doesNotMatch(prompt, /【当前场景】/);
  assert.doesNotMatch(prompt, /【故事线】/);
  assert.doesNotMatch(prompt, /【说话风格】/);
});
