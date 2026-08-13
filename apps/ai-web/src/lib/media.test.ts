import assert from "node:assert/strict";
import test from "node:test";
import { forwardImageGeneration, forwardVision } from "./media";

test("vision forwards image data URL and returns the description", async () => {
  let seenBody = "";
  const fetcher: typeof fetch = async (_input, init) => {
    seenBody = String(init?.body);
    return Response.json({
      choices: [{ message: { content: "图片里有一片星空。" } }],
    });
  };
  const text = await forwardVision(
    "https://media.example.test/v1",
    "sk-media-secret",
    "qwen-vl",
    "data:image/png;base64,AAAA",
    "描述这张图片",
    fetcher,
  );
  assert.equal(text, "图片里有一片星空。");
  const parsed = JSON.parse(seenBody) as {
    messages: { content: { type: string; image_url?: { url: string } }[] }[];
  };
  assert.equal(parsed.messages[0].content[1].type, "image_url");
  assert.equal(parsed.messages[0].content[1].image_url?.url, "data:image/png;base64,AAAA");
  assert.doesNotMatch(seenBody, /sk-media-secret/);
});

test("image generation returns data URL from b64_json", async () => {
  const fetcher: typeof fetch = async (_input, init) => {
    assert.match(String(init?.body), /"prompt":"一只猫"/);
    return Response.json({ data: [{ b64_json: "Q0FUIElNQUdF" }] });
  };
  const url = await forwardImageGeneration(
    "https://media.example.test/v1",
    "sk-media-secret",
    "flux",
    "一只猫",
    fetcher,
  );
  assert.equal(url, "data:image/png;base64,Q0FUIElNQUdF");
});

test("image generation falls back to remote url", async () => {
  const fetcher: typeof fetch = async () =>
    Response.json({ data: [{ url: "https://cdn.example.test/cat.png" }] });
  const url = await forwardImageGeneration(
    "https://media.example.test/v1",
    "sk-media-secret",
    "flux",
    "一只猫",
    fetcher,
  );
  assert.equal(url, "https://cdn.example.test/cat.png");
});
