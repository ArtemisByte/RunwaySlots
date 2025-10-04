if (typeof firebase === 'undefined') { showError("Firebase configuration failed to load."); }

const STORAGE_KEY = "historicLog";
let currentSlotType = "";
const monthMap = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };
const monthAbbrArr = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** IATA SEASON CHANGE */
function getIataSeasonCode(date = new Date()) {
  const y = date.getFullYear();
  const lastSunday = (year, monthIndex) => {
    const d = new Date(year, monthIndex + 1, 0, 12);
    const dow = d.getDay(); // 0=Sun..6=Sat
    d.setDate(d.getDate() - dow);
    d.setHours(0, 0, 0, 0);
    return d;
  };
  const summerStart = lastSunday(y, 2); // last Sunday of March
  const winterStart = lastSunday(y, 9); // last Sunday of October
  if (date >= winterStart) return "W" + String(y).slice(-2);
  if (date >= summerStart) return "S" + String(y).slice(-2);
  return "W" + String(y - 1).slice(-2);
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

function getHistoricLog() { try { const d = localStorage.getItem(STORAGE_KEY); return d ? JSON.parse(d) : []; } catch (e) { return []; } }
function setHistoricLog(l) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(l)); } catch (e) { showError("Could not save log."); } }
function addLogEntry(e) { const l = getHistoricLog(); l.push(e); setHistoricLog(l); }
function parseDateString(dStr) { dStr = dStr ? dStr.toUpperCase() : ''; const mD = dStr.match(/^(\d{2})([A-Z]{3})$/); const mDY = dStr.match(/^(\d{2})([A-Z]{3})(\d{4})$/); let dy, mAb, yr; if (mDY) { [, dy, mAb, yr] = mDY.map((v, i) => i === 1 || i === 3 ? parseInt(v, 10) : v); } else if (mD) { [, dy, mAb] = mD.map((v, i) => i === 1 ? parseInt(v, 10) : v); yr = new Date().getFullYear(); } else { return null; } const mIdx = monthMap[mAb]; if (mIdx === undefined || isNaN(dy) || isNaN(yr) || dy < 1 || dy > 31) return null; const dtO = new Date(Date.UTC(yr, mIdx, dy)); if (dtO.getUTCFullYear() === yr && dtO.getUTCMonth() === mIdx && dtO.getUTCDate() === dy) return dtO; return null; }
function getDayOfOperation(dayOfWeek) { const fD = dayOfWeek.charAt(0).toUpperCase() + dayOfWeek.slice(1).toLowerCase(); const ds = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]; const dgs = [7, 1, 2, 3, 4, 5, 6]; const pws = [0, 6, 5, 4, 3, 2, 1]; let idx = ds.indexOf(fD); if (idx === -1) idx = 1; const dg = dgs[idx]; const pw = pws[idx]; const cN = dg * Math.pow(10, pw); return String(cN).padStart(7, '0'); }
function convertSCRDateToInput(sD) { const p = parseDateString(sD); if (!p) return ""; const dy = String(p.getUTCDate()).padStart(2, '0'); const mn = String(p.getUTCMonth() + 1).padStart(2, '0'); const yr = p.getUTCFullYear(); return `${yr}-${mn}-${dy}`; }
function convertInputDateToSCR(iD) { try { const dO = new Date(iD + 'T00:00:00Z'); if (isNaN(dO.getTime())) return "01JAN"; const dy = String(dO.getUTCDate()).padStart(2, '0'); const mA = monthAbbrArr[dO.getUTCMonth()]; return dy + mA; } catch (e) { return "01JAN"; } }
function getCurrentDate() { const dO = new Date(); const dy = String(dO.getDate()).padStart(2, '0'); const mn = monthAbbrArr[dO.getMonth()]; return `${dy}${mn}`; }

