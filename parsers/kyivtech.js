const stringSimilarity = require("string-similarity");

/**
 * Убирает скобки и лишние пробелы из текста.
 */
function cleanComponent(text) {
  return text.replace(/\(.*?\)/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Нормализует текст для сравнения: убирает скобки, пробелы и приводит к нижнему регистру.
 */
function normalizeText(text) {
  return text.replace(/\(.*?\)/g, "").replace(/\s+/g, "").toLowerCase();
}

/**
 * Пороговые значения похожести для разных типов комплектующих.
 */
const similarityThresholds = {
  "процесор": 0.96,
  "відеокарта": 0.88,
  "сервер": 0.90,
  "оперативнапам'ять": 0.65,
  "накопичувачssd": 0.58,
  "робочастанція": 0.85,
};

/**
 * Выбирает порог похожести в зависимости от префикса названия компонента.
 */
function getSimilarityThreshold(component) {
  const normalized = normalizeText(component);
  const entry = Object.entries(similarityThresholds)
    .find(([prefix]) => normalized.startsWith(prefix));
  return entry ? entry[1] : 0.4;
}

/**
 * Выбирает лучший матч из списка товаров по похожести названий.
 * Если ни один товар не проходит порог, возвращает «Товар не знайдено».
 */
function findBestMatch(component, productItems) {
  const normalizedComponent = normalizeText(component);
  const threshold = getSimilarityThreshold(component);

  let best = { prod: null, similarity: 0 };
  for (const prod of productItems) {
    if (!prod.name) continue;
    const sim = stringSimilarity.compareTwoStrings(
      normalizedComponent,
      normalizeText(prod.name)
    );
    if (sim > best.similarity) {
      best = { prod, similarity: sim };
    }
  }

  if (best.similarity >= threshold) {
    return { site: "Kyivtech", ...best.prod };
  }

  return {
    site: "Kyivtech",
    name: "Товар не знайдено",
    price: "Ціна не знайдена",
    link: "Посилання не знайдено",
    availability: "Немає даних",
  };
}

module.exports = {
  name: "Kyivtech",

  url: (component) =>
    `https://kyivtech.com.ua/search/?search=${encodeURIComponent(cleanComponent(component))}`,

  selectors: {
    container: "main",
    item: ".product-thumb",
    name: ".product-name",
    price: ".price_value",
    availability: ".stock-status",
  },

  /**
   * Основная функция парсинга.
   * Если на странице встречается <content><p>Немає товарів, що відповідали б критеріям пошуку</p></content>,
   * бросаем ошибку "notFound" и возвращаем { productItems: [], error: "notFound" }.
   */
  parseSite: async function (page, component) {
    try {
      const cleanedComponent = cleanComponent(component);
      await page.goto(this.url(cleanedComponent), { waitUntil: "networkidle2" });
      await page.waitForSelector(this.selectors.container, { timeout: 4000 });

      // ——— Проверка на отсутствие товаров ———
      const noProductsHandle = await page.$("content p");
      if (noProductsHandle) {
        const noProductsText = await page.evaluate(el => el.innerText.trim(), noProductsHandle);
        if (noProductsText.includes("Немає товарів, що відповідали б критеріям пошуку")) {
          throw new Error("notFound");
        }
      }

      // ——— Извлечение списка товаров ———
      const productItems = await page.evaluate(
        ({ item, name, price, availability }) => {
          return Array.from(document.querySelectorAll(item)).map(el => ({
            name: el.querySelector(name)?.innerText.trim() || "",
            price: el.querySelector(price)?.innerText.trim() || "Ціна не знайдена",
            link: el.querySelector("a")?.href || "Посилання не знайдено",
            availability: el.querySelector(availability)?.innerText.trim() || "Наявність не вказана",
          }));
        },
        this.selectors
      );

      return {
        siteName: this.name,
        productItems: [findBestMatch(cleanedComponent, productItems)],
      };
    } catch (err) {
      console.error(`Помилка парсингу "${component}" на "${this.name}":`, err);
      return {
        siteName: this.name,
        productItems: [],
        error: err.message, // будет "notFound", если сработала проверка
      };
    }
  },
};
