"use strict";

const LS_KEY = "rb_username";

function titleCaseName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((part) => {
      if (!part) {
        return "";
      }

      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(" ");
}

function getGreetingForHour(hour) {
  if (hour < 12) {
    return "Good Morning";
  }

  if (hour < 16) {
    return "Good Afternoon";
  }

  return "Good Evening";
}

function setGreeting(name) {
  const greetingElement = document.getElementById("greeting");

  if (!greetingElement) {
    return;
  }

  const currentHour = new Date().getHours();
  const greeting = getGreetingForHour(currentHour);

  greetingElement.textContent = name
    ? `${greeting}, ${name}`
    : greeting;
}

function showOverlay(show) {
  const overlay = document.getElementById("nameOverlay");
  const input = document.getElementById("nameInput");

  if (!overlay) {
    return;
  }

  if (show) {
    overlay.classList.remove("hidden");

    window.setTimeout(() => {
      if (input) {
        input.focus();
        input.select();
      }
    }, 0);
  } else {
    overlay.classList.add("hidden");
  }
}

function getStoredName() {
  try {
    return localStorage.getItem(LS_KEY) || "";
  } catch (error) {
    console.warn("Local storage could not be read:", error);
    return "";
  }
}

function saveNameLocally(name) {
  try {
    localStorage.setItem(LS_KEY, name);
    return true;
  } catch (error) {
    console.warn("Local storage save failed:", error);
    return false;
  }
}

function getUserPersonalizationRef() {
  if (
    typeof firebase === "undefined" ||
    !firebase.apps ||
    !firebase.apps.length
  ) {
    throw new Error(
      "Firebase is not initialized. Check scripts/firebase.js."
    );
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

  return {
    now,
    date,
    time
  };
}

async function saveNameToFirebase(name) {
  const personalizationRef = getUserPersonalizationRef();
  const { now, date, time } = getReadableDateTime();

  const payload = {
    name,
    savedAt: firebase.database.ServerValue.TIMESTAMP,
    localSavedAtIso: now.toISOString(),
    date,
    time
  };

  const newPersonalizationRef = personalizationRef.push();

  await newPersonalizationRef.set(payload);

  console.log("Name saved to Firebase:", payload);
}

async function saveNameFromInput() {
  const input = document.getElementById("nameInput");
  const errorElement = document.getElementById("nameError");
  const saveButton = document.getElementById("saveNameBtn");

  if (!input || !errorElement) {
    return;
  }

  const cleanName = titleCaseName(input.value);

  if (!cleanName || cleanName.length < 2) {
    errorElement.textContent = "Please enter a valid name.";
    input.focus();
    return;
  }

  errorElement.textContent = "";

  if (saveButton) {
    saveButton.disabled = true;
    saveButton.textContent = "Saving...";
  }

  saveNameLocally(cleanName);

  /*
   * Update the greeting immediately so the page still works if
   * Firebase is temporarily unavailable.
   */
  setGreeting(cleanName);

  try {
    await saveNameToFirebase(cleanName);
    showOverlay(false);
  } catch (error) {
    console.error("Firebase write error:", error);

    errorElement.textContent =
      "Your name was saved on this device, but Firebase could not be updated.";

    /*
     * Keep the dialog visible so the user can see the Firebase warning.
     * The locally stored name will still be available after reloading.
     */
  } finally {
    if (saveButton) {
      saveButton.disabled = false;
      saveButton.textContent = "OK";
    }
  }
}

function openChangeNameDialog() {
  const input = document.getElementById("nameInput");
  const errorElement = document.getElementById("nameError");

  if (input) {
    input.value = getStoredName();
  }

  if (errorElement) {
    errorElement.textContent = "";
  }

  showOverlay(true);
}

function closeNameDialog() {
  const currentName = getStoredName();

  /*
   * Do not allow the initial dialog to close when no name has
   * previously been stored.
   */
  if (!currentName) {
    const errorElement = document.getElementById("nameError");

    if (errorElement) {
      errorElement.textContent = "Please enter your name to continue.";
    }

    return;
  }

  showOverlay(false);
}

function bindEvents() {
  const saveButton = document.getElementById("saveNameBtn");
  const cancelButton = document.getElementById("cancelNameBtn");
  const closeButton = document.getElementById("closeDialog");
  const changeNameButton = document.getElementById("changeName");
  const input = document.getElementById("nameInput");
  const overlay = document.getElementById("nameOverlay");

  if (saveButton) {
    saveButton.addEventListener("click", saveNameFromInput);
  }

  if (cancelButton) {
    cancelButton.addEventListener("click", closeNameDialog);
  }

  if (closeButton) {
    closeButton.addEventListener("click", closeNameDialog);
  }

  if (changeNameButton) {
    changeNameButton.addEventListener("click", openChangeNameDialog);
  }

  if (input) {
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        saveNameFromInput();
      }

      if (event.key === "Escape") {
        event.preventDefault();
        closeNameDialog();
      }
    });

    input.addEventListener("input", () => {
      const errorElement = document.getElementById("nameError");

      if (errorElement) {
        errorElement.textContent = "";
      }
    });
  }

  if (overlay) {
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        closeNameDialog();
      }
    });
  }
}

function initialiseWelcomePage() {
  const storedName = getStoredName();
  const input = document.getElementById("nameInput");

  setGreeting(storedName);
  bindEvents();

  if (input) {
    input.value = storedName;
  }

  showOverlay(!storedName);

  /*
   * Refresh the greeting periodically in case the page remains open
   * when the greeting changes from morning to afternoon or evening.
   */
  window.setInterval(() => {
    setGreeting(getStoredName());
  }, 60 * 1000);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialiseWelcomePage);
} else {
  initialiseWelcomePage();
}