function parseInput(input) {
  const lines = input ? input.trim().split("\n") : []; const pE = []; let hasError = false;
  lines.forEach((ln) => {
    ln = ln.trim(); if (!ln) return; const pts = ln.split(/\s+/);
    if (pts.length < 7 || pts.length > 8) { hasError = true; return; }
    const [fR, fRw, tRw, dS, dpT, arT, sIn] = pts; let acTIn = pts[7] ? pts[7].toUpperCase() : null;
    const frm = fRw.toUpperCase(); const to = tRw.toUpperCase();
    if (acTIn === '738') acTIn = '73H'; if (acTIn === '197' || acTIn === '73M') acTIn = '7M8';
    const pD = parseDateString(dS); if (!pD) { hasError = true; return; }
    if (!/^\d{4}$/.test(dpT) || !/^\d{4}$/.test(arT)) { hasError = true; return; }
    const dOW = pD.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }); const dOO = getDayOfOperation(dOW); const dt = convertInputDateToSCR(pD.toISOString().split('T')[0]);
    const fP = fR.slice(0, 2).toUpperCase(); let fN = fR.slice(2); const fDg = fN.match(/\d+/)?.[0] || ""; let fLt = fN.replace(/\d+/g, "").toUpperCase(); if (fLt.endsWith("P")) fLt = fLt.slice(0, -1); const pFDg = fDg.padStart(3, "0"); const fl = `${fP}${pFDg}${fLt}`;
    pE.push({ flight: fl, from: frm, to: to, date: dt, fullDate: pD, departureTime: dpT, arrivalTime: arT, serviceTypeInput: sIn.toUpperCase(), dayOfOperation: dOO, aircraftTypeInput: acTIn, originalLine: ln });
  });
  return { parsedEntries: pE, errors: hasError };
}

  function getSelectedServiceType() { return document.getElementById("dropdownMenu").value; }
  function getSlotType() { const v = document.getElementById("slotType").value; if (v === "NEW") return "NEW SLOT"; if (v === "CANCEL") return "CANCEL SLOT"; if (v === "CHANGE") return "CHANGE SCR"; return ""; }
  function getAircraftReg() { const sST = getSelectedServiceType(); const rIV = document.getElementById("regInput").value.trim().toUpperCase(); if (sST === "D") { if (rIV && rIV !== "L45" && rIV !== "CL5") return rIV; if (document.getElementById("learjetCheckbox").checked) return "L45"; if (document.getElementById("bombardierCheckbox").checked) return "CL5"; document.getElementById("learjetCheckbox").checked = true; return "L45"; } return rIV || "[UNKNOWN_REG]"; }
  function getFinalCombinedCode(scrLineServiceType, aircraftTypeInput) { const sT = scrLineServiceType.toUpperCase(); const aTI = aircraftTypeInput ? aircraftTypeInput.toUpperCase() : null; if (sT === 'J') { if (aTI === '73H') return '18973H'; if (aTI === '7MJ') return '2287MJ'; if (aTI === '320') return '180320'; if (aTI === '7M8') return '1977M8'; return '18973H'; } else if (sT === 'P') { if (aTI === '73H') return '00073H'; if (aTI === '7M8') return '0007M8';  if (aTI === '320') return '000320'; if (aTI === '7MJ') return '0007MJ'; return '00073H'; } else if (sT === 'D') { const pfx = document.getElementById("bombardierCheckbox").checked ? "009" : "008"; const oC = document.getElementById("bombardierCheckbox").checked ? "CL5" : "L45"; return pfx + oC; } else { const pfx = '000'; let oC = '73H'; if (aTI === '73H') oC = '73H'; else if (aTI === '7M8') oC = '7M8'; else if (aTI === '320') oC ='320'; else if (aTI === '7MJ') oC ='7MJ'; return pfx + oC; } }
  function showError(m) { const eD = document.getElementById("errorMessage"); eD.innerHTML = m; eD.style.display = "block"; }
  function showSuccess(m) { const sD = document.getElementById("successMessage"); sD.textContent = m; sD.style.display = "block"; setTimeout(() => { sD.style.display = "none"; }, 5000); }
  function clearFeedback() { document.getElementById("errorMessage").style.display = "none"; document.getElementById("successMessage").style.display = "none"; }

