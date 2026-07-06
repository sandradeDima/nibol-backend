export const escapeHtml = (value) => {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
};
export const toParagraphHtml = (value) => {
    return value
        .split(/\n+/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((line) => `<p style="margin: 0 0 16px;">${escapeHtml(line)}</p>`)
        .join("");
};
export const greeting = (userName) => {
    return userName.trim() ? `Hola ${userName.trim()},` : "Hola,";
};
export const joinTextBlocks = (...blocks) => {
    return blocks.filter((block) => Boolean(block?.trim())).join("\n\n");
};
//# sourceMappingURL=utils.js.map