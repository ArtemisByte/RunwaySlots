const LIVE_HISTORY_PATH = "scrHistory";
const BACKUP_HISTORY_PATH = "scrHistoryBackup";

const state = {
  database: null,
  liveReference: null,
  backupReference: null,
  liveRecords: {},
  backupRecords: {},
  allRecords: [],
  filteredRecords: [],
  charts: {},
  selectedRecord: null
};

const elements = {
  utcClock: document.getElementById("utcClock"),
  utcDate: document.getElementById("utcDate"),
  databaseStatus: document.getElementById("databaseStatus"),
  databaseStatusText: document.getElementById("databaseStatusText"),

  rangeFilter: document.getElementById("rangeFilter"),
  actionFilter: document.getElementById("actionFilter"),
  searchFilter: document.getElementById("searchFilter"),
  resetButton: document.getElementById("resetButton"),
  exportTopButton: document.getElementById("exportTopButton"),

  totalRequests: document.getElementById("totalRequests"),
  totalNote: document.getElementById("totalNote"),
  newRequests: document.getElementById("newRequests"),
  newNote: document.getElementById("newNote"),
  changeRequests: document.getElementById("changeRequests"),
  changeNote: document.getElementById("changeNote"),
  cancelRequests: document.getElementById("cancelRequests"),
  cancelNote: document.getElementById("cancelNote"),
  uniqueAirports: document.getElementById("uniqueAirports"),
  topAirportNote: document.getElementById("topAirportNote"),

  activityTableBody: document.getElementById("activityTableBody"),
  recordSummary: document.getElementById("recordSummary"),
  exportButton: document.getElementById("exportButton"),
  emptyState: document.getElementById("emptyState"),
  objectCount: document.getElementById("objectCount"),

  detailBackdrop: document.getElementById("detailBackdrop"),
  detailTitle: document.getElementById("detailTitle"),
  detailTime: document.getElementById("detailTime"),
  detailAction: document.getElementById("detailAction"),
  detailAirport: document.getElementById("detailAirport"),
  detailFlight: document.getElementById("detailFlight"),
  detailDirection: document.getElementById("detailDirection"),
  detailService: document.getElementById("detailService"),
  detailMessage: document.getElementById("detailMessage"),
  copyDialogButton: document.getElementById("copyDialogButton"),
  closeDialogButton: document.getElementById("closeDialogButton"),
  dialogCloseButton: document.getElementById("dialogCloseButton")
};

function updateClock() {
  const now = new Date();

  if (elements.utcClock) {
    elements.utcClock.textContent = now.toLocaleTimeString("en-GB", {
      timeZone: "UTC",
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  }

  if (elements.utcDate) {
    elements.utcDate.textContent = now
      .toLocaleDateString("en-GB", {
        timeZone: "UTC",
        day: "2-digit",
        month: "short",
        year: "numeric"
      })
      .replace(/\s/g, "")
      .toUpperCase();
  }
}

function setDatabaseStatus(status, text) {
  if (elements.databaseStatus) {
    elements.databaseStatus.className =
      `info-box database-status ${status}`;
  }

  if (elements.databaseStatusText) {
    elements.databaseStatusText.textContent = text;
  }
}

function normaliseAction(value) {
  const action = String(value || "").trim().toUpperCase();

  if (
    action.includes("CHANGE") ||
    action === "C" ||
    action === "R"
  ) {
    return "CHANGE";
  }

  if (
    action.includes("CANCEL") ||
    action.includes("CANX") ||
    action === "D"
  ) {
    return "CANCEL";
  }

  return "NEW";
}

function getRecordTimestamp(value) {
  const candidates = [
    value.createdAt,
    value.clientTimestamp,
    value.timestamp,
    value.time,
    value.dateCreated,
    value.savedAt
  ];

  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null || candidate === "") {
      continue;
    }

    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate;
    }

    if (
      typeof candidate === "object" &&
      typeof candidate.toMillis === "function"
    ) {
      return candidate.toMillis();
    }

    const numericValue = Number(candidate);

    if (Number.isFinite(numericValue) && numericValue > 0) {
      return numericValue;
    }

    const parsedValue = Date.parse(String(candidate));

    if (Number.isFinite(parsedValue)) {
      return parsedValue;
    }
  }

  return Date.now();
}

