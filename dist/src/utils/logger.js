const logPriority = {
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
};
const rawConfiguredLevel = process.env.LOG_LEVEL;
const configuredLevel = rawConfiguredLevel === "debug" ||
    rawConfiguredLevel === "info" ||
    rawConfiguredLevel === "warn" ||
    rawConfiguredLevel === "error"
    ? rawConfiguredLevel
    : "info";
const shouldLog = (level) => {
    return logPriority[level] >= (logPriority[configuredLevel] ?? logPriority.info);
};
const formatMessage = (level, message, meta) => {
    const metadata = meta === undefined ? "" : ` ${JSON.stringify(meta)}`;
    return `[${new Date().toISOString()}] ${level.toUpperCase()} ${message}${metadata}`;
};
const log = (level, message, meta) => {
    if (!shouldLog(level)) {
        return;
    }
    writers[level](formatMessage(level, message, meta));
};
export const logger = {
    debug: (message, meta) => log("debug", message, meta),
    info: (message, meta) => log("info", message, meta),
    warn: (message, meta) => log("warn", message, meta),
    error: (message, meta) => log("error", message, meta),
};
//# sourceMappingURL=logger.js.map