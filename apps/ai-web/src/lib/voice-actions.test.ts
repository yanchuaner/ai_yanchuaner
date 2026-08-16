import assert from "node:assert/strict";
import test from "node:test";
import { ActionError } from "./action-http";
import {
  clearVoiceSection,
  getVoiceSettings,
  synthesizeSpeech,
  transcribeVoice,
  updateVoiceSettings,
} from "./voice-actions";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const settings = {
  asr: { baseUrl: "https://api.siliconflow.cn/v1", model: "FunAudioLLM/SenseVoiceSmall" },
  tts: {
    baseUrl: "https://api.siliconflow.cn/v1",
    model: "FunAudioLLM/CosyVoice2-0.5B",
    voice: "FunAudioLLM/CosyVoice2-0.5B:alex",
  },
  updatedAt: 1700000000,
};

test("getVoiceSettings parses the settings", async () => {
  const result = await getVoiceSettings(async () => json({ settings }));
  assert.equal(result.asr?.model, "FunAudioLLM/SenseVoiceSmall");
  assert.equal(result.tts?.voice, "FunAudioLLM/CosyVoice2-0.5B:alex");
});

test("updateVoiceSettings posts the input and returns settings", async () => {
  let seenBody = "";
  const fetcher: typeof fetch = async (_input, init) => {
    seenBody = String(init?.body);
    return json({ settings });
  };
  const result = await updateVoiceSettings(
    { asr: { baseUrl: "https://api.siliconflow.cn/v1", model: "m1" } },
    fetcher,
  );
  assert.deepEqual(JSON.parse(seenBody), {
    asr: { baseUrl: "https://api.siliconflow.cn/v1", model: "m1" },
  });
  assert.equal(result.updatedAt, 1700000000);
});

test("clearVoiceSection sends null for the target section", async () => {
  let seenBody = "";
  const fetcher: typeof fetch = async (_input, init) => {
    seenBody = String(init?.body);
    return json({ settings });
  };
  await clearVoiceSection("tts", fetcher);
  assert.deepEqual(JSON.parse(seenBody), { tts: null });
});

test("transcribeVoice posts a FormData file and returns text", async () => {
  let seenBody: unknown;
  const fetcher: typeof fetch = async (_input, init) => {
    seenBody = init?.body;
    return json({ text: "你好" });
  };
  const text = await transcribeVoice(new File(["audio"], "a.webm", { type: "audio/webm" }), fetcher);
  assert.ok(seenBody instanceof FormData);
  assert.equal((seenBody as FormData).has("file"), true);
  assert.equal(text, "你好");
});

test("synthesizeSpeech returns audio bytes and content type", async () => {
  const audio = new Uint8Array([1, 2, 3]).buffer;
  const result = await synthesizeSpeech(
    "你好",
    async () =>
      new Response(audio, {
        headers: { "content-type": "audio/mpeg" },
      }),
  );
  assert.equal(result.audio.byteLength, 3);
  assert.equal(result.contentType, "audio/mpeg");
});

for (const [status, code] of [
  [401, "unauthenticated"],
  [502, "unavailable"],
] as const) {
  test(`synthesizeSpeech maps HTTP ${status} to ${code}`, async () => {
    await assert.rejects(
      synthesizeSpeech("你好", async () => json({ error: "失败" }, status)),
      (error: unknown) => error instanceof ActionError && error.code === code && error.status === status,
    );
  });
}
