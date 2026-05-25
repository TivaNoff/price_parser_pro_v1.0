const fs = require("fs");
const path = require("path");

const LOG_DIR = path.join(__dirname, "logs");
let logStream = null;
let currentLogPath = null;

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function formatLine(level, message, meta) {
  const ts = new Date().toISOString();
  const metaStr =
    meta && Object.keys(meta).length > 0 ? ` | ${JSON.stringify(meta)}` : "";
  return `[${ts}] [${level.toUpperCase()}] ${message}${metaStr}\n`;
}

function write(level, message, meta) {
  if (!logStream) return;
  logStream.write(formatLine(level, message, meta));
}

function startParseLog() {
  ensureLogDir();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  currentLogPath = path.join(LOG_DIR, `parse-${stamp}.log`);
  logStream = fs.createWriteStream(currentLogPath, { flags: "a", encoding: "utf8" });
  write("info", "=== Старт сесії парсингу ===");
  return currentLogPath;
}

function endParseLog() {
  if (!logStream) return;
  write("info", "=== Кінець сесії парсингу ===");
  logStream.end();
  logStream = null;
}

function logInfo(message, meta) {
  write("info", message, meta);
}

function logWarn(message, meta) {
  write("warn", message, meta);
}

function logError(message, meta) {
  write("error", message, meta);
}

function getLogPath() {
  return currentLogPath;
}

module.exports = {
  startParseLog,
  endParseLog,
  logInfo,
  logWarn,
  logError,
  getLogPath,
  LOG_DIR,
};
