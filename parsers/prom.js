const stringSimilarity = require("string-similarity");
const {
  buildSearchQuery,
  filterByModelMatch,
  normalizeSearchText,
  isAccessoryBundle,
} = require("./search-utils");
const logger = require("../logger");

const EMPTY_RESULTS_RE = /нічого не знайдено|не знайдено|не найдено|ничего не найдено/i;

module.exports = {
  name: "Prom",
  url: (component) =>
    `https://prom.ua/ua/search?search_term=${encodeURIComponent(
      buildSearchQuery(component)
    )}&a10006=83770&binary_filters=presence_available`,
  selectors: {
    item: '[data-qaid="product_block"]',
    name: '[data-qaid="product_name"]',
    price: '[data-qaid="product_price"]',
    availability: '[data-qaid="product_presence"]',
    link: 'a[data-qaid="product_link"]',
  },

  parseSite: async function (page, component) {
    try {
      await page.goto(this.url(component), {
        waitUntil: "domcontentloaded",
        timeout: 15000,
      });

      const hasResults = await waitForPromResults(page, this.selectors.item, 10000);
      if (!hasResults) {
        return { siteName: this.name, productItems: [notFound()] };
      }

      const productItems = await page.evaluate(
        ({ item, name, price, availability, link }) => {
          return Array.from(document.querySelectorAll(item)).map((el) => ({
            name: el.querySelector(name)?.innerText.trim() || "",
            price: el.querySelector(price)?.innerText.trim() || "Ціна не знайдена",
            link: el.querySelector(link)?.href || el.querySelector("a")?.href || "Посилання не знайдено",
            availability:
              el.querySelector(availability)?.innerText.trim() ||
              "Наявність не вказана",
          }));
        },
        this.selectors
      );

      return {
        siteName: this.name,
        productItems: productItems.length
          ? [findBestMatch(component, productItems)]
          : [notFound()],
      };
    } catch (err) {
      logger.logError(`Помилка парсингу ${component} на ${this.name}`, { message: err.message });
      return { siteName: this.name, productItems: [notFound()], error: err.message };
    }
  },
};

async function waitForPromResults(page, itemSelector, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const state = await page.evaluate((sel, emptyReSource) => {
      const emptyRe = new RegExp(emptyReSource, "i");
      return {
        blocks: document.querySelectorAll(sel).length,
        empty: emptyRe.test(document.body.innerText),
      };
    }, itemSelector, EMPTY_RESULTS_RE.source);

    if (state.blocks > 0) return true;
    if (state.empty) return false;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

const removeParenthesesContent = (text) =>
  text.replace(/\s*\(.*?\)\s*/g, " ").trim();

const normalizeText = (text) => text.replace(/\s+/g, "").toLowerCase();

const parsePrice = (priceText) => {
  const cleaned = priceText.replace(/[^0-9.,]/g, "").replace(/\s+/g, "");
  const normalized = cleaned.replace(",", ".");
  return parseFloat(normalized);
};

const findBestMatch = (component, productItems) => {
  const normalizedComponent = normalizeSearchText(buildSearchQuery(component));

  const exactMatches = filterByModelMatch(component, productItems).filter(
    (prod) => !isAccessoryBundle(prod.name, component)
  );
  if (!exactMatches.length) {
    return notFound();
  }

  const ranked = exactMatches
    .map((prod) => {
      const nameForCompare = removeParenthesesContent(prod.name);
      const similarity = stringSimilarity.compareTwoStrings(
        normalizedComponent,
        normalizeText(nameForCompare)
      );
      return { prod, similarity };
    })
    .filter((item) => item.similarity >= 0.55)
    .sort((a, b) => b.similarity - a.similarity);

  if (!ranked.length) {
    return notFound();
  }

  const cheapest = ranked.reduce((best, current) => {
    const bestPrice = parsePrice(best.prod.price);
    const currPrice = parsePrice(current.prod.price);
    if (isNaN(bestPrice)) return current;
    if (isNaN(currPrice)) return best;
    return currPrice < bestPrice ? current : best;
  });

  return { site: "Prom", ...cheapest.prod };
};

const notFound = () => ({
  site: "Prom",
  name: "Товар не знайдено",
  price: "Ціна не знайдена",
  link: "Посилання не знайдено",
  availability: "Немає даних",
});
