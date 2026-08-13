// 语音转发：用户自配的 ASR/TTS 服务，凭据只保存在服务端请求头中。

export type VoiceEndpointSettings = {
  baseUrl: string;
  model: string;
  apiKey: string;
};

function audioEndpoint(baseUrl: string, path: string): URL {
  const base = baseUrl.replace(/\/+$/, "");
  const root = base.endsWith("/v1") ? base.slice(0, -3) : base;
  return new URL(`${root}/v1${path}`);
}

export async function forwardSpeechToText(
  settings: VoiceEndpointSettings,
  audio: { bytes: ArrayBuffer; name: string; type: string },
  fetcher: typeof fetch = fetch,
): Promise<string> {
  const form = new FormData();
  form.append("file", new Blob([audio.bytes], { type: audio.type }), audio.name);
  form.append("model", settings.model);
  const response = await fetcher(audioEndpoint(settings.baseUrl, "/audio/transcriptions"), {
    method: "POST",
    redirect: "error",
    headers: { Authorization: `Bearer ${settings.apiKey}` },
    body: form,
  });
  if (!response.ok) throw new Error(`语音转写失败（${response.status}）。`);
  const body = (await response.json()) as { text?: unknown };
  if (typeof body.text !== "string" || !body.text.trim()) throw new Error("语音转写结果无效。");
  return body.text.trim();
}

export async function forwardTextToSpeech(
  settings: VoiceEndpointSettings,
  text: string,
  fetcher: typeof fetch = fetch,
): Promise<{ audio: ArrayBuffer; contentType: string }> {
  const response = await fetcher(audioEndpoint(settings.baseUrl, "/audio/speech"), {
    method: "POST",
    redirect: "error",
    headers: {
      Authorization: `Bearer ${settings.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: settings.model, input: text, voice: "alloy" }),
  });
  if (!response.ok) throw new Error(`语音合成失败（${response.status}）。`);
  const audio = await response.arrayBuffer();
  if (audio.byteLength === 0) throw new Error("语音合成结果为空。");
  return { audio, contentType: response.headers.get("content-type") || "audio/mpeg" };
}