function attachSendButtonsListeners() { const oL = document.getElementById("outputList"); oL.removeEventListener("click", handleOutputListClick); oL.addEventListener("click", handleOutputListClick); }
async function handleOutputListClick(event) { const tgt = event.target.closest('button'); if (tgt && tgt.closest('.scr-group') && tgt.textContent.includes('Send Email')) { const card = tgt.closest('.scr-group'); if (!tgt.textContent.includes('Update')) { const aC = card.dataset.airportCode; const sO = card.dataset.scrOutput; if (aC && sO) await sendEmail(aC, sO); else showError("Err: Missing data."); } } }

function formatSCRMessages() {
  clearFeedback(); const input = document.getElementById("userInput").value; const { parsedEntries, errors } = parseInput(input);
  if (errors) { showError(`Input validation failed. Check format.`); }
  if (parsedEntries.length === 0) { if (!errors) showError("No valid flights."); return; }

  currentSlotType = getSlotType(); const scrLineServiceType = getSelectedServiceType(); const globalReg = getAircraftReg();
  const outputList = document.getElementById("outputList"); outputList.innerHTML = ""; const airportGroups = {};
  parsedEntries.forEach((d) => { const { from, to } = d; if (!airportGroups[from]) airportGroups[from] = { airportCode: from, flights: [] }; airportGroups[from].flights.push({ type: 'departure', data: d }); if (!airportGroups[to]) airportGroups[to] = { airportCode: to, flights: [] }; airportGroups[to].flights.push({ type: 'arrival', data: d }); });

  Object.values(airportGroups).forEach((grp) => {
    const { airportCode, flights } = grp;

    // Determine season from earliest dated leg in this group
    const minDateMs = Math.min(...flights.map(f => f.data.fullDate?.getTime?.() ?? Date.now()));
    const groupSeason = getIataSeasonCode(new Date(minDateMs));

    const sLs = ["SCR", groupSeason, getCurrentDate(), airportCode];

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
    createScrGroupElement(outputList, airportCode, scrOut); // Use OLD UI creation function
    addLogEntry({
      type: currentSlotType,
      flightNumber: flights.map(e => e.data.flight).join(", "),
      airport: airportCode,
      direction: flights.map(e => e.type).join("/"),
      timestamp: new Date().toISOString().split(".")[0].replace("T", " "),
      scrMessage: scrOut
    });
  });

  if (parsedEntries.length > 0) { showSuccess(`Formatted ${parsedEntries.length} leg(s) into ${Object.keys(airportGroups).length} message(s). ${errors ? 'Errors found.' : ''}`); }
  attachSendButtonsListeners();
}

