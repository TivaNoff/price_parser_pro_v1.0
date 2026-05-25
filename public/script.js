document.addEventListener("DOMContentLoaded", function () {
  ResultsDisplay.init();

  async function loadSavedResults() {
    try {
      const response = await fetch("/parsed_results.json");
      if (!response.ok) {
        console.warn("Файл с результатами еще не создан.");
        return;
      }
      const data = await response.json();
      localStorage.setItem("lastResults", JSON.stringify(data));
      ResultsDisplay.displayResults(data);
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
      ResultsDisplay.displayResults(data.results);
    } catch (error) {
      console.error("Error:", error);
      alert("Сталася помилка при завантаженні файлу.");
    } finally {
      document.getElementById("loading-indicator").style.display = "none";
    }
  });
});
