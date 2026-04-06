    let currentSlotType = "";
    let sharedHistoryCache = [];

    const monthMap = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };
    const monthAbbrArr = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

    function getHistoryRef() {
      if (typeof firebase === "undefined" || !firebase.apps || !firebase.apps.length) {
        throw new Error("Firebase app is not initialized. Check scripts/firebase.js");
      }
      return firebase.database().ref("scrHistory");
    }

    function getLastSundayOfMonthUTC(year, monthIndex) {
      const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0));
      const dayOfWeek = lastDay.getUTCDay();
      lastDay.setUTCDate(lastDay.getUTCDate() - dayOfWeek);
      return lastDay;
    }

    function getIATASlotSeasonUTC(date = new Date()) {
      const year = date.getUTCFullYear();
      const marchLastSunday = getLastSundayOfMonthUTC(year, 2);
      const octoberLastSunday = getLastSundayOfMonthUTC(year, 9);

      const summerStart = new Date(Date.UTC(
        marchLastSunday.getUTCFullYear(),
        marchLastSunday.getUTCMonth(),
        marchLastSunday.getUTCDate(),
        0, 1, 0
      ));

      const winterStart = new Date(Date.UTC(
        octoberLastSunday.getUTCFullYear(),
        octoberLastSunday.getUTCMonth(),
        octoberLastSunday.getUTCDate(),
        0, 1, 0
      ));

      if (date >= summerStart && date < winterStart) {
        return `S${String(year % 100).padStart(2, "0")}`;
      }

      return `W${String(year % 100).padStart(2, "0")}`;
    }

    async function getAirportEmail(airportCode, serviceType) {
      if (typeof firebase === 'undefined' || typeof firebase.database !== 'function') return "slotdesk@ryanair.com";
      try {
        const snapshot = await firebase.database().ref("airports/" + airportCode.toUpperCase()).once("value");
        if (snapshot.exists()) {
          const data = snapshot.val();
          const cleanST = serviceType ? serviceType.trim().toUpperCase() : '';
          if (cleanST === "D") return data.emailGeneral?.trim() || data.email?.trim() || "slotdesk@ryanair.com";
          return data.email?.trim() || "slotdesk@ryanair.com";
        }
        return "slotdesk@ryanair.com";
      } catch (error) {
        showError(`Email lookup failed for ${airportCode}.`);
        return "slotdesk@ryanair.com";
      }
    }

    function getReadableTimestamp() {
      const now = new Date();
      return now.toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
    }

    function getHistoricLog() {
      return sharedHistoryCache;
    }

    function setHistoricLog(log) {
      sharedHistoryCache = Array.isArray(log) ? log : [];
    }

    function startHistoryListener() {
      try {
        const historyRef = getHistoryRef();
        historyRef.on("value", (snapshot) => {
          const rows = [];

          snapshot.forEach((child) => {
            rows.push({
              firebaseKey: child.key,
              ...child.val()
            });
          });

          rows.reverse();
          setHistoricLog(rows);
          renderHistoryPanel();
        }, (error) => {
          showError("Failed to load shared history.");
          console.error("History listener error:", error);
        });
      } catch (error) {
        showError("Shared history failed to start. Check Firebase config.");
        console.error(error);
      }
    }

    function addLogEntry(entry) {
      try {
        const historyRef = getHistoryRef();
        historyRef.push({
          ...entry,
          createdAt: firebase.database.ServerValue.TIMESTAMP
        }).catch((error) => {
          showError("Could not save shared history.");
          console.error("Add history error:", error);
        });
      } catch (error) {
        showError("Could not save shared history.");
        console.error(error);
      }
    }

    function deleteLogEntry(index) {
      const log = getHistoricLog();
      const item = log[index];
      if (!item || !item.firebaseKey) return;

      try {
        const historyRef = getHistoryRef();
        historyRef.child(item.firebaseKey).remove()
          .then(() => {
            showSuccess("History entry deleted.");
          })
          .catch((error) => {
            showError("Could not delete history entry.");
            console.error("Delete history error:", error);
          });
      } catch (error) {
        showError("Could not delete history entry.");
        console.error(error);
      }
    }

    function clearHistory() {
      try {
        const historyRef = getHistoryRef();
        historyRef.remove()
          .then(() => {
            showSuccess("All history cleared.");
          })
          .catch((error) => {
            showError("Could not clear shared history.");
            console.error("Clear history error:", error);
          });
      } catch (error) {
        showError("Could not clear shared history.");
        console.error(error);
      }
    }

    function formatPreviewText(text, maxLength = 220) {
      if (!text) return "";
      const cleaned = text.replace(/\s+/g, " ").trim();
      return cleaned.length > maxLength ? cleaned.slice(0, maxLength) + "..." : cleaned;
    }

    function normalizeSearchText(value) {
      return String(value || "")
        .toLowerCase()
        .replace(/[_/.,-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    function normalizeCompareValue(value) {
      return String(value || "").trim().toUpperCase();
    }

    function buildHistorySearchBlob(entry) {
      return normalizeSearchText([
        entry.type || "",
        entry.airport || "",
        entry.flightNumber || "",
        entry.direction || "",
        entry.timestamp || "",
        entry.scrMessage || "",
        entry.rawInput || "",
        entry.slotTypeValue || "",
        getSlotTypeLabel(entry.slotTypeValue, entry.type),
        entry.serviceType || "",
        entry.registration || "",
        entry.dAircraftChoice || ""
      ].join(" "));
    }

    function escapeHtml(value) {
      return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    }

    function updateRowChangeHighlight(rowDiv) {
      if (!rowDiv) return;

      let hasChanges = false;
      const fields = rowDiv.querySelectorAll("input, select");

      fields.forEach(field => {
        const originalValue = field.dataset.originalValue || "";
        const currentValue = field.value || "";
        const changed = normalizeCompareValue(originalValue) !== normalizeCompareValue(currentValue);
        field.classList.toggle("changed-field", changed);
        if (changed) hasChanges = true;
      });

      rowDiv.classList.toggle("changed-row", hasChanges);

      let badge = rowDiv.querySelector(".change-indicator");
      if (hasChanges) {
        if (!badge) {
          badge = document.createElement("span");
          badge.className = "change-indicator";
          badge.textContent = "Changed";
          rowDiv.appendChild(badge);
        }
      } else if (badge) {
        badge.remove();
      }
    }

    function attachRowChangeTracking(rowDiv) {
      if (!rowDiv) return;
      const fields = rowDiv.querySelectorAll("input, select");
      fields.forEach(field => {
        field.dataset.originalValue = field.value || "";
        field.addEventListener("input", () => updateRowChangeHighlight(rowDiv));
        field.addEventListener("change", () => updateRowChangeHighlight(rowDiv));
      });
      updateRowChangeHighlight(rowDiv);
    }

    function wrapIfChanged(originalValue, newValue) {
      const oldVal = normalizeCompareValue(originalValue);
      const newVal = normalizeCompareValue(newValue);
      const safeValue = escapeHtml(newValue);
      if (oldVal !== newVal) {
        return `<span class="scr-preview-highlight">${safeValue}</span>`;
      }
      return safeValue;
    }

    function getSlotTypeLabel(slotTypeValue, typeValue) {
      const typeText = normalizeSearchText(typeValue || "");

      if (typeText.includes("change")) return "change scr";
      if (typeText.includes("cancel")) return "cancel slot";
      if (typeText.includes("new")) return "new slot";

      if (slotTypeValue === "NEW") return "new slot";
      if (slotTypeValue === "CANCEL") return "cancel slot";
      if (slotTypeValue === "CHANGE") return "change scr";

      return typeText;
    }

    function getHistorySearchValue() {
      const el = document.getElementById("historySearch");
      return normalizeSearchText(el ? el.value : "");
    }

    function matchesHistorySearch(entry, search) {
      if (!search) return true;
      const blob = buildHistorySearchBlob(entry);
      const terms = search.split(" ").filter(Boolean);
      return terms.every(term => blob.includes(term));
    }

    function parseDateString(dStr) {
      dStr = dStr ? dStr.toUpperCase() : '';
      const mD = dStr.match(/^(\d{2})([A-Z]{3})$/);
      const mDY = dStr.match(/^(\d{2})([A-Z]{3})(\d{4})$/);
      let dy, mAb, yr;

      if (mDY) {
        [, dy, mAb, yr] = mDY.map((v, i) => i === 1 || i === 3 ? parseInt(v, 10) : v);
      } else if (mD) {
        [, dy, mAb] = mD.map((v, i) => i === 1 ? parseInt(v, 10) : v);
        yr = new Date().getFullYear();
      } else {
        return null;
      }

      const mIdx = monthMap[mAb];
      if (mIdx === undefined || isNaN(dy) || isNaN(yr) || dy < 1 || dy > 31) return null;

      const dtO = new Date(Date.UTC(yr, mIdx, dy));
      if (dtO.getUTCFullYear() === yr && dtO.getUTCMonth() === mIdx && dtO.getUTCDate() === dy) return dtO;
      return null;
    }

    function getDayOfOperation(dayOfWeek) {
      const fD = dayOfWeek.charAt(0).toUpperCase() + dayOfWeek.slice(1).toLowerCase();
      const ds = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const dgs = [7, 1, 2, 3, 4, 5, 6];
      const pws = [0, 6, 5, 4, 3, 2, 1];
      let idx = ds.indexOf(fD);
      if (idx === -1) idx = 1;
      const dg = dgs[idx];
      const pw = pws[idx];
      const cN = dg * Math.pow(10, pw);
      return String(cN).padStart(7, '0');
    }

    function convertSCRDateToInput(sD) {
      const p = parseDateString(sD);
      if (!p) return "";
      const dy = String(p.getUTCDate()).padStart(2, '0');
      const mn = String(p.getUTCMonth() + 1).padStart(2, '0');
      const yr = p.getUTCFullYear();
      return `${yr}-${mn}-${dy}`;
    }

    function convertInputDateToSCR(iD) {
      try {
        const dO = new Date(iD + 'T00:00:00Z');
        if (isNaN(dO.getTime())) return "01JAN";
        const dy = String(dO.getUTCDate()).padStart(2, '0');
        const mA = monthAbbrArr[dO.getUTCMonth()];
        return dy + mA;
      } catch (e) {
        return "01JAN";
      }
    }

    function getCurrentDate() {
      const dO = new Date();
      const dy = String(dO.getDate()).padStart(2, '0');
      const mn = monthAbbrArr[dO.getMonth()];
      return `${dy}${mn}`;
    }

    function parseInput(input) {
      const lines = input ? input.trim().split("\n") : [];
      const pE = [];
      let hasError = false;

      lines.forEach((ln) => {
        ln = ln.trim();
        if (!ln) return;
        const pts = ln.split(/\s+/);
        if (pts.length < 7 || pts.length > 8) {
          hasError = true;
          return;
        }

        const [fR, fRw, tRw, dS, dpT, arT, sIn] = pts;
        let acTIn = pts[7] ? pts[7].toUpperCase() : null;

        const frm = fRw.toUpperCase();
        const to = tRw.toUpperCase();

        if (acTIn === '738') acTIn = '73H';
        if (acTIn === '197' || acTIn === '73M') acTIn = '7M8';

        const pD = parseDateString(dS);
        if (!pD) {
          hasError = true;
          return;
        }

        if (!/^\d{4}$/.test(dpT) || !/^\d{4}$/.test(arT)) {
          hasError = true;
          return;
        }

        const dOW = pD.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
        const dOO = getDayOfOperation(dOW);
        const dt = convertInputDateToSCR(pD.toISOString().split('T')[0]);

        const fP = fR.slice(0, 2).toUpperCase();
        let fN = fR.slice(2);
        const fDg = fN.match(/\d+/)?.[0] || "";
        let fLt = fN.replace(/\d+/g, "").toUpperCase();
        if (fLt.endsWith("P")) fLt = fLt.slice(0, -1);
        const pFDg = fDg.padStart(3, "0");
        const fl = `${fP}${pFDg}${fLt}`;

        pE.push({
          flight: fl,
          from: frm,
          to: to,
          date: dt,
          fullDate: pD,
          departureTime: dpT,
          arrivalTime: arT,
          serviceTypeInput: sIn.toUpperCase(),
          dayOfOperation: dOO,
          aircraftTypeInput: acTIn,
          originalLine: ln
        });
      });

      return { parsedEntries: pE, errors: hasError };
    }

    function getSelectedServiceType() {
      return document.getElementById("dropdownMenu").value.charAt(0);
    }

    function getSlotType() {
      const v = document.getElementById("slotType").value;
      if (v === "NEW") return "NEW SLOT";
      if (v === "CANCEL") return "CANCEL SLOT";
      if (v === "CHANGE") return "CHANGE SCR";
      return "";
    }

    function getAircraftReg() {
      const sST = getSelectedServiceType();
      const rIV = document.getElementById("regInput").value.trim().toUpperCase();
      if (sST === "D") {
        if (rIV && rIV !== "L45" && rIV !== "CL5") return rIV;
        if (document.getElementById("learjetCheckbox").checked) return "L45";
        if (document.getElementById("bombardierCheckbox").checked) return "CL5";
        document.getElementById("learjetCheckbox").checked = true;
        return "L45";
      }
      return rIV || "[UNKNOWN_REG]";
    }

    function getFinalCombinedCode(scrLineServiceType, aircraftTypeInput) {
      const sT = scrLineServiceType.toUpperCase();
      const aTI = aircraftTypeInput ? aircraftTypeInput.toUpperCase() : null;

      if (sT === 'J') {
        if (aTI === '73H') return '18973H';
        if (aTI === '7M8') return '1977M8';
        return '18973H';
      } else if (sT === 'P') {
        if (aTI === '73H') return '00073H';
        if (aTI === '7M8') return '0007M8';
        return '00073H';
      } else if (sT === 'D') {
        const pfx = document.getElementById("bombardierCheckbox").checked ? "009" : "008";
        const oC = document.getElementById("bombardierCheckbox").checked ? "CL5" : "L45";
        return pfx + oC;
      } else {
        const pfx = '000';
        let oC = '73H';
        if (aTI === '73H') oC = '73H';
        else if (aTI === '7M8') oC = '7M8';
        return pfx + oC;
      }
    }

    function showError(m) {
      const eD = document.getElementById("errorMessage");
      eD.innerHTML = m;
      eD.style.display = "block";
    }

    function showSuccess(m) {
      const sD = document.getElementById("successMessage");
      sD.textContent = m;
      sD.style.display = "block";
      setTimeout(() => { sD.style.display = "none"; }, 5000);
    }

    function clearFeedback() {
      document.getElementById("errorMessage").style.display = "none";
      document.getElementById("successMessage").style.display = "none";
    }

    function showScrModal(scrText, allowHtml = false) {
      const modalText = document.getElementById("scrModalText");
      if (allowHtml) {
        modalText.innerHTML = scrText;
      } else {
        modalText.textContent = scrText;
      }
      document.getElementById("scrModal").style.display = "block";
    }

    function showClearAllModal() {
      const modal = document.getElementById("clearAllModal");
      if (modal) modal.style.display = "block";
    }

    function hideClearAllModal() {
      const modal = document.getElementById("clearAllModal");
      if (modal) modal.style.display = "none";
    }

    async function copyScrToClipboard(scrText) {
      try {
        await navigator.clipboard.writeText(scrText);
        showSuccess("SCR copied to clipboard!");
      } catch (err) {
        showError("Failed to copy SCR.");
        console.error('Failed to copy: ', err);
      }
    }

    function createEditableRLineRow(rowData) {
      const rowDiv = document.createElement("div");
      rowDiv.className = "modified-scr-row";
      rowDiv.dataset.rowId = rowData.id;

      const createField = (lTxt, iT, cN, val, dis = false, opts = null) => {
        const lbl = document.createElement("label");
        lbl.textContent = lTxt + ": ";
        let inp;

        if (iT === "select") {
          inp = document.createElement("select");
          inp.className = cN;
          (opts || []).forEach(o => {
            const op = document.createElement("option");
            op.value = o;
            op.textContent = o;
            if (o === val) op.selected = true;
            inp.appendChild(op);
          });
        } else {
          inp = document.createElement("input");
          inp.type = iT;
          inp.className = cN;
          inp.value = val;
        }

        inp.disabled = dis;

        if (iT === "text" && (cN === "r-airport" || cN === "r-combined-code")) {
          inp.style.textTransform = "uppercase";
        }

        lbl.appendChild(inp);
        return { label: lbl, input: inp };
      };

      const flightField = createField("Flight", "text", "r-flight", rowData.flight);
      const dateField = createField("Date", "date", "r-date", rowData.date);
      const dayField = createField("Day", "text", "r-day", rowData.day, true);
      const combinedCodeField = createField("Code(Prefix+Op)", "text", "r-combined-code", rowData.combinedCode);
      const timeField = createField("Time", "time", "r-time", rowData.time);
      const airportField = createField("Airport", "text", "r-airport", rowData.airport);
      const serviceField = createField("Service", "select", "r-service", rowData.service, false, ["P","J","T","K","D","X"]);

      rowDiv.appendChild(flightField.label);
      rowDiv.appendChild(dateField.label);
      rowDiv.appendChild(dayField.label);
      rowDiv.appendChild(combinedCodeField.label);
      rowDiv.appendChild(timeField.label);
      rowDiv.appendChild(airportField.label);
      rowDiv.appendChild(serviceField.label);

      function detectAircraftTypeFromCombinedCode(code) {
        const upper = String(code || "").toUpperCase();
        if (upper.includes("73H")) return "73H";
        if (upper.includes("7M8")) return "7M8";
        if (upper.includes("L45")) return "L45";
        if (upper.includes("CL5")) return "CL5";
        return "73H";
      }

      function recalculateCombinedCodeFromService() {
        const selectedService = serviceField.input.value.toUpperCase();
        const detectedAircraft = detectAircraftTypeFromCombinedCode(combinedCodeField.input.value);

        let newCode = combinedCodeField.input.value.toUpperCase();

        if (selectedService === "J") {
          if (detectedAircraft === "7M8") newCode = "1977M8";
          else newCode = "18973H";
        } else if (selectedService === "P") {
          if (detectedAircraft === "7M8") newCode = "0007M8";
          else newCode = "00073H";
        } else if (selectedService === "D") {
          if (detectedAircraft === "CL5") newCode = "009CL5";
          else newCode = "008L45";
        } else {
          if (detectedAircraft === "7M8") newCode = "0007M8";
          else if (detectedAircraft === "CL5") newCode = "009CL5";
          else if (detectedAircraft === "L45") newCode = "008L45";
          else newCode = "00073H";
        }

        combinedCodeField.input.value = newCode;
        updateRowChangeHighlight(rowDiv);
      }

      dateField.input.addEventListener("change", (e) => {
        try {
          const sD = new Date(e.target.value + "T00:00:00Z");
          if (!isNaN(sD.getTime())) {
            const dW = sD.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
            dayField.input.value = getDayOfOperation(dW);
          } else {
            dayField.input.value = "INVALID";
          }
        } catch (err) {
          dayField.input.value = "ERROR";
        }

        updateRowChangeHighlight(rowDiv);
      });

      serviceField.input.addEventListener("change", () => {
        recalculateCombinedCodeFromService();
      });

      attachRowChangeTracking(rowDiv);

      return rowDiv;
    }

    async function sendEmail(airportCode, scrOutput, fallbackServiceType = null) {
      let sP;
      if (currentSlotType === "NEW SLOT") sP = "NEW SLOT REQ";
      else if (currentSlotType === "CANCEL SLOT") sP = "SLOT CANX REQ";
      else if (currentSlotType === "CHANGE SCR") sP = "SLOT CHG REQ";
      else sP = "SLOT REQ";

      const subj = `${sP} ${airportCode}`;
      const eLST = fallbackServiceType || getSelectedServiceType();
      const rE = await getAirportEmail(airportCode, eLST);
      const cE = "slotdesk@ryanair.com";
      let mL = `mailto:${rE}`;
      const pA = [];

      if (rE.toLowerCase() !== cE.toLowerCase()) {
        pA.push(`cc=${encodeURIComponent(cE)}`);
      }

      pA.push(`subject=${encodeURIComponent(subj)}`);
      pA.push(`body=${encodeURIComponent(scrOutput)}`);

      if (pA.length > 0) {
        mL += `?${pA.join('&')}`;
      }

      if (mL.length > 2000) {
        showError(`Email for ${airportCode} is too long for mailto link.`);
      }

      window.open(mL, '_blank');
    }

    function createScrGroupElement(outputList, airportCode, scrOutput) {
      const scrGroup = document.createElement("div");
      scrGroup.className = "scr-group";

      const hD = document.createElement("div");
      hD.className = "heading";
      hD.textContent = `SCR [${airportCode}]`;
      scrGroup.appendChild(hD);

      const oCD = document.createElement("div");
      oCD.className = "output-container";
      const pre = document.createElement("pre");
      pre.textContent = scrOutput;
      oCD.appendChild(pre);
      scrGroup.appendChild(oCD);

      const buttonFlexContainer = document.createElement("div");
      buttonFlexContainer.className = "send-button-container";

      const sendBtn = document.createElement("button");
      sendBtn.textContent = "Send Email";
      sendBtn.addEventListener("click", async () => {
        await sendEmail(airportCode, scrOutput, getSelectedServiceType());
      });
      buttonFlexContainer.appendChild(sendBtn);

      const showScrBtn = document.createElement("button");
      showScrBtn.textContent = "Show SCR";
      showScrBtn.addEventListener("click", () => showScrModal(scrOutput));
      buttonFlexContainer.appendChild(showScrBtn);

      const copyScrBtn = document.createElement("button");
      copyScrBtn.textContent = "Copy SCR";
      copyScrBtn.addEventListener("click", () => copyScrToClipboard(scrOutput));
      buttonFlexContainer.appendChild(copyScrBtn);

      const copyEmailBtn = document.createElement("button");
      copyEmailBtn.textContent = "Copy Email";
      copyEmailBtn.addEventListener("click", async () => {
        try {
          const emailAddress = await getAirportEmail(airportCode, getSelectedServiceType());
          await navigator.clipboard.writeText(emailAddress);
          showSuccess(`Email for ${airportCode} (${emailAddress}) copied to clipboard!`);
        } catch (err) {
          showError(`Failed to copy email for ${airportCode}.`);
        }
      });
      buttonFlexContainer.appendChild(copyEmailBtn);

      scrGroup.appendChild(buttonFlexContainer);
      outputList.appendChild(scrGroup);
    }

    function formatSCRMessages() {
      clearFeedback();
      const input = document.getElementById("userInput").value;
      const { parsedEntries, errors } = parseInput(input);

      if (errors) showError(`Input validation failed. Check format.`);
      if (parsedEntries.length === 0) {
        if (!errors) showError("No valid flights.");
        return;
      }

      currentSlotType = getSlotType();
      const scrLineServiceType = getSelectedServiceType();
      const globalReg = getAircraftReg();
      const outputList = document.getElementById("outputList");
      outputList.innerHTML = "";
      const airportGroups = {};

      parsedEntries.forEach((d) => {
        const { from, to } = d;
        if (!airportGroups[from]) airportGroups[from] = { airportCode: from, flights: [] };
        airportGroups[from].flights.push({ type: 'departure', data: d });
        if (!airportGroups[to]) airportGroups[to] = { airportCode: to, flights: [] };
        airportGroups[to].flights.push({ type: 'arrival', data: d });
      });

      Object.values(airportGroups).forEach((grp) => {
        const { airportCode, flights } = grp;
        const sLs = ["SCR", getIATASlotSeasonUTC(), getCurrentDate(), airportCode];

        flights.forEach(fE => {
          const { type, data } = fE;
          const { flight, date, dayOfOperation: dOO, departureTime: dT, arrivalTime: aT, from, to, aircraftTypeInput: aTI } = data;
          const fSt = (currentSlotType === "CANCEL SLOT") ? "D" : "N";
          const fCC = getFinalCombinedCode(scrLineServiceType, aTI);
          let ln = (type === 'departure')
            ? `${fSt} ${flight} ${date}${date} ${dOO} ${fCC} ${dT}${to} ${scrLineServiceType}`
            : `${fSt}${flight} ${date}${date} ${dOO} ${fCC} ${from}${aT} ${scrLineServiceType}`;
          sLs.push(ln);
        });

        let siAct = (currentSlotType === "NEW SLOT") ? "NEW SLOT REQ" : "SLOT CANX REQ";
        let siLn = `SI ${siAct} ${airportCode}`;
        if (scrLineServiceType === "D") {
          let lbl = document.getElementById("learjetCheckbox").checked ? "LEARJET" : "BOMBARDIER";
          siLn += ` // ${lbl} REG: ${globalReg}`;
        }

        sLs.push(siLn);
        const scrOut = sLs.join("\n");
        createScrGroupElement(outputList, airportCode, scrOut);

        addLogEntry({
          type: currentSlotType,
          flightNumber: flights.map(e => e.data.flight).join(", "),
          airport: airportCode,
          direction: flights.map(e => e.type).join("/"),
          timestamp: getReadableTimestamp(),
          rawInput: input,
          scrMessage: scrOut,
          slotTypeValue: document.getElementById("slotType").value,
          serviceType: document.getElementById("dropdownMenu").value,
          registration: document.getElementById("regInput").value.trim(),
          dAircraftChoice: document.getElementById("bombardierCheckbox").checked ? "CL5" : "L45"
        });
      });

      if (parsedEntries.length > 0) {
        showSuccess(`Formatted ${parsedEntries.length} leg(s) into ${Object.keys(airportGroups).length} message(s). ${errors ? 'Errors found.' : ''}`);
      }
    }

    function buildChangeHistoryPayload(airportCode, headerLines, flightChangePairs, siLine) {
      return { airportCode, headerLines, flightChangePairs, siLine };
    }

    function formatChangeSCRMessages() {
      clearFeedback();
      const input = document.getElementById("userInput").value;
      const { parsedEntries, errors } = parseInput(input);

      if (errors) showError(`Input validation failed. Check format.`);
      if (parsedEntries.length === 0) {
        if (!errors) showError("No valid flights for change.");
        return;
      }

      currentSlotType = "CHANGE SCR";
      const scrLineServiceType = getSelectedServiceType();
      const globalReg = getAircraftReg();
      const outputList = document.getElementById("outputList");
      outputList.innerHTML = "";
      const airportGroups = {};

      parsedEntries.forEach((d) => {
        const { from, to } = d;
        if (!airportGroups[from]) airportGroups[from] = { airportCode: from, flights: [] };
        airportGroups[from].flights.push({ type: 'departure', data: d });
        if (!airportGroups[to]) airportGroups[to] = { airportCode: to, flights: [] };
        airportGroups[to].flights.push({ type: 'arrival', data: d });
      });

      Object.values(airportGroups).forEach((grp, gIdx) => {
        const { airportCode, flights } = grp;
        const hLs = ["SCR", getIATASlotSeasonUTC(), getCurrentDate(), airportCode];
        const fCPs = [];

        flights.forEach((fE, fIdx) => {
          const { type, data } = fE;
          const { flight, date, dayOfOperation: dOO, departureTime: dT, arrivalTime: aT, from, to, aircraftTypeInput: aTI } = data;
          const fCC = getFinalCombinedCode(scrLineServiceType, aTI);
          const cLB = `${date}${date} ${dOO} ${fCC}`;
          let cLn;
          const rLD = {
            id: `rline-${gIdx}-${fIdx}`,
            flight,
            date: convertSCRDateToInput(date),
            day: dOO,
            combinedCode: fCC,
            service: scrLineServiceType,
            direction: type
          };

          if (type === 'departure') {
            cLn = `C ${flight} ${cLB} ${dT}${to} ${scrLineServiceType}`;
            rLD.time = dT.slice(0, 2) + ":" + dT.slice(2);
            rLD.airport = to;
          } else {
            cLn = `C${flight} ${cLB} ${from}${aT} ${scrLineServiceType}`;
            rLD.time = aT.slice(0, 2) + ":" + aT.slice(2);
            rLD.airport = from;
          }

          fCPs.push({ cLine: cLn, rLineData: rLD });
        });

        const scrGroup = document.createElement("div");
        scrGroup.className = "scr-group";

        const headingDiv = document.createElement("div");
        headingDiv.className = "heading";
        headingDiv.textContent = `Change SCR [${airportCode}]`;
        scrGroup.appendChild(headingDiv);

        const outputContainerDiv = document.createElement("div");
        outputContainerDiv.className = "output-container";

        const headerDisplayDiv = document.createElement("div");
        headerDisplayDiv.style.cssText = "white-space: pre-wrap; font-family: monospace; margin-bottom: 10px;";
        headerDisplayDiv.innerHTML = `<strong>--- Header ---</strong>\n${hLs.join("\n")}`;
        outputContainerDiv.appendChild(headerDisplayDiv);

        const cAndRLinesDiv = document.createElement("div");
        cAndRLinesDiv.id = `editable-r-lines-${gIdx}`;
        cAndRLinesDiv.innerHTML = `<strong style="display: block; margin-bottom: 4px;">--- Cancellation (C) / New Request (R) Lines ---</strong>`;

        fCPs.forEach((pair) => {
          const cLT = document.createElement('div');
          cLT.style.cssText = 'font-family: monospace; white-space: pre; font-size: 11px; color: #555;';
          cLT.textContent = pair.cLine;
          cAndRLinesDiv.appendChild(cLT);
          cAndRLinesDiv.appendChild(createEditableRLineRow(pair.rLineData));
        });
        outputContainerDiv.appendChild(cAndRLinesDiv);

        let initialSiLine = `SI SLOT CHG REQ ${airportCode}`;
        if (scrLineServiceType === "D") {
          let lbl = document.getElementById("learjetCheckbox").checked ? "LEARJET" : "BOMBARDIER";
          initialSiLine += ` // ${lbl} REG: ${globalReg}`;
        }

        const siDiv = document.createElement("div");
        siDiv.id = `si-line-display-${gIdx}`;
        siDiv.style.cssText = "white-space: pre-wrap; font-family: monospace; margin-top: 10px;";
        siDiv.innerHTML = `<strong>--- SI Line ---</strong>\n${initialSiLine}`;
        outputContainerDiv.appendChild(siDiv);

        scrGroup.appendChild(outputContainerDiv);

        const buttonContainer = document.createElement("div");
        buttonContainer.className = "send-button-container";

        const updateSendBtn = document.createElement("button");
        updateSendBtn.textContent = "Update & Send Email";
        updateSendBtn.addEventListener("click", async () => {
          const result = await buildUpdatedChangeScrFromContainer(
            cAndRLinesDiv,
            fCPs,
            hLs,
            airportCode,
            scrLineServiceType
          );
          if (!result) return;
          await sendEmail(airportCode, result.updatedScrMessage, scrLineServiceType);
          addLogEntry({
            type: "CHANGE SCR (Updated)",
            flightNumber: fCPs.map(p => p.rLineData.flight).join(", "),
            airport: airportCode,
            direction: "change",
            timestamp: getReadableTimestamp(),
            rawInput: document.getElementById("userInput").value,
            scrMessage: result.updatedScrMessage,
            slotTypeValue: document.getElementById("slotType").value,
            serviceType: document.getElementById("dropdownMenu").value,
            registration: document.getElementById("regInput").value.trim(),
            dAircraftChoice: document.getElementById("bombardierCheckbox").checked ? "CL5" : "L45",
            changeEditorData: buildChangeHistoryPayload(airportCode, hLs, result.updatedPairs, result.finalSiLine)
          });
          showSuccess(`Updated ${airportCode}. Sending...`);
        });
        buttonContainer.appendChild(updateSendBtn);

        const showScrBtn = document.createElement("button");
        showScrBtn.textContent = "Show SCR";
        showScrBtn.addEventListener("click", async () => {
          const result = await buildUpdatedChangeScrFromContainer(
            cAndRLinesDiv,
            fCPs,
            hLs,
            airportCode,
            scrLineServiceType
          );
          if (result) showScrModal(result.updatedScrMessage);
        });
        buttonContainer.appendChild(showScrBtn);

        const copyScrBtn = document.createElement("button");
        copyScrBtn.textContent = "Copy SCR";
        copyScrBtn.addEventListener("click", async () => {
          const result = await buildUpdatedChangeScrFromContainer(
            cAndRLinesDiv,
            fCPs,
            hLs,
            airportCode,
            scrLineServiceType
          );
          if (result) copyScrToClipboard(result.updatedScrMessage);
        });
        buttonContainer.appendChild(copyScrBtn);

        scrGroup.appendChild(buttonContainer);
        outputList.appendChild(scrGroup);

        const initialBuild = buildInitialChangeSCRMessageFallback(hLs, fCPs, initialSiLine);
        addLogEntry({
          type: "CHANGE SCR (Initial)",
          flightNumber: fCPs.map(p => p.rLineData.flight).join(", "),
          airport: airportCode,
          direction: "change",
          timestamp: getReadableTimestamp(),
          rawInput: input,
          scrMessage: initialBuild,
          slotTypeValue: document.getElementById("slotType").value,
          serviceType: document.getElementById("dropdownMenu").value,
          registration: document.getElementById("regInput").value.trim(),
          dAircraftChoice: document.getElementById("bombardierCheckbox").checked ? "CL5" : "L45",
          changeEditorData: buildChangeHistoryPayload(airportCode, hLs, fCPs, initialSiLine)
        });
      });

      if (parsedEntries.length > 0) {
        showSuccess(`Formatted ${parsedEntries.length} leg(s) into ${Object.keys(airportGroups).length} editable message(s). ${errors ? 'Errors found.' : ''}`);
      }
    }

    function buildInitialChangeSCRMessageFallback(headerLines, flightChangePairs, siLine) {
      const pairsText = flightChangePairs.map(p => {
        const r = p.rLineData;
        const sD = convertInputDateToSCR(r.date);
        const tF = r.time.replace(":", "");
        const rLine = (r.direction === 'departure')
          ? `R ${r.flight} ${sD}${sD} ${r.day} ${r.combinedCode} ${tF}${r.airport} ${r.service}`
          : `R${r.flight} ${sD}${sD} ${r.day} ${r.combinedCode} ${r.airport}${tF} ${r.service}`;
        return `${p.cLine}\n${rLine}`;
      }).join("\n");

      return [...headerLines, pairsText, siLine].join("\n");
    }

    async function buildUpdatedChangeScrFromContainer(containerDiv, originalPairs, headerLines, airportCode, serviceType) {
      const modifiedRows = containerDiv.querySelectorAll(".modified-scr-row");
      let reconstructionError = false;
      const updatedMessageLines = [...headerLines];
      const updatedPairs = [];

      modifiedRows.forEach((rowDiv) => {
        const rowId = rowDiv.dataset.rowId;
        const originalPair = originalPairs.find(p => p.rLineData.id === rowId);
        if (!originalPair) {
          reconstructionError = true;
          return;
        }

        const direction = originalPair.rLineData.direction;
        try {
          const fV = rowDiv.querySelector(".r-flight").value.toUpperCase();
          const dV = rowDiv.querySelector(".r-date").value;
          const sD = convertInputDateToSCR(dV);
          const dayV = rowDiv.querySelector(".r-day").value;
          const cCV = rowDiv.querySelector(".r-combined-code").value.toUpperCase();
          const tVR = rowDiv.querySelector(".r-time").value;
          const tV = tVR.replace(":", "");
          const aV = rowDiv.querySelector(".r-airport").value.toUpperCase();
          const sV = rowDiv.querySelector(".r-service").value.toUpperCase();

          if (!fV || !sD || !dayV || !cCV || !/^\d{4}$/.test(tV) || !aV || !sV) throw new Error("Invalid");

          const updatedRLine = (direction === 'departure')
            ? `R ${fV} ${sD}${sD} ${dayV} ${cCV} ${tV}${aV} ${sV}`
            : `R${fV} ${sD}${sD} ${dayV} ${cCV} ${aV}${tV} ${sV}`;

          updatedMessageLines.push(originalPair.cLine);
          updatedMessageLines.push(updatedRLine);

          updatedPairs.push({
            cLine: originalPair.cLine,
            rLineData: {
              id: rowId,
              flight: fV,
              date: dV,
              day: dayV,
              combinedCode: cCV,
              service: sV,
              direction: direction,
              time: tVR,
              airport: aV
            }
          });
        } catch (err) {
          reconstructionError = true;
        }
      });

      if (reconstructionError) {
        showError(`Failed to update ${airportCode}. Check editable fields.`);
        return null;
      }

      let finalSiLine = `SI SLOT CHG REQ ${airportCode}`;
      if (serviceType === "D") {
        const lbl = document.getElementById("learjetCheckbox").checked ? "LEARJET" : "BOMBARDIER";
        const reg = getAircraftReg();
        finalSiLine += ` // ${lbl} REG: ${reg}`;
      }

      updatedMessageLines.push(finalSiLine);

      return {
        updatedScrMessage: updatedMessageLines.join("\n"),
        updatedPairs,
        finalSiLine
      };
    }

    function buildHighlightedRLineHtml(originalRow, updatedRow) {
      const sD = convertInputDateToSCR(updatedRow.date);
      const originalSD = convertInputDateToSCR(originalRow.date);
      const tV = (updatedRow.time || "").replace(":", "");
      const originalTV = (originalRow.time || "").replace(":", "");

      const flightPart = wrapIfChanged(originalRow.flight, updatedRow.flight);
      const datePart = wrapIfChanged(originalSD + originalSD, sD + sD);
      const dayPart = wrapIfChanged(originalRow.day, updatedRow.day);
      const codePart = wrapIfChanged(originalRow.combinedCode, updatedRow.combinedCode);
      const servicePart = wrapIfChanged(originalRow.service, updatedRow.service);

      if (updatedRow.direction === "departure") {
        const timeAirportPart = wrapIfChanged(
          originalTV + originalRow.airport,
          tV + updatedRow.airport
        );
        return `R ${flightPart} ${datePart} ${dayPart} ${codePart} ${timeAirportPart} ${servicePart}`;
      } else {
        const airportTimePart = wrapIfChanged(
          originalRow.airport + originalTV,
          updatedRow.airport + tV
        );
        return `R${flightPart} ${datePart} ${dayPart} ${codePart} ${airportTimePart} ${servicePart}`;
      }
    }

    function buildHistoryHighlightedPreviewHtml(headerLines, originalPairs, updatedPairs, finalSiLine) {
      const htmlParts = [];
      htmlParts.push(escapeHtml(headerLines.join("\n")));

      updatedPairs.forEach((pair) => {
        const originalPair = originalPairs.find(p => p.rLineData.id === pair.rLineData.id);
        const cLine = originalPair ? originalPair.cLine : pair.cLine;
        htmlParts.push(escapeHtml(cLine));

        if (originalPair) {
          htmlParts.push(buildHighlightedRLineHtml(originalPair.rLineData, pair.rLineData));
        } else {
          htmlParts.push(escapeHtml(pair.cLine));
        }
      });

      htmlParts.push(escapeHtml(finalSiLine));
      return htmlParts.join("\n");
    }

    function buildChangeEditorDataFromRawHistory(entry) {
      if (!entry || !entry.rawInput) {
        showError("No original input stored for this history item.");
        return null;
      }

      const { parsedEntries, errors } = parseInput(entry.rawInput);
      if (errors || parsedEntries.length === 0) {
        showError("Could not rebuild Change SCR editor from this history item.");
        return null;
      }

      const airportCode = entry.airport || parsedEntries[0]?.from || "UNKNOWN";
      const serviceType = entry.serviceType ? entry.serviceType.charAt(0) : "P";
      const headerLines = ["SCR", getIATASlotSeasonUTC(), getCurrentDate(), airportCode];
      const flightChangePairs = [];

      parsedEntries.forEach((data, idx) => {
        const {
          flight,
          date,
          dayOfOperation: dOO,
          departureTime: dT,
          arrivalTime: aT,
          from,
          to,
          aircraftTypeInput: aTI
        } = data;

        const fCC = getFinalCombinedCode(serviceType, aTI);

        if (from === airportCode) {
          flightChangePairs.push({
            cLine: `C ${flight} ${date}${date} ${dOO} ${fCC} ${dT}${to} ${serviceType}`,
            rLineData: {
              id: `hist-rline-dep-${idx}`,
              flight,
              date: convertSCRDateToInput(date),
              day: dOO,
              combinedCode: fCC,
              service: serviceType,
              direction: "departure",
              time: dT.slice(0, 2) + ":" + dT.slice(2),
              airport: to
            }
          });
        }

        if (to === airportCode) {
          flightChangePairs.push({
            cLine: `C${flight} ${date}${date} ${dOO} ${fCC} ${from}${aT} ${serviceType}`,
            rLineData: {
              id: `hist-rline-arr-${idx}`,
              flight,
              date: convertSCRDateToInput(date),
              day: dOO,
              combinedCode: fCC,
              service: serviceType,
              direction: "arrival",
              time: aT.slice(0, 2) + ":" + aT.slice(2),
              airport: from
            }
          });
        }
      });

      let siLine = `SI SLOT CHG REQ ${airportCode}`;
      if (serviceType === "D") {
        const lbl = entry.dAircraftChoice === "CL5" ? "BOMBARDIER" : "LEARJET";
        const reg = (entry.registration || "").toUpperCase() || "[UNKNOWN_REG]";
        siLine += ` // ${lbl} REG: ${reg}`;
      }

      return {
        airportCode,
        headerLines,
        flightChangePairs,
        siLine
      };
    }

    function renderHistoryChangeEditor(entry, itemContainer) {
      const data = entry.changeEditorData;
      if (!data || !data.flightChangePairs || !data.headerLines) {
        showError("This history item was not saved with editable Change SCR data.");
        return;
      }

      const existing = itemContainer.querySelector(".history-editor");
      if (existing) {
        existing.remove();
        return;
      }

      const editor = document.createElement("div");
      editor.className = "history-editor";

      const heading = document.createElement("div");
      heading.className = "heading";
      heading.textContent = `Edit / Change [${data.airportCode}]`;
      editor.appendChild(heading);

      const header = document.createElement("div");
      header.className = "history-editor-header";
      header.textContent = `--- Header ---\n${data.headerLines.join("\n")}`;
      editor.appendChild(header);

      const editableContainer = document.createElement("div");
      editableContainer.innerHTML = `<strong style="display:block; margin-bottom:4px;">--- Cancellation (C) / New Request (R) Lines ---</strong>`;

      data.flightChangePairs.forEach((pair) => {
        const cLT = document.createElement("div");
        cLT.style.cssText = "font-family: monospace; white-space: pre; font-size: 11px; color: #555;";
        cLT.textContent = pair.cLine;
        editableContainer.appendChild(cLT);
        editableContainer.appendChild(createEditableRLineRow(pair.rLineData));
      });
      editor.appendChild(editableContainer);

      const siDiv = document.createElement("div");
      siDiv.className = "history-editor-si";
      siDiv.textContent = `--- SI Line ---\n${data.siLine || `SI SLOT CHG REQ ${data.airportCode}`}`;
      editor.appendChild(siDiv);

      const generatedPreviewDiv = document.createElement("div");
      generatedPreviewDiv.className = "scr-preview-box";
      generatedPreviewDiv.innerHTML = "<strong>--- Generated SCR Preview ---</strong>\nPreview updates as fields change.";
      editor.appendChild(generatedPreviewDiv);

      const refreshGeneratedPreview = async () => {
        const result = await buildUpdatedChangeScrFromContainer(
          editableContainer,
          data.flightChangePairs,
          data.headerLines,
          data.airportCode,
          entry.serviceType ? entry.serviceType.charAt(0) : "P"
        );

        if (!result) {
          generatedPreviewDiv.innerHTML = "<strong>--- Generated SCR Preview ---</strong>\nUnable to build preview.";
          return;
        }

        siDiv.textContent = `--- SI Line ---\n${result.finalSiLine}`;

        const highlightedHtml = buildHistoryHighlightedPreviewHtml(
          data.headerLines,
          data.flightChangePairs,
          result.updatedPairs,
          result.finalSiLine
        );

        generatedPreviewDiv.innerHTML = `<strong>--- Generated SCR Preview ---</strong>\n${highlightedHtml}`;
      };

      editableContainer.querySelectorAll("input, select").forEach(field => {
        field.addEventListener("input", refreshGeneratedPreview);
        field.addEventListener("change", refreshGeneratedPreview);
      });

      refreshGeneratedPreview();

      const actionBar = document.createElement("div");
      actionBar.className = "history-editor-actions";

      const previewBtn = document.createElement("button");
      previewBtn.type = "button";
      previewBtn.textContent = "Preview";
      previewBtn.addEventListener("click", async () => {
        const result = await buildUpdatedChangeScrFromContainer(
          editableContainer,
          data.flightChangePairs,
          data.headerLines,
          data.airportCode,
          entry.serviceType ? entry.serviceType.charAt(0) : "P"
        );
        if (!result) return;

        siDiv.textContent = `--- SI Line ---\n${result.finalSiLine}`;

        const highlightedHtml = buildHistoryHighlightedPreviewHtml(
          data.headerLines,
          data.flightChangePairs,
          result.updatedPairs,
          result.finalSiLine
        );

        showScrModal(`--- Generated SCR Preview ---\n${highlightedHtml}`, true);
      });
      actionBar.appendChild(previewBtn);

      const viewHighlightedBtn = document.createElement("button");
      viewHighlightedBtn.type = "button";
      viewHighlightedBtn.textContent = "View Highlighted SCR";
      viewHighlightedBtn.addEventListener("click", async () => {
        const result = await buildUpdatedChangeScrFromContainer(
          editableContainer,
          data.flightChangePairs,
          data.headerLines,
          data.airportCode,
          entry.serviceType ? entry.serviceType.charAt(0) : "P"
        );
        if (!result) return;

        const highlightedHtml = buildHistoryHighlightedPreviewHtml(
          data.headerLines,
          data.flightChangePairs,
          result.updatedPairs,
          result.finalSiLine
        );

        showScrModal(`--- Generated SCR Preview ---\n${highlightedHtml}`, true);
      });
      actionBar.appendChild(viewHighlightedBtn);

      const copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.textContent = "Copy";
      copyBtn.addEventListener("click", async () => {
        const result = await buildUpdatedChangeScrFromContainer(
          editableContainer,
          data.flightChangePairs,
          data.headerLines,
          data.airportCode,
          entry.serviceType ? entry.serviceType.charAt(0) : "P"
        );
        if (!result) return;
        siDiv.textContent = `--- SI Line ---\n${result.finalSiLine}`;
        copyScrToClipboard(result.updatedScrMessage);
      });
      actionBar.appendChild(copyBtn);

      const sendBtn = document.createElement("button");
      sendBtn.type = "button";
      sendBtn.textContent = "Update & Send Email";
      sendBtn.addEventListener("click", async () => {
        currentSlotType = "CHANGE SCR";
        const result = await buildUpdatedChangeScrFromContainer(
          editableContainer,
          data.flightChangePairs,
          data.headerLines,
          data.airportCode,
          entry.serviceType ? entry.serviceType.charAt(0) : "P"
        );
        if (!result) return;

        siDiv.textContent = `--- SI Line ---\n${result.finalSiLine}`;

        await sendEmail(data.airportCode, result.updatedScrMessage, entry.serviceType ? entry.serviceType.charAt(0) : "P");

        addLogEntry({
          type: "CHANGE SCR (Updated)",
          flightNumber: result.updatedPairs.map(p => p.rLineData.flight).join(", "),
          airport: data.airportCode,
          direction: "change",
          timestamp: getReadableTimestamp(),
          rawInput: entry.rawInput || "",
          scrMessage: result.updatedScrMessage,
          slotTypeValue: "CHANGE",
          serviceType: entry.serviceType || "P",
          registration: entry.registration || "",
          dAircraftChoice: entry.dAircraftChoice || "L45",
          changeEditorData: buildChangeHistoryPayload(data.airportCode, data.headerLines, result.updatedPairs, result.finalSiLine)
        });

        showSuccess(`Updated ${data.airportCode}. Sending...`);
      });
      actionBar.appendChild(sendBtn);

      const closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.textContent = "Close";
      closeBtn.addEventListener("click", () => editor.remove());
      actionBar.appendChild(closeBtn);

      editor.appendChild(actionBar);
      itemContainer.appendChild(editor);
    }

    function generateCancelScrFromHistory(entry) {
      if (!entry || !entry.scrMessage) {
        showError("No saved SCR message available to create a cancellation.");
        return null;
      }

      const lines = entry.scrMessage
        .split("\n")
        .map(line => line.trim())
        .filter(Boolean);

      if (lines.length < 4) {
        showError("Saved SCR message is not valid for cancellation.");
        return null;
      }

      const airportCode = entry.airport || lines[3] || "UNKNOWN";
      const serviceType = entry.serviceType ? entry.serviceType.charAt(0) : "P";

      const headerLines = lines.slice(0, 4);
      const siLine = (() => {
        let line = `SI SLOT CANX REQ ${airportCode}`;
        if (serviceType === "D") {
          const aircraftLabel = entry.dAircraftChoice === "CL5" ? "BOMBARDIER" : "LEARJET";
          const reg = (entry.registration || "").toUpperCase() || "[UNKNOWN_REG]";
          line += ` // ${aircraftLabel} REG: ${reg}`;
        }
        return line;
      })();

      const bodyLines = lines.slice(4).filter(line => !line.startsWith("SI "));
      let cancelLine = null;
      const changeEntry = entry.type && entry.type.toUpperCase().includes("CHANGE");

      if (changeEntry) {
        const rLines = bodyLines.filter(line => /^R\s|^R[A-Z0-9]/i.test(line));
        const rLine = rLines.length ? rLines[rLines.length - 1] : null;
        if (!rLine) {
          showError("No updated R line found to cancel.");
          return null;
        }

        if (/^R\s/.test(rLine)) {
          cancelLine = "D " + rLine.slice(2);
        } else {
          cancelLine = "D" + rLine.slice(1);
        }
      } else {
        const schedLine = bodyLines.find(line => /^[NDR]\s|^[NDR][A-Z0-9]/i.test(line));
        if (!schedLine) {
          showError("No valid line found to cancel.");
          return null;
        }

        if (/^[NDR]\s/.test(schedLine)) {
          cancelLine = "D " + schedLine.slice(2);
        } else {
          cancelLine = "D" + schedLine.slice(1);
        }
      }

      return [{
        airportCode,
        scrMessage: [...headerLines, cancelLine, siLine].join("\n"),
        flightNumber: entry.flightNumber || "-",
        direction: entry.direction || "-"
      }];
    }

    async function cancelScrFromHistory(entry) {
      if ((entry.slotTypeValue === "CANCEL") || (entry.type && entry.type.toUpperCase().includes("CANCEL"))) {
        showError("This history item is already a cancellation SCR.");
        return;
      }

      const cancellationMessages = generateCancelScrFromHistory(entry);
      if (!cancellationMessages || cancellationMessages.length === 0) return;

      currentSlotType = "CANCEL SLOT";

      for (const msg of cancellationMessages) {
        await sendEmail(msg.airportCode, msg.scrMessage, entry.serviceType ? entry.serviceType.charAt(0) : "P");

        addLogEntry({
          type: "CANCEL SLOT",
          flightNumber: msg.flightNumber,
          airport: msg.airportCode,
          direction: msg.direction,
          timestamp: getReadableTimestamp(),
          rawInput: entry.rawInput || "",
          scrMessage: msg.scrMessage,
          slotTypeValue: "CANCEL",
          serviceType: entry.serviceType || "P",
          registration: entry.registration || "",
          dAircraftChoice: entry.dAircraftChoice || "L45"
        });
      }

      showSuccess(`Cancellation SCR created and sent for ${cancellationMessages.length} history item.`);
    }

    function renderHistoryPanel() {
      const historyList = document.getElementById("historyList");
      if (!historyList) return;

      const search = getHistorySearchValue();
      const log = getHistoricLog();

      const indexedLog = log.map((entry, index) => ({ entry, index }));
      const filtered = indexedLog.filter(item => matchesHistorySearch(item.entry, search));

      if (!filtered.length) {
        historyList.innerHTML = `<div class="history-empty">No matching SCR history found.</div>`;
        return;
      }

      historyList.innerHTML = "";

      filtered.forEach(({ entry, index: realIndex }) => {
        const item = document.createElement("div");
        item.className = "history-item";

        const title = document.createElement("div");
        title.className = "history-item-title";
        title.textContent = `${entry.type || "SCR"} - ${entry.airport || "UNKNOWN"}`;

        const meta = document.createElement("div");
        meta.className = "history-item-meta";
        meta.innerHTML = `
          <div><strong>Flight:</strong> ${entry.flightNumber || "-"}</div>
          <div><strong>Direction:</strong> ${entry.direction || "-"}</div>
          <div><strong>Slot Type:</strong> ${getSlotTypeLabel(entry.slotTypeValue, entry.type) || "-"}</div>
          <div><strong>Service:</strong> ${entry.serviceType || "-"}</div>
          <div><strong>Reg:</strong> ${entry.registration || "-"}</div>
          <div><strong>Time:</strong> ${entry.timestamp || "-"}</div>
        `;

        const preview = document.createElement("div");
        preview.className = "history-item-preview";
        preview.textContent = formatPreviewText(entry.scrMessage || "", 260);

        const actions = document.createElement("div");
        actions.className = "history-actions";

        const viewBtn = document.createElement("button");
        viewBtn.type = "button";
        viewBtn.textContent = "View SCR";
        viewBtn.addEventListener("click", () => showScrModal(entry.scrMessage || ""));
        actions.appendChild(viewBtn);

        const copyBtn = document.createElement("button");
        copyBtn.type = "button";
        copyBtn.textContent = "Copy SCR";
        copyBtn.addEventListener("click", () => copyScrToClipboard(entry.scrMessage || ""));
        actions.appendChild(copyBtn);

        const changeBtn = document.createElement("button");
        changeBtn.type = "button";
        changeBtn.textContent = "Change SCR";
        changeBtn.addEventListener("click", () => {
          const editorData = entry.changeEditorData || buildChangeEditorDataFromRawHistory(entry);
          if (!editorData) return;

          const historyEntryForEditor = {
            ...entry,
            changeEditorData: editorData,
            serviceType: entry.serviceType || "P",
            registration: entry.registration || "",
            dAircraftChoice: entry.dAircraftChoice || "L45"
          };

          renderHistoryChangeEditor(historyEntryForEditor, item);
        });
        actions.appendChild(changeBtn);

        const inputBtn = document.createElement("button");
        inputBtn.type = "button";
        inputBtn.textContent = "View Input";
        inputBtn.addEventListener("click", () => showScrModal(entry.rawInput || "No original input stored."));
        actions.appendChild(inputBtn);

        const cancelBtn = document.createElement("button");
        cancelBtn.type = "button";
        cancelBtn.textContent = "Cancel SCR";
        cancelBtn.addEventListener("click", async () => {
          await cancelScrFromHistory(entry);
        });
        actions.appendChild(cancelBtn);

        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.textContent = "Remove History";
        removeBtn.addEventListener("click", () => deleteLogEntry(realIndex));
        actions.appendChild(removeBtn);

        item.appendChild(title);
        item.appendChild(meta);
        item.appendChild(preview);
        item.appendChild(actions);

        historyList.appendChild(item);
      });
    }

    function setupEventListeners() {
      document.getElementById("formatBtn").addEventListener("click", () => {
        (document.getElementById("slotType").value === "CHANGE") ? formatChangeSCRMessages() : formatSCRMessages();
      });

      document.getElementById("dropdownMenu").addEventListener("change", function() {
        document.getElementById("aircraftSelection").style.display = (this.value.charAt(0) === "D") ? "block" : "none";
      });

      const lCb = document.getElementById("learjetCheckbox");
      const bCb = document.getElementById("bombardierCheckbox");

      lCb.addEventListener("change", () => {
        if (lCb.checked) bCb.checked = false;
        else if (!bCb.checked) lCb.checked = true;
      });

      bCb.addEventListener("change", () => {
        if (bCb.checked) lCb.checked = false;
        else if (!lCb.checked) bCb.checked = true;
      });

      document.getElementById("refreshHistoryBtn").addEventListener("click", renderHistoryPanel);
      document.getElementById("clearHistoryBtn").addEventListener("click", () => {
        showClearAllModal();
      });
      document.getElementById("historySearch").addEventListener("input", renderHistoryPanel);
      document.getElementById("historySearch").addEventListener("keyup", renderHistoryPanel);
    }

    document.addEventListener("DOMContentLoaded", () => {
      setupEventListeners();
      startHistoryListener();

      document.getElementById("aircraftSelection").style.display =
        (getSelectedServiceType() === "D") ? "block" : "none";

      const modal = document.getElementById("scrModal");
      const closeModalBtn = document.getElementById("closeScrModalBtn");

      if (closeModalBtn) {
        closeModalBtn.onclick = function() {
          if (modal) modal.style.display = "none";
        };
      }

      const confirmClearAllBtn = document.getElementById("confirmClearAllBtn");
      const cancelClearAllBtn = document.getElementById("cancelClearAllBtn");

      if (confirmClearAllBtn) {
        confirmClearAllBtn.onclick = function() {
          hideClearAllModal();
          clearHistory();
        };
      }

      if (cancelClearAllBtn) {
        cancelClearAllBtn.onclick = function() {
          hideClearAllModal();
        };
      }

      window.onclick = function(event) {
        const scrModal = document.getElementById("scrModal");
        const clearAllModal = document.getElementById("clearAllModal");

        if (event.target === scrModal && scrModal) {
          scrModal.style.display = "none";
        }

        if (event.target === clearAllModal && clearAllModal) {
          clearAllModal.style.display = "none";
        }
      };
    });
