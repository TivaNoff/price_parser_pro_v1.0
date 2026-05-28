const { normalizeAvailability } = require("./availability-utils");

async function loadSearchPage(page, url, waitSelector, options = {}) {
  const {
    waitUntil = "domcontentloaded",
    gotoTimeout = 20000,
    selectorTimeout = 12000,
    retries = 2,
    retryDelayMs = 2000,
  } = options;

  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await page.goto(url, { waitUntil, timeout: gotoTimeout });
      await page.waitForSelector(waitSelector, { timeout: selectorTimeout });
      return;
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, retryDelayMs * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

async function fetchAvailabilityFromProductPage(page, link, selectors, fallback = "Наявність не вказана") {
  if (!link || link === "Посилання не знайдено") return fallback;

  try {
    await page.goto(link, { waitUntil: "domcontentloaded", timeout: 15000 });
    const raw = await page.evaluate((sels, fb) => {
      for (const sel of sels) {
        const text = document.querySelector(sel)?.innerText?.trim();
        if (text) return text;
      }
      return fb;
    }, selectors, fallback);
    return normalizeAvailability(raw);
  } catch {
    return normalizeAvailability(fallback);
  }
}

async function fetchHardKievAvailability(page, link, fallback = "Наявність не вказана") {
  if (!link || link === "Посилання не знайдено") return normalizeAvailability(fallback);

  try {
    await page.goto(link, { waitUntil: "domcontentloaded", timeout: 15000 });
    const raw = await page.evaluate(() => {
      const purchaseStock = document.querySelector(".purchase .stocks")?.innerText?.trim();
      if (purchaseStock) return purchaseStock;

      const add2cartStatus = document.querySelector(".add2cart .price")?.innerText?.trim();
      if (add2cartStatus && !/^\d[\d\s.,]*\s*грн\.?$/i.test(add2cartStatus)) {
        return add2cartStatus;
      }

      return "";
    });
    return normalizeAvailability(raw || fallback);
  } catch {
    return normalizeAvailability(fallback);
  }
}

async function fetchServerShopAvailability(page, link, fallback = "Наявність не вказана") {
  if (!link || link === "Посилання не знайдено") return normalizeAvailability(fallback);

  try {
    await page.goto(link, { waitUntil: "domcontentloaded", timeout: 15000 });
    const raw = await page.evaluate(() => {
      return (
        document.querySelector(".status.status_yes")?.innerText?.trim() ||
        document.querySelector(".status.status_no")?.innerText?.trim() ||
        document.querySelector(".status")?.innerText?.trim() ||
        ""
      );
    });
    return normalizeAvailability(raw || fallback);
  } catch {
    return normalizeAvailability(fallback);
  }
}

module.exports = {
  loadSearchPage,
  fetchAvailabilityFromProductPage,
  fetchHardKievAvailability,
  fetchServerShopAvailability,
};
