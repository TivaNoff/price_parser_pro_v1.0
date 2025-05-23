const stringSimilarity = require("string-similarity");

module.exports = {
  name: "Servak",
  url: (component) => `https://servak.com.ua/ua/search/?search=${encodeURIComponent(cleanComponent(component))}&limit=25`,
  selectors: {
    container: ".container",
    item: ".product-layout",
    name: ".h4",
    price: ".price",
    availability: ".btn-addtocart",
  },

  parseSite: async function (page, component) {
    try {
      const cleanedComponent = cleanComponent(component);
      await page.goto(this.url(cleanedComponent), { waitUntil: "networkidle2", timeout: 8000 });
      await page.waitForSelector(this.selectors.container, { timeout: 8000 });

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
        productItems: productItems.length ? [findBestMatch(cleanedComponent, productItems)] : [notFound()],
      };
    } catch (err) {
      console.error(`Помилка парсингу ${component} на ${this.name}:`, err);
      return { siteName: this.name, productItems: [], error: err.message };
    }
  },
};

// Функция обработки названия компонента (удаляет текст в скобках, очищает пробелы)
const cleanComponent = (text) => text.replace(/\(.*?\)|\s+/g, " ").trim();

// Функция нормализации текста (удаление скобок, пробелов, приведение к нижнему регистру)
const normalizeText = (text) => text.replace(/\(.*?\)|\s+/g, "").toLowerCase();

// Карта порогов схожести для разных компонентов
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

// Функция для получения порога схожести в зависимости от компонента
const getSimilarityThreshold = (component) => {
  const category = Object.keys(similarityThresholds).find((prefix) =>
    normalizeText(component).startsWith(prefix)
  );
  return category ? similarityThresholds[category] : 0.65;
};

// Функция поиска лучшего совпадения
const findBestMatch = (component, productItems) => {
  const normalizedComponent = normalizeText(component);
  const similarityThreshold = getSimilarityThreshold(component);

  const bestMatch = productItems.reduce(
    (best, prod) => {
      const similarity = stringSimilarity.compareTwoStrings(normalizedComponent, normalizeText(prod.name));
      return similarity > best.similarity ? { prod, similarity } : best;
    },
    { prod: null, similarity: 0 }
  );

  console.log(`Лучший товар: ${bestMatch.prod?.name || "не найден"}, Схожість: ${bestMatch.similarity}`);
  return bestMatch.prod && bestMatch.similarity >= similarityThreshold
    ? { site: "Servak", ...bestMatch.prod }
    : notFound();
};

// Функция возвращает объект, если товар не найден
const notFound = () => ({
  site: "Servak",
  name: "Товар не знайдено",
  price: "Ціна не знайдена",
  link: "Посилання не знайдено",
  availability: "Немає даних",
});
