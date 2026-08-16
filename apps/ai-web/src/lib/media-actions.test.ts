import assert from "node:assert/strict";
import test from "node:test";
import {
  clearMediaSettings,
  describeImage,
  generateImage,
  getMediaSettings,
  updateMediaSettings,
} from "./media-actions";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const settings = {
  baseUrl: "https://api.siliconflow.cn/v1",
  visionModel: "Qwen/Qwen2.5-VL-72B-Instruct",
  imageModel: "black-forest-labs/FLUX.1-schnell",
  updatedAt: 1700000000,
};

test("getMediaSettings parses settings and accepts null", async () => {
  const result = await getMediaSettings(async () => json({ settings }));
  assert.equal(result?.visionModel, "Qwen/Qwen2.5-VL-72B-Instruct");
  const empty = await getMediaSettings(async () => json({ settings: null }));
  assert.equal(empty, null);
});

test("updateMediaSettings posts the input", async () => {
  let seenBody = "";
  const fetcher: typeof fetch = async (_input, init) => {
    seenBody = String(init?.body);
    return json({ settings });
  };
  const result = await updateMediaSettings(
    { baseUrl: "https://api.siliconflow.cn/v1", visionModel: "m1", imageModel: "m2" },
    fetcher,
  );
  assert.deepEqual(JSON.parse(seenBody), {
    baseUrl: "https://api.siliconflow.cn/v1",
    visionModel: "m1",
    imageModel: "m2",
  });
  assert.equal(result?.imageModel, "black-forest-labs/FLUX.1-schnell");
});

test("clearMediaSettings sends DELETE", async () => {
  let seenMethod = "";
  const fetcher: typeof fetch = async (_input, init) => {
    seenMethod = init?.method ?? "";
    return json({ success: true });
  };
  await clearMediaSettings(fetcher);
  assert.equal(seenMethod, "DELETE");
});

test("generateImage posts prompt and returns the image URL", async () => {
  let seenBody = "";
  const fetcher: typeof fetch = async (_input, init) => {
    seenBody = String(init?.body);
    return json({ image: "data:image/png;base64,AAAA" });
  };
  const image = await generateImage("一只猫", fetcher);
  assert.deepEqual(JSON.parse(seenBody), { prompt: "一只猫" });
  assert.equal(image, "data:image/png;base64,AAAA");
});

test("describeImage posts image and prompt and returns text", async () => {
  let seenBody = "";
  const fetcher: typeof fetch = async (_input, init) => {
    seenBody = String(init?.body);
    return json({ text: "图片里有一只猫。" });
  };
  const text = await describeImage("data:image/png;base64,AAAA", "描述图片", fetcher);
  assert.deepEqual(JSON.parse(seenBody), { image: "data:image/png;base64,AAAA", prompt: "描述图片" });
  assert.equal(text, "图片里有一只猫。");
});
