// BYOK 媒体状态边界：设置、图片选择、画图与视觉理解。

import { useRef, useState } from "react";
import { resolveActionError } from "@/lib/action-error-utils";
import * as mediaActions from "@/lib/media-actions";
import type { MediaSettingsView } from "@/lib/media-actions";

type UseMediaStateOptions = {
  onUnauthenticated: () => void;
};

export function useMediaState({ onUnauthenticated }: UseMediaStateOptions) {
  const [mediaSettings, setMediaSettings] = useState<MediaSettingsView | null>(null);
  const [mediaForm, setMediaForm] = useState({
    baseUrl: "",
    visionModel: "",
    imageModel: "",
    apiKey: "",
  });
  const [mediaBusy, setMediaBusy] = useState(false);
  const [mediaResult, setMediaResult] = useState("");
  const [mediaError, setMediaError] = useState("");
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const imageFileRef = useRef<HTMLInputElement | null>(null);

  async function loadMediaSettings() {
    try {
      const settings = await mediaActions.getMediaSettings();
      setMediaSettings(settings);
      setMediaForm({
        baseUrl: settings?.baseUrl ?? "https://api.siliconflow.cn/v1",
        visionModel: settings?.visionModel ?? "Qwen/Qwen2.5-VL-72B-Instruct",
        imageModel: settings?.imageModel ?? "black-forest-labs/FLUX.1-schnell",
        apiKey: "",
      });
    } catch (error) {
      resolveActionError(error, onUnauthenticated);
    }
  }

  async function saveMediaSettings() {
    setMediaBusy(true);
    setMediaError("");
    setMediaResult("");
    try {
      const settings = await mediaActions.updateMediaSettings({
        baseUrl: mediaForm.baseUrl.trim(),
        visionModel: mediaForm.visionModel.trim(),
        imageModel: mediaForm.imageModel.trim(),
        apiKey: mediaForm.apiKey || undefined,
      });
      setMediaSettings(settings);
      setMediaResult("媒体设置已保存。");
      setMediaForm((current) => ({ ...current, apiKey: "" }));
    } catch (error) {
      const message = resolveActionError(error, onUnauthenticated);
      setMediaError(message ?? "保存媒体设置失败。");
    } finally {
      setMediaBusy(false);
    }
  }

  async function clearMedia() {
    try {
      await mediaActions.clearMediaSettings();
      setMediaSettings(null);
      setMediaResult("媒体设置已清除。");
    } catch (error) {
      const message = resolveActionError(error, onUnauthenticated);
      if (message) setMediaError(message);
    }
  }

  function pickImageFile() {
    imageFileRef.current?.click();
  }

  function handleImageFile(file: File) {
    if (!file.type.startsWith("image/")) return "请选择图片文件。";
    if (file.size > 8 * 1024 * 1024) return "图片不能超过 8 MB。";
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setPendingImage(reader.result);
    };
    reader.readAsDataURL(file);
    return null;
  }

  async function generateImage(prompt: string): Promise<string> {
    setImageBusy(true);
    try {
      return await mediaActions.generateImage(prompt);
    } finally {
      setImageBusy(false);
    }
  }

  function describeImage(image: string, prompt: string): Promise<string> {
    return mediaActions.describeImage(image, prompt);
  }

  return {
    mediaSettings,
    mediaForm,
    setMediaForm,
    mediaBusy,
    mediaResult,
    mediaError,
    pendingImage,
    setPendingImage,
    imageBusy,
    imageFileRef,
    loadMediaSettings,
    saveMediaSettings,
    clearMedia,
    pickImageFile,
    handleImageFile,
    generateImage,
    describeImage,
  };
}
