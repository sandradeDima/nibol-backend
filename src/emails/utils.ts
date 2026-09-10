export const escapeHtml = (value: string): string => {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
};

export const resolveEmailAppName = (value?: string): string => {
  const candidate = value?.trim();
  if (
    !candidate ||
    /saas base project|starter template|base project|generic saas/i.test(
      candidate,
    )
  ) {
    return "NIBOL Bolivia";
  }
  return candidate;
};

export const emailSemanticBadgeStyle = (value: string): string => {
  const normalized = value.trim().toLowerCase();

  if (normalized.includes("alto") || normalized.includes("rechaz")) {
    return "background:#fee2e2;color:#991b1b";
  }
  if (
    normalized.includes("medio") ||
    normalized.includes("pendiente") ||
    normalized.includes("devuelt") ||
    normalized.includes("iniciad")
  ) {
    return "background:#fef3c7;color:#92400e";
  }
  if (
    normalized.includes("bajo") ||
    normalized.includes("aprobad") ||
    normalized.includes("concluid")
  ) {
    return "background:#dcfce7;color:#166534";
  }
  if (normalized.includes("avance") || normalized.includes("revisi")) {
    return "background:#dbeafe;color:#1d4ed8";
  }
  return "background:#e7edf5;color:#334155";
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
  return userName.trim() ? `Hola ${userName.trim()},` : "Hola,";
};

export const joinTextBlocks = (
  ...blocks: Array<string | undefined>
): string => {
  return blocks
    .filter((block): block is string => Boolean(block?.trim()))
    .join("\n\n");
};