function formatChangeSCRMessages() {
  clearFeedback(); const input = document.getElementById("userInput").value; const { parsedEntries, errors } = parseInput(input);
  if (errors) { showError(`Input validation failed. Check format.`); }
  if (parsedEntries.length === 0) { if (!errors) showError("No valid flights for change."); return; }
  currentSlotType = "CHANGE SCR"; const scrLineServiceType = getSelectedServiceType(); const globalReg = getAircraftReg();
  const outputList = document.getElementById("outputList"); outputList.innerHTML = ""; const airportGroups = {};
  parsedEntries.forEach((d) => { const { from, to } = d; if (!airportGroups[from]) airportGroups[from] = { airportCode: from, flights: [] }; airportGroups[from].flights.push({ type: 'departure', data: d }); if (!airportGroups[to]) airportGroups[to] = { airportCode: to, flights: [] }; airportGroups[to].flights.push({ type: 'arrival', data: d }); });

  Object.values(airportGroups).forEach((grp, gIdx) => {
    const { airportCode, flights } = grp;

    // Determine season from earliest dated leg in this group
    const minDateMs = Math.min(...flights.map(f => f.data.fullDate?.getTime?.() ?? Date.now()));
    const groupSeason = getIataSeasonCode(new Date(minDateMs));

    let hLs = ["SCR", groupSeason, getCurrentDate(), airportCode]; // updated header with season
    let fCPs = []; // flightChangePairs

    flights.forEach((fE, fIdx) => {
      const { type, data } = fE;
      const { flight, date, dayOfOperation: dOO, departureTime: dT, arrivalTime: aT, from, to, aircraftTypeInput: aTI } = data;
      const fCC = getFinalCombinedCode(scrLineServiceType, aTI);
      let cLB = `${date}${date} ${dOO} ${fCC}`;
      let cLn;
      let rLD = { id: `rline-${gIdx}-${fIdx}`, flight, date: convertSCRDateToInput(date), day: dOO, combinedCode: fCC, service: scrLineServiceType, direction: type };
      if (type === 'departure') { cLn = `C ${flight} ${cLB} ${dT}${to} ${scrLineServiceType}`; rLD.time = dT.slice(0, 2) + ":" + dT.slice(2); rLD.airport = to; }
      else { cLn = `C${flight} ${cLB} ${from}${aT} ${scrLineServiceType}`; rLD.time = aT.slice(0, 2) + ":" + aT.slice(2); rLD.airport = from; }
      fCPs.push({ cLine: cLn, rLineData: rLD });
    });

    const scrGroup = createChangeScrGroupElement(outputList, airportCode, hLs, fCPs, gIdx); 
    const iSiL = scrGroup.querySelector(`#si-line-display-${gIdx}`).textContent.replace('--- SI Line ---\n','');
    const iPLs = fCPs.map(p => {
      const r=p.rLineData; const sD=convertInputDateToSCR(r.date); const tF=r.time.replace(":", "");
      const iRL = (r.direction==='departure')
        ? `R ${r.flight} ${sD}${sD} ${r.day} ${r.combinedCode} ${tF}${r.airport} ${r.service}`
        : `R${r.flight} ${sD}${sD} ${r.day} ${r.combinedCode} ${r.airport}${tF} ${r.service}`;
      return `${p.cLine}\n${iRL}`;
    }).join("\n");
    const iSMsg = [...hLs, iPLs, iSiL].join("\n"); scrGroup.dataset.scrOutput = iSMsg;

    addLogEntry({
      type: "CHANGE SCR (Initial)",
      flightNumber: fCPs.map(p => p.rLineData.flight).join(", "),
      airport: airportCode,
      direction: "change",
      timestamp: new Date().toISOString().split(".")[0].replace("T", " "),
      scrMessage: iSMsg
    });
  });
  if (parsedEntries.length > 0) { showSuccess(`Formatted ${parsedEntries.length} leg(s) into ${Object.keys(airportGroups).length} editable message(s). ${errors ? 'Errors found.' : ''}`); }
}

/** Creates scr-group for NEW/CANCEL */
function createScrGroupElement(outputList, airportCode, scrOutput) {
  const scrGroup = document.createElement("div"); scrGroup.className = "scr-group"; scrGroup.dataset.airportCode = airportCode; scrGroup.dataset.scrOutput = scrOutput;
  const hD = document.createElement("div"); hD.className = "heading"; hD.textContent = `SCR [${airportCode}]`; scrGroup.appendChild(hD);
  const oCD = document.createElement("div"); oCD.className = "output-container"; const pre = document.createElement("pre"); pre.textContent = scrOutput; oCD.appendChild(pre); scrGroup.appendChild(oCD);
  const bF = document.createElement("div"); bF.className = "send-button-container"; const sB = document.createElement("button"); sB.textContent = "Send Email"; bF.appendChild(sB); scrGroup.appendChild(bF);
  outputList.appendChild(scrGroup);
}

