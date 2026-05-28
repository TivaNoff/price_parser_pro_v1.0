const stringSimilarity = require("string-similarity");
const { loadSearchPage, fetchAvailabilityFromProductPage } = require("./page-utils");
const {
  buildSearchQuery,
  filterByModelMatch,
  normalizeSearchText,
  isAccessoryBundle,
} = require("./search-utils");
const logger = require("../logger");

function normalizeText(text, isGpu, isWorkstation) {
  return isGpu || isWorkstation
    ? normalizeSearchText(text)
    : normalizeSearchText(text).replace(/\s+/g, "");
}

function findBestMatch(component, productItems) {
  const isGpu = component.startsWith("Відеокарта");
  const isWorkstation = component.startsWith("Робоча станція");
  const searchQuery = buildSearchQuery(component);
  const normalizedComponent = normalizeText(searchQuery, isGpu, isWorkstation);

  let candidates = filterByModelMatch(component, productItems).filter(
    (prod) => !isAccessoryBundle(prod.name, component)
  );

  if (!candidates.length) {
    return {
      site: "HWF",
      name: "Товар не знайдено",
      price: "Ціна не знайдена",
      link: "Посилання не знайдено",
      availability: "Немає даних",
    };
  }

  const bestMatch = candidates.reduce(
    (best, prod) => {
      const similarity = stringSimilarity.compareTwoStrings(
        normalizedComponent,
        normalizeText(prod.name, isGpu, isWorkstation)
      );
      return similarity > best.similarity ? { prod, similarity } : best;
    },
    { prod: null, similarity: 0 }
  );

  return bestMatch.prod && bestMatch.similarity >= 0.72
    ? { site: "HWF", ...bestMatch.prod }
    : {
        site: "HWF",
        name: "Товар не знайдено",
        price: "Ціна не знайдена",
        link: "Посилання не знайдено",
        availability: "Немає даних",
      };
}

module.exports = {
  name: "HWF",
  url: (component) =>
    `https://hwf.com.ua/katalog/search/?q=${encodeURIComponent(buildSearchQuery(component))}`,
  selectors: {
    container: ".catalog",
    item: ".catalog-grid__item",
    name: ".catalogCard-title",
    price: ".catalogCard-price",
    productAvailability: ".order-box__availability",
  },

  parseSite: async function (page, component) {
    try {
      await loadSearchPage(page, this.url(component), this.selectors.item);

      const productItems = await page.evaluate(({ item, name, price }) => {
        return Array.from(document.querySelectorAll(item)).map((el) => ({
          name: el.querySelector(name)?.innerText.trim() || "",
          price: el.querySelector(price)?.innerText.trim() || "Ціна не знайдена",
          link: el.querySelector("a")?.href || "Посилання не знайдено",
          availability: "Наявність не вказана",
        }));
      }, this.selectors);

      const bestMatch = findBestMatch(component, productItems);
      if (bestMatch.name !== "Товар не знайдено") {
        bestMatch.availability = await fetchAvailabilityFromProductPage(
          page,
          bestMatch.link,
          [this.selectors.productAvailability]
        );
      }

      return { siteName: this.name, productItems: [bestMatch] };
    } catch (err) {
      logger.logError(`Помилка парсингу ${component} на ${this.name}`, {
        message: err.message,
        stack: err.stack,
      });
      return { siteName: this.name, productItems: [findBestMatch(component, [])], error: err.message };
    }
  },
};
