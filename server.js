const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");
const { Cluster } = require("puppeteer-cluster");

const app = express();
const upload = multer({ dest: "uploads/" });

app.use(express.static("public"));

app.post("/parse", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.json({ error: "Файл не завантажено" });
  }

  const filePath = path.join(__dirname, req.file.path);
  const fileContent = fs.readFileSync(filePath, "utf-8");
  const components = fileContent
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  // Використовуємо Puppeteer кластер для паралельного парсингу
  const results = await parseWithCluster(components);

  fs.unlinkSync(filePath); // Видаляємо файл після обробки

  console.log("Results:", results); // Перевірка виведення в консоль
  res.json({ results });
});

// Функція для отримання ціни з сайту server-shop.ua за допомогою кластеру
async function getPriceFromServerShop(cluster, component) {
  return await cluster.execute(async ({ page }) => {
    // Перехоплюємо запити і блокуємо непотрібні ресурси
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const resourceTypesToBlock = ["font", "image", "stylesheet", "script"];
      if (resourceTypesToBlock.includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });

    // Встановлюємо користувацький агент
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    );

    // Відкриваємо сторінку пошуку
    const url = `https://server-shop.ua/search.html?query=${encodeURIComponent(
      component
    )}`;
    await page.goto(url, { waitUntil: "domcontentloaded" });

    // Чекаємо на основний елемент каталогу
    await page.waitForSelector(".catalog_wrapper", { timeout: 5000 });

    // Витягуємо дані про перший товар на сторінці
    const result = await page.evaluate(() => {
      const product = document.querySelector(".cat_item");
      if (!product) return null;

      const price = product.querySelector(".price_text")
        ? product.querySelector(".price_text").innerText.trim()
        : null;
      const link = product.querySelector("a")
        ? product.querySelector("a").href
        : null;

      return { price, link };
    });

    return result;
  });
}

// Функція для отримання ціни з сайту servak.com.ua за допомогою кластеру
async function getPriceFromservak(cluster, component) {
  return await cluster.execute(async ({ page }) => {
    // Перехоплюємо запити і блокуємо непотрібні ресурси
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const resourceTypesToBlock = ["font", "image", "stylesheet", "script"];
      if (resourceTypesToBlock.includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });

    // Встановлюємо користувацький агент
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    );

    // Відкриваємо сторінку пошуку
    const url = `https://servak.com.ua/ua/search/?search=${encodeURIComponent(
      component
    )}`;
    await page.goto(url, { waitUntil: "domcontentloaded" });

    // Чекаємо на основний елемент каталогу
    await page.waitForSelector(".container", { timeout: 5000 });

    // Витягуємо дані про перший товар на сторінці
    const result = await page.evaluate((component) => {
      const product = document.querySelector(".product-thumb");
      if (!product) return null;

      // Отримуємо назву компонента з сайту
      const productName = product.querySelector(".h4")
        ? product.querySelector(".h4").innerText.trim()
        : "";

      // Перевіряємо, чи містить назва компонента на сайті назву, передану в component
      if (productName.toLowerCase().includes(component.toLowerCase())) {
        const price = product.querySelector(".price")
          ? product.querySelector(".price").innerText.trim()
          : null;
        const link = product.querySelector("a")
          ? product.querySelector("a").href
          : null;

        return { price, link };
      }
      return null; // Якщо назва не містить компонента, повертаємо null
    }, component);

    return result;
  });
}

// Оновлений процес парсингу для кожного комплектуючого
async function getPrices(component, cluster) {
  const prices = {
    name: component,
    results: [], // Масив для зберігання результатів з різних сайтів
  };

  // Парсимо з server-shop.ua
  const serverShopPrice = await getPriceFromServerShop(cluster, component);
  prices.results.push({
    site: "Server-Shop",
    price: serverShopPrice ? serverShopPrice.price : "Ціна не знайдена",
    link: serverShopPrice ? serverShopPrice.link : "Посилання не знайдено",
  });

  // Парсимо з servak.com.ua
  const servakPrice = await getPriceFromservak(cluster, component);
  prices.results.push({
    site: "Servak",
    price: servakPrice ? servakPrice.price : "Ціна не знайдена",
    link: servakPrice ? servakPrice.link : "Посилання не знайдено",
  });

  // Якщо ціни не знайдено на жодному сайті, даємо посилання на eBay
  prices.results.push({
    site: "eBay",
    price: "Ціна не знайдена",
    link: `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(
      component
    )}`,
  });

  return prices;
}

// Функція для парсингу за допомогою кластеру
async function parseWithCluster(components) {
  // Ініціалізуємо кластер
  const cluster = await Cluster.launch({
    concurrency: Cluster.CONCURRENCY_PAGE, // Використовуємо режим з одним воркером для кожної сторінки
    maxConcurrency: 5, // Максимальна кількість одночасних сторінок (можна налаштувати)
    puppeteerOptions: {
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-images",
        "--disable-gpu",
      ],
    },
  });

  // Використовуємо кластер для парсингу компонентів
  const results = await Promise.all(
    components.map(async (component) => {
      const prices = await getPrices(component, cluster);
      return prices;
    })
  );

  await cluster.close(); // Закриваємо кластер після завершення парсингу

  return results;
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Сервер працює на порту ${PORT}`);
});
