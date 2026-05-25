const puppeteer = require("puppeteer");
const { extractModelKey, modelMatches } = require("../parsers/search-utils");
const hardkiev = require("../parsers/hardkiev");
const serverShop = require("../parsers/server-shop");
const prom = require("../parsers/prom");

const SAMPLES = [
  {
    name: "Процессор Intel Xeon E5-2630L v2",
    expectModel: "e5-2630l",
    expectVersion: "2",
  },
  {
    name: "Процессор Intel Xeon E5-2650L v2",
    expectModel: "e5-2650l",
    expectVersion: "2",
  },
  {
    name: "Процессор Intel Core i7-7700",
    expectModel: "i7-7700",
    expectVersion: null,
  },
  {
    name: "Процессор Intel Xeon E5-2680 v2",
    expectModel: "e5-2680",
    expectVersion: "2",
  },
];

const ALLOWED = new Set(["document", "script", "xhr", "fetch", "stylesheet"]);

function assertModelMatch(inputName, resultName, expectModel, expectVersion) {
  const key = extractModelKey(resultName);
  if (key !== expectModel) {
    throw new Error(`model key: expected ${expectModel}, got ${key} (${resultName})`);
  }
  if (expectVersion && !modelMatches(inputName, resultName)) {
    throw new Error(`version mismatch for ${inputName} -> ${resultName}`);
  }
}

async function runParser(page, parser, component) {
  const result = await parser.parseSite(page, component);
  return result.productItems[0];
}

(async () => {
  console.log("=== search-utils unit checks ===");
  for (const sample of SAMPLES) {
    const key = extractModelKey(sample.name);
    if (key !== sample.expectModel) {
      console.error(`FAIL key ${sample.name}: ${key} !== ${sample.expectModel}`);
      process.exitCode = 1;
    } else {
      console.log(`OK key ${sample.name} -> ${key}`);
    }
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on("request", (req) => (ALLOWED.has(req.resourceType()) ? req.continue() : req.abort()));
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  );

  console.log("\n=== live parser checks ===");
  for (const sample of SAMPLES) {
    console.log(`\n--- ${sample.name} ---`);

    for (const [label, parser] of [
      ["HardKiev", hardkiev],
      ["Server-Shop", serverShop],
      ["Prom", prom],
    ]) {
      try {
        const item = await runParser(page, parser, sample.name);
        const found = item.name !== "Товар не знайдено";
        console.log(`${label}: ${found ? item.name : "not found"} | ${item.price}`);

        if (found && label === "Prom") {
          assertModelMatch(sample.name, item.name, sample.expectModel, sample.expectVersion);
          console.log(`${label}: model check OK`);
        }

        if (found && label === "HardKiev") {
          assertModelMatch(sample.name, item.name, sample.expectModel, sample.expectVersion);
          console.log(`${label}: model check OK`);
        }
      } catch (err) {
        console.error(`${label}: ERROR`, err.message);
        process.exitCode = 1;
      }
    }
  }

  await browser.close();
  console.log("\nDone.");
})();
