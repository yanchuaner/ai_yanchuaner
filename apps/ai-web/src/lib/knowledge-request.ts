import { NextRequest } from "next/server";

export type KnowledgeRequestData = {
  name: string;
  text: string;
  source: "paste" | "file";
};

const MAX_DOCUMENT_BYTES = 1024 * 1024;

export async function parseKnowledgeRequest(
  request: NextRequest,
): Promise<{ data?: KnowledgeRequestData; error?: string }> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) return { error: "请选择要上传的文件。" };
    if (!/\.(txt|md|markdown)$/i.test(file.name)) {
      return { error: "仅支持 txt 或 Markdown 文件。" };
    }
    if (file.size > MAX_DOCUMENT_BYTES) {
      return { error: "文件过大，最大支持 1 MB。" };
    }
    return { data: { name: file.name, text: await file.text(), source: "file" } };
  }
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.text !== "string") {
    return { error: "请填写资料内容。" };
  }
  return {
    data: {
      name: typeof body.name === "string" && body.name.trim() ? body.name : "粘贴资料",
      text: body.text,
      source: "paste",
    },
  };
}