function normaliseRecord(id, value) {
  const record = value && typeof value === "object" ? value : {};

  return {
    id,

    type: normaliseAction(
      record.type ||
      record.action ||
      record.slotType ||
      record.requestType
    ),

    airport: String(
      record.airport ||
      record.airportCode ||
      record.iata ||
      "--"
    ).toUpperCase(),

    flightNumber: String(
      record.flightNumber ||
      record.flight ||
      record.flightNo ||
      "--"
    ).toUpperCase(),

    direction: String(
      record.direction ||
      record.movement ||
      "--"
    ),

    serviceType: String(
      record.serviceType ||
      record.service ||
      record.stc ||
      "--"
    ).toUpperCase(),

    registration: String(
      record.registration ||
      record.reg ||
      record.aircraftRegistration ||
      "-"
    ).toUpperCase(),

    scrMessage: String(
      record.scrMessage ||
      record.scr ||
      record.message ||
      record.output ||
      ""
    ),

    createdAt: getRecordTimestamp(record)
  };
}

function rebuildRecords() {
  /*
    Backup records are loaded first.

    A matching live record temporarily replaces the archived record
    while it exists. If Multi Flight deletes the live child, the backup
    record automatically becomes visible again.
  */
  const combined = {
    ...state.backupRecords,
    ...state.liveRecords
  };

  state.allRecords = Object.values(combined)
    .sort((a, b) => b.createdAt - a.createdAt);

  applyFilters();
}

function createBackupPayload(recordId, value) {
  const source =
    value && typeof value === "object"
      ? { ...value }
      : {};

  return {
    ...source,
    originalHistoryKey: recordId,
    backupSourcePath: LIVE_HISTORY_PATH,
    backupCreatedAt: firebase.database.ServerValue.TIMESTAMP
  };
}

async function archiveRecord(recordId, value) {
  if (!state.backupReference || !recordId || !value) {
    return;
  }

  try {
    /*
      Transaction creates the backup only when it does not already exist.

      Returning undefined leaves an existing backup unchanged.
      No remove(), set(null), or null update is used anywhere.
    */
    await state.backupReference
      .child(recordId)
      .transaction(currentBackup => {
        if (currentBackup !== null) {
          return;
        }

        return createBackupPayload(recordId, value);
      });
  } catch (error) {
    console.error(
      `Unable to archive SCR history record ${recordId}:`,
      error
    );
  }
}

