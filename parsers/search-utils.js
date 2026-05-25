const TRIGGERS = [
  "Оперативна пам'ять",
  "Диск NVMe",
  "Жорсткий диск",
  "Накопичувач SSD",
];

const CATEGORY_PREFIX =
  /^(процессор|процесор|відеокарта|материнська\s+плата|сервер|робоча\s+станція|накопичувач|жорсткий\s+диск|диск\s+nvme|оперативна\s+пам'ять)\s+/i;

function normalizeForSearch(text) {
  return String(text || "")
    .replace(/[®™]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildSearchQuery(component) {
  if (TRIGGERS.some((trigger) => component.startsWith(trigger))) {
    const match = component.match(/\(([^)]+)\)/);
    return normalizeForSearch(match ? match[1] : component);
  }

  let query = component.replace(/\([^)]*\)/g, " ");
  query = normalizeForSearch(query.replace(CATEGORY_PREFIX, ""));
  return query;
}

function extractModelKey(name) {
  const text = normalizeForSearch(name).toLowerCase();

  const epyc = text.match(/\bepyc\s*(\d+[a-z0-9]*)\b/i);
  if (epyc) return `epyc-${epyc[1].toLowerCase()}`;

  const xeonE = text.match(/\be([357])-(\d{4})([a-z])?\b/i);
  if (xeonE) {
    const suffix = xeonE[3] ? xeonE[3].toLowerCase() : "";
    return `e${xeonE[1]}-${xeonE[2]}${suffix}`;
  }

  const xeonTier = text.match(/\bxeon\s+(platinum|gold|silver|bronze)\s+(\d+\+?)\b/i);
  if (xeonTier) return `${xeonTier[1].toLowerCase()}-${xeonTier[2].toLowerCase()}`;

  const xeonD = text.match(/\bxeon\s+d-(\d+)\b/i) || text.match(/\bd-(\d+)\b/i);
  if (xeonD) return `d-${xeonD[1]}`;

  const core = text.match(/\bcore\s+(i[357]-\d+[a-z]?)\b/i) || text.match(/\b(i[357]-\d+[a-z]?)\b/i);
  if (core) return core[1].toLowerCase();

  const ryzen = text.match(/\bryzen\s+(\d+\s+\d+[a-z0-9]*|\d+[a-z0-9]*)\b/i);
  if (ryzen) return `ryzen-${ryzen[1].replace(/\s+/g, "")}`;

  return null;
}

function extractVersion(name) {
  const text = normalizeForSearch(name).toLowerCase();
  const spaced = text.match(/\bv(\d+)\b/);
  if (spaced) return spaced[1];

  const compact = text.match(/(?:xeon|core|epyc|ryzen|e[357])[\s-]*(?:\d+[a-z]?[\s-]*)?v(\d+)\b/);
  return compact ? compact[1] : null;
}

function filterByModelMatch(component, productItems) {
  const modelKey = extractModelKey(component);
  if (!modelKey) return productItems;
  return productItems.filter((prod) => modelMatches(component, prod.name));
}

function normalizeSearchText(text) {
  return normalizeForSearch(text).toLowerCase();
}

function isAccessoryBundle(name, component) {
  const product = normalizeSearchText(name);
  const query = normalizeSearchText(component);
  const isCpuQuery = /процессор|процесор|xeon|epyc|core\s+i[357]|ryzen/.test(query);
  if (!isCpuQuery) return false;
  return /комплект|материнськ|материнская|bundle|контролер|корпус|салазк|backplane|raid|оперативн|ssd|hdd|nvme/.test(product);
}

function modelMatches(queryName, productName) {
  const queryKey = extractModelKey(queryName);
  if (!queryKey) return true;

  const productKey = extractModelKey(productName);
  if (!productKey || queryKey !== productKey) return false;

  const queryVersion = extractVersion(queryName);
  if (!queryVersion) return true;

  const productVersion = extractVersion(productName);
  return productVersion === queryVersion;
}

function isCloudflareChallenge(pageText) {
  const text = String(pageText || "").toLowerCase();
  return (
    text.includes("checking your browser") ||
    text.includes("just a moment") ||
    text.includes("ray id") ||
    text.includes("cf-browser-verification") ||
    text.includes("выполнение проверки безопасности") ||
    text.includes("перевірку безпеки") ||
    text.includes("performance & security by cloudflare") ||
    text.includes("your request was blocked") ||
    text.includes("access denied") ||
    text.includes("запит заблоковано")
  );
}

module.exports = {
  buildSearchQuery,
  extractModelKey,
  extractVersion,
  modelMatches,
  filterByModelMatch,
  normalizeSearchText,
  isAccessoryBundle,
  isCloudflareChallenge,
  TRIGGERS,
};
