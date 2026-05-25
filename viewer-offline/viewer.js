document.addEventListener("DOMContentLoaded", function () {
  ResultsDisplay.init();

  const jsonInput = document.getElementById("json-input");
  const jsonForm = document.getElementById("json-form");
  const dropZone = document.getElementById("drop-zone");
  const fileNameEl = document.getElementById("file-name");

  function validateResults(data) {
    if (!Array.isArray(data) || data.length === 0) {
      return false;
    }

    return data.every(
      (item) =>
        item &&
        typeof item.name === "string" &&
        Array.isArray(item.results) &&
        item.results.every(
          (site) =>
            site &&
            typeof site.site === "string" &&
            typeof site.name === "string" &&
            typeof site.price === "string" &&
            typeof site.link === "string" &&
            typeof site.availability === "string"
        )
    );
  }

  function loadResults(data, sourceLabel) {
    if (!validateResults(data)) {
      alert("Невірний формат JSON. Очікується масив об'єктів з полями name та results.");
      return;
    }

    localStorage.setItem("lastResults", JSON.stringify(data));
    ResultsDisplay.displayResults(data);

    if (sourceLabel) {
      fileNameEl.textContent = `Завантажено: ${sourceLabel}`;
    }
  }

  function readJsonFile(file) {
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".json")) {
      alert("Оберіть файл у форматі JSON (.json).");
      return;
    }

    const reader = new FileReader();

    reader.onload = function (event) {
      try {
        const data = JSON.parse(event.target.result);
        loadResults(data, file.name);
      } catch (error) {
        console.error("JSON parse error:", error);
        alert("Не вдалося прочитати JSON-файл. Перевірте, що файл не пошкоджений.");
      }
    };

    reader.onerror = function () {
      alert("Помилка читання файлу.");
    };

    reader.readAsText(file, "utf-8");
  }

  function loadFromLocalStorage() {
    const saved = localStorage.getItem("lastResults");
    if (!saved) return;

    try {
      const data = JSON.parse(saved);
      if (validateResults(data)) {
        ResultsDisplay.displayResults(data);
        fileNameEl.textContent = "Показано збережені результати (localStorage)";
      }
    } catch (error) {
      console.warn("Не вдалося завантажити з localStorage:", error);
    }
  }

  jsonForm.addEventListener("submit", function (event) {
    event.preventDefault();
    readJsonFile(jsonInput.files[0]);
  });

  jsonInput.addEventListener("change", function () {
    if (jsonInput.files[0]) {
      fileNameEl.textContent = `Обрано: ${jsonInput.files[0].name}`;
    }
  });

  dropZone.addEventListener("dragover", function (event) {
    event.preventDefault();
    dropZone.classList.add("drag-over");
  });

  dropZone.addEventListener("dragleave", function () {
    dropZone.classList.remove("drag-over");
  });

  dropZone.addEventListener("drop", function (event) {
    event.preventDefault();
    dropZone.classList.remove("drag-over");

    const file = event.dataTransfer.files[0];
    if (file) {
      readJsonFile(file);
    }
  });

  loadFromLocalStorage();
});
