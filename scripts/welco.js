const LS_KEY = "rb_username";

function titleCaseName(str) {
  return (str || "")
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map(s => s ? (s[0].toUpperCase() + s.slice(1).toLowerCase()) : "")
    .join(" ");
}

function getGreetingForHour(h) {
  if (h < 12) return "Good Morning";
  if (h < 16) return "Good Afternoon";
  return "Good Evening";
}

function setGreeting(name) {
  const hour = new Date().getHours();
  const greet = getGreetingForHour(hour);
  document.getElementById("greeting").textContent = name ? `${greet}, ${name}` : greet;
}

function showOverlay(show) {
  const overlay = document.getElementById("nameOverlay");
  if (show) {
    overlay.classList.remove("hidden");
    setTimeout(() => document.getElementById("nameInput").focus(), 0);
  } else {
    overlay.classList.add("hidden");
  }
}

function getUserPersonalizationRef() {
  if (typeof firebase === "undefined" || !firebase.apps || !firebase.apps.length) {
    throw new Error("Firebase is not initialized.");
  }
  return firebase.database().ref("userPersonalization");
}

function getReadableDateTime() {
  const now = new Date();

  const date = now.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });

  const time = now.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });

  return { now, date, time };
}

function saveNameToFirebase(name) {
  try {
    const ref = getUserPersonalizationRef();
    const { now, date, time } = getReadableDateTime();

    ref.push({
      name: name,
      savedAt: firebase.database.ServerValue.TIMESTAMP,
      localSavedAtIso: now.toISOString(),
      date: date,
      time: time
    }).catch((error) => {
      console.error("Failed to save name to Firebase:", error);
    });
  } catch (error) {
    console.error("Firebase write error:", error);
  }
}

function saveNameFromInput() {
  const input = document.getElementById("nameInput");
  const err = document.getElementById("nameError");
  const clean = titleCaseName(input.value);

  if (!clean || clean.length < 2) {
    err.textContent = "Please enter a valid name.";
    return;
  }

  try {
    localStorage.setItem(LS_KEY, clean);
  } catch (e) {}

  saveNameToFirebase(clean);

  err.textContent = "";
  setGreeting(clean);
  showOverlay(false);
}

document.getElementById("saveNameBtn").addEventListener("click", saveNameFromInput);
document.getElementById("cancelNameBtn").addEventListener("click", () => showOverlay(false));
document.getElementById("closeDialog").addEventListener("click", () => showOverlay(false));

document.getElementById("nameInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") saveNameFromInput();
  if (e.key === "Escape") showOverlay(false);
});

document.getElementById("changeName").addEventListener("click", () => {
  showOverlay(true);
  document.getElementById("nameInput").value = localStorage.getItem(LS_KEY) || "";
  document.getElementById("nameError").textContent = "";
});

(function init() {
  let name = "";
  try {
    name = localStorage.getItem(LS_KEY) || "";
  } catch (e) {}

  setGreeting(name);

  if (!name) {
    showOverlay(true);
  } else {
    showOverlay(false);
  }
})();
