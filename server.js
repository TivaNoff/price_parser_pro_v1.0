const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { Cluster } = require("puppeteer-cluster");
const stealthPuppeteer = require("./parsers/stealth-browser");
const xml2js = require("xml2js");

// Подключаем наши парсеры
const serverShopParser = require("./parsers/server-shop");
const hwfParser = require("./parsers/hwf");
const hardkievParser = require("./parsers/hardkiev");
const serverPartsParser = require("./parsers/serverparts");
const promParser = require("./parsers/prom");
const logger = require("./logger");

function extractComponentsFromXml(parsedXml) {
  if (parsedXml?.itemlist?.item) {
    const items = Array.isArray(parsedXml.itemlist.item)
      ? parsedXml.itemlist.item
      : [parsedXml.itemlist.item];
    return items.map((itm) => itm.name_uk || itm.name_ua).filter(Boolean);
  }

  const offers = parsedXml?.yml_catalog?.shop?.offers?.offer;
  if (offers) {
    const items = Array.isArray(offers) ? offers : [offers];
    return items.map((itm) => itm.name_ua || itm.name_uk || itm.name).filter(Boolean);
  }

  return null;
}

function formatXmlPrice(price) {
  const num = parseFloat(String(price ?? "").replace(",", "."));
  if (Number.isNaN(num)) return "Ціна не знайдена";
  return `${num.toFixed(2)} грн.`;
}

function formatXmlAvailability(offer) {
  const qty = parseInt(offer.stock_quantity, 10);
  if (offer.available === "true" || (!Number.isNaN(qty) && qty > 0)) {
    return "В наявності";
  }
  return "Немає в наявності";
}

function extractServerPartsFromXml(parsedXml) {
  const offers = parsedXml?.yml_catalog?.shop?.offers?.offer;
  if (!offers) return null;

  const items = Array.isArray(offers) ? offers : [offers];
  const map = {};

  for (const offer of items) {
    const name = offer.name_ua || offer.name_uk || offer.name;
    if (!name) continue;

    map[name] = {
      site: "ServerParts",
      name,
      price: formatXmlPrice(offer.price),
      link: offer.url || "Посилання не знайдено",
      availability: formatXmlAvailability(offer),
    };
  }

  return map;
}

const ALLOWED_RESOURCE_TYPES = new Set(["document", "script", "xhr", "fetch", "stylesheet"]);
const CHROME_ARGS = ["--no-sandbox", "--disable-setuid-sandbox"];
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const CLUSTER_DEFAULTS = {
  concurrency: Cluster.CONCURRENCY_PAGE,
  timeout: 90000,
  puppeteerOptions: { headless: true, args: CHROME_ARGS },
};

const SERVER_SHOP_CLUSTER = {
  ...CLUSTER_DEFAULTS,
  puppeteer: stealthPuppeteer,
  maxConcurrency: 2,
  sameDomainDelay: 5000,
};

const MAIN_CLUSTER = {
  ...CLUSTER_DEFAULTS,
  maxConcurrency: 8,
  sameDomainDelay: 1500,
};

function setupPageInterception(page) {
  page.removeAllListeners("request");
  page.on("request", (req) => {
    if (ALLOWED_RESOURCE_TYPES.has(req.resourceType())) {
      req.continue();
    } else {
      req.abort();
    }
  });
}

let progressStartTime = 0;
let lastPlainProgressLog = 0;

function formatProgressLine(completed, total, errors, currentSite, elapsedSec) {
  const pct = total ? ((completed / total) * 100).toFixed(1) : "0.0";
  const barLen = 24;
  const filled = total ? Math.min(barLen, Math.round((completed / total) * barLen)) : 0;
  const bar = "█".repeat(filled) + "░".repeat(barLen - filled);
  const eta =
    completed > 0 && completed < total
      ? Math.round((elapsedSec / completed) * (total - completed))
      : null;
  const etaStr = eta !== null ? ` | ~${eta}с залишилось` : "";
  const siteStr = currentSite ? ` | ${currentSite}` : "";
  return `[${bar}] ${completed}/${total} (${pct}%) | помилок: ${errors} | ${elapsedSec}с${etaStr}${siteStr}`;
}

function reportProgress(completed, total, errors, currentSite) {
  const elapsedSec = progressStartTime ? Math.round((Date.now() - progressStartTime) / 1000) : 0;
  const line = formatProgressLine(completed, total, errors, currentSite, elapsedSec);

  if (process.stdout.isTTY) {
    process.stdout.write(`\r\x1b[2K${line}`);
    return;
  }

  if (completed === 0 || completed - lastPlainProgressLog >= 10 || completed === total) {
    console.log(line);
    lastPlainProgressLog = completed;
  }
}

