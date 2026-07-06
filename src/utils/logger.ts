type LogLevel = "debug" | "info" | "warn" | "error";

const logPriority: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const writers = {
  debug: console.debug.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
} satisfies Record<LogLevel, (...args: unknown[]) => void>;

const rawConfiguredLevel = process.env.LOG_LEVEL;

const configuredLevel: LogLevel =
  rawConfiguredLevel === "debug" ||
  rawConfiguredLevel === "info" ||
  rawConfiguredLevel === "warn" ||
  rawConfiguredLevel === "error"
    ? rawConfiguredLevel
    : "info";

const shouldLog = (level: LogLevel): boolean => {
  return logPriority[level] >= (logPriority[configuredLevel] ?? logPriority.info);
};

const formatMessage = (level: LogLevel, message: string, meta?: unknown): string => {
  const metadata = meta === undefined ? "" : ` ${JSON.stringify(meta)}`;

  return `[${new Date().toISOString()}] ${level.toUpperCase()} ${message}${metadata}`;
};

const log = (level: LogLevel, message: string, meta?: unknown): void => {
  if (!shouldLog(level)) {
    return;
  }

  writers[level](formatMessage(level, message, meta));
};

export const logger = {
  debug: (message: string, meta?: unknown) => log("debug", message, meta),
  info: (message: string, meta?: unknown) => log("info", message, meta),
  warn: (message: string, meta?: unknown) => log("warn", message, meta),
  error: (message: string, meta?: unknown) => log("error", message, meta),
};
