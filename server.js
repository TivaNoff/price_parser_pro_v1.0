const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { Cluster } = require("puppeteer-cluster");
const xml2js = require("xml2js");

// Подключаем наши парсеры
const serverShopParser = require("./parsers/server-shop");
const servakParser = require("./parsers/servak");
const hwfParser = require("./parsers/hwf");
const hardkievParser = require("./parsers/hardkiev");
const kyivtechParser = require("./parsers/kyivtech");
const serverPartsParser = require("./parsers/serverparts");
const promParser = require("./parsers/prom");

const app = express();
const upload = multer({ dest: "uploads/" });
app.use(express.static("public"));

app.post("/parse", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.json({ error: "Файл не завантажено" });
  }

  const filePath = path.join(__dirname, req.file.path);
  const ext = path.extname(req.file.originalname).toLowerCase();

  let components = [];
  try {
    if (ext === ".xml") {
      const xmlData = fs.readFileSync(filePath, "utf-8");
      const parser = new xml2js.Parser({ trim: true, explicitArray: false });
      const parsedXml = await parser.parseStringPromise(xmlData);

      if (parsedXml?.itemlist?.item) {
        let items = parsedXml.itemlist.item;
        if (!Array.isArray(items)) {
          items = [items];
        }
        components = items.map((itm) => itm.name_uk).filter(Boolean);
      } else {
        fs.unlinkSync(filePath);
        return res.json({ error: "Структура XML не відповідає очікуваній" });
      }
    } else {
      components = fs.readFileSync(filePath, "utf-8").split("\n").map(line => line.trim()).filter(Boolean);
    }
  } catch (err) {
    fs.unlinkSync(filePath);
    return res.json({ error: "Помилка при читанні/парсингу файлу: " + err.message });
  }

  console.time("Parsing Time");
  try {
    const results = await parseWithCluster(components);
    console.timeEnd("Parsing Time");

    fs.unlinkSync(filePath);
    
    const outputFilePath = path.join(__dirname, "public", "parsed_results.json");
    fs.writeFileSync(outputFilePath, JSON.stringify(results, null, 2), "utf-8");

    res.json({ results, file: "/parsed_results.json" });
  } catch (err) {
    console.timeEnd("Parsing Time");
    fs.unlinkSync(filePath);
    res.json({ error: err.message || "Помилка при парсингу" });
  }
});

async function parseWithCluster(components) {
  const siteParsers = [serverShopParser, servakParser, hwfParser, hardkievParser, serverPartsParser, kyivtechParser, promParser];

  const cluster = await Cluster.launch({
    concurrency: Cluster.CONCURRENCY_PAGE,
    maxConcurrency: 4,
    puppeteerOptions: { headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] }
  });

  await cluster.task(async ({ page, data }) => {
    const { component, parser } = data;
    try {
      await page.setRequestInterception(true);
      page.on("request", req => {
        if (req.resourceType() === "document") req.continue();
        else req.abort();
      });
      await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)");
      const parseResult = await parser.parseSite(page, component);
      return { component, siteName: parseResult.siteName, productItems: parseResult.productItems, error: parseResult.error };
    } catch (err) {
      console.error(`Помилка парсингу ${component} на сайті ${parser.name}:`, err);
      return { component, siteName: parser.name, productItems: [], error: err.message };
    }
  });

  const tasks = [];
  for (const component of components) {
    for (const parser of siteParsers) {
      tasks.push({ component, parser });
    }
  }

  const rawResults = await Promise.all(tasks.map(task => cluster.execute(task)));

  const groupedResults = {};
  for (const { component, siteName, productItems } of rawResults) {
    if (!groupedResults[component]) {
      groupedResults[component] = [];
    }
    groupedResults[component].push(...productItems);
  }

  await cluster.idle();
  await cluster.close();

  return Object.entries(groupedResults).map(([name, results]) => ({ name, results }));
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Сервер працює на порту ${PORT}`));
