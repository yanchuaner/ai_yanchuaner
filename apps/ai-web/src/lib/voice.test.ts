import assert from "node:assert/strict";
import test from "node:test";
import { forwardSpeechToText, forwardTextToSpeech } from "./voice";

const settings = {
  baseUrl: "https://api.openai.com/v1",
  model: "whisper-1",
  voice: "FunAudioLLM/CosyVoice2-0.5B:alex",
  apiKey: "sk-voice-secret",
};

test("speech-to-text forwards the user key in headers only", async () => {
  let seenUrl = "";
  let seenAuthorization = "";
  const fetcher: typeof fetch = async (input, init) => {
    seenUrl = String(input);
    seenAuthorization = new Headers(init?.headers).get("authorization") ?? "";
    return Response.json({ text: "转写结果" });
  };
  const text = await forwardSpeechToText(
    settings,
    { bytes: new Uint8Array([1, 2, 3]).buffer, name: "voice.webm", type: "audio/webm" },
    fetcher,
  );
  assert.equal(text, "转写结果");
  assert.equal(seenUrl, "https://api.openai.com/v1/audio/transcriptions");
  assert.equal(seenAuthorization, "Bearer sk-voice-secret");
});

test("speech-to-text rejects invalid responses", async () => {
  await assert.rejects(
    () =>
      forwardSpeechToText(
        settings,
        { bytes: new Uint8Array([1]).buffer, name: "a.webm", type: "audio/webm" },
        async () => Response.json({ error: "bad" }, { status: 400 }),
      ),
    /语音转写失败/,
  );
  await assert.rejects(
    () =>
      forwardSpeechToText(
        settings,
        { bytes: new Uint8Array([1]).buffer, name: "a.webm", type: "audio/webm" },
        async () => Response.json({ text: "" }),
      ),
    /结果无效/,
  );
});

test("text-to-speech returns audio bytes and content type", async () => {
  let seenUrl = "";
  let seenBody = "";
  const fetcher: typeof fetch = async (input, init) => {
    seenUrl = String(input);
    seenBody = String(init?.body);
    return new Response(new Uint8Array([9, 8, 7]), {
      status: 200,
      headers: { "Content-Type": "audio/mpeg" },
    });
  };
  const result = await forwardTextToSpeech(settings, "你好", fetcher);
  assert.equal(seenUrl, "https://api.openai.com/v1/audio/speech");
  assert.deepEqual(Array.from(new Uint8Array(result.audio)), [9, 8, 7]);
  assert.equal(result.contentType, "audio/mpeg");
  assert.doesNotMatch(seenBody, /sk-voice-secret/);
  assert.deepEqual(JSON.parse(seenBody), {
    model: "whisper-1",
    input: "你好",
    voice: "FunAudioLLM/CosyVoice2-0.5B:alex",
  });
});
