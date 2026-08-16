// BYOK 设置仓储端口：媒体与语音设置，凭据擦除语义由实现保证。

import type { MediaSettingsInput, MediaSettingsView } from "@/lib/media-settings";
import type { VoiceSettingsInput, VoiceSettingsView } from "@/lib/voice-settings";

export type ByokSettingsRepository = {
  getMedia(userId: number): Promise<MediaSettingsView | null>;
  updateMedia(userId: number, input: MediaSettingsInput): Promise<MediaSettingsView | null>;
  clearMedia(userId: number): Promise<void>;
  getVoice(userId: number): Promise<VoiceSettingsView>;
  updateVoice(userId: number, input: VoiceSettingsInput): Promise<VoiceSettingsView>;
  clearVoiceSection(userId: number, section: "asr" | "tts"): Promise<VoiceSettingsView>;
};