function startFirebase() {
  try {
    if (
      typeof firebase === "undefined" ||
      !firebase.apps ||
      firebase.apps.length === 0
    ) {
      throw new Error(
        "Firebase is not initialised. Load firebase.js before the analytics script."
      );
    }

    state.database = firebase.database();

    state.liveReference =
      state.database.ref(LIVE_HISTORY_PATH);

    state.backupReference =
      state.database.ref(BACKUP_HISTORY_PATH);

    state.database
      .ref(".info/connected")
      .on("value", snapshot => {
        const connected = snapshot.val() === true;

        setDatabaseStatus(
          connected ? "online" : "offline",
          connected
            ? "Database Online"
            : "Database Offline"
        );
      });

    /*
      Load archived records.

      The analytics page only reads this path after records have been
      archived. It never removes backup records.
    */
    state.backupReference.on(
      "child_added",
      snapshot => {
        state.backupRecords[snapshot.key] =
          normaliseRecord(snapshot.key, snapshot.val());

        rebuildRecords();
      },
      error => {
        console.error("Backup history read failed:", error);
      }
    );

    state.backupReference.on(
      "child_changed",
      snapshot => {
        state.backupRecords[snapshot.key] =
          normaliseRecord(snapshot.key, snapshot.val());

        rebuildRecords();
      }
    );

    /*
      This only updates browser memory if a backup was deleted outside
      this page. It does not delete anything from Firebase.
    */
    state.backupReference.on(
      "child_removed",
      snapshot => {
        delete state.backupRecords[snapshot.key];
        rebuildRecords();
      }
    );

    /*
      Existing live children trigger child_added when the page opens.
      New history records also trigger child_added.
    */
    state.liveReference.on(
      "child_added",
      snapshot => {
        const recordId = snapshot.key;
        const value = snapshot.val();

        state.liveRecords[recordId] =
          normaliseRecord(recordId, value);

        rebuildRecords();

        archiveRecord(recordId, value);
      },
      error => {
        console.error("Live history read failed:", error);

        setDatabaseStatus(
          "offline",
          "Database Read Failed"
        );
      }
    );

    /*
      Updated shared-history records remain visible live.

      The original archived record is not overwritten because archiveRecord()
      only creates a backup when one does not already exist.
    */
    state.liveReference.on(
      "child_changed",
      snapshot => {
        const recordId = snapshot.key;
        const value = snapshot.val();

        state.liveRecords[recordId] =
          normaliseRecord(recordId, value);

        rebuildRecords();

        archiveRecord(recordId, value);
      }
    );

    /*
      Multi Flight may remove a child from /scrHistory.

      This handler removes only the in-memory live version. It never calls
      Firebase remove(), set(null), or update({ key: null }).

      The archived record remains in /scrHistoryBackup and continues to
      appear on the analytics page.
    */
    state.liveReference.on(
      "child_removed",
      snapshot => {
        delete state.liveRecords[snapshot.key];
        rebuildRecords();
      }
    );
  } catch (error) {
    console.error(error);

    setDatabaseStatus(
      "offline",
      "Database Error"
    );

    rebuildRecords();
  }
}

function getRangeCutoff() {
  const range = elements.rangeFilter?.value || "7";

  if (range === "all") {
    return 0;
  }

  return (
    Date.now() -
    Number(range) *
    24 *
    60 *
    60 *
    1000
  );
}

function applyFilters() {
  const cutoff = getRangeCutoff();
  const action = elements.actionFilter?.value || "ALL";
  const search = String(elements.searchFilter?.value || "")
    .trim()
    .toUpperCase();

  state.filteredRecords = state.allRecords.filter(record => {
    const rangeMatch =
      cutoff === 0 ||
      record.createdAt >= cutoff;

    const actionMatch =
      action === "ALL" ||
      record.type === action;

    const searchMatch =
      !search ||
      record.airport.includes(search) ||
      record.flightNumber.includes(search) ||
      record.direction.toUpperCase().includes(search) ||
      record.serviceType.includes(search) ||
      record.registration.includes(search);

    return rangeMatch && actionMatch && searchMatch;
  });

  renderDashboard();
}

function countBy(records, property) {
  return records.reduce((result, record) => {
    const key = record[property];

    result[key] = (result[key] || 0) + 1;

    return result;
  }, {});
}

function getTopEntry(counts) {
  return (
    Object.entries(counts)
      .sort((a, b) => b[1] - a[1])[0] ||
    null
  );
}

function percentage(value, total) {
  return total
    ? Math.round((value / total) * 100)
    : 0;
}

