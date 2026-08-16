import {
  clearMediaSettings,
  getDecryptedMediaProvider,
  getMediaSettings,
  updateMediaSettings,
} from "@/lib/media-settings";
import { getDecryptedVoiceProvider, getVoiceSettings, updateVoiceSettings } from "@/lib/voice-settings";
import type { ByokSettingsRepository } from "@/lib/byok-settings-repository";

export function createFileByokSettingsRepository(
  masterSecret: string,
  allowInsecure: boolean,
): ByokSettingsRepository {
  return {
    getMedia: (userId) => getMediaSettings(userId),
    updateMedia: (userId, input) => updateMediaSettings(userId, masterSecret, input, allowInsecure),
    clearMedia: (userId) => clearMediaSettings(userId),
    getDecryptedMedia: (userId) => getDecryptedMediaProvider(userId, masterSecret),
    getVoice: (userId) => getVoiceSettings(userId),
    updateVoice: (userId, input) => updateVoiceSettings(userId, masterSecret, input, allowInsecure),
    getDecryptedVoice: (userId, section) => getDecryptedVoiceProvider(userId, section, masterSecret),
    clearVoiceSection: (userId, section) =>
      updateVoiceSettings(userId, masterSecret, { [section]: null }, allowInsecure),
  };
}