/** Creates scr-group for CHANGE SCR */
function createChangeScrGroupElement(outputList, airportCode, headerLines, flightChangePairs, groupIndex) {
  const scrGroup = document.createElement("div"); scrGroup.className = "scr-group"; scrGroup.dataset.airportCode = airportCode;
  scrGroup.dataset.headerLines = JSON.stringify(headerLines); scrGroup.dataset.flightChangePairs = JSON.stringify(flightChangePairs);
  scrGroup.dataset.siAction = "SLOT CHG REQ"; scrGroup.dataset.siAirport = airportCode;
  const scrLineServiceType = getSelectedServiceType(); const globalReg = getAircraftReg();
  scrGroup.dataset.globalReg = globalReg; scrGroup.dataset.serviceType = scrLineServiceType;

  const headingDiv = document.createElement("div"); headingDiv.className = "heading"; headingDiv.textContent = `Change SCR [${airportCode}]`; scrGroup.appendChild(headingDiv);
  const outputContainerDiv = document.createElement("div"); outputContainerDiv.className = "output-container"; // Use the old class

  // Display Header
  const headerDisplayDiv = document.createElement("div"); headerDisplayDiv.style.cssText = "white-space: pre-wrap; font-family: monospace; margin-bottom: 10px;"; headerDisplayDiv.innerHTML = `<strong>--- Header ---</strong>\n${headerLines.join("\n")}`; outputContainerDiv.appendChild(headerDisplayDiv);

  // Display interleaved C / editable R lines
  const cAndRLinesDiv = document.createElement("div"); cAndRLinesDiv.id = `editable-r-lines-${groupIndex}`; cAndRLinesDiv.innerHTML = `<strong style="display: block; margin-bottom: 4px;">--- Cancellation (C) / New Request (R) Lines ---</strong>`;
  flightChangePairs.forEach((pair) => { const cLT = document.createElement('div'); cLT.style.cssText = 'font-family: monospace; white-space: pre; font-size: 11px; color: #555;'; cLT.textContent = pair.cLine; cAndRLinesDiv.appendChild(cLT); cAndRLinesDiv.appendChild(createEditableRLineRow(pair.rLineData)); }); // Use OLD R-line creator
  outputContainerDiv.appendChild(cAndRLinesDiv);

  // Display SI Line placeholder
  const siDiv = document.createElement("div"); siDiv.id = `si-line-display-${groupIndex}`; siDiv.style.cssText = "white-space: pre-wrap; font-family: monospace; margin-top: 10px;";
  let initialSiLine = `SI SLOT CHG REQ ${airportCode}`; if (scrLineServiceType === "D") { let lbl = document.getElementById("learjetCheckbox").checked ? "LEARJET" : "BOMBARDIER"; initialSiLine += ` // ${lbl} REG: ${globalReg}`; } siDiv.innerHTML = `<strong>--- SI Line ---</strong>\n${initialSiLine}`; outputContainerDiv.appendChild(siDiv);
  scrGroup.appendChild(outputContainerDiv);

  // Button Container
  const buttonContainer = document.createElement("div"); buttonContainer.className = "send-button-container"; // Use old class
  const updateSendBtn = document.createElement("button"); updateSendBtn.textContent = "Update & Send Email";
  updateSendBtn.addEventListener("click", async () => {
    const editableContainer = document.getElementById(`editable-r-lines-${groupIndex}`); const modifiedRows = editableContainer.querySelectorAll(".modified-scr-row"); let reconstructionError = false;
    const storedFlightChangePairs = JSON.parse(scrGroup.dataset.flightChangePairs || "[]"); const groupServiceType = scrGroup.dataset.serviceType;
    const storedHeader = JSON.parse(scrGroup.dataset.headerLines || "[]"); let updatedMessageLines = [...storedHeader];
    modifiedRows.forEach((rowDiv) => { const rowId = rowDiv.dataset.rowId; const originalPair = storedFlightChangePairs.find(p => p.rLineData.id === rowId); if (!originalPair) { reconstructionError = true; return; } const originalCLine = originalPair.cLine; const direction = originalPair.rLineData.direction; try { const fV=rowDiv.querySelector(".r-flight").value.toUpperCase(); const dV=rowDiv.querySelector(".r-date").value; const sD=convertInputDateToSCR(dV); const dayV=rowDiv.querySelector(".r-day").value; const cCV=rowDiv.querySelector(".r-combined-code").value.toUpperCase(); const tVR=rowDiv.querySelector(".r-time").value; const tV=tVR.replace(":",""); const aV=rowDiv.querySelector(".r-airport").value.toUpperCase(); const sV=rowDiv.querySelector(".r-service").value.toUpperCase(); if(!fV||!sD||!dayV||!cCV||!/^\d{4}$/.test(tV)||!aV||!sV) throw new Error("Invalid"); let uRL=(direction==='departure')?`R ${fV} ${sD}${sD} ${dayV} ${cCV} ${tV}${aV} ${sV}`:`R${fV} ${sD}${sD} ${dayV} ${cCV} ${aV}${tV} ${sV}`; updatedMessageLines.push(originalCLine); updatedMessageLines.push(uRL); } catch(err){ showError(`Error R-Line ${originalPair.rLineData.flight}.`); reconstructionError=true; } });
    if(reconstructionError){ showError(`Failed update ${airportCode}.`); return; }
    const siAction = scrGroup.dataset.siAction; const siAirport = scrGroup.dataset.siAirport; let finalSiLine = `SI ${siAction} ${siAirport}`; if(groupServiceType === "D"){ let lbl=document.getElementById("learjetCheckbox").checked?"LEARJET":"BOMBARDIER"; let reg=getAircraftReg(); finalSiLine+=` // ${lbl} REG: ${reg}`; } document.getElementById(`si-line-display-${groupIndex}`).innerHTML = `<strong>--- SI Line ---</strong>\n${finalSiLine}`; updatedMessageLines.push(finalSiLine);
    const updatedScrMessage = updatedMessageLines.join("\n"); scrGroup.dataset.scrOutput = updatedScrMessage;
    showSuccess(`Updated ${airportCode}. Sending...`); await sendEmail(airportCode, updatedScrMessage);
    addLogEntry({ type: "CHANGE SCR (Updated)", flightNumber: storedFlightChangePairs.map(p => p.rLineData.flight).join(", "), airport: airportCode, direction: "change", timestamp: new Date().toISOString().split(".")[0].replace("T", " "), scrMessage: updatedScrMessage });
  });
  buttonContainer.appendChild(updateSendBtn); scrGroup.appendChild(buttonContainer); outputList.appendChild(scrGroup); return scrGroup;
}

