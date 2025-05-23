const stringSimilarity = require("string-similarity");

function cleanComponent(text) {
  return text.startsWith("Відеокарта") || text.startsWith("Робоча станція")
    ? text.trim()
    : text.replace(/\(.*?\)/g, "").trim();
}

function normalizeText(text, isGpu, isWorkstation) {
  return (isGpu || isWorkstation)
    ? text.trim().toLowerCase()
    : text.replace(/\(.*?\)/g, "").replace(/\s+/g, "").toLowerCase();
}

function findBestMatch(component, productItems) {
  const isGpu = component.startsWith("Відеокарта");
  const isWorkstation = component.startsWith("Робоча станція");
  const normalizedComponent = normalizeText(component, isGpu, isWorkstation);
  
  let bestMatch = productItems.reduce((best, prod) => {
    const sim = stringSimilarity.compareTwoStrings(normalizedComponent, normalizeText(prod.name, isGpu, isWorkstation));
    return sim > best.similarity ? { prod, similarity: sim } : best;
  }, { prod: null, similarity: 0 });
  
  
  return bestMatch.similarity > 0.72
    ? { site: "HWF", ...bestMatch.prod }
    : { site: "HWF", name: "Товар не знайдено", price: "Ціна не знайдена", link: "Посилання не знайдено", availability: "Немає даних" };
}

module.exports = {
  name: "HWF",
  url: (component) => `https://hwf.com.ua/katalog/search/?q=${encodeURIComponent(cleanComponent(component))}`,
  selectors: {
    container: ".catalog",
    item: ".catalog-grid__item",
    name: ".catalogCard-title",
    price: ".catalogCard-price",
    availability: ".catalog-card-specs__value",
  },

  parseSite: async function (page, component) {
    try {
      await page.goto(this.url(component), { waitUntil: "networkidle2" });
      await page.waitForSelector(this.selectors.container, { timeout: 6500 });
      
      const productItems = await page.evaluate(({ item, name, price, avail }) => {
        return Array.from(document.querySelectorAll(item)).map(el => ({
          name: el.querySelector(name)?.innerText.trim() || "",
          price: el.querySelector(price)?.innerText.trim() || "Ціна не знайдена",
          link: el.querySelector("a")?.href || "Посилання не знайдено",
          availability: el.querySelector(avail)?.innerText.trim() || "Наявність не вказана",
        }));
      }, this.selectors);

      return { siteName: this.name, productItems: [findBestMatch(component, productItems)] };
    } catch (err) {
      console.error(`Помилка парсингу ${component} на ${this.name}:`, err);
      return { siteName: this.name, productItems: [], error: err.message };
    }
  },
};