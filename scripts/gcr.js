(function () {
  "use strict";

  function initFirebaseSafe() {
    try {
      if (!window.firebase || !firebase.initializeApp) return false;
      const cfg = window.firebaseConfig;
      if (!firebase.apps.length) {
        if (!cfg || !cfg.apiKey) return false;
        firebase.initializeApp(cfg);
      }
      return true;
    } catch (e) {
      console.warn("Firebase init skipped:", e);
      return false;
    }
  }

  const FIREBASE_READY = initFirebaseSafe();
  const db = FIREBASE_READY && firebase.database ? firebase.database() : null;

  const DEFAULT_EMAIL = "slotdesk@ryanair.com";
  const GCR_HISTORY_PATH = "gcrHistory";
  const GCR_BACKUP_PATH = "gcrHistoryBackup";
  const GCR_STATS_PATH = "gcrStats";
  const CONNECTED_USERS_PATH = "connectedUsers";

  const monthMap = {
    JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
    JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11
  };
  const monthAbbr = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

  const aircraftTypeMap = new Map();
  let aircraftTypesLoaded = false;
  let historyRecords = [];
  let presenceRef = null;

  const $ = (id) => document.getElementById(id);

  function showError(msg) {
    const e = $("errorMessage");
    if (!e) return;
    e.textContent = msg;
    e.style.display = "block";
    const s = $("successMessage");
    if (s) s.style.display = "none";
    clearTimeout(showError._timer);
    showError._timer = setTimeout(() => { e.style.display = "none"; }, 6000);
  }

  function showSuccess(msg) {
    const s = $("successMessage");
    if (!s) return;
    s.textContent = msg;
    s.style.display = "block";
    const e = $("errorMessage");
    if (e) e.style.display = "none";
    clearTimeout(showSuccess._timer);
    showSuccess._timer = setTimeout(() => { s.style.display = "none"; }, 4500);
  }

  async function copyToClipboard(txt) {
    try {
      await navigator.clipboard.writeText(txt);
      showSuccess("Copied to clipboard!");
    } catch (err) {
      const ta = document.createElement("textarea");
      ta.value = txt;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      showSuccess("Copied to clipboard!");
    }
  }

  function getDisplayName() {
    return (
      localStorage.getItem("rb_username") ||
      localStorage.getItem("username") ||
      "Anonymous"
    ).trim() || "Anonymous";
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function parseDateString(ds) {
    const m = /^(\d{2})([A-Z]{3})(\d{4})$/.exec(String(ds || "").toUpperCase());
    if (!m || !(m[2] in monthMap)) return null;

    const day = Number(m[1]);
    const month = monthMap[m[2]];
    const year = Number(m[3]);
    const dt = new Date(Date.UTC(year, month, day));

    if (
      dt.getUTCFullYear() !== year ||
      dt.getUTCMonth() !== month ||
      dt.getUTCDate() !== day
    ) return null;

    return dt;
  }

  function fmtDate(dt) {
    return String(dt.getUTCDate()).padStart(2, "0") + monthAbbr[dt.getUTCMonth()];
  }

  function validHHMM(value) {
    if (!/^\d{4}$/.test(value)) return false;
    const h = Number(value.slice(0, 2));
    const m = Number(value.slice(2, 4));
    return h >= 0 && h <= 23 && m >= 0 && m <= 59;
  }

  function parseInputDetailed(raw) {
    const sourceLines = String(raw || "").split(/\r?\n/);
    const entries = [];
    const errors = [];

    sourceLines.forEach((source, index) => {
      const line = source.trim();
      if (!line) return;

      const p = line.split(/\s+/);
      if (p.length < 8) {
        errors.push(`Line ${index + 1}: expected 8 fields.`);
        return;
      }

      const [flight, fromRaw, toRaw, dateRaw, dep, arr, acRaw, regRaw] = p;
      const from = fromRaw.toUpperCase();
      const to = toRaw.toUpperCase();
      const acType = acRaw.toUpperCase();
      const reg = regRaw.toUpperCase();
      const dt = parseDateString(dateRaw.toUpperCase());

      if (!/^[A-Z0-9]{4}$/.test(from) || !/^[A-Z0-9]{4}$/.test(to)) {
        errors.push(`Line ${index + 1}: FROM and TO must be 4-character ICAO codes.`);
        return;
      }
      if (!dt) {
        errors.push(`Line ${index + 1}: invalid date '${dateRaw}'. Use DDMMMYYYY.`);
        return;
      }
      if (!validHHMM(dep) || !validHHMM(arr)) {
        errors.push(`Line ${index + 1}: departure/arrival time must be valid HHMM UTC.`);
        return;
      }
      if (!acType || !reg) {
        errors.push(`Line ${index + 1}: aircraft type and registration are required.`);
        return;
      }

      entries.push({
        sourceLine: index + 1,
        flight: flight.toUpperCase(),
        from,
        to,
        fullDate: dateRaw.toUpperCase(),
        date: fmtDate(dt),
        dep,
        arr,
        acType,
        reg,
        svc: "D"
      });
    });

    return { entries, errors };
  }

  function updateLineCounter() {
    const raw = $("userInput")?.value || "";
    const lines = raw.split(/\r?\n/).filter((line) => line.trim()).length;
    const el = $("lineCounter");
    if (el) el.textContent = `${lines} line${lines === 1 ? "" : "s"}`;
  }

  async function loadAircraftTypes() {
    if (aircraftTypesLoaded || !db) return;
    try {
      const snap = await db.ref("aircraftTypes").once("value");
      if (snap.exists()) {
        snap.forEach((child) => {
          const value = child.val() || {};
          const inputCode = String(value.inputCode || child.key || "").toUpperCase().trim();
          const scrCode = String(value.scrCode || inputCode).toUpperCase().trim();
          const seats = String(value.seats || "").replace(/\D/g, "").padStart(3, "0").slice(-3);
          const item = {
            inputCode,
            scrCode: scrCode || inputCode,
            seats: seats || "000",
            name: String(value.name || inputCode || "Aircraft")
          };
          if (inputCode) aircraftTypeMap.set(inputCode, item);
          if (scrCode) aircraftTypeMap.set(scrCode, item);
        });
      }
    } catch (err) {
      console.warn("Aircraft type database load failed:", err);
    } finally {
      aircraftTypesLoaded = true;
    }
  }

  function resolveAircraft(acType) {
    const code = String(acType || "").toUpperCase();
    const fromDb = aircraftTypeMap.get(code);
    if (fromDb) {
      return {
        code: fromDb.scrCode || code,
        seats: (fromDb.seats || "000").padStart(3, "0").slice(-3),
        name: fromDb.name || code
      };
    }

    if (code === "CL5") return { code: "CL5", seats: "009", name: "Bombardier Challenger" };
    if (code === "L45") return { code: "L45", seats: "008", name: "Learjet" };
    return { code, seats: "008", name: code || "Aircraft" };
  }

  function splitEmails(value) {
    return String(value || "")
      .split(/[;,]\s*/)
      .map((item) => item.trim())
      .filter((item) => item && /\S+@\S+\.\S+/.test(item));
  }

  function uniqueEmails(list) {
    const seen = new Set();
    return list.filter((email) => {
      const key = email.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async function getAirportInfoByIcao(icaoCode) {
    const fallback = {
      found: false,
      airportName: "Airport not found in database",
      emails: [DEFAULT_EMAIL],
      gcr: "UNKNOWN",
      ppr: "UNKNOWN"
    };

    const icao = String(icaoCode || "").trim().toUpperCase();
    if (!icao || !db) return fallback;

    try {
      let snap = await db.ref("airports")
        .orderByChild("airportIcao")
        .equalTo(icao)
        .once("value");

      if (!snap.exists()) {
        snap = await db.ref("airports")
          .orderByChild("airportIcao")
          .equalTo(icao.toLowerCase())
          .once("value");
      }

      if (!snap.exists()) return fallback;

      const records = [];
      snap.forEach((child) => records.push(child.val() || {}));

      const generalEmails = uniqueEmails(records.flatMap((r) => splitEmails(r.generalEmail)));
      const normalEmails = uniqueEmails(records.flatMap((r) => splitEmails(r.email)));
      const record = records[0] || {};

      return {
        found: true,
        airportName: record.airportName || icao,
        emails: generalEmails.length ? generalEmails : (normalEmails.length ? normalEmails : [DEFAULT_EMAIL]),
        gcr: String(record.gcr || "UNKNOWN").toUpperCase(),
        ppr: String(record.ppr || "UNKNOWN").toUpperCase()
      };
    } catch (err) {
      console.warn("Airport lookup failed for", icao, err);
      return fallback;
    }
  }

  function buildMailto(toList, subject, body) {
    const to = Array.isArray(toList) && toList.length ? toList.join(",") : DEFAULT_EMAIL;
    return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  function subjectForMode(mode, apt) {
    const ICAO = String(apt || "").toUpperCase();
    if (mode === "NEW") return `NEW GCR REQ '${ICAO}'`;
    if (mode === "CHANGE") return `CHANGE GCR SLOT REQ '${ICAO}'`;
    if (mode === "CANCEL") return `CANCEL GCR SLOT REQ '${ICAO}'`;
    return `GCR '${ICAO}'`;
  }

  function displayModeLabel(mode) {
    if (mode === "NEW") return "NEW SLOT";
    if (mode === "CHANGE") return "CHANGE SLOT";
    if (mode === "CANCEL") return "CANCEL SLOT";
    return mode;
  }

  function buildStaticBlock(apt, entries, mode) {
    const lines = ["GCR", "/REG", apt];
    const prefArr = mode === "CANCEL" ? "D" : "N";
    const prefDep = mode === "CANCEL" ? "D " : "N ";

    entries.filter((e) => e.to === apt).forEach((e) => {
      const ac = resolveAircraft(e.acType);
      lines.push(`${prefArr}${e.reg} ${e.date} ${ac.seats}${ac.code} ${e.from}${e.arr} ${e.svc}`);
    });

    entries.filter((e) => e.from === apt).forEach((e) => {
      const ac = resolveAircraft(e.acType);
      lines.push(`${prefDep}${e.reg} ${e.date} ${ac.seats}${ac.code} ${e.dep}${e.to} ${e.svc}`);
    });

    if (mode === "NEW") lines.push(`GI NEW SLOT REQ ${apt} PPR / SLOT ID NUMBER PLS`);
    if (mode === "CANCEL") lines.push(`GI SLOT CANX REQ ${apt} PPR / SLOT ID NUMBER PLS`);

    return { lines, editors: [] };
  }

  function buildChangeGCRBlockDetailed(apt, entries) {
    const lines = ["GCR", "/REG", apt];
    const editors = [];

    entries.filter((e) => e.to === apt).forEach((e, index) => {
      const ac = resolveAircraft(e.acType);
      lines.push(`C${e.reg} ${e.date} ${ac.seats}${ac.code} ${e.from}${e.arr} ${e.svc}`);
      lines.push(`R${e.reg} ${e.date} ${ac.seats}${ac.code} ${e.from}${e.arr} ${e.svc}`);
      editors.push({ index: lines.length - 1, type: "Arrival", number: index + 1 });
    });

    entries.filter((e) => e.from === apt).forEach((e, index) => {
      const ac = resolveAircraft(e.acType);
      lines.push(`C ${e.reg} ${e.date} ${ac.seats}${ac.code} ${e.dep}${e.to} ${e.svc}`);
      lines.push(`R ${e.reg} ${e.date} ${ac.seats}${ac.code} ${e.dep}${e.to} ${e.svc}`);
      editors.push({ index: lines.length - 1, type: "Departure", number: index + 1 });
    });

    lines.push(`GI SLOT CHG REQ ${apt}`);
    return { lines, editors };
  }

  function setLoading(show, percent = 0, text = "Loading...") {
    const box = $("generationLoading");
    const fill = $("loadingBarFill");
    const label = $("loadingText");
    if (!box || !fill || !label) return;

    box.style.display = show ? "block" : "none";
    fill.style.width = `${Math.max(0, Math.min(100, percent))}%`;
    label.textContent = text;
  }

  function setGenerateDisabled(disabled) {
    const btn = $("formatBtn");
    if (!btn) return;
    btn.disabled = disabled;
    btn.textContent = disabled ? "GENERATING..." : "GENERATE GCR MESSAGE";
  }

  function updateFirebaseIndicator(connected) {
    if (typeof window.__setFirebaseStatus === "function") {
      window.__setFirebaseStatus(connected);
      return;
    }
    const status = $("fbStatus");
    if (!status) return;
    status.classList.toggle("connected", !!connected);
    const text = status.querySelector(".text");
    if (text) text.textContent = connected ? "DB Connected" : "DB Not Connected";
  }

  function setupPresence() {
    if (!db) {
      updateFirebaseIndicator(false);
      const count = $("connectedUsersCount");
      if (count) count.textContent = "0";
      return;
    }

    let sessionId = sessionStorage.getItem("gcrPresenceId");
    if (!sessionId) {
      sessionId = db.ref(CONNECTED_USERS_PATH).push().key;
      sessionStorage.setItem("gcrPresenceId", sessionId);
    }

    presenceRef = db.ref(`${CONNECTED_USERS_PATH}/${sessionId}`);

    db.ref(".info/connected").on("value", (snap) => {
      const connected = snap.val() === true;
      updateFirebaseIndicator(connected);
      if (!connected) return;

      presenceRef.onDisconnect().remove().then(() => {
        return presenceRef.set({
          page: "GCR Format",
          username: getDisplayName(),
          connectedAt: firebase.database.ServerValue.TIMESTAMP,
          lastSeen: firebase.database.ServerValue.TIMESTAMP
        });
      }).catch((err) => console.warn("Presence setup failed:", err));
    });

    db.ref(CONNECTED_USERS_PATH).on("value", (snap) => {
      const el = $("connectedUsersCount");
      if (el) el.textContent = String(snap.numChildren());
    }, (err) => console.warn("Connected user count failed:", err));
  }

  async function backupHistoryRecord(key, record) {
    if (!db || !key) return;
    try {
      await db.ref(`${GCR_BACKUP_PATH}/${key}`).set(record);
    } catch (err) {
      console.warn("GCR backup write skipped/failed:", err);
    }
  }

  async function incrementStat(mode) {
    if (!db) return;
    try {
      await Promise.all([
        db.ref(`${GCR_STATS_PATH}/${mode}`).transaction((current) => (Number(current) || 0) + 1),
        db.ref(`${GCR_STATS_PATH}/TOTAL`).transaction((current) => (Number(current) || 0) + 1)
      ]);
    } catch (err) {
      console.warn("GCR stats update failed:", err);
    }
  }

  async function saveHistoryRecord({ mode, apt, rawInput, text, emails, airportInfo, entries }) {
    if (!db) return null;

    const ref = db.ref(GCR_HISTORY_PATH).push();
    const record = {
      mode,
      airport: apt,
      airportName: airportInfo?.airportName || apt,
      emails: emails || [DEFAULT_EMAIL],
      input: rawInput,
      output: text,
      username: getDisplayName(),
      registrations: Array.from(new Set(entries.map((e) => e.reg))),
      aircraftTypes: Array.from(new Set(entries.map((e) => e.acType))),
      createdAt: firebase.database.ServerValue.TIMESTAMP,
      updatedAt: firebase.database.ServerValue.TIMESTAMP
    };

    await ref.set(record);
    backupHistoryRecord(ref.key, record);
    incrementStat(mode);
    return ref.key;
  }

  async function updateHistoryOutput(historyKey, output) {
    if (!db || !historyKey) return;
    try {
      await db.ref(`${GCR_HISTORY_PATH}/${historyKey}`).update({
        output,
        updatedAt: firebase.database.ServerValue.TIMESTAMP
      });
    } catch (err) {
      console.warn("History update failed:", err);
    }
  }

  function formatTimestamp(value) {
    if (!value) return "Time unavailable";
    const d = new Date(Number(value));
    if (Number.isNaN(d.getTime())) return "Time unavailable";
    return d.toLocaleString([], {
      year: "numeric", month: "short", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit"
    });
  }

  function renderHistory() {
    const list = $("historyList");
    if (!list) return;

    const search = ($("historySearch")?.value || "").trim().toUpperCase();
    const modeFilter = $("historyModeFilter")?.value || "ALL";

    const filtered = historyRecords.filter((item) => {
      const modeOk = modeFilter === "ALL" || item.mode === modeFilter;
      const haystack = `${item.airport || ""} ${item.username || ""} ${item.output || ""}`.toUpperCase();
      return modeOk && (!search || haystack.includes(search));
    });

    list.innerHTML = "";

    const count = $("historyCount");
    if (count) count.textContent = String(filtered.length);

    if (!filtered.length) {
      const empty = document.createElement("div");
      empty.className = "history-empty";
      empty.textContent = historyRecords.length ? "No history matches the current filter." : "No GCR shared history yet.";
      list.appendChild(empty);
      return;
    }

    filtered.forEach((item) => {
      const card = document.createElement("div");
      card.className = "history-item";

      const top = document.createElement("div");
      top.className = "history-item-top";
      top.innerHTML = `
        <strong>${escapeHtml(item.airport || "----")}</strong>
        <span class="history-mode mode-${escapeHtml(item.mode || "UNKNOWN")}">${escapeHtml(displayModeLabel(item.mode || "UNKNOWN"))}</span>
      `;
      card.appendChild(top);

      const meta = document.createElement("div");
      meta.className = "history-meta";
      meta.textContent = `${formatTimestamp(item.createdAt)} • ${item.username || "Anonymous"}`;
      card.appendChild(meta);

      const pre = document.createElement("pre");
      pre.className = "history-output";
      pre.textContent = item.output || "";
      card.appendChild(pre);

      const actions = document.createElement("div");
      actions.className = "history-actions";

      const copy = document.createElement("button");
      copy.type = "button";
      copy.textContent = "COPY";
      copy.onclick = () => copyToClipboard(item.output || "");
      actions.appendChild(copy);

      const email = document.createElement("button");
      email.type = "button";
      email.textContent = "EMAIL";
      email.onclick = () => {
        window.location.href = buildMailto(
          Array.isArray(item.emails) && item.emails.length ? item.emails : [DEFAULT_EMAIL],
          subjectForMode(item.mode, item.airport),
          item.output || ""
        );
      };
      actions.appendChild(email);

      const del = document.createElement("button");
      del.type = "button";
      del.className = "danger-btn";
      del.textContent = "DELETE";
      del.onclick = async () => {
        const ok = window.confirm(`Delete visible GCR history for ${item.airport}? The backup copy will remain.`);
        if (!ok || !db) return;
        try {
          await db.ref(`${GCR_HISTORY_PATH}/${item.id}`).remove();
          showSuccess("GCR history entry deleted. Backup retained.");
        } catch (err) {
          console.error(err);
          showError("Unable to delete this history entry.");
        }
      };
      actions.appendChild(del);

      card.appendChild(actions);
      list.appendChild(card);
    });
  }

  function setupHistoryListener() {
    if (!db) {
      historyRecords = [];
      renderHistory();
      return;
    }

    db.ref(GCR_HISTORY_PATH).on("value", (snap) => {
      const records = [];
      snap.forEach((child) => records.push({ id: child.key, ...(child.val() || {}) }));
      historyRecords = records.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
      renderHistory();
    }, (err) => {
      console.warn("GCR history listener failed:", err);
      showError("Shared GCR history could not be loaded.");
    });
  }

  function setupStatsListener() {
    if (!db) return;
    db.ref(GCR_STATS_PATH).on("value", (snap) => {
      const stats = snap.val() || {};
      if ($("newCount")) $("newCount").textContent = Number(stats.NEW || 0).toLocaleString();
      if ($("changeCount")) $("changeCount").textContent = Number(stats.CHANGE || 0).toLocaleString();
      if ($("cancelCount")) $("cancelCount").textContent = Number(stats.CANCEL || 0).toLocaleString();
      if ($("totalCount")) $("totalCount").textContent = Number(stats.TOTAL || 0).toLocaleString();
    });
  }

  function appendMetaPill(container, label, value, className = "") {
    const labelSpan = document.createElement("span");
    labelSpan.className = "label";
    labelSpan.textContent = `${label}:`;
    container.appendChild(labelSpan);

    const pill = document.createElement("span");
    pill.className = `pill ${className}`.trim();
    pill.textContent = value;
    container.appendChild(pill);
  }

  function renderOutputBlock({ apt, mode, lines, editors, emails, airportInfo, historyKey }) {
    const out = $("outputList");
    if (!out) return;

    const block = document.createElement("div");
    block.className = "output-container";

    const hd = document.createElement("div");
    hd.className = "heading";
    hd.textContent = mode === "CHANGE" ? `Change GCR [${apt}]` : `GCR [${apt}]`;
    block.appendChild(hd);

    const meta = document.createElement("div");
    meta.className = "meta";
    appendMetaPill(meta, "Mode", displayModeLabel(mode));
    appendMetaPill(meta, "Airport", airportInfo.found ? airportInfo.airportName : "NOT IN DATABASE", airportInfo.found ? "" : "pill-warning");
    appendMetaPill(meta, "GCR", airportInfo.gcr, airportInfo.gcr === "YES" ? "pill-good" : "pill-warning");
    appendMetaPill(meta, "PPR", airportInfo.ppr, airportInfo.ppr === "YES" ? "pill-good" : "");

    const emailLabel = document.createElement("span");
    emailLabel.className = "label";
    emailLabel.textContent = "Emails:";
    meta.appendChild(emailLabel);
    emails.forEach((address) => {
      const pill = document.createElement("span");
      pill.className = "pill";
      pill.textContent = address;
      meta.appendChild(pill);
    });

    if (mode === "CHANGE") appendMetaPill(meta, "R-lines", `${editors.length} editable`);
    block.appendChild(meta);

    const pre = document.createElement("pre");
    pre.textContent = lines.join("\n");
    block.appendChild(pre);

    const getCurrentText = () => lines.join("\n");
    const persistCurrentText = () => updateHistoryOutput(historyKey, getCurrentText());

    const actions = document.createElement("div");
    actions.className = "action-buttons";

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.textContent = mode === "CHANGE" ? "UPDATE & COPY" : "COPY";
    copyBtn.onclick = async () => {
      await persistCurrentText();
      await copyToClipboard(getCurrentText());
    };
    actions.appendChild(copyBtn);

    const emailBtn = document.createElement("button");
    emailBtn.type = "button";
    emailBtn.textContent = mode === "CHANGE" ? "UPDATE & EMAIL" : "EMAIL";
    emailBtn.onclick = async () => {
      await persistCurrentText();
      window.location.href = buildMailto(emails, subjectForMode(mode, apt), getCurrentText());
    };
    actions.appendChild(emailBtn);

    block.appendChild(actions);

    if (mode === "CHANGE") {
      editors.forEach((editor) => {
        const edit = document.createElement("div");
        edit.className = "r-edit";

        const label = document.createElement("label");
        label.textContent = `Edit ${editor.type} R-line ${editor.number}:`;
        edit.appendChild(label);

        const ta = document.createElement("textarea");
        ta.value = lines[editor.index] || "";
        edit.appendChild(ta);

        const apply = document.createElement("button");
        apply.type = "button";
        apply.textContent = `APPLY ${editor.type.toUpperCase()} R-LINE`;
        apply.onclick = async () => {
          const value = ta.value.trim();
          if (!value) {
            showError("R-line cannot be empty.");
            return;
          }
          lines[editor.index] = value;
          pre.textContent = getCurrentText();
          await persistCurrentText();
          showSuccess(`${editor.type} R-line updated.`);
        };
        edit.appendChild(apply);
        block.appendChild(edit);
      });
    }

    out.appendChild(block);
  }

  async function generateGcr() {
    const rawInput = $("userInput")?.value || "";
    const parsed = parseInputDetailed(rawInput);

    if (!parsed.entries.length) {
      showError(parsed.errors[0] || "No valid flights.");
      return;
    }
    if (parsed.errors.length) {
      showError(parsed.errors.slice(0, 3).join(" | "));
      return;
    }

    const mode = $("slotType")?.value || "NEW";
    const entries = parsed.entries;
    const airports = Array.from(new Set(entries.flatMap((e) => [e.from, e.to])));
    const out = $("outputList");
    if (out) out.innerHTML = "";

    setGenerateDisabled(true);
    setLoading(true, 5, "Preparing GCR data...");

    try {
      await loadAircraftTypes();
      setLoading(true, 15, "Loading airport database records...");

      const airportMap = {};
      let completedLookups = 0;
      await Promise.all(airports.map(async (apt) => {
        airportMap[apt] = await getAirportInfoByIcao(apt);
        completedLookups += 1;
        const pct = 15 + Math.round((completedLookups / airports.length) * 45);
        setLoading(true, pct, `Airport database ${completedLookups}/${airports.length}`);
      }));

      let generated = 0;
      let fallbackCount = 0;

      for (const apt of airports) {
        const airportInfo = airportMap[apt];
        const emails = airportInfo?.emails?.length ? airportInfo.emails : [DEFAULT_EMAIL];
        if (!airportInfo.found) fallbackCount += 1;

        const result = mode === "CHANGE"
          ? buildChangeGCRBlockDetailed(apt, entries)
          : buildStaticBlock(apt, entries, mode);

        const text = result.lines.join("\n");
        const relevantEntries = entries.filter((e) => e.from === apt || e.to === apt);

        let historyKey = null;
        try {
          historyKey = await saveHistoryRecord({
            mode,
            apt,
            rawInput,
            text,
            emails,
            airportInfo,
            entries: relevantEntries
          });
        } catch (err) {
          console.warn("GCR history save failed:", err);
        }

        renderOutputBlock({
          apt,
          mode,
          lines: result.lines,
          editors: result.editors,
          emails,
          airportInfo,
          historyKey
        });

        generated += 1;
        const pct = 60 + Math.round((generated / airports.length) * 40);
        setLoading(true, pct, `Generating GCR ${generated}/${airports.length}`);
      }

      const dbSuffix = db ? "" : " Database offline: default email used where needed.";
      const fallbackSuffix = fallbackCount ? ` ${fallbackCount} airport(s) were not found in the airport database.` : "";
      showSuccess(`Generated ${generated} GCR block(s) in ${displayModeLabel(mode)} mode.${fallbackSuffix}${dbSuffix}`);
    } catch (err) {
      console.error(err);
      showError("Unable to generate the GCR message. Check the input and Firebase connection.");
    } finally {
      setLoading(true, 100, "Complete");
      setTimeout(() => setLoading(false), 500);
      setGenerateDisabled(false);
    }
  }

  function clearPage() {
    if ($("userInput")) $("userInput").value = "";
    if ($("outputList")) $("outputList").innerHTML = "";
    if ($("errorMessage")) {
      $("errorMessage").textContent = "";
      $("errorMessage").style.display = "none";
    }
    if ($("successMessage")) {
      $("successMessage").textContent = "";
      $("successMessage").style.display = "none";
    }
    setLoading(false);
    updateLineCounter();
  }

  function bindEvents() {
    $("formatBtn")?.addEventListener("click", generateGcr);
    $("clearBtn")?.addEventListener("click", clearPage);
    $("userInput")?.addEventListener("input", updateLineCounter);
    $("historySearch")?.addEventListener("input", renderHistory);
    $("historyModeFilter")?.addEventListener("change", renderHistory);
  }

  function start() {
    const historyModeFilter = $("historyModeFilter");
    if (historyModeFilter) historyModeFilter.value = "ALL";

    const historySearch = $("historySearch");
    if (historySearch) historySearch.value = "";

    bindEvents();
    updateLineCounter();
    setupPresence();
    setupHistoryListener();
    setupStatsListener();
    loadAircraftTypes();
  }

  start();
})();