function finishProgress() {
  if (process.stdout.isTTY) {
    process.stdout.write("\n");
  }
}

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
  let serverPartsFromXml = null;
  try {
    if (ext === ".xml") {
      const xmlData = fs.readFileSync(filePath, "utf-8");
      const parser = new xml2js.Parser({ trim: true, explicitArray: false });
      const parsedXml = await parser.parseStringPromise(xmlData);

      serverPartsFromXml = extractServerPartsFromXml(parsedXml);
      components = extractComponentsFromXml(parsedXml);
      if (!components?.length) {
        fs.unlinkSync(filePath);
        return res.json({
          error: "Структура XML не відповідає очікуваній (потрібен itemlist/item або yml_catalog/shop/offers/offer)",
        });
      }
    } else {
      components = fs.readFileSync(filePath, "utf-8").split("\n").map(line => line.trim()).filter(Boolean);
    }
  } catch (err) {
    fs.unlinkSync(filePath);
    return res.json({ error: "Помилка при читанні/парсингу файлу: " + err.message });
  }

  const logPath = logger.startParseLog();
  console.log(`Завантажено ${components.length} позицій. Лог: ${logPath}`);
  logger.logInfo(`Завантажено ${components.length} позицій`, { file: req.file.originalname });

  const parseStartedAt = Date.now();
  try {
    const results = await parseWithCluster(components, serverPartsFromXml);
    const elapsedSec = Math.round((Date.now() - parseStartedAt) / 1000);

    fs.unlinkSync(filePath);

    const outputFilePath = path.join(__dirname, "public", "parsed_results.json");
    fs.writeFileSync(outputFilePath, JSON.stringify(results, null, 2), "utf-8");

    logger.logInfo(`Парсинг завершено за ${elapsedSec}с`, { results: results.length });
    console.log(`Готово за ${elapsedSec}с. Лог: ${logPath}`);

    res.json({ results, file: "/parsed_results.json", logFile: logPath });
  } catch (err) {
    logger.logError("Критична помилка парсингу", { message: err.message, stack: err.stack });
    fs.unlinkSync(filePath);
    res.json({ error: err.message || "Помилка при парсингу", logFile: logPath });
  } finally {
    logger.endParseLog();
  }
});

async function parseWithCluster(components, serverPartsFromXml = null) {
  const otherParsers = serverPartsFromXml
    ? [hwfParser, hardkievParser, promParser]
    : [hwfParser, hardkievParser, serverPartsParser, promParser];

  const shopTasks = components.map((component) => ({ component, parser: serverShopParser }));
  const otherTasks = [];
  for (const component of components) {
    for (const parser of otherParsers) {
      otherTasks.push({ component, parser });
    }
  }

  const total = shopTasks.length + otherTasks.length;
  let completed = 0;
  let errors = 0;
  let lastActiveSite = "старт";
  progressStartTime = Date.now();
  lastPlainProgressLog = 0;

  const siteCount = otherParsers.length + 1;
  const parseSummary =
    `Парсинг: ${components.length} товарів × ${siteCount} сайтів = ${total} задач | ` +
    `Server-Shop: stealth, ×2, пауза 5с | інші: ×8, пауза 1.5с`;
  logger.logInfo(parseSummary);
  reportProgress(0, total, 0, lastActiveSite);

  const progressInterval = setInterval(() => {
    reportProgress(completed, total, errors, lastActiveSite);
  }, 1000);

  const createTaskHandler = (cluster) =>
    cluster.task(async ({ page, data }) => {
      const { component, parser } = data;
      try {
        await page.setRequestInterception(true);
        setupPageInterception(page);
        await page.setUserAgent(USER_AGENT);
        const parseResult = await parser.parseSite(page, component);
        return {
          component,
          siteName: parseResult.siteName,
          productItems: parseResult.productItems,
          error: parseResult.error,
        };
      } catch (err) {
        logger.logError(`Помилка парсингу на ${parser.name}`, {
          component,
          message: err.message,
          stack: err.stack,
        });
        return { component, siteName: parser.name, productItems: [], error: err.message };
      }
    });

  const runTasks = async (cluster, tasks) =>
    Promise.all(
      tasks.map(async (task) => {
        lastActiveSite = task.parser.name;
        const result = await cluster.execute(task);
        completed++;
        if (result.error) errors++;
        reportProgress(completed, total, errors, task.parser.name);
        return result;
      })
    );

  const shopCluster = await Cluster.launch(SERVER_SHOP_CLUSTER);
  const mainCluster = await Cluster.launch(MAIN_CLUSTER);
  createTaskHandler(shopCluster);
  createTaskHandler(mainCluster);

  let rawResults;
  try {
    const [shopResults, otherResults] = await Promise.all([
      runTasks(shopCluster, shopTasks),
      runTasks(mainCluster, otherTasks),
    ]);
    rawResults = [...shopResults, ...otherResults];
  } finally {
    clearInterval(progressInterval);
  }

  finishProgress();
  const doneMsg = `Завершено: ${completed} задач, помилок: ${errors}`;
  logger.logInfo(doneMsg);
  console.log(doneMsg);

  const groupedResults = {};
  for (const { component, productItems } of rawResults) {
    if (!groupedResults[component]) {
      groupedResults[component] = [];
    }
    groupedResults[component].push(...productItems);
  }

  await shopCluster.idle();
  await shopCluster.close();
  await mainCluster.idle();
  await mainCluster.close();

  return Object.entries(groupedResults).map(([name, results]) => {
    if (serverPartsFromXml?.[name]) {
      results.unshift(serverPartsFromXml[name]);
    }
    return { name, results };
  });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Сервер працює на порту ${PORT}`));
