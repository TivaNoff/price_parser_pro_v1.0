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

module.exports = { loadSearchPage };
