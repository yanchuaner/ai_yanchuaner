// 中文友好的文本分块：先按段落，再按句子切分，最后合并过短的碎片。

export type ChunkOptions = {
  maxChars?: number;
  minChars?: number;
  overlap?: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function chunkText(text: string, options: ChunkOptions = {}): string[] {
  const maxChars = clamp(options.maxChars ?? 600, 200, 2000);
  const minChars = clamp(options.minChars ?? 300, 100, maxChars - 100);
  const overlap = clamp(options.overlap ?? 60, 0, Math.floor(maxChars / 2));
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const raw: string[] = [];

  for (const paragraph of paragraphs) {
    if (paragraph.length <= maxChars) {
      raw.push(paragraph);
      continue;
    }
    const sentences = paragraph
      .split(/(?<=[。！？!?；;])\s*/)
      .map((sentence) => sentence.trim())
      .filter(Boolean);
    let current = "";
    for (const sentence of sentences) {
      if (sentence.length > maxChars) {
        if (current) {
          raw.push(current);
          current = "";
        }
        const step = maxChars - overlap;
        for (let index = 0; index < sentence.length; index += step) {
          raw.push(sentence.slice(index, index + maxChars));
        }
      } else if (current.length + sentence.length > maxChars) {
        raw.push(current);
        current = sentence;
      } else {
        current += sentence;
      }
    }
    if (current) raw.push(current);
  }

  const chunks: string[] = [];
  for (const chunk of raw) {
    const last = chunks[chunks.length - 1];
    if (last && last.length < minChars && last.length + chunk.length <= maxChars) {
      chunks[chunks.length - 1] = last + chunk;
    } else {
      chunks.push(chunk);
    }
  }
  return chunks.map((chunk) => chunk.trim()).filter(Boolean);
}