function formatUtc(timestamp) {
  return new Date(timestamp).toLocaleString("en-GB", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

function renderDashboard() {
  renderSummary();
  renderCharts();
  renderTable();
}

function renderSummary() {
  const total = state.filteredRecords.length;

  const actionCounts = countBy(
    state.filteredRecords,
    "type"
  );

  const airportCounts = countBy(
    state.filteredRecords,
    "airport"
  );

  const topAirport = getTopEntry(airportCounts);

  if (elements.totalRequests) {
    elements.totalRequests.textContent =
      total.toLocaleString("en-GB");
  }

  if (elements.totalNote) {
    elements.totalNote.textContent =
      `${total} FILTERED RECORDS`;
  }

  if (elements.newRequests) {
    elements.newRequests.textContent =
      (actionCounts.NEW || 0).toLocaleString("en-GB");
  }

  if (elements.newNote) {
    elements.newNote.textContent =
      `${percentage(
        actionCounts.NEW || 0,
        total
      )}% OF FILTERED ACTIVITY`;
  }

  if (elements.changeRequests) {
    elements.changeRequests.textContent =
      (actionCounts.CHANGE || 0).toLocaleString("en-GB");
  }

  if (elements.changeNote) {
    elements.changeNote.textContent =
      `${percentage(
        actionCounts.CHANGE || 0,
        total
      )}% OF FILTERED ACTIVITY`;
  }

  if (elements.cancelRequests) {
    elements.cancelRequests.textContent =
      (actionCounts.CANCEL || 0).toLocaleString("en-GB");
  }

  if (elements.cancelNote) {
    elements.cancelNote.textContent =
      `${percentage(
        actionCounts.CANCEL || 0,
        total
      )}% OF FILTERED ACTIVITY`;
  }

  if (elements.uniqueAirports) {
    elements.uniqueAirports.textContent =
      Object.keys(airportCounts).length;
  }

  if (elements.topAirportNote) {
    elements.topAirportNote.textContent =
      topAirport
        ? `TOP AIRPORT: ${topAirport[0]} (${topAirport[1]})`
        : "TOP AIRPORT: --";
  }
}

function chartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 100
    },
    plugins: {
      legend: {
        labels: {
          color: "#000000",
          font: {
            family: "Arial",
            size: 11,
            weight: "bold"
          },
          boxWidth: 13
        }
      },
      tooltip: {
        backgroundColor: "#ffffdf",
        titleColor: "#000000",
        bodyColor: "#000000",
        borderColor: "#000000",
        borderWidth: 1,
        padding: 7
      }
    },
    scales: {
      x: {
        grid: {
          color: "#d2d2d2"
        },
        ticks: {
          color: "#000000",
          font: {
            family: "Arial",
            size: 10
          }
        }
      },
      y: {
        beginAtZero: true,
        grid: {
          color: "#d2d2d2"
        },
        ticks: {
          color: "#000000",
          precision: 0,
          font: {
            family: "Arial",
            size: 10
          }
        }
      }
    }
  };
}

function replaceChart(name, elementId, config) {
  const canvas = document.getElementById(elementId);

  if (!canvas || typeof Chart === "undefined") {
    return;
  }

  if (state.charts[name]) {
    state.charts[name].destroy();
  }

  state.charts[name] = new Chart(canvas, config);
}

function renderCharts() {
  renderTrendChart();
  renderActionChart();
  renderAirportChart();
  renderHourChart();
}

function renderTrendChart() {
  const days = [];
  const daily = {};

  for (let index = 6; index >= 0; index -= 1) {
    const date = new Date();

    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() - index);

    const key = date.toISOString().slice(0, 10);

    days.push(key);

    daily[key] = {
      NEW: 0,
      CHANGE: 0,
      CANCEL: 0
    };
  }

  state.filteredRecords.forEach(record => {
    const key = new Date(record.createdAt)
      .toISOString()
      .slice(0, 10);

    if (daily[key]) {
      daily[key][record.type] += 1;
    }
  });

  replaceChart("trend", "trendChart", {
    type: "line",
    data: {
      labels: days.map(day => {
        return new Date(`${day}T00:00:00Z`)
          .toLocaleDateString("en-GB", {
            timeZone: "UTC",
            day: "2-digit",
            month: "short"
          });
      }),
      datasets: [
        {
          label: "NEW",
          data: days.map(day => daily[day].NEW),
          borderColor: "#008000",
          backgroundColor: "#008000",
          borderWidth: 2,
          tension: 0
        },
        {
          label: "CHANGE",
          data: days.map(day => daily[day].CHANGE),
          borderColor: "#c49a00",
          backgroundColor: "#c49a00",
          borderWidth: 2,
          tension: 0
        },
        {
          label: "CANCEL",
          data: days.map(day => daily[day].CANCEL),
          borderColor: "#aa0000",
          backgroundColor: "#aa0000",
          borderWidth: 2,
          tension: 0
        }
      ]
    },
    options: chartOptions()
  });
}

