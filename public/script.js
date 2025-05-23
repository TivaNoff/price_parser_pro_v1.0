document.addEventListener("DOMContentLoaded", function () {
  let cheaperProducts = [];
  let currentIndex = 0;

  async function loadSavedResults() {
    try {
      const response = await fetch("/parsed_results.json");
      if (!response.ok) {
        console.warn("Файл с результатами еще не создан.");
        return;
      }
      const data = await response.json();
      localStorage.setItem("lastResults", JSON.stringify(data));
      displayResults(data);
    } catch (error) {
      console.error("Ошибка при загрузке данных:", error);
    }
  }

  loadSavedResults();

  document.getElementById("upload-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const fileInput = document.getElementById("file-input");
    const formData = new FormData();
    formData.append("file", fileInput.files[0]);
    document.getElementById("loading-indicator").style.display = "block";

    try {
      const response = await fetch("/parse", { method: "POST", body: formData });
      const data = await response.json();
      if (data.error) {
        alert(data.error);
        return;
      }
      localStorage.setItem("lastResults", JSON.stringify(data.results));
      displayResults(data.results);
    } catch (error) {
      console.error("Error:", error);
      alert("Сталася помилка при завантаженні файлу.");
    } finally {
      document.getElementById("loading-indicator").style.display = "none";
    }
  });

  function parsePrice(priceString) {
    let numericString = priceString.replace(/[^\d,.]/g, "").replace(",", ".");
    let numericValue = parseFloat(numericString);
    return isNaN(numericValue) ? null : numericValue;
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

      let header = `<strong>${result.name}</strong><br/>`;
      resultDiv.innerHTML = header;

      let serverPartsPrice = null;
      const serverPartsIndex = result.results.findIndex(item => item.site.toLowerCase() === "serverparts");

      if (serverPartsIndex !== -1) {
        serverPartsPrice = parsePrice(result.results[serverPartsIndex].price);
      }

      let hasCheaperThanServerParts = false;

      // Перевіряємо, чи є дешевші пропозиції у інших магазинів
      result.results.forEach((siteResult) => {
        const price = parsePrice(siteResult.price);
        const available = !availabilityFilter 
          || (
               siteResult.availability !== "Немає в наявності"
            && siteResult.availability !== "Наявність не вказана"
            && siteResult.availability !== "Немає даних"
             );
        const orderable = !orderFilter || siteResult.availability !== "Під замовлення";

        if (serverPartsPrice !== null && price !== null && price < serverPartsPrice && available && orderable) {
          hasCheaperThanServerParts = true;
        }
      });

      if (hasCheaperThanServerParts) {
        cheaperProducts.push({ name: result.name, blockId: productBlockId });
      }

      // Виводимо результати з урахуванням фільтрів
      result.results.forEach((siteResult) => {
        if (
          (availabilityFilter && (
              siteResult.availability === "Немає в наявності"
           || siteResult.availability === "Наявність не вказана"
           || siteResult.availability === "Немає даних"
          )) ||
          (orderFilter && siteResult.availability === "Під замовлення")
        ) {
          return;
        }

        const siteBlock = document.createElement("div");
        let content = `
          <span class="site-name">${siteResult.site}:</span><br/>
          Назва товару: ${siteResult.name}<br/>
          Ціна: ${siteResult.price}<br/>
          Наявність: ${siteResult.availability}<br/>
          <a href="${siteResult.link}" target="_blank">Посилання на товар</a><br/><br/>
        `;
        siteBlock.innerHTML = content;

        const price = parsePrice(siteResult.price);

        if (serverPartsPrice !== null && price !== null && price < serverPartsPrice) {
          siteBlock.style.backgroundColor = "rgba(0, 255, 0, 0.23)";
          siteBlock.style.color = "black";
          siteBlock.style.borderRadius = "3px";
        }

        if (serverPartsPrice !== null && siteResult.site.toLowerCase() === "serverparts" && hasCheaperThanServerParts) {
          siteBlock.style.backgroundColor = "rgba(197, 17, 17, 0.29)";
          siteBlock.style.color = "black";
          siteBlock.style.borderRadius = "3px";
        }

        resultDiv.appendChild(siteBlock);
      });

      resultsContainer.appendChild(resultDiv);
    });

    // Меню навігації по дешевим товарам
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

  document.getElementById("availability-filter").addEventListener("change", updateResults);
  document.getElementById("order-filter").addEventListener("change", updateResults);

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
});
