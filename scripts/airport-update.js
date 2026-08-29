(() => {
  "use strict";

  const FIELD_DEFINITIONS = [
    { key: "airportCode", label: "IATA Code", required: true, aliases: ["iata", "iata code", "airport iata", "airport iata code", "airport code"] },
    { key: "airportIcao", label: "ICAO Code", required: false, aliases: ["icao", "icao code", "airport icao", "airport icao code"] },
    { key: "airportName", label: "Airport Name", required: true, aliases: ["airport", "airport name", "name", "aerodrome", "aerodrome name"] },
    { key: "country", label: "Country", required: false, aliases: ["country", "country name"] },
    { key: "summerLevel", label: "Summer Level", required: false, aliases: ["summer level", "summer", "summer coordination level", "summer airport level"] },
    { key: "winterLevel", label: "Winter Level", required: false, aliases: ["winter level", "winter", "winter coordination level", "winter airport level"] }
  ];

  let selectedFile = null;
  let analysedRows = [];
  let validationItems = [];
  let currentValidationFilter = "all";
  const els = {};

  document.addEventListener("DOMContentLoaded", () => {
    [
      "airportFile","analyseBtn","clearBtn","selectedFileName","selectedFileSize",
      "analysisSection","validationSection","previewSection","readySection",
      "totalRows","validRows","warningRows","errorRows","columnMapping",
      "analysisMessage","validationList","previewTableBody","showAllBtn",
      "showWarningsBtn","showErrorsBtn"
    ].forEach(id => els[id] = document.getElementById(id));

    els.airportFile.addEventListener("change", handleFileSelection);
    els.analyseBtn.addEventListener("click", analyseSelectedFile);
    els.clearBtn.addEventListener("click", resetPage);
    els.showAllBtn.addEventListener("click", () => { currentValidationFilter = "all"; renderValidationList(); });
    els.showWarningsBtn.addEventListener("click", () => { currentValidationFilter = "warning"; renderValidationList(); });
    els.showErrorsBtn.addEventListener("click", () => { currentValidationFilter = "error"; renderValidationList(); });

    resetPage();
  });

  function handleFileSelection(event) {
    selectedFile = event.target.files && event.target.files[0] ? event.target.files[0] : null;

    if (!selectedFile) {
      els.selectedFileName.textContent = "No file selected";
      els.selectedFileSize.textContent = "-";
      els.analyseBtn.disabled = true;
      return;
    }

    els.selectedFileName.textContent = selectedFile.name;
    els.selectedFileSize.textContent = formatFileSize(selectedFile.size);
    els.analyseBtn.disabled = false;
    hideResults();
  }

  async function analyseSelectedFile() {
    if (!selectedFile) return;

    els.analyseBtn.disabled = true;
    els.analyseBtn.textContent = "Analysing...";

    try {
      if (typeof XLSX === "undefined") {
        throw new Error("Excel reader library not loaded.");
      }

      const data = await selectedFile.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array" });

      if (!workbook.SheetNames.length) {
        throw new Error("No worksheet found.");
      }

      const rows = XLSX.utils.sheet_to_json(
        workbook.Sheets[workbook.SheetNames[0]],
        { defval: "", raw: false, blankrows: false }
      );

      if (!rows.length) {
        throw new Error("The first worksheet contains no airport rows.");
      }

      processRows(rows);
    } catch (error) {
      els.analysisSection.classList.remove("hidden");
      els.validationSection.classList.add("hidden");
      els.previewSection.classList.add("hidden");
      els.readySection.classList.add("hidden");
      showAnalysisMessage(error.message || "Unable to analyse the selected file.", "error");
      console.error(error);
    } finally {
      els.analyseBtn.disabled = false;
      els.analyseBtn.textContent = "Analyse File";
    }
  }

  function processRows(rows) {
    const mapping = detectColumnMapping(Object.keys(rows[0] || {}));
    renderColumnMapping(mapping);

    const missingRequired = FIELD_DEFINITIONS.filter(field => field.required && !mapping[field.key]);
    els.analysisSection.classList.remove("hidden");

    if (missingRequired.length) {
      els.totalRows.textContent = rows.length;
      els.validRows.textContent = "0";
      els.warningRows.textContent = "0";
      els.errorRows.textContent = rows.length;
      els.validationSection.classList.add("hidden");
      els.previewSection.classList.add("hidden");
      els.readySection.classList.add("hidden");
      showAnalysisMessage(
        "Required column(s) not detected: " + missingRequired.map(field => field.label).join(", "),
        "error"
      );
      return;
    }

    validationItems = [];

    analysedRows = rows.map((rawRow, index) => {
      const row = {
        rowNumber: index + 2,
        airportCode: cleanCode(getMappedValue(rawRow, mapping.airportCode)),
        airportIcao: cleanCode(getMappedValue(rawRow, mapping.airportIcao)),
        airportName: cleanText(getMappedValue(rawRow, mapping.airportName)),
        country: cleanText(getMappedValue(rawRow, mapping.country)),
        summerLevel: cleanLevel(getMappedValue(rawRow, mapping.summerLevel)),
        winterLevel: cleanLevel(getMappedValue(rawRow, mapping.winterLevel)),
        status: "valid",
        issues: []
      };

      validateAirportRow(row);
      return row;
    });

    detectDuplicateIataCodes();

    const validCount = analysedRows.filter(row => row.status === "valid").length;
    const warningCount = analysedRows.filter(row => row.status === "warning").length;
    const errorCount = analysedRows.filter(row => row.status === "error").length;

    els.totalRows.textContent = analysedRows.length;
    els.validRows.textContent = validCount;
    els.warningRows.textContent = warningCount;
    els.errorRows.textContent = errorCount;

    els.validationSection.classList.remove("hidden");
    els.previewSection.classList.remove("hidden");
    els.readySection.classList.remove("hidden");

    showAnalysisMessage(
      errorCount
        ? `${analysedRows.length} rows analysed. ${errorCount} row(s) contain errors.`
        : `${analysedRows.length} rows analysed successfully. Ready for Firebase comparison in Step 2.`,
      errorCount ? "warning" : "success"
    );

    renderValidationList();
    renderPreviewTable();
  }

  function detectColumnMapping(headers) {
    const normalizedHeaders = headers.map(header => ({
      original: header,
      normalized: normalizeHeading(header)
    }));

    const mapping = {};

    FIELD_DEFINITIONS.forEach(field => {
      const aliases = [normalizeHeading(field.label), ...field.aliases.map(normalizeHeading)];

      const exact = normalizedHeaders.find(header => aliases.includes(header.normalized));
      if (exact) {
        mapping[field.key] = exact.original;
        return;
      }

      const partial = normalizedHeaders.find(header =>
        aliases.some(alias =>
          alias.length >= 4 &&
          (header.normalized.includes(alias) || alias.includes(header.normalized))
        )
      );

      mapping[field.key] = partial ? partial.original : null;
    });

    return mapping;
  }

  function renderColumnMapping(mapping) {
    els.columnMapping.innerHTML = "";

    FIELD_DEFINITIONS.forEach(field => {
      const item = document.createElement("div");
      const detected = mapping[field.key];
      item.className = "column-map-item" + (!detected && field.required ? " missing" : "");
      item.innerHTML = `<strong>${escapeHtml(field.label)}:</strong> ${
        detected ? escapeHtml(detected) : (field.required ? "NOT FOUND" : "Not supplied")
      }`;
      els.columnMapping.appendChild(item);
    });
  }

  function validateAirportRow(row) {
    if (!row.airportCode) addIssue(row, "error", "IATA code is missing.");
    else if (!/^[A-Z]{3}$/.test(row.airportCode)) addIssue(row, "error", `IATA code "${row.airportCode}" must contain exactly 3 letters.`);

    if (!row.airportName) addIssue(row, "error", "Airport name is missing.");

    if (!row.airportIcao) addIssue(row, "warning", "ICAO code is not supplied.");
    else if (!/^[A-Z0-9]{4}$/.test(row.airportIcao)) addIssue(row, "warning", `ICAO code "${row.airportIcao}" is not in the expected 4-character format.`);

    if (!row.country) addIssue(row, "warning", "Country is not supplied.");

    validateLevel(row, "summerLevel", "Summer");
    validateLevel(row, "winterLevel", "Winter");
  }

  function validateLevel(row, property, label) {
    const value = row[property];

    if (!value) {
      addIssue(row, "warning", `${label} Level is not supplied.`);
      return;
    }

    if (!["1", "2", "3"].includes(value)) {
      addIssue(row, "error", `${label} Level "${value}" is invalid. Expected 1, 2 or 3.`);
    }
  }

  function detectDuplicateIataCodes() {
    const seen = new Map();

    analysedRows.forEach(row => {
      if (!row.airportCode) return;
      if (!seen.has(row.airportCode)) seen.set(row.airportCode, []);
      seen.get(row.airportCode).push(row);
    });

    seen.forEach((rows, code) => {
      if (rows.length < 2) return;
      rows.forEach(row => addIssue(row, "error", `Duplicate IATA code ${code} appears ${rows.length} times.`));
    });
  }

  function addIssue(row, type, message) {
    row.issues.push({ type, message });

    if (type === "error") row.status = "error";
    else if (type === "warning" && row.status !== "error") row.status = "warning";

    validationItems.push({
      type,
      rowNumber: row.rowNumber,
      airportCode: row.airportCode || "-",
      message
    });
  }

  function renderValidationList() {
    els.validationList.innerHTML = "";

    const filtered = currentValidationFilter === "all"
      ? validationItems
      : validationItems.filter(item => item.type === currentValidationFilter);

    if (!filtered.length) {
      const item = document.createElement("div");
      item.className = "validation-item info";
      item.textContent = currentValidationFilter === "all"
        ? "No validation issues detected."
        : `No ${currentValidationFilter} items detected.`;
      els.validationList.appendChild(item);
      return;
    }

    filtered.forEach(item => {
      const div = document.createElement("div");
      div.className = `validation-item ${item.type}`;
      div.innerHTML = `<span class="validation-type">${escapeHtml(item.type.toUpperCase())}</span>
        <strong>Row ${item.rowNumber}</strong> &nbsp; ${escapeHtml(item.airportCode)} &nbsp;—&nbsp; ${escapeHtml(item.message)}`;
      els.validationList.appendChild(div);
    });
  }

  function renderPreviewTable() {
    els.previewTableBody.innerHTML = "";

    analysedRows.forEach(row => {
      const tr = document.createElement("tr");
      tr.className = `row-${row.status}`;
      tr.innerHTML = `
        <td><span class="status-pill ${row.status}">${escapeHtml(row.status.toUpperCase())}</span></td>
        <td>${escapeHtml(row.airportCode || "-")}</td>
        <td>${escapeHtml(row.airportIcao || "-")}</td>
        <td>${escapeHtml(row.airportName || "-")}</td>
        <td>${escapeHtml(row.country || "-")}</td>
        <td>${escapeHtml(row.summerLevel || "-")}</td>
        <td>${escapeHtml(row.winterLevel || "-")}</td>
      `;
      els.previewTableBody.appendChild(tr);
    });
  }

  function getMappedValue(row, headerName) {
    if (!headerName) return "";
    const value = row[headerName];
    return value == null ? "" : value;
  }

  function cleanCode(value) {
    return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
  }

  function cleanText(value) {
    return String(value || "").trim().replace(/\s+/g, " ");
  }

  function cleanLevel(value) {
    const text = String(value || "").trim().toUpperCase();
    const match = text.match(/[123]/);
    return match ? match[0] : text;
  }

  function normalizeHeading(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[_\-\/]+/g, " ")
      .replace(/[^\w\s]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} bytes`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  function showAnalysisMessage(message, type) {
    els.analysisMessage.textContent = message;
    els.analysisMessage.className = `analysis-message ${type}`;
  }

  function hideResults() {
    ["analysisSection","validationSection","previewSection","readySection"].forEach(key => {
      if (els[key]) els[key].classList.add("hidden");
    });

    if (els.analysisMessage) {
      els.analysisMessage.textContent = "";
      els.analysisMessage.className = "analysis-message";
    }

    analysedRows = [];
    validationItems = [];

    if (els.previewTableBody) els.previewTableBody.innerHTML = "";
    if (els.validationList) els.validationList.innerHTML = "";
    if (els.columnMapping) els.columnMapping.innerHTML = "";

    ["totalRows","validRows","warningRows","errorRows"].forEach(key => {
      if (els[key]) els[key].textContent = "0";
    });
  }

  function resetPage() {
    selectedFile = null;
    analysedRows = [];
    validationItems = [];
    currentValidationFilter = "all";

    if (els.airportFile) els.airportFile.value = "";
    if (els.selectedFileName) els.selectedFileName.textContent = "No file selected";
    if (els.selectedFileSize) els.selectedFileSize.textContent = "-";
    if (els.analyseBtn) {
      els.analyseBtn.disabled = true;
      els.analyseBtn.textContent = "Analyse File";
    }

    hideResults();
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
})();
