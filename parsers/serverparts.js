const stringSimilarity = require("string-similarity");
const { loadSearchPage } = require("./page-utils");
const {
  buildSearchQuery,
  filterByModelMatch,
  normalizeSearchText,
  isAccessoryBundle,
} = require("./search-utils");
const logger = require("../logger");

module.exports = {
  name: "ServerParts",
  url: (component) =>
    `https://serverparts.com.ua/search/?search=${encodeURIComponent(buildSearchQuery(component))}`,
  selectors: {
    container: ".row-flex",
    item: ".product-thumb",
    name: ".product-name",
    price: ".price_value",
    availability: ".stock-status",
  },

  parseSite: async function parseSite(page, component) {
    try {
      await page.setExtraHTTPHeaders({ "Cache-Control": "no-cache" });
      await loadSearchPage(page, this.url(component), this.selectors.item);

      const productItems = await page.evaluate(({ item, name, price, availability }) => {
        return Array.from(document.querySelectorAll(item)).map((el) => ({
          name: el.querySelector(name)?.innerText?.trim() || "Назва не знайдена",
          price: el.querySelector(price)?.innerText?.trim() || "Ціна не знайдена",
          link: el.querySelector("a")?.href || "Посилання не знайдено",
          availability: el.querySelector(availability)?.innerText?.trim() || "Наявність не вказана",
        }));
      }, this.selectors);

      return { siteName: this.name, productItems: [findBestMatch(component, productItems)] };
    } catch (err) {
      logger.logError(`Помилка парсингу ${component} на ${this.name}`, { message: err.message });
      return {
        siteName: this.name,
        productItems: [notFound()],
        error: err.message,
      };
    }
  },
};

function findBestMatch(component, productItems) {
  if (!productItems.length) return notFound();

  const searchQuery = normalizeSearchText(buildSearchQuery(component));
  const candidates = filterByModelMatch(component, productItems).filter(
    (prod) => !isAccessoryBundle(prod.name, component)
  );

  if (!candidates.length) return notFound();

  for (const prod of candidates) {
    if (normalizeSearchText(prod.name).includes(searchQuery)) {
      return { site: "ServerParts", ...prod };
    }
  }

  const best = candidates.reduce(
    (best, prod) => {
      const similarity = stringSimilarity.compareTwoStrings(searchQuery, normalizeSearchText(prod.name));
      return similarity > best.similarity ? { prod, similarity } : best;
    },
    { prod: null, similarity: 0 }
  );

  return best.prod && best.similarity >= 0.55
    ? { site: "ServerParts", ...best.prod }
    : notFound();
}

function notFound() {
  return {
    site: "ServerParts",
    name: "Товар не знайдено",
    price: "Ціна не знайдена",
    link: "Посилання не знайдено",
    availability: "Немає даних",
  };
}
