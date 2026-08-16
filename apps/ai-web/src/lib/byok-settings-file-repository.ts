import {
  clearMediaSettings,
  getMediaSettings,
  updateMediaSettings,
} from "@/lib/media-settings";
import { getVoiceSettings, updateVoiceSettings } from "@/lib/voice-settings";
import type { ByokSettingsRepository } from "@/lib/byok-settings-repository";

export function createFileByokSettingsRepository(
  masterSecret: string,
  allowInsecure: boolean,
): ByokSettingsRepository {
  return {
    getMedia: (userId) => getMediaSettings(userId),
    updateMedia: (userId, input) => updateMediaSettings(userId, masterSecret, input, allowInsecure),
    clearMedia: (userId) => clearMediaSettings(userId),
    getVoice: (userId) => getVoiceSettings(userId),
    updateVoice: (userId, input) => updateVoiceSettings(userId, masterSecret, input, allowInsecure),
    clearVoiceSection: (userId, section) =>
      updateVoiceSettings(userId, masterSecret, { [section]: null }, allowInsecure),
  };
}
