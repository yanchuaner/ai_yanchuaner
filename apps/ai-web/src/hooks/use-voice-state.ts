// BYOK 语音状态边界：ASR/TTS 设置、转写与朗读。

import { useRef, useState } from "react";
import { resolveActionError } from "@/lib/action-error-utils";
import * as voiceActions from "@/lib/voice-actions";
import type { VoiceSettingsInput, VoiceSettingsView } from "@/lib/voice-actions";

type UseVoiceStateOptions = {
  onUnauthenticated: () => void;
};

export function useVoiceState({ onUnauthenticated }: UseVoiceStateOptions) {
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettingsView | null>(null);
  const [voiceForm, setVoiceForm] = useState({
    asrBaseUrl: "",
    asrModel: "",
    asrKey: "",
    ttsBaseUrl: "",
    ttsModel: "",
    ttsVoice: "",
    ttsKey: "",
  });
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voiceResult, setVoiceResult] = useState("");
  const [voiceError, setVoiceError] = useState("");
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  async function loadVoiceSettings() {
    try {
      const settings = await voiceActions.getVoiceSettings();
      setVoiceSettings(settings);
      setVoiceForm({
        asrBaseUrl: settings.asr?.baseUrl ?? "https://api.siliconflow.cn/v1",
        asrModel: settings.asr?.model ?? "FunAudioLLM/SenseVoiceSmall",
        asrKey: "",
        ttsBaseUrl: settings.tts?.baseUrl ?? "https://api.siliconflow.cn/v1",
        ttsModel: settings.tts?.model ?? "FunAudioLLM/CosyVoice2-0.5B",
        ttsVoice: settings.tts?.voice ?? "FunAudioLLM/CosyVoice2-0.5B:alex",
        ttsKey: "",
      });
    } catch (error) {
      resolveActionError(error, onUnauthenticated);
    }
  }

  async function saveVoiceSettings() {
    setVoiceBusy(true);
    setVoiceError("");
    setVoiceResult("");
    const payload: VoiceSettingsInput = {};
    if (voiceForm.asrBaseUrl.trim() || voiceForm.asrModel.trim() || voiceForm.asrKey) {
      payload.asr = {
        baseUrl: voiceForm.asrBaseUrl.trim(),
        model: voiceForm.asrModel.trim(),
        apiKey: voiceForm.asrKey || undefined,
      };
    }
    if (voiceForm.ttsBaseUrl.trim() || voiceForm.ttsModel.trim() || voiceForm.ttsVoice.trim() || voiceForm.ttsKey) {
      payload.tts = {
        baseUrl: voiceForm.ttsBaseUrl.trim(),
        model: voiceForm.ttsModel.trim(),
        voice: voiceForm.ttsVoice.trim() || undefined,
        apiKey: voiceForm.ttsKey || undefined,
      };
    }
    try {
      const settings = await voiceActions.updateVoiceSettings(payload);
      setVoiceSettings(settings);
      setVoiceResult("语音设置已保存。");
      setVoiceForm((current) => ({ ...current, asrKey: "", ttsKey: "" }));
    } catch (error) {
      const message = resolveActionError(error, onUnauthenticated);
      setVoiceError(message ?? "保存语音设置失败。");
    } finally {
      setVoiceBusy(false);
    }
  }

  async function clearVoiceSection(section: "asr" | "tts") {
    setVoiceBusy(true);
    setVoiceError("");
    setVoiceResult("");
    try {
      const settings = await voiceActions.clearVoiceSection(section);
      setVoiceSettings(settings);
      setVoiceResult("语音设置已清除。");
      setVoiceForm((current) => ({
        ...current,
        ...(section === "asr"
          ? { asrBaseUrl: "", asrModel: "", asrKey: "" }
          : { ttsBaseUrl: "", ttsModel: "", ttsVoice: "", ttsKey: "" }),
      }));
    } catch (error) {
      const message = resolveActionError(error, onUnauthenticated);
      setVoiceError(message ?? "清除失败。");
    } finally {
      setVoiceBusy(false);
    }
  }

  function transcribeVoice(file: File): Promise<string> {
    return voiceActions.transcribeVoice(file);
  }

  async function speakVoice(messageId: string, text: string) {
    setSpeakingId(messageId);
    try {
      // 在用户手势内创建并唤醒 AudioContext，避免浏览器自动播放策略拦截。
      const audioContext = audioContextRef.current ?? new AudioContext();
      audioContextRef.current = audioContext;
      if (audioContext.state === "suspended") await audioContext.resume();
      const { audio } = await voiceActions.synthesizeSpeech(text);
      const decoded = await audioContext.decodeAudioData(audio);
      const source = audioContext.createBufferSource();
      source.buffer = decoded;
      source.connect(audioContext.destination);
      source.onended = () => setSpeakingId(null);
      source.start();
    } catch (error) {
      setSpeakingId(null);
      throw error instanceof Error ? error : new Error("语音朗读失败。");
    }
  }

  return {
    voiceSettings,
    voiceForm,
    setVoiceForm,
    voiceBusy,
    voiceResult,
    voiceError,
    speakingId,
    loadVoiceSettings,
    saveVoiceSettings,
    clearVoiceSection,
    transcribeVoice,
    speakVoice,
  };
}
