    const LIVE_HISTORY_PATH = "analytics/slotEvents";
    const BACKUP_HISTORY_PATH = "analytics/slotEventsBackup";

    const state = {
      database: null,
      liveReference: null,
      backupReference: null,
      liveRecords: {},
      backupRecords: {},
      allRecords: [],
      filteredRecords: [],
      charts: {},
      selectedRecord: null,
      backupRunning: false
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

      elements.utcClock.textContent =
        now.toLocaleTimeString("en-GB", {
          timeZone: "UTC",
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit"
        });

      elements.utcDate.textContent =
        now
          .toLocaleDateString("en-GB", {
            timeZone: "UTC",
            day: "2-digit",
            month: "short",
            year: "numeric"
          })
          .replace(/\s/g, "")
          .toUpperCase();
    }

    function setDatabaseStatus(status, text) {
      elements.databaseStatus.className =
        "info-box database-status " + status;

      elements.databaseStatusText.textContent = text;
    }

    function hasFirebaseConfig() {
      return Boolean(
        firebaseConfig.apiKey &&
        firebaseConfig.databaseURL &&
        firebaseConfig.projectId
      );
    }

    function normaliseAction(value) {
      const action = String(value || "").toUpperCase();

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

    function normaliseRecord(id, value) {
      const timestamp =
        Number(value.createdAt) ||
        Number(value.clientTimestamp) ||
        Number(value.timestamp) ||
        Date.parse(value.timestamp || "") ||
        Date.now();

      return {
        id,
        type: normaliseAction(
          value.type ||
          value.action ||
          value.slotType
        ),
        airport: String(
          value.airport ||
          value.airportCode ||
          "--"
        ).toUpperCase(),
        flightNumber: String(
          value.flightNumber ||
          value.flight ||
          "--"
        ),
        direction: String(value.direction || "--"),
        serviceType: String(
          value.serviceType ||
          value.service ||
          "--"
        ).toUpperCase(),
        registration: String(
          value.registration ||
          value.reg ||
          "-"
        ).toUpperCase(),
        scrMessage: String(
          value.scrMessage ||
          value.message ||
          value.output ||
          ""
        ),
        createdAt: timestamp
      };
    }

    function snapshotToMap(snapshot) {
      const result = {};
      const data = snapshot.val() || {};

      Object.entries(data).forEach(([id, value]) => {
        if (!value || typeof value !== "object") {
          return;
        }

        result[id] = normaliseRecord(id, value);
      });

      return result;
    }

    function rebuildRecords() {
      /*
        Live data replaces the matching archived copy while it exists.
        When live data is deleted, the archived copy remains.
      */
      const combined = {
        ...state.backupRecords,
        ...state.liveRecords
      };

      state.allRecords =
        Object.values(combined)
          .sort((a, b) => b.createdAt - a.createdAt);

      applyFilters();
    }

    function createBackupPayload(id, value) {
      return {
        ...value,
        originalHistoryKey: id,
        backupSourcePath: LIVE_HISTORY_PATH,
        backupCreatedAt:
          firebase.database.ServerValue.TIMESTAMP
      };
    }

    async function backupSnapshot(snapshot) {
      if (
        !state.backupReference ||
        state.backupRunning
      ) {
        return;
      }

      const entries =
        Object.entries(snapshot.val() || {})
          .filter(([, value]) =>
            value &&
            typeof value === "object"
          );

      if (!entries.length) {
        return;
      }

      state.backupRunning = true;

      try {
        for (const [id, value] of entries) {
          await state.backupReference
            .child(id)
            .transaction(currentValue => {
              if (currentValue !== null) {
                return;
              }

              return createBackupPayload(id, value);
            });
        }
      } catch (error) {
        console.error("History backup failed:", error);
      } finally {
        state.backupRunning = false;
      }
    }

    function startFirebase() {
      if (!hasFirebaseConfig()) {
        setDatabaseStatus(
          "offline",
          "Realtime Database"
        );

        rebuildRecords();
        return;
      }

      try {
        if (!firebase.apps.length) {
          firebase.initializeApp(firebaseConfig);
        }

        state.database = firebase.database();
        state.liveReference =
          state.database.ref(LIVE_HISTORY_PATH);
        state.backupReference =
          state.database.ref(BACKUP_HISTORY_PATH);

        state.database
          .ref(".info/connected")
          .on("value", snapshot => {
            const connected =
              snapshot.val() === true;

            setDatabaseStatus(
              connected ? "online" : "offline",
              connected
                ? "Database Online"
                : "Database Offline"
            );
          });

        state.backupReference.on(
          "value",
          snapshot => {
            state.backupRecords =
              snapshotToMap(snapshot);

            rebuildRecords();
          },
          error => {
            console.error(
              "Backup history read failed:",
              error
            );
          }
        );

        state.liveReference.on(
          "value",
          snapshot => {
            state.liveRecords =
              snapshotToMap(snapshot);

            rebuildRecords();
            backupSnapshot(snapshot);
          },
          error => {
            console.error(
              "Live history read failed:",
              error
            );

            setDatabaseStatus(
              "offline",
              "Database Read Failed"
            );

            state.liveRecords = {};
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
      const range = elements.rangeFilter.value;

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
      const action = elements.actionFilter.value;
      const search =
        elements.searchFilter.value
          .trim()
          .toUpperCase();

      state.filteredRecords =
        state.allRecords.filter(record => {
          const rangeMatch =
            cutoff === 0 ||
            record.createdAt >= cutoff;

          const actionMatch =
            action === "ALL" ||
            record.type === action;

          const searchMatch =
            !search ||
            record.airport.includes(search) ||
            record.flightNumber
              .toUpperCase()
              .includes(search) ||
            record.direction
              .toUpperCase()
              .includes(search) ||
            record.serviceType.includes(search) ||
            record.registration.includes(search);

          return (
            rangeMatch &&
            actionMatch &&
            searchMatch
          );
        });

      renderDashboard();
    }

    function countBy(records, property) {
      return records.reduce(
        (result, record) => {
          const key = record[property];

          result[key] =
            (result[key] || 0) + 1;

          return result;
        },
        {}
      );
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
      return new Date(timestamp)
        .toLocaleString("en-GB", {
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
      const actionCounts =
        countBy(state.filteredRecords, "type");
      const airportCounts =
        countBy(state.filteredRecords, "airport");
      const topAirport =
        getTopEntry(airportCounts);

      elements.totalRequests.textContent =
        total.toLocaleString("en-GB");

      elements.totalNote.textContent =
        total + " FILTERED RECORDS";

      elements.newRequests.textContent =
        (actionCounts.NEW || 0)
          .toLocaleString("en-GB");

      elements.newNote.textContent =
        percentage(
          actionCounts.NEW || 0,
          total
        ) +
        "% OF FILTERED ACTIVITY";

      elements.changeRequests.textContent =
        (actionCounts.CHANGE || 0)
          .toLocaleString("en-GB");

      elements.changeNote.textContent =
        percentage(
          actionCounts.CHANGE || 0,
          total
        ) +
        "% OF FILTERED ACTIVITY";

      elements.cancelRequests.textContent =
        (actionCounts.CANCEL || 0)
          .toLocaleString("en-GB");

      elements.cancelNote.textContent =
        percentage(
          actionCounts.CANCEL || 0,
          total
        ) +
        "% OF FILTERED ACTIVITY";

      elements.uniqueAirports.textContent =
        Object.keys(airportCounts).length;

      elements.topAirportNote.textContent =
        topAirport
          ? "TOP AIRPORT: " +
            topAirport[0] +
            " (" +
            topAirport[1] +
            ")"
          : "TOP AIRPORT: --";
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
      if (state.charts[name]) {
        state.charts[name].destroy();
      }

      state.charts[name] =
        new Chart(
          document.getElementById(elementId),
          config
        );
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
        const key =
          new Date(record.createdAt)
            .toISOString()
            .slice(0, 10);

        if (daily[key]) {
          daily[key][record.type] += 1;
        }
      });

      replaceChart(
        "trend",
        "trendChart",
        {
          type: "line",
          data: {
            labels: days.map(day =>
              new Date(day + "T00:00:00Z")
                .toLocaleDateString("en-GB", {
                  timeZone: "UTC",
                  day: "2-digit",
                  month: "short"
                })
            ),
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
        }
      );
    }

    function renderActionChart() {
      const counts =
        countBy(state.filteredRecords, "type");

      replaceChart(
        "action",
        "actionChart",
        {
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
              },
              tooltip: {
                backgroundColor: "#ffffdf",
                titleColor: "#000000",
                bodyColor: "#000000",
                borderColor: "#000000",
                borderWidth: 1
              }
            }
          }
        }
      );
    }

    function renderAirportChart() {
      const counts =
        countBy(state.filteredRecords, "airport");

      const entries =
        Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10);

      const options = chartOptions();
      options.indexAxis = "y";

      replaceChart(
        "airport",
        "airportChart",
        {
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
        }
      );
    }

    function renderHourChart() {
      const hours = Array(24).fill(0);

      state.filteredRecords.forEach(record => {
        const hour =
          new Date(record.createdAt)
            .getUTCHours();

        hours[hour] += 1;
      });

      replaceChart(
        "hour",
        "hourChart",
        {
          type: "bar",
          data: {
            labels: hours.map((_, hour) =>
              String(hour).padStart(2, "0")
            ),
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
        }
      );
    }

    function renderTable() {
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
            <td><span class="badge ${record.type}">${record.type}</span></td>
            <td>${escapeHtml(record.airport)}</td>
            <td>${escapeHtml(record.flightNumber)}</td>
            <td>${escapeHtml(record.direction)}</td>
            <td>${escapeHtml(record.serviceType)}</td>
            <td>${escapeHtml(record.registration)}</td>
            <td class="message-cell" title="${escapeHtml(messagePreview)}">
              ${escapeHtml(messagePreview)}
            </td>
            <td>
              <button class="win-button view-button" type="button">
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

      elements.recordSummary.textContent =
        "SHOWING " +
        Math.min(state.filteredRecords.length, 150) +
        " OF " +
        state.filteredRecords.length +
        " FILTERED RECORDS";

      elements.emptyState.classList.toggle(
        "show",
        state.filteredRecords.length === 0
      );

      elements.exportButton.disabled =
        state.filteredRecords.length === 0;

      elements.exportTopButton.disabled =
        state.filteredRecords.length === 0;

      elements.objectCount.textContent =
        state.filteredRecords.length
          .toLocaleString("en-GB") +
        " OBJECT(S)";
    }

    function openDialog(record) {
      state.selectedRecord = record;

      elements.detailTitle.textContent =
        record.type +
        " SLOT - " +
        record.airport;

      elements.detailTime.textContent =
        formatUtc(record.createdAt);

      elements.detailAction.textContent =
        record.type;

      elements.detailAirport.textContent =
        record.airport;

      elements.detailFlight.textContent =
        record.flightNumber;

      elements.detailDirection.textContent =
        record.direction;

      elements.detailService.textContent =
        record.serviceType +
        " / " +
        record.registration;

      elements.detailMessage.textContent =
        record.scrMessage ||
        "No SCR message stored.";

      elements.detailBackdrop.classList.add("show");
    }

    function closeDialog() {
      state.selectedRecord = null;
      elements.detailBackdrop.classList.remove("show");
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

      const csv =
        rows
          .map(row =>
            row
              .map(value =>
                '"' +
                String(value)
                  .replaceAll('"', '""') +
                '"'
              )
              .join(",")
          )
          .join("\n");

      const blob =
        new Blob(
          ["\uFEFF" + csv],
          {
            type:
              "text/csv;charset=utf-8"
          }
        );

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download =
        "runway-slot-analytics-" +
        new Date()
          .toISOString()
          .slice(0, 10) +
        ".csv";

      document.body.appendChild(link);
      link.click();
      link.remove();

      URL.revokeObjectURL(url);
    }

    elements.rangeFilter.addEventListener(
      "change",
      applyFilters
    );

    elements.actionFilter.addEventListener(
      "change",
      applyFilters
    );

    elements.searchFilter.addEventListener(
      "input",
      applyFilters
    );

    elements.resetButton.addEventListener(
      "click",
      () => {
        elements.rangeFilter.value = "7";
        elements.actionFilter.value = "ALL";
        elements.searchFilter.value = "";
        applyFilters();
      }
    );

    elements.exportButton.addEventListener(
      "click",
      exportCsv
    );

    elements.exportTopButton.addEventListener(
      "click",
      exportCsv
    );

    elements.closeDialogButton.addEventListener(
      "click",
      closeDialog
    );

    elements.dialogCloseButton.addEventListener(
      "click",
      closeDialog
    );

    elements.copyDialogButton.addEventListener(
      "click",
      copySelectedScr
    );

    elements.detailBackdrop.addEventListener(
      "click",
      event => {
        if (
          event.target ===
          elements.detailBackdrop
        ) {
          closeDialog();
        }
      }
    );

    updateClock();
    setInterval(updateClock, 1000);

    startFirebase();