/** create OLD UI editable R-Line row */
function createEditableRLineRow(rowData) {
  const rowDiv = document.createElement("div"); rowDiv.className = "modified-scr-row"; rowDiv.dataset.rowId = rowData.id;
  const createField = (lTxt, iT, cN, val, dis = false, opts = null) => { const lbl = document.createElement("label"); lbl.textContent = lTxt + ": "; let inp; if(iT === 'select'){ inp = document.createElement("select"); inp.className = cN; (opts||[]).forEach(o => { const op = document.createElement("option"); op.value=o; op.textContent=o; if(o===val) op.selected=true; inp.appendChild(op); }); } else { inp = document.createElement("input"); inp.type = iT; inp.className = cN; inp.value = val; } inp.disabled = dis; if(iT==='text' && (cN==='r-airport'||cN==='r-combined-code')) inp.style.textTransform='uppercase'; lbl.appendChild(inp); return {label:lbl, input:inp}; }; // Return object containing label and input
  const flightField = createField("Flight", "text", "r-flight", rowData.flight); const dateField = createField("Date", "date", "r-date", rowData.date); const dayField = createField("Day", "text", "r-day", rowData.day, true); const combinedCodeField = createField("Code(Prefix+Op)", "text", "r-combined-code", rowData.combinedCode); const timeField = createField("Time", "time", "r-time", rowData.time); const airportField = createField("Airport", "text", "r-airport", rowData.airport); const serviceField = createField("Service", "select", "r-service", rowData.service, false, ["P","J","T","K","D","X"]);
  dateField.input.addEventListener("change", (e) => { try { const sD=new Date(e.target.value+'T00:00:00Z'); if(!isNaN(sD.getTime())){ const dW=sD.toLocaleDateString("en-US",{weekday:"long",timeZone:"UTC"}); dayField.input.value=getDayOfOperation(dW); } else { dayField.input.value="INVALID"; } } catch(err){ dayField.input.value="ERROR"; } });
  rowDiv.appendChild(flightField.label); rowDiv.appendChild(dateField.label); rowDiv.appendChild(dayField.label); rowDiv.appendChild(combinedCodeField.label); rowDiv.appendChild(timeField.label); rowDiv.appendChild(airportField.label); rowDiv.appendChild(serviceField.label);
  return rowDiv;
}

