import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  getDecryptedVoiceProvider,
  getVoiceSettings,
  updateVoiceSettings,
} from "./voice-settings";

const SECRET = "01234567890123456789012345678901";

async function withDataDir(run: () => Promise<void>) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ai-web-voice-"));
  const previous = process.env.AI_WEB_DATA_DIR;
  process.env.AI_WEB_DATA_DIR = dir;
  try {
    await run();
  } finally {
    if (previous === undefined) delete process.env.AI_WEB_DATA_DIR;
    else process.env.AI_WEB_DATA_DIR = previous;
    await rm(dir, { recursive: true, force: true });
  }
}

test("voice settings store encrypted keys and never return them", async () => {
  await withDataDir(async () => {
    const saved = await updateVoiceSettings(
      7,
      SECRET,
      {
        asr: { baseUrl: "https://api.openai.com/v1", model: "whisper-1", apiKey: "sk-asr-secret" },
        tts: {
          baseUrl: "https://api.openai.com/v1",
          model: "tts-1",
          voice: "FunAudioLLM/CosyVoice2-0.5B:alex",
          apiKey: "sk-tts-secret",
        },
      },
      false,
    );
    assert.equal(saved.asr?.model, "whisper-1");
    assert.equal(saved.asr?.baseUrl, "https://api.openai.com/v1");
    assert.equal(saved.tts?.voice, "FunAudioLLM/CosyVoice2-0.5B:alex");
    assert.equal(JSON.stringify(saved).includes("sk-"), false);

    const asr = await getDecryptedVoiceProvider(7, "asr", SECRET);
    assert.equal(asr?.apiKey, "sk-asr-secret");
    assert.equal((await getDecryptedVoiceProvider(8, "asr", SECRET)), null);

    // 不传 Key 时保留原 Key，传 null 清除整段配置
    await updateVoiceSettings(
      7,
      SECRET,
      { asr: { baseUrl: "https://api.openai.com/v1", model: "whisper-1" } },
      false,
    );
    assert.equal((await getDecryptedVoiceProvider(7, "asr", SECRET))?.apiKey, "sk-asr-secret");
    await updateVoiceSettings(7, SECRET, { tts: null }, false);
    assert.equal((await getVoiceSettings(7)).tts, null);
  });
});

test("voice settings reject insecure or invalid providers", async () => {
  await withDataDir(async () => {
    await assert.rejects(
      () =>
        updateVoiceSettings(
          7,
          SECRET,
          { asr: { baseUrl: "http://192.168.1.1/v1", model: "whisper-1", apiKey: "sk" } },
          false,
        ),
      /HTTPS/,
    );
    await assert.rejects(
      () =>
        updateVoiceSettings(
          7,
          SECRET,
          { asr: { baseUrl: "https://api.example.com/v1", model: "", apiKey: "sk" } },
          false,
        ),
      /模型名称/,
    );
    const ok = await updateVoiceSettings(
      7,
      SECRET,
      { asr: { baseUrl: "http://127.0.0.1:4010", model: "whisper-1", apiKey: "sk" } },
      true,
    );
    assert.equal(ok.asr?.baseUrl, "http://127.0.0.1:4010");
  });
});
