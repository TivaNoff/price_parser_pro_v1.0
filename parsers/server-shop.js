const stringSimilarity = require("string-similarity");

const TRIGGERS = [
  "Оперативна пам'ять",
  "Диск NVMe",
  "Жорсткий диск",
  "Накопичувач SSD",
];

module.exports = {
  name: "Server-Shop",
  url: (component) => `https://server-shop.ua/ua/search.html?query=${encodeURIComponent(normalizeText(extractSearchTerm(component)))}`,

  selectors: {
    container: ".catalog_block",
    item: ".item",
    name: ".title_wrap",
    price: ".price_text",
    availability: ".cat_item_stock_status",
    textSmall: ".bottom_links .text-small",
  },

  async parseSite(page, component) {
    try {
      const searchTerm = normalizeText(extractSearchTerm(component));
      await page.goto(this.url(component), { waitUntil: "networkidle2" });
      await page.waitForSelector(this.selectors.container, { timeout: 5000 });

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

      return {
        siteName: this.name,
        productItems: [findBestMatchOrContains(searchTerm, productItems)].filter(Boolean),
      };
    } catch (err) {
      console.error(`❌ Помилка парсингу ${component} на Server-Shop:`, err);
      return { siteName: this.name, productItems: [], error: err.message };
    }
  },
};

function extractSearchTerm(component) {
  return TRIGGERS.some((trigger) => component.startsWith(trigger))
    ? (component.match(/\(([^)]+)\)/)?.[1] || component).trim()
    : component.replace(/\([^)]*\)/g, "").trim();
}

function normalizeText(str) {
  return str?.toLowerCase().replace(/\s+/g, " ").trim() || "";
}

function findBestMatchOrContains(searchTerm, productItems) {
  const normalizedSearchTerm = normalizeText(searchTerm);
  const exactMatch = productItems.find((prod) => normalizeText(prod.textSmall).includes(normalizedSearchTerm));
  if (exactMatch) return { site: "Server-Shop", ...exactMatch };

  const bestMatch = productItems.reduce((best, prod) => {
    const similarity = stringSimilarity.compareTwoStrings(normalizedSearchTerm, normalizeText(prod.name));
    return similarity > best.similarity ? { prod, similarity } : best;
  }, { prod: null, similarity: 0 });

  return bestMatch.prod && bestMatch.similarity > 0.4
    ? { site: "Server-Shop", ...bestMatch.prod }
    : { site: "Server-Shop", name: "Товар не знайдено", price: "Ціна не знайдена", link: "Посилання не знайдено", availability: "Немає даних" };
}
