const stringSimilarity = require("string-similarity");

module.exports = {
  name: "ServerParts",
  url: (component) => `https://serverparts.com.ua/search/?search=${encodeURIComponent(component)}`,
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
      await page.goto(this.url(component), { waitUntil: "networkidle2" });
      await page.waitForSelector(this.selectors.container, { timeout: 5000 });

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
      console.error(`Помилка парсингу ${component} на ${this.name}:`, err);
      return { siteName: this.name, productItems: [], error: err.message };
    }
  },
};

function findBestMatch(component, productItems) {
  if (!productItems.length) {
    return { site: "ServerParts", name: "Товар не знайдено", price: "Ціна не знайдена", link: "Посилання не знайдено", availability: "Немає даних" };
  }

  const best = productItems.reduce((best, prod) => {
    const similarity = stringSimilarity.compareTwoStrings(component.toLowerCase(), prod.name.toLowerCase());
    return similarity > best.similarity ? { prod, similarity } : best;
  }, { prod: null, similarity: 0 });

  return best.similarity > 0.35 ? { site: "ServerParts", ...best.prod } : {
    site: "ServerParts",
    name: "Товар не знайдено",
    price: "Ціна не знайдена",
    link: "Посилання не знайдено",
    availability: "Немає даних",
  };
}
