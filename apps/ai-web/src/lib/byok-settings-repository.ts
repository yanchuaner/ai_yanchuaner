// BYOK 设置仓储端口：媒体与语音设置，凭据擦除语义由实现保证。

import type { MediaSettingsInput, MediaSettingsView } from "@/lib/media-settings";
import type { VoiceSettingsInput, VoiceSettingsView } from "@/lib/voice-settings";

export type ByokSettingsRepository = {
  getMedia(userId: number): Promise<MediaSettingsView | null>;
  updateMedia(userId: number, input: MediaSettingsInput): Promise<MediaSettingsView | null>;
  clearMedia(userId: number): Promise<void>;
  getDecryptedMedia(userId: number): Promise<{ baseUrl: string; visionModel: string; imageModel: string; apiKey: string } | null>;
  getVoice(userId: number): Promise<VoiceSettingsView>;
  updateVoice(userId: number, input: VoiceSettingsInput): Promise<VoiceSettingsView>;
  getDecryptedVoice(
    userId: number,
    section: "asr" | "tts",
  ): Promise<{ baseUrl: string; model: string; voice?: string; apiKey: string } | null>;
  clearVoiceSection(userId: number, section: "asr" | "tts"): Promise<VoiceSettingsView>;
};
