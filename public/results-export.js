(function () {
  function parsePrice(priceString) {
    const numericString = String(priceString ?? "")
      .replace(/[^\d,.]/g, "")
      .replace(",", ".");
    const numericValue = parseFloat(numericString);
    return Number.isNaN(numericValue) ? null : numericValue;
  }

  function formatPrice(value) {
    return `${value.toFixed(2)} грн.`;
  }

  function isServerPartsSite(siteResult) {
    return siteResult.site.toLowerCase() === "serverparts";
  }

  function passesAvailabilityFilter(siteResult, availabilityFilter) {
    if (!availabilityFilter) return true;
    return (
      siteResult.availability !== "Немає в наявності" &&
      siteResult.availability !== "Наявність не вказана" &&
      siteResult.availability !== "Немає даних"
    );
  }

  function passesOrderFilter(siteResult, orderFilter) {
    if (!orderFilter) return true;
    return siteResult.availability !== "Під замовлення";
  }

  function passesFilters(siteResult, availabilityFilter, orderFilter) {
    if (isServerPartsSite(siteResult)) return true;
    return (
      passesAvailabilityFilter(siteResult, availabilityFilter) &&
      passesOrderFilter(siteResult, orderFilter)
    );
  }

  function findServerPartsOffer(results) {
    return results.find((siteResult) => isServerPartsSite(siteResult)) || null;
  }

  function filterCheaperResults(results, availabilityFilter, orderFilter) {
    return results
      .map((product) => {
        const serverPartsOffer = findServerPartsOffer(product.results);
        const serverPartsPrice = serverPartsOffer
          ? parsePrice(serverPartsOffer.price)
          : null;

        if (serverPartsPrice === null) {
          return null;
        }

        const cheaperOffers = product.results
          .filter((siteResult) => !isServerPartsSite(siteResult))
          .filter((siteResult) =>
            passesFilters(siteResult, availabilityFilter, orderFilter)
          )
          .map((siteResult) => {
            const price = parsePrice(siteResult.price);
            if (price === null || price >= serverPartsPrice) {
              return null;
            }

            return {
              ...siteResult,
              priceNumeric: price,
              savingsNumeric: serverPartsPrice - price,
            };
          })
          .filter(Boolean);

        if (cheaperOffers.length === 0) {
          return null;
        }

        return {
          name: product.name,
          serverPartsOffer,
          serverPartsPrice,
          cheaperOffers,
        };
      })
      .filter(Boolean);
  }

  function escapeXml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  function buildServerPartsXml(serverPartsOffer, serverPartsPrice) {
    return [
      "    <serverparts>",
      `      <price>${escapeXml(serverPartsOffer.price)}</price>`,
      `      <price_numeric>${serverPartsPrice.toFixed(2)}</price_numeric>`,
      `      <name>${escapeXml(serverPartsOffer.name)}</name>`,
      `      <availability>${escapeXml(serverPartsOffer.availability)}</availability>`,
      `      <link>${escapeXml(serverPartsOffer.link)}</link>`,
      "    </serverparts>",
    ].join("\n");
  }

  function buildCheaperOfferXml(offer) {
    return [
      `    <cheaper_offer site="${escapeXml(offer.site)}">`,
      `      <name>${escapeXml(offer.name)}</name>`,
      `      <price>${escapeXml(offer.price)}</price>`,
      `      <price_numeric>${offer.priceNumeric.toFixed(2)}</price_numeric>`,
      `      <savings>${escapeXml(formatPrice(offer.savingsNumeric))}</savings>`,
      `      <savings_numeric>${offer.savingsNumeric.toFixed(2)}</savings_numeric>`,
      `      <availability>${escapeXml(offer.availability)}</availability>`,
      `      <link>${escapeXml(offer.link)}</link>`,
      "    </cheaper_offer>",
    ].join("\n");
  }

  function buildGroupedXml(filteredResults) {
    const generated = new Date().toISOString();
    const productsXml = filteredResults
      .map((product) => {
        const offersXml = product.cheaperOffers.map(buildCheaperOfferXml).join("\n");
        return [
          `  <product name="${escapeXml(product.name)}">`,
          buildServerPartsXml(product.serverPartsOffer, product.serverPartsPrice),
          offersXml,
          "  </product>",
        ].join("\n");
      })
      .join("\n");

    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      `<products generated="${escapeXml(generated)}" description="Товари з ціною нижче за ServerParts">`,
      productsXml,
      "</products>",
    ].join("\n");
  }

  function downloadXml(xml, filename) {
    const blob = new Blob([xml], { type: "application/xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function exportFilteredXml(results, availabilityFilter, orderFilter) {
    const filtered = filterCheaperResults(results, availabilityFilter, orderFilter);
    if (filtered.length === 0) {
      alert("Немає товарів з ціною нижче, ніж у ServerParts (з урахуванням фільтрів).");
      return;
    }
    const xml = buildGroupedXml(filtered);
    downloadXml(xml, "parsed_results.xml");
  }

  window.ResultsExport = {
    passesFilters,
    filterCheaperResults,
    buildGroupedXml,
    downloadXml,
    exportFilteredXml,
  };
})();
