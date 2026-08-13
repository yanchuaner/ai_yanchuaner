import assert from "node:assert/strict";
import test from "node:test";
import { charaCardV3ToPersonaInput, personaToCharaCardV3 } from "./chara-card";

test("persona exports a standard chara_card_v3 card", () => {
  const persona = {
    id: "custom-1",
    name: "闵先生",
    faction: "燕中",
    avatar: "🧑‍🏫",
    cover: "ocean",
    description: "航天班班主任，教生物。",
    firstMessage: "进来坐。",
    style: "温和",
    world: "燕川中学",
    scenario: "办公室",
    plot: "日常答疑",
    examples: "用户：老师好。",
    tags: ["校园"],
  };
  const card = personaToCharaCardV3(persona);
  assert.equal(card.spec, "chara_card_v3");
  assert.equal(card.data.name, "闵先生");
  assert.equal(card.data.description, "航天班班主任，教生物。");
  assert.equal(card.data.first_mes, "进来坐。");
  assert.equal((card.data.extensions as Record<string, unknown>).plot, "日常答疑");
});

test("chara card v3 imports into a persona input with length protection", () => {
  const input = charaCardV3ToPersonaInput({
    spec: "chara_card_v3",
    spec_version: "2.0",
    data: {
      name: "  旅行者  ",
      description: " 穿梭星海的旅人。",
      personality: " 说话像念诗。",
      scenario: "光站",
      first_mes: " 夜好。",
      mes_example: "用户：你好",
      tags: [" 科幻 ", "", "星空"],
      extensions: {
        style: "克制",
        world: "星海之间",
        plot: "寻找故乡",
        cover: "galaxy",
        faction: "科幻",
      },
    },
  });
  assert.equal(input.name, "旅行者");
  assert.equal(input.description, "穿梭星海的旅人。\n说话像念诗。");
  assert.equal(input.firstMessage, "夜好。");
  assert.equal(input.world, "星海之间");
  assert.equal(input.plot, "寻找故乡");
  assert.equal(input.cover, "galaxy");
  assert.equal(input.faction, "科幻");
  assert.deepEqual(input.tags, ["科幻", "星空"]);
});

test("chara card without name or description is rejected", () => {
  assert.throws(
    () =>
      charaCardV3ToPersonaInput({
        spec: "chara_card_v3",
        data: { first_mes: "你好" },
      }),
    /invalid chara card/,
  );
  assert.throws(
    () =>
      charaCardV3ToPersonaInput({
        spec: "chara_card_v3",
        data: { name: "无名" },
      }),
    /invalid chara card/,
  );
});

test("chara card fields are truncated to persona limits", () => {
  const input = charaCardV3ToPersonaInput({
    spec: "chara_card_v3",
    data: {
      name: "名".repeat(100),
      description: "描".repeat(5000),
    },
  });
  assert.equal(input.name.length, 32);
  assert.equal(input.description.length, 4000);
});
