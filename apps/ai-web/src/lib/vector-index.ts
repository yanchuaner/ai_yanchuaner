// 向量检索：预览阶段用内存余弦相似度，后续可替换为 pgvector 等实现。

export type VectorItem = {
  id: string;
  vector: number[];
};

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
    normA += a[index] * a[index];
    normB += b[index] * b[index];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function searchVectors(
  query: number[],
  items: VectorItem[],
  topK: number,
  threshold: number,
): { id: string; score: number }[] {
  return items
    .map((item) => ({ id: item.id, score: cosineSimilarity(query, item.vector) }))
    .filter((item) => item.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
