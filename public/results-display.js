(function () {
  let cheaperProducts = [];
  let currentIndex = 0;

  function parsePrice(priceString) {
    const numericString = priceString.replace(/[^\d,.]/g, "").replace(",", ".");
    const numericValue = parseFloat(numericString);
    return isNaN(numericValue) ? null : numericValue;
  }

  function isServerPartsSite(siteResult) {
    return siteResult.site.toLowerCase() === "serverparts";
  }

  function displayResults(results) {
    const resultsContainer = document.getElementById("results-container");
    const cheaperMenuContainer = document.getElementById("cheaper-menu");
    const availabilityFilter = document.getElementById("availability-filter").checked;
    const orderFilter = document.getElementById("order-filter").checked;

    resultsContainer.innerHTML = "";
    cheaperMenuContainer.innerHTML = "";
    cheaperProducts = [];

    results.forEach((result, resultIndex) => {
      const resultDiv = document.createElement("div");
      const productBlockId = `product-${resultIndex}`;
      resultDiv.setAttribute("id", productBlockId);
      resultDiv.classList.add("result");

      resultDiv.innerHTML = `<strong>${result.name}</strong><br/>`;

      let serverPartsPrice = null;
      const serverPartsIndex = result.results.findIndex(
        (item) => item.site.toLowerCase() === "serverparts"
      );

      if (serverPartsIndex !== -1) {
        serverPartsPrice = parsePrice(result.results[serverPartsIndex].price);
      }

      let hasCheaperThanServerParts = false;

      result.results.forEach((siteResult) => {
        if (isServerPartsSite(siteResult)) return;

        const price = parsePrice(siteResult.price);
        if (
          serverPartsPrice !== null &&
          price !== null &&
          price < serverPartsPrice &&
          ResultsExport.passesFilters(siteResult, availabilityFilter, orderFilter)
        ) {
          hasCheaperThanServerParts = true;
        }
      });

      if (hasCheaperThanServerParts) {
        cheaperProducts.push({ name: result.name, blockId: productBlockId });
      }

      result.results.forEach((siteResult) => {
        if (!ResultsExport.passesFilters(siteResult, availabilityFilter, orderFilter)) {
          return;
        }

        const siteBlock = document.createElement("div");
        siteBlock.innerHTML = `
          <span class="site-name">${siteResult.site}:</span><br/>
          Назва товару: ${siteResult.name}<br/>
          Ціна: ${siteResult.price}<br/>
          Наявність: ${siteResult.availability}<br/>
          <a href="${siteResult.link}" target="_blank">Посилання на товар</a><br/><br/>
        `;

        const price = parsePrice(siteResult.price);

        if (serverPartsPrice !== null && price !== null && price < serverPartsPrice) {
          siteBlock.style.backgroundColor = "rgba(0, 255, 0, 0.23)";
          siteBlock.style.color = "black";
          siteBlock.style.borderRadius = "3px";
        }

        if (
          serverPartsPrice !== null &&
          siteResult.site.toLowerCase() === "serverparts" &&
          hasCheaperThanServerParts
        ) {
          siteBlock.style.backgroundColor = "rgba(197, 17, 17, 0.29)";
          siteBlock.style.color = "black";
          siteBlock.style.borderRadius = "3px";
        }

        resultDiv.appendChild(siteBlock);
      });

      resultsContainer.appendChild(resultDiv);
    });

    if (cheaperProducts.length > 0) {
      let menuHtml = `
        <button class="nav-btn" onclick="navigateProduct(-1)">🔼</button>
        <button class="nav-btn" onclick="navigateProduct(1)">🔽</button>
        <ul>
      `;
      cheaperProducts.forEach((item) => {
        menuHtml += `<li><a href="#${item.blockId}">${item.name}</a></li>`;
      });
      menuHtml += "</ul>";
      cheaperMenuContainer.innerHTML = menuHtml;
    } else {
      cheaperMenuContainer.innerHTML = "<p>Немає товарів з ціною нижче, ніж у serverparts.</p>";
    }
  }

  function updateResults() {
    const savedResults = JSON.parse(localStorage.getItem("lastResults")) || [];
    displayResults(savedResults);
  }

  function init() {
    document.getElementById("availability-filter").addEventListener("change", updateResults);
    document.getElementById("order-filter").addEventListener("change", updateResults);

    document.getElementById("export-xml-btn").addEventListener("click", () => {
      const results = JSON.parse(localStorage.getItem("lastResults")) || [];
      if (!results.length) {
        alert("Немає результатів для експорту.");
        return;
      }
      const availabilityFilter = document.getElementById("availability-filter").checked;
      const orderFilter = document.getElementById("order-filter").checked;
      ResultsExport.exportFilteredXml(results, availabilityFilter, orderFilter);
    });

    window.navigateProduct = function (direction) {
      if (cheaperProducts.length === 0) return;

      currentIndex += direction;

      if (currentIndex < 0) {
        currentIndex = 0;
      } else if (currentIndex >= cheaperProducts.length) {
        currentIndex = cheaperProducts.length - 1;
      }

      const targetElement = document.getElementById(cheaperProducts[currentIndex].blockId);
      if (targetElement) {
        targetElement.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    };
  }

  window.ResultsDisplay = {
    init,
    displayResults,
    updateResults,
  };
})();