function renderActionChart() {
  const counts = countBy(
    state.filteredRecords,
    "type"
  );

  replaceChart("action", "actionChart", {
    type: "doughnut",
    data: {
      labels: [
        "NEW",
        "CHANGE",
        "CANCEL"
      ],
      datasets: [
        {
          data: [
            counts.NEW || 0,
            counts.CHANGE || 0,
            counts.CANCEL || 0
          ],
          backgroundColor: [
            "#008000",
            "#ffdd00",
            "#aa0000"
          ],
          borderColor: "#000000",
          borderWidth: 1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "58%",
      animation: {
        duration: 100
      },
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            color: "#000000",
            font: {
              family: "Arial",
              size: 11,
              weight: "bold"
            },
            boxWidth: 13
          }
        }
      }
    }
  });
}

function renderAirportChart() {
  const counts = countBy(
    state.filteredRecords,
    "airport"
  );

  const entries = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const options = chartOptions();
  options.indexAxis = "y";

  replaceChart("airport", "airportChart", {
    type: "bar",
    data: {
      labels: entries.map(entry => entry[0]),
      datasets: [
        {
          label: "REQUESTS",
          data: entries.map(entry => entry[1]),
          backgroundColor: "#0000a8",
          borderColor: "#000000",
          borderWidth: 1
        }
      ]
    },
    options
  });
}

function renderHourChart() {
  const hours = Array(24).fill(0);

  state.filteredRecords.forEach(record => {
    const hour = new Date(record.createdAt)
      .getUTCHours();

    hours[hour] += 1;
  });

  replaceChart("hour", "hourChart", {
    type: "bar",
    data: {
      labels: hours.map((_, hour) => {
        return String(hour).padStart(2, "0");
      }),
      datasets: [
        {
          label: "REQUESTS",
          data: hours,
          backgroundColor: "#008787",
          borderColor: "#000000",
          borderWidth: 1
        }
      ]
    },
    options: chartOptions()
  });
}

function renderTable() {
  if (!elements.activityTableBody) {
    return;
  }

  elements.activityTableBody.innerHTML = "";

  state.filteredRecords
    .slice(0, 150)
    .forEach(record => {
      const row = document.createElement("tr");

      const messagePreview =
        record.scrMessage
          .replace(/\s+/g, " ")
          .trim() ||
        "No SCR message stored.";

      row.innerHTML = `
        <td>${escapeHtml(formatUtc(record.createdAt))}</td>
        <td>
          <span class="badge ${record.type}">
            ${escapeHtml(record.type)}
          </span>
        </td>
        <td>${escapeHtml(record.airport)}</td>
        <td>${escapeHtml(record.flightNumber)}</td>
        <td>${escapeHtml(record.direction)}</td>
        <td>${escapeHtml(record.serviceType)}</td>
        <td>${escapeHtml(record.registration)}</td>
        <td
          class="message-cell"
          title="${escapeHtml(messagePreview)}"
        >
          ${escapeHtml(messagePreview)}
        </td>
        <td>
          <button
            class="win-button view-button"
            type="button"
          >
            View SCR
          </button>
        </td>
      `;

      row
        .querySelector(".view-button")
        .addEventListener("click", () => {
          openDialog(record);
        });

      elements.activityTableBody.appendChild(row);
    });

  if (elements.recordSummary) {
    elements.recordSummary.textContent =
      `SHOWING ${Math.min(
        state.filteredRecords.length,
        150
      )} OF ${state.filteredRecords.length} FILTERED RECORDS`;
  }

  if (elements.emptyState) {
    elements.emptyState.classList.toggle(
      "show",
      state.filteredRecords.length === 0
    );
  }

  if (elements.exportButton) {
    elements.exportButton.disabled =
      state.filteredRecords.length === 0;
  }

  if (elements.exportTopButton) {
    elements.exportTopButton.disabled =
      state.filteredRecords.length === 0;
  }

  if (elements.objectCount) {
    elements.objectCount.textContent =
      `${state.filteredRecords.length.toLocaleString(
        "en-GB"
      )} OBJECT(S)`;
  }
}

