const stringSimilarity = require("string-similarity");
const { loadSearchPage } = require("./page-utils");
const {
  buildSearchQuery,
  extractModelKey,
  modelMatches,
  isCloudflareChallenge,
} = require("./search-utils");
const logger = require("../logger");

const NO_RESULTS_RE =
  /нічого не знайдено|ничего не найдено|не знайдено|не найдено|товарів не знайдено|товаров не найдено/i;

module.exports = {
  name: "Servak",
  url: (component) =>
    `https://servak.com.ua/ua/search/?search=${encodeURIComponent(buildSearchQuery(component))}&limit=25`,
  selectors: {
    container: ".content-wrapper",
    item: ".product-layout",
    name: ".h4",
    price: ".price",
    availability: ".btn-addtocart",
  },

  parseSite: async function (page, component) {
    try {
      const searchQuery = buildSearchQuery(component);
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
        logger.logError(`Помилка парсингу ${component} на ${this.name}`, { message: errMsg });
        return { siteName: this.name, productItems: [notFound()], error: errMsg };
      }

      if (NO_RESULTS_RE.test(pageText)) {
        return { siteName: this.name, productItems: [notFound()] };
      }

      await page.waitForSelector(this.selectors.item, { timeout: 8000 }).catch(() => null);

      const productItems = await page.evaluate(({ item, name, price, availability }) => {
        return Array.from(document.querySelectorAll(item)).map((el) => ({
          name: el.querySelector(name)?.innerText.trim() || "",
          price: el.querySelector(price)?.innerText.trim() || "Ціна не знайдена",
          link: el.querySelector("a")?.href || "Посилання не знайдено",
          availability: el.querySelector(availability)?.innerText.trim() || "Наявність не вказана",
        }));
      }, this.selectors);

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

const normalizeText = (text) => text.replace(/\(.*?\)|\s+/g, "").toLowerCase();

const similarityThresholds = {
  "процесор": 0.97,
  "відеокарта": 0.95,
  "сервер": 0.88,
  "оперативнапам'ять": 0.48,
  "накопичувач": 0.7,
  "жорсткийдиск": 0.6,
  "накопичувачssd": 0.6,
  "материнськаплата": 0.85,
};

const getSimilarityThreshold = (component) => {
  const category = Object.keys(similarityThresholds).find((prefix) =>
    normalizeText(component).startsWith(prefix)
  );
  return category ? similarityThresholds[category] : 0.75;
};

const findBestMatch = (component, productItems) => {
  const hasModelKey = Boolean(extractModelKey(component));
  const candidates = hasModelKey
    ? productItems.filter((prod) => modelMatches(component, prod.name))
    : productItems;

  if (!candidates.length) return notFound();

  const normalizedComponent = normalizeText(buildSearchQuery(component));
  const similarityThreshold = getSimilarityThreshold(component);

  const bestMatch = candidates.reduce(
    (best, prod) => {
      const similarity = stringSimilarity.compareTwoStrings(
        normalizedComponent,
        normalizeText(prod.name)
      );
      return similarity > best.similarity ? { prod, similarity } : best;
    },
    { prod: null, similarity: 0 }
  );

  return bestMatch.prod && bestMatch.similarity >= similarityThreshold
    ? { site: "Servak", ...bestMatch.prod }
    : notFound();
};

const notFound = () => ({
  site: "Servak",
  name: "Товар не знайдено",
  price: "Ціна не знайдена",
  link: "Посилання не знайдено",
  availability: "Немає даних",
});
