const UNKNOWN_STATUSES = new Set(["Немає даних", "Наявність не вказана"]);

const POSITIVE_PATTERNS = [
  /^в\s*наявності$/i,
  /^є\s*в\s*наявності$/i,
  /^\d+\s*шт\.?$/i,
];

const NEGATIVE_PATTERNS = [
  /немає\s*в\s*наявності/i,
  /^немає$/i,
  /^продано$/i,
  /^під\s*замовлення$/i,
  /закінч/i,
  /очікується/i,
  /out\s*of\s*stock/i,
  /outstock/i,
  /недоступ/i,
];

function looksLikePrice(text) {
  return /^\d[\d\s.,]*\s*грн\.?$/i.test(text.trim());
}

function normalizeAvailability(text) {
  if (!text || typeof text !== "string") return "Наявність не вказана";

  const trimmed = text.trim();
  if (!trimmed) return "Наявність не вказана";
  if (UNKNOWN_STATUSES.has(trimmed)) return trimmed;
  if (looksLikePrice(trimmed)) return "Наявність не вказана";

  const lower = trimmed.toLowerCase();

  if (
    NEGATIVE_PATTERNS.some((pattern) => pattern.test(trimmed)) ||
    /немає\s*в\s*наявності|продано|замовлення|outstock|out.?of.?stock|недоступ/i.test(lower)
  ) {
    return "Немає в наявності";
  }

  if (
    POSITIVE_PATTERNS.some((pattern) => pattern.test(trimmed)) ||
    /в\s*наявності|\d+\s*шт|instock/i.test(lower)
  ) {
    return "В наявності";
  }

  return "Наявність не вказана";
}

module.exports = { normalizeAvailability };
