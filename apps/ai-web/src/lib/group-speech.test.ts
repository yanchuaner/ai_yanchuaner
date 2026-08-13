import assert from "node:assert/strict";
import test from "node:test";
import { createSpeakerPrefixStripper } from "./group-speech";

test("speaker prefix stripper removes the name marker at the beginning", () => {
  const stripper = createSpeakerPrefixStripper("星河旅者");
  assert.equal(stripper.push("星河旅者：按地球的年岁算"), "按地球的年岁算");
});

test("speaker prefix stripper handles streaming chunks", () => {
  const stripper = createSpeakerPrefixStripper("星河旅者");
  const chunks = [..."星河旅者：夜好。"];
  let output = "";
  for (const chunk of chunks) output += stripper.push(chunk);
  assert.equal(output, "夜好。");
});

test("speaker prefix stripper keeps normal speech unchanged", () => {
  const stripper = createSpeakerPrefixStripper("星河旅者");
  assert.equal(stripper.push("按地球的年岁算"), "按地球的年岁算");
});

test("speaker prefix stripper handles bracketed markers", () => {
  const first = createSpeakerPrefixStripper("长者");
  assert.equal(first.push("[长者] 星云间的晨昏"), "星云间的晨昏");
  const second = createSpeakerPrefixStripper("长者");
  assert.equal(second.push("（长者）星云间的晨昏"), "星云间的晨昏");
});
