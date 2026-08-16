import type { MediaSettingsInput, MediaSettingsView } from "@/lib/media-settings";
import type { VoiceSettingsInput, VoiceSettingsView } from "@/lib/voice-settings";
import type { ByokSettingsRepository } from "@/lib/byok-settings-repository";

type MemoryByok = {
  media: MediaSettingsView | null;
  voice: VoiceSettingsView;
};

const stores = new Map<number, MemoryByok>();

function storeFor(userId: number): MemoryByok {
  if (!stores.has(userId)) {
    stores.set(userId, {
      media: null,
      voice: { asr: null, tts: null, updatedAt: 0 },
    });
  }
  return stores.get(userId)!;
}

export function createMemoryByokSettingsRepository(): ByokSettingsRepository {
  return {
    async getMedia(userId) {
      return storeFor(userId).media;
    },
    async updateMedia(userId, input) {
      const store = storeFor(userId);
      const previous = store.media;
      store.media = {
        baseUrl: input.baseUrl ?? previous?.baseUrl ?? "",
        visionModel: input.visionModel ?? previous?.visionModel ?? "",
        imageModel: input.imageModel ?? previous?.imageModel ?? "",
        updatedAt: Date.now(),
      };
      return store.media;
    },
    async clearMedia(userId) {
      storeFor(userId).media = null;
    },
    async getDecryptedMedia() {
      return null;
    },
    async getVoice(userId) {
      return storeFor(userId).voice;
    },
    async updateVoice(userId, input) {
      const store = storeFor(userId);
      const voice: VoiceSettingsView = {
        asr: input.asr === null ? null : input.asr ? { baseUrl: input.asr.baseUrl, model: input.asr.model } : store.voice.asr,
        tts: input.tts === null ? null : input.tts ? { baseUrl: input.tts.baseUrl, model: input.tts.model, voice: input.tts.voice } : store.voice.tts,
        updatedAt: Date.now(),
      };
      store.voice = voice;
      return voice;
    },
    async clearVoiceSection(userId, section) {
      const store = storeFor(userId);
      const voice = { ...store.voice, updatedAt: Date.now() };
      if (section === "asr") voice.asr = null;
      else voice.tts = null;
      store.voice = voice;
      return voice;
    },
    async getDecryptedVoice() {
      return null;
    },
  };
}
