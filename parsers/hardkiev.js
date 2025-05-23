const stringSimilarity = require("string-similarity");

const TRIGGERS = [
  "Оперативна пам'ять",
  "Диск NVMe",
  "Жорсткий диск",
  "Накопичувач SSD",
];

module.exports = {
  name: "HardKiev",
  url: (component) => {
    const searchTerm = normalizeText(extractSearchTerm(component));
    return `https://hard.kiev.ua/search/?query=${encodeURIComponent(searchTerm)}`;
  },

  selectors: {
    container: ".container",
    item: "tr",
    name: "h5",
    price: ".price",
    availability: ".stocks",
  },

  parseSite: async function (page, component) {
    try {
      const searchTerm = normalizeText(extractSearchTerm(component));

      await page.goto(this.url(component), { waitUntil: "networkidle2" });
      await page.waitForSelector(this.selectors.container, { timeout: 5000 });

      const productItems = await page.evaluate((selectors) => {
        const items = document.querySelectorAll(selectors.item);
        let products = [];
        items.forEach((item) => {
          let nameEl = item.querySelector(selectors.name);
          let priceEl = item.querySelector(selectors.price);
          let linkEl = item.querySelector("a");
          let availabilityEl = item.querySelector(selectors.availability);

          products.push({
            name: nameEl ? nameEl.innerText.trim() : "",
            price: priceEl ? priceEl.innerText.trim() : "Ціна не знайдена",
            link: linkEl ? linkEl.href : "Посилання не знайдено",
            availability: availabilityEl ? availabilityEl.innerText.trim() : "Наявність не вказана",
          });
        });
        return products;
      }, this.selectors);

      return {
        siteName: this.name,
        productItems: findBestMatch(searchTerm, productItems),
      };
    } catch {
      return { siteName: this.name, productItems: [], error: "Помилка парсингу" };
    }
  },
};

function extractSearchTerm(component) {
  if (TRIGGERS.some((trigger) => component.startsWith(trigger))) {
    const match = component.match(/\(([^)]+)\)/);
    return match ? match[1].trim() : component.trim();
  }
  return component.replace(/\([^)]*\)/g, "").trim();
}

function normalizeText(str) {
  return str ? str.toLowerCase().replace(/\s+/g, " ").trim() : "";
}

function findBestMatch(searchTerm, productItems) {
  if (!productItems.length) {
    return [{
      site: "HardKiev",
      name: "Товар не знайдено",
      price: "Ціна не знайдена",
      link: "Посилання не знайдено",
      availability: "Немає даних",
    }];
  }

  let bestMatch = null;
  let highestSimilarity = 0;

  for (const prod of productItems) {
    const normalizedName = normalizeText(prod.name);
    if (normalizedName.includes(searchTerm)) return [{ site: "HardKiev", ...prod }];

    const similarity = stringSimilarity.compareTwoStrings(searchTerm, normalizedName);
    if (similarity > highestSimilarity) {
      highestSimilarity = similarity;
      bestMatch = prod;
    }
  }

  return highestSimilarity > 0.4 ? [{ site: "HardKiev", ...bestMatch }] : [{
    site: "HardKiev",
    name: "Товар не знайдено",
    price: "Ціна не знайдена",
    link: "Посилання не знайдено",
    availability: "Немає даних",
  }];
}
