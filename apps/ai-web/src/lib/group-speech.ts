// 群聊流式输出的前缀剥离：模型偶尔会模仿历史消息里的「角色名：」格式，
// 这里在显示前去掉开头标注，避免消息内容里出现“星河旅者：”这类重复。

export type SpeakerPrefixStripper = {
  push(chunk: string): string;
};

export function createSpeakerPrefixStripper(speakerName: string): SpeakerPrefixStripper {
  const name = speakerName.trim();
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `^\\s*(?:[（(【\\[]\\s*)?${escaped}\\s*(?:[）)】\\]]\\s*[:：]?\\s*|[:：]\\s*)?`,
  );
  let buffer = "";
  let done = false;

  return {
    push(chunk) {
      if (!chunk || done) return chunk;
      buffer += chunk;
      const normalized = buffer.replace(/\s/g, "");
      const stillPossible =
        name.startsWith(normalized) ||
        normalized.startsWith(name) ||
        /^[（(【\[]?$/.test(normalized);
      if (buffer.length < name.length + 4 && stillPossible) return "";
      done = true;
      const match = buffer.match(pattern);
      return match ? buffer.slice(match[0].length) : buffer;
    },
  };
}

function escapePattern(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function containsOtherSpeakerSpeech(
  content: string,
  selfName: string,
  otherNames: string[],
): boolean {
  const others = otherNames.filter((name) => name !== selfName && name.trim().length > 0);
  if (others.length === 0) return false;
  const pattern = new RegExp(
    `(?:^|\\n)\\s*(?:[（(【\\[]\\s*)?(${others.map((name) => escapePattern(name.trim())).join("|")})\\s*[）)】\\]]?[:：]`,
  );
  return pattern.test(content);
}
