const stringSimilarity = require("string-similarity");
const { loadSearchPage, fetchHardKievAvailability } = require("./page-utils");
const {
  buildSearchQuery,
  filterByModelMatch,
  normalizeSearchText,
  isAccessoryBundle,
} = require("./search-utils");
const logger = require("../logger");

module.exports = {
  name: "HardKiev",
  url: (component) => {
    const searchTerm = buildSearchQuery(component);
    return `https://hard.kiev.ua/search/?query=${encodeURIComponent(searchTerm)}`;
  },

  selectors: {
    container: "body",
    item: "table.product-list tr[itemprop='offers']",
    name: "h5 a, h5",
    price: ".price .sku_count, .price",
  },

  parseSite: async function (page, component) {
    try {
      const searchTerm = normalizeSearchText(buildSearchQuery(component));

      await loadSearchPage(page, this.url(component), this.selectors.container);

      const noResults = await page.evaluate(() =>
        /Нажаль,\s*нічого не знайдено/i.test(document.body.innerText)
      );
      if (noResults) {
        return { siteName: this.name, productItems: [notFoundItem()] };
      }

      const productItems = await page.evaluate((selectors) => {
        const items = document.querySelectorAll(selectors.item);
        let products = [];
        items.forEach((item) => {
          let nameEl = item.querySelector(selectors.name);
          let priceEl = item.querySelector(selectors.price);
          let linkEl = item.querySelector("a");
          products.push({
            name: nameEl ? nameEl.innerText.trim() : "",
            price: priceEl ? priceEl.innerText.trim() : "Ціна не знайдена",
            link: linkEl ? linkEl.href : "Посилання не знайдено",
            availability: "Наявність не вказана",
          });
        });
        return products;
      }, this.selectors);

      const matches = findBestMatch(component, searchTerm, productItems);
      const bestMatch = matches[0];
      if (bestMatch.name !== "Товар не знайдено") {
        bestMatch.availability = await fetchHardKievAvailability(page, bestMatch.link);
      }

      return {
        siteName: this.name,
        productItems: matches,
      };
    } catch (err) {
      logger.logError(`Помилка парсингу ${component} на ${this.name}`, {
        message: err?.message || "Помилка парсингу",
      });
      return { siteName: this.name, productItems: [notFoundItem()], error: err?.message || "Помилка парсингу" };
    }
  },
};

function findBestMatch(component, searchTerm, productItems) {
  if (!productItems.length) {
    return [notFoundItem()];
  }

  const candidates = filterByModelMatch(component, productItems).filter(
    (prod) => !isAccessoryBundle(prod.name, component)
  );

  if (!candidates.length) {
    return [notFoundItem()];
  }

  for (const prod of candidates) {
    const normalizedName = normalizeSearchText(prod.name);
    if (normalizedName.includes(searchTerm)) {
      return [{ site: "HardKiev", ...prod }];
    }
  }

  let bestMatch = null;
  let highestSimilarity = 0;

  for (const prod of candidates) {
    const similarity = stringSimilarity.compareTwoStrings(searchTerm, normalizeSearchText(prod.name));
    if (similarity > highestSimilarity) {
      highestSimilarity = similarity;
      bestMatch = prod;
    }
  }

  return highestSimilarity >= 0.55 ? [{ site: "HardKiev", ...bestMatch }] : [notFoundItem()];
}

function notFoundItem() {
  return {
    site: "HardKiev",
    name: "Товар не знайдено",
    price: "Ціна не знайдена",
    link: "Посилання не знайдено",
    availability: "Немає даних",
  };
}