async function sendEmail(airportCode, scrOutput) {
  let sP; if (currentSlotType === "NEW SLOT") sP = "NEW SLOT REQ"; else if (currentSlotType === "CANCEL SLOT") sP = "SLOT CANX REQ"; else if (currentSlotType === "CHANGE SCR") sP = "SLOT CHG REQ"; else sP = "SLOT REQ"; const subj = `${sP} ${airportCode}`;
  const cardEl = Array.from(document.querySelectorAll('.scr-group')).find(c => c.dataset.airportCode === airportCode); let eLST = getSelectedServiceType(); if (cardEl && cardEl.dataset.serviceType) eLST = cardEl.dataset.serviceType; const rE = await getAirportEmail(airportCode, eLST); const cE = "slotdesk@ryanair.com"; let mL = `mailto:${rE}`; const pA = []; if (rE.toLowerCase() !== cE.toLowerCase()) pA.push(`cc=${encodeURIComponent(cE)}`); pA.push(`subject=${encodeURIComponent(subj)}`); pA.push(`body=${encodeURIComponent(scrOutput)}`); if (pA.length > 0) mL += `?${pA.join('&')}`;
  if (mL.length > 2000) { showError(`Email ${airportCode} too long.`); } window.open(mL, '_blank');
}

function sendAllEmails() {
  clearFeedback(); const oL = document.getElementById("outputList"); const cards = oL.querySelectorAll(".scr-group"); if (cards.length === 0) { showError("No messages."); return; } showSuccess(`Triggering ${cards.length} email(s)... Allow popups.`); let eSC = 0;
  cards.forEach((card, idx) => { const aC = card.dataset.airportCode; const sO = card.dataset.scrOutput; if (!aC || !sO) { showError(`Error sending group ${idx + 1}.`); return; } setTimeout(async () => { try { await sendEmail(aC, sO); eSC++; } catch(err) { showError(`Failed ${aC}.`); } finally { if (idx === cards.length - 1) { setTimeout(() => { if(eSC > 0) showSuccess(`Finished ${eSC}/${cards.length} emails.`); }, 500); } } }, idx * 1500); });
}

function setupEventListeners() {
  document.getElementById("formatBtn").addEventListener("click", () => { (document.getElementById("slotType").value === "CHANGE") ? formatChangeSCRMessages() : formatSCRMessages(); });
  document.getElementById("sendAllBtn").addEventListener("click", sendAllEmails);
  document.getElementById("dropdownMenu").addEventListener("change", function() { document.getElementById("aircraftSelection").style.display = (this.value === "D") ? "block" : "none"; });
  const lCb = document.getElementById("learjetCheckbox"); const bCb = document.getElementById("bombardierCheckbox"); lCb.addEventListener("change", () => { if (lCb.checked) bCb.checked = false; else if (!bCb.checked) lCb.checked = true; }); bCb.addEventListener("change", () => { if (bCb.checked) lCb.checked = false; else if (!lCb.checked) bCb.checked = true; });
}

document.addEventListener("DOMContentLoaded", () => {
  setupEventListeners();
  document.getElementById("aircraftSelection").style.display = (getSelectedServiceType() === "D") ? "block" : "none";
  attachSendButtonsListeners();
});