function openDialog(record) {
  state.selectedRecord = record;

  if (elements.detailTitle) {
    elements.detailTitle.textContent =
      `${record.type} SLOT - ${record.airport}`;
  }

  if (elements.detailTime) {
    elements.detailTime.textContent =
      formatUtc(record.createdAt);
  }

  if (elements.detailAction) {
    elements.detailAction.textContent =
      record.type;
  }

  if (elements.detailAirport) {
    elements.detailAirport.textContent =
      record.airport;
  }

  if (elements.detailFlight) {
    elements.detailFlight.textContent =
      record.flightNumber;
  }

  if (elements.detailDirection) {
    elements.detailDirection.textContent =
      record.direction;
  }

  if (elements.detailService) {
    elements.detailService.textContent =
      `${record.serviceType} / ${record.registration}`;
  }

  if (elements.detailMessage) {
    elements.detailMessage.textContent =
      record.scrMessage ||
      "No SCR message stored.";
  }

  elements.detailBackdrop?.classList.add("show");
}

function closeDialog() {
  state.selectedRecord = null;
  elements.detailBackdrop?.classList.remove("show");
}

async function copySelectedScr() {
  if (!state.selectedRecord) {
    return;
  }

  try {
    await navigator.clipboard.writeText(
      state.selectedRecord.scrMessage || ""
    );
  } catch (error) {
    console.error(error);
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function exportCsv() {
  if (!state.filteredRecords.length) {
    return;
  }

  const rows = [
    [
      "Timestamp UTC",
      "Action",
      "Airport",
      "Flight",
      "Direction",
      "Service Type",
      "Registration",
      "SCR Message"
    ],
    ...state.filteredRecords.map(record => [
      formatUtc(record.createdAt),
      record.type,
      record.airport,
      record.flightNumber,
      record.direction,
      record.serviceType,
      record.registration,
      record.scrMessage
    ])
  ];

  const csv = rows
    .map(row => {
      return row
        .map(value => {
          return `"${String(value).replaceAll(
            '"',
            '""'
          )}"`;
        })
        .join(",");
    })
    .join("\n");

  const blob = new Blob(
    ["\uFEFF" + csv],
    {
      type: "text/csv;charset=utf-8"
    }
  );

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download =
    `runway-slot-analytics-${
      new Date().toISOString().slice(0, 10)
    }.csv`;

  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}

elements.rangeFilter?.addEventListener(
  "change",
  applyFilters
);

elements.actionFilter?.addEventListener(
  "change",
  applyFilters
);

elements.searchFilter?.addEventListener(
  "input",
  applyFilters
);

elements.resetButton?.addEventListener(
  "click",
  () => {
    elements.rangeFilter.value = "7";
    elements.actionFilter.value = "ALL";
    elements.searchFilter.value = "";

    applyFilters();
  }
);

elements.exportButton?.addEventListener(
  "click",
  exportCsv
);

elements.exportTopButton?.addEventListener(
  "click",
  exportCsv
);

elements.closeDialogButton?.addEventListener(
  "click",
  closeDialog
);

elements.dialogCloseButton?.addEventListener(
  "click",
  closeDialog
);

elements.copyDialogButton?.addEventListener(
  "click",
  copySelectedScr
);

elements.detailBackdrop?.addEventListener(
  "click",
  event => {
    if (event.target === elements.detailBackdrop) {
      closeDialog();
    }
  }
);

updateClock();
setInterval(updateClock, 1000);

startFirebase();
