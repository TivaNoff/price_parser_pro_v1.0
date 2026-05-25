const stringSimilarity = require("string-similarity");
const { loadSearchPage } = require("./page-utils");
const {
  buildSearchQuery,
  filterByModelMatch,
  normalizeSearchText,
  isAccessoryBundle,
  isCloudflareChallenge,
} = require("./search-utils");
const logger = require("../logger");

const NO_RESULTS_RE =
  /нічого не знайдено|ничего не найдено|не знайдено|подходящих результатов не найдено|не найдено/i;

module.exports = {
  name: "Server-Shop",
  url: (component) =>
    `https://server-shop.ua/ua/search.html?query=${encodeURIComponent(buildSearchQuery(component))}`,

  selectors: {
    container: ".catalog_block",
    item: ".catalog_block .item",
    name: ".title_wrap",
    price: ".price_text",
    availability: ".cat_item_stock_status",
    textSmall: ".bottom_links .text-small",
  },

  async parseSite(page, component) {
    try {
      const searchTerm = normalizeSearchText(buildSearchQuery(component));
      const url = this.url(component);
      for (let attempt = 0; attempt < 3; attempt++) {
        await loadSearchPage(page, url, "body", {
          retries: 1,
          retryDelayMs: 3000,
        });

        const pageText = await page.evaluate(() => document.body.innerText);
        if (!isCloudflareChallenge(pageText)) break;

        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 4000 * (attempt + 1)));
        }
      }

      const pageText = await page.evaluate(() => document.body.innerText);
      if (isCloudflareChallenge(pageText)) {
        const errMsg = "Cloudflare challenge — доступ заблоковано";
        logger.logError(`Помилка парсингу ${component} на Server-Shop`, { message: errMsg });
        return { siteName: this.name, productItems: [notFoundItem()], error: errMsg };
      }

      const noResults = NO_RESULTS_RE.test(pageText);
      if (noResults) {
        return { siteName: this.name, productItems: [notFoundItem()] };
      }

      await page.waitForSelector(this.selectors.container, { timeout: 8000 }).catch(() => null);

      const productItems = await page.evaluate((selectors) =>
        Array.from(document.querySelectorAll(selectors.item)).map((item) => ({
          name: item.querySelector(selectors.name)?.innerText.trim() || "",
          price: item.querySelector(selectors.price)?.innerText.trim() || "Ціна не знайдена",
          link: item.querySelector("a")?.href || "Посилання не знайдено",
          availability: item.querySelector(selectors.availability)?.innerText.trim() || "Наявність не вказана",
          textSmall: item.querySelector(selectors.textSmall)?.innerText.trim() || "",
        })),
        this.selectors
      );

      if (!productItems.length) {
        return { siteName: this.name, productItems: [notFoundItem()] };
      }

      return {
        siteName: this.name,
        productItems: [findBestMatchOrContains(component, searchTerm, productItems)],
      };
    } catch (err) {
      logger.logError(`Помилка парсингу ${component} на Server-Shop`, { message: err.message });
      return {
        siteName: this.name,
        productItems: [notFoundItem()],
        error: err.message,
      };
    }
  },
};

function findBestMatchOrContains(component, searchTerm, productItems) {
  const candidates = filterByModelMatch(component, productItems).filter(
    (prod) => !isAccessoryBundle(prod.name, component)
  );

  if (!candidates.length) return notFoundItem();

  const exactMatch = candidates.find((prod) =>
    normalizeSearchText(prod.textSmall).includes(searchTerm) ||
    normalizeSearchText(prod.name).includes(searchTerm)
  );
  if (exactMatch) return { site: "Server-Shop", ...exactMatch };

  const bestMatch = candidates.reduce(
    (best, prod) => {
      const similarity = stringSimilarity.compareTwoStrings(searchTerm, normalizeSearchText(prod.name));
      return similarity > best.similarity ? { prod, similarity } : best;
    },
    { prod: null, similarity: 0 }
  );

  return bestMatch.prod && bestMatch.similarity >= 0.55
    ? { site: "Server-Shop", ...bestMatch.prod }
    : notFoundItem();
}

function notFoundItem() {
  return {
    site: "Server-Shop",
    name: "Товар не знайдено",
    price: "Ціна не знайдена",
    link: "Посилання не знайдено",
    availability: "Немає даних",
  };
}
