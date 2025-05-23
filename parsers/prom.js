const stringSimilarity = require("string-similarity");

module.exports = {
  name: "Prom",
  url: (component) =>
    `https://prom.ua/ua/search?search_term=${encodeURIComponent(
      cleanComponent(component)
    )}&a10006=83770&binary_filters=presence_available`,
  selectors: {
    container: ".IZV5x",
    item: ".l-GwW",
    name: ".h97_n",
    price: ".yzKb6",
    availability: ".NSmdF",
  },

  parseSite: async function (page, component) {
    try {
      const cleanedComponent = cleanComponent(component);
      await page.goto(this.url(cleanedComponent), {
        waitUntil: "networkidle2",
        timeout: 12000,
      });
      await page.waitForSelector(this.selectors.container, { timeout: 5000 });

      const productItems = await page.evaluate(
        ({ item, name, price, availability }) => {
          return Array.from(document.querySelectorAll(item)).map((el) => ({
            name: el.querySelector(name)?.innerText.trim() || "",
            price: el.querySelector(price)?.innerText.trim() || "Ціна не знайдена",
            link: el.querySelector("a")?.href || "Посилання не знайдено",
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
          ? [findBestMatch(cleanedComponent, productItems)]
          : [notFound()],
      };
    } catch (err) {
      console.error(`Помилка парсингу ${component} на ${this.name}:`, err);
      return { siteName: this.name, productItems: [], error: err.message };
    }
  },
};

// Удаляет текст в скобках вместе со скобками
const removeParenthesesContent = (text) =>
  text.replace(/\s*\(.*?\)\s*/g, " ").trim();

// Очищает компонент для поиска (удаляет текст в скобках, лишние пробелы)
const cleanComponent = (text) =>
  removeParenthesesContent(text).replace(/\s+/g, " ").trim();

// Нормализует текст для сравнения (нижний регистр, удаляет все пробелы)
const normalizeText = (text) => text.replace(/\s+/g, "").toLowerCase();

// Преобразует строку цены в число
const parsePrice = (priceText) => {
  const cleaned = priceText.replace(/[^0-9.,]/g, "").replace(/\s+/g, "");
  const normalized = cleaned.replace(",", ".");
  return parseFloat(normalized);
};

// Карта порогов схожести
const similarityThresholds = {
  "процесор": 0.89,
  "відеокарта": 0.95,
  "сервер": 0.9,
  "оперативнапам'ять": 0.89,
  "накопичувач": 0.75,
  "жорсткийдиск": 0.75,
  "накопичувачssd": 0.75,
  "материнськаплата": 0.89,
};

const getSimilarityThreshold = (component) => {
  const category = Object.keys(similarityThresholds).find((prefix) =>
    normalizeText(component).startsWith(prefix)
  );
  return category ? similarityThresholds[category] : 0.75;
};

// Поиск лучшего совпадения с учётом удаления скобок и выбора самого дешёвого из подходящих
const findBestMatch = (component, productItems) => {
  const normalizedComponent = normalizeText(cleanComponent(component));
  const threshold = getSimilarityThreshold(component);

  // Собираем все товары, подходящие по схожести
  const matches = productItems
    .map((prod) => {
      const nameForCompare = removeParenthesesContent(prod.name);
      const similarity = stringSimilarity.compareTwoStrings(
        normalizedComponent,
        normalizeText(nameForCompare)
      );
      return { prod, similarity };
    })
    .filter((m) => m.similarity >= threshold);

  if (!matches.length) {
    console.log(`No suitable products found for "${component}"`);
    return notFound();
  }

  // Из подходящих выбираем самый дешёвый
  const cheapest = matches.reduce((best, current) => {
    const bestPrice = parsePrice(best.prod.price);
    const currPrice = parsePrice(current.prod.price);
    if (isNaN(bestPrice)) return current;
    if (isNaN(currPrice)) return best;
    return currPrice < bestPrice ? current : best;
  });

  console.log(
    `Best match Prom: ${cheapest.prod.name}, price: ${cheapest.prod.price}`
  );
  return { site: "Prom", ...cheapest.prod };
};

// Возвращает объект "не найдено"
const notFound = () => ({
  site: "Prom",
  name: "Товар не знайдено",
  price: "Ціна не знайдена",
  link: "Посилання не знайдено",
  availability: "Немає даних",
});
