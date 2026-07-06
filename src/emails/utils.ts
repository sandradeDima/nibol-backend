export const escapeHtml = (value: string): string => {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
};

export const toParagraphHtml = (value: string): string => {
  return value
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => `<p style="margin: 0 0 16px;">${escapeHtml(line)}</p>`)
    .join("");
};

export const greeting = (userName: string): string => {
  return userName.trim() ? `Hi ${userName.trim()},` : "Hi,";
};

export const joinTextBlocks = (...blocks: Array<string | undefined>): string => {
  return blocks.filter((block): block is string => Boolean(block?.trim())).join("\n\n");
};
