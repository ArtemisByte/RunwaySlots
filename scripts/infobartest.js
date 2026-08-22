// =========================================================
// RUNWAY SLOTS - GLOBAL INFOBAR
// =========================================================
//
// Features:
// - UTC clock
// - Firebase connection status
// - Connected users
// - One browser = one user, even with multiple tabs
// - Automatic presence cleanup
// - Website deployment/update detection
// - Update popup
// - 15 minute auto-refresh
//
// Firebase v8 compatible
// =========================================================

(function () {
  "use strict";

  /* Prevent accidental double loading */

  if (window.__RUNWAY_INFOBAR_LOADED__) {
    return;
  }

  window.__RUNWAY_INFOBAR_LOADED__ = true;


  /* =========================================================
     CONFIG
     ========================================================= */

  const REFRESH_MS =
    15 * 60 * 1000;

  const FIREBASE_RETRY_MS =
    250;

  const FIREBASE_MAX_RETRIES =
    40;

  const CONNECTED_USERS_PATH =
    "connectedUsers";

  const DEPLOYMENT_PATH =
    "siteStatus/deployment";

  const BROWSER_ID_KEY =
    "runway_browser_id";

  const TAB_ID_KEY =
    "runway_tab_id";

  const DISMISSED_UPDATE_KEY =
    "runway_dismissed_update";


  let database = null;

  let firebaseRetryCount = 0;

  let pageDeploymentVersion = null;

  let latestDeployment = null;

  let presenceRegistered = false;


  /* =========================================================
     DOM READY
     ========================================================= */

  function ready(callback) {

    if (
      document.readyState ===
      "loading"
    ) {

      document.addEventListener(
        "DOMContentLoaded",
        callback
      );

    } else {

      callback();

    }

  }


  /* =========================================================
     UTC CLOCK
     ========================================================= */

  const MONTHS = [
    "JAN",
    "FEB",
    "MAR",
    "APR",
    "MAY",
    "JUN",
    "JUL",
    "AUG",
    "SEP",
    "OCT",
    "NOV",
    "DEC"
  ];


  function updateUtcClock() {

    const element =
      document.getElementById(
        "utcTopClock"
      );


    if (!element) {
      return;
    }


    const now =
      new Date();


    const hours =
      String(
        now.getUTCHours()
      ).padStart(
        2,
        "0"
      );


    const minutes =
      String(
        now.getUTCMinutes()
      ).padStart(
        2,
        "0"
      );


    const seconds =
      String(
        now.getUTCSeconds()
      ).padStart(
        2,
        "0"
      );


    const day =
      String(
        now.getUTCDate()
      ).padStart(
        2,
        "0"
      );


    const month =
      MONTHS[
        now.getUTCMonth()
      ];


    const year =
      now.getUTCFullYear();


    element.textContent =
      `UTC: ${hours}:${minutes}:${seconds} • ${day}${month}${year}`;

  }


  /* =========================================================
     DATABASE STATUS
     ========================================================= */

  function setDatabaseStatus(
    connected
  ) {

    const status =
      document.getElementById(
        "fbStatus"
      );


    if (!status) {
      return;
    }


    const dot =
      status.querySelector(
        ".dot"
      );


    const text =
      status.querySelector(
        ".text"
      );


    if (dot) {

      dot.style.background =
        connected
          ? "#2e7d32"
          : "#c62828";

    }


    if (text) {

      text.textContent =
        connected
          ? "Database Online"
          : "Database Offline";

    }

  }


  /* =========================================================
     CONNECTED USERS DISPLAY
     ========================================================= */

  function setConnectedUsersDisplay(
    count,
    state
  ) {

    const container =
      document.getElementById(
        "connectedUsersStatus"
      );


    const number =
      document.getElementById(
        "connectedUsersCount"
      );


    if (
      !container ||
      !number
    ) {
      return;
    }


    container.classList.remove(
      "online",
      "offline",
      "connecting"
    );


    container.classList.add(
      state
    );


    if (
      state === "offline" ||
      state === "connecting"
    ) {

      number.textContent =
        "--";

      return;

    }


    number.textContent =
      String(
        count
      );

  }


  /* =========================================================
     ID GENERATOR
     ========================================================= */

  function generateId() {

    if (
      window.crypto &&
      typeof window.crypto.randomUUID ===
        "function"
    ) {

      return window.crypto.randomUUID();

    }


    return (
      Date.now()
        .toString(36) +
      "-" +
      Math.random()
        .toString(36)
        .substring(2, 15)
    );

  }


  function safeFirebaseKey(
    value
  ) {

    return String(
      value
    ).replace(
      /[.#$\[\]\/]/g,
      "_"
    );

  }


  /* =========================================================
     BROWSER ID
     =========================================================
     
     localStorage is shared between tabs.
     
     Therefore:
     
     Chrome tab 1
     Chrome tab 2
     Chrome tab 3
     
     = ONE browser/user
     
     ========================================================= */

  function getBrowserId() {

    let id = null;


    try {

      id =
        localStorage.getItem(
          BROWSER_ID_KEY
        );

    } catch (_) {}


    if (!id) {

      id =
        generateId();


      try {

        localStorage.setItem(
          BROWSER_ID_KEY,
          id
        );

      } catch (_) {}

    }


    return safeFirebaseKey(
      id
    );

  }


  /* =========================================================
     TAB ID
     ========================================================= */

  function getTabId() {

    let id = null;


    try {

      id =
        sessionStorage.getItem(
          TAB_ID_KEY
        );

    } catch (_) {}


    if (!id) {

      id =
        generateId();


      try {

        sessionStorage.setItem(
          TAB_ID_KEY,
          id
        );

      } catch (_) {}

    }


    return safeFirebaseKey(
      id
    );

  }


  /* =========================================================
     AUTO REFRESH
     ========================================================= */

  function setAutoRefresh(
    enabled
  ) {

    const checkbox =
      document.getElementById(
        "autoRefreshToggle"
      );


    if (checkbox) {

      checkbox.checked =
        !!enabled;

    }


    if (
      window.__RUNWAY_AUTO_REFRESH_TIMER__
    ) {

      clearInterval(
        window.__RUNWAY_AUTO_REFRESH_TIMER__
      );


      window.__RUNWAY_AUTO_REFRESH_TIMER__ =
        null;

    }


    if (enabled) {

      window.__RUNWAY_AUTO_REFRESH_TIMER__ =
        setInterval(
          function () {

            window.location.reload();

          },
          REFRESH_MS
        );

    }


    try {

      localStorage.setItem(
        "autoRefreshEnabled",
        JSON.stringify(
          !!enabled
        )
      );

    } catch (_) {}

  }


  function initialiseAutoRefresh() {

    let storedValue = null;


    try {

      const stored =
        localStorage.getItem(
          "autoRefreshEnabled"
        );


      if (stored !== null) {

        storedValue =
          JSON.parse(
            stored
          );

      }

    } catch (_) {}


    /*
     * Default = ON
     */

    const enabled =
      storedValue === null
        ? true
        : !!storedValue;


    setAutoRefresh(
      enabled
    );


    const checkbox =
      document.getElementById(
        "autoRefreshToggle"
      );


    if (!checkbox) {
      return;
    }


    checkbox.addEventListener(
      "change",
      function () {

        setAutoRefresh(
          checkbox.checked
        );

      }
    );

  }


  /* =========================================================
     UPDATE POPUP
     ========================================================= */

  function createUpdatePopup() {

    if (
      document.getElementById(
        "runwayUpdateNotification"
      )
    ) {
      return;
    }


    const popup =
      document.createElement(
        "div"
      );


    popup.id =
      "runwayUpdateNotification";


    popup.className =
      "runway-update-notification";


    popup.setAttribute(
      "role",
      "dialog"
    );


    popup.setAttribute(
      "aria-modal",
      "true"
    );


    popup.innerHTML = `

      <div class="runway-update-titlebar">

        <span>
          Runway Slots
        </span>

        <button
          type="button"
          id="closeRunwayUpdate"
          aria-label="Close"
        >
          ×
        </button>

      </div>


      <div class="runway-update-body">

        <div class="runway-update-icon">
          ↻
        </div>


        <div class="runway-update-message">

          <strong>
            NEW UPDATE AVAILABLE
          </strong>

          <span id="runwayUpdateMessage">
            A new version of Runway Slots has been deployed.
          </span>

          <small id="runwayUpdateVersion"></small>

        </div>

      </div>


      <div class="runway-update-buttons">

        <button
          id="refreshRunwayUpdate"
          type="button"
        >
          Refresh Now
        </button>

        <button
          id="laterRunwayUpdate"
          type="button"
        >
          Later
        </button>

      </div>
    `;


    document.body.appendChild(
      popup
    );


    document
      .getElementById(
        "refreshRunwayUpdate"
      )
      .addEventListener(
        "click",
        refreshForUpdate
      );


    document
      .getElementById(
        "laterRunwayUpdate"
      )
      .addEventListener(
        "click",
        dismissUpdate
      );


    document
      .getElementById(
        "closeRunwayUpdate"
      )
      .addEventListener(
        "click",
        dismissUpdate
      );

  }


  /* =========================================================
     UPDATE STATUS
     ========================================================= */

  function setUpdateStatus(
    updateAvailable
  ) {

    const status =
      document.getElementById(
        "websiteUpdateStatus"
      );


    if (!status) {
      return;
    }


    if (updateAvailable) {

      status.classList.add(
        "update-available"
      );


      status.textContent =
        "⚠ NEW UPDATE — REFRESH";


      status.title =
        "A newer version of Runway Slots is available. Click to view.";

    } else {

      status.classList.remove(
        "update-available"
      );


      status.textContent =
        "✓ WEBSITE UP TO DATE";


      status.title =
        "You are using the latest Runway Slots version.";

    }

  }


  /* =========================================================
     SHOW UPDATE
     ========================================================= */

  function showUpdate(
    deployment,
    force
  ) {

    if (
      !deployment ||
      !deployment.version
    ) {
      return;
    }


    let dismissedVersion =
      null;


    try {

      dismissedVersion =
        sessionStorage.getItem(
          DISMISSED_UPDATE_KEY
        );

    } catch (_) {}


    if (
      !force &&
      dismissedVersion ===
        deployment.version
    ) {

      return;

    }


    const popup =
      document.getElementById(
        "runwayUpdateNotification"
      );


    if (!popup) {
      return;
    }


    const message =
      document.getElementById(
        "runwayUpdateMessage"
      );


    const version =
      document.getElementById(
        "runwayUpdateVersion"
      );


    if (message) {

      message.textContent =
        deployment.message ||
        "A new version of Runway Slots has been deployed. Refresh the page to use the latest version.";

    }


    if (version) {

      const shortVersion =
        deployment.shortVersion ||
        String(
          deployment.version
        ).substring(
          0,
          7
        );


      version.textContent =
        `Version: ${shortVersion}`;

    }


    popup.classList.add(
      "show"
    );

  }


  /* =========================================================
     DISMISS UPDATE
     ========================================================= */

  function dismissUpdate() {

    const popup =
      document.getElementById(
        "runwayUpdateNotification"
      );


    if (popup) {

      popup.classList.remove(
        "show"
      );

    }


    if (
      latestDeployment &&
      latestDeployment.version
    ) {

      try {

        sessionStorage.setItem(
          DISMISSED_UPDATE_KEY,
          latestDeployment.version
        );

      } catch (_) {}

    }

  }


  /* =========================================================
     REFRESH UPDATE
     ========================================================= */

  function refreshForUpdate() {

    const url =
      new URL(
        window.location.href
      );


    url.searchParams.set(
      "_runway_update",
      Date.now()
    );


    window.location.replace(
      url.toString()
    );

  }


  /* =========================================================
     WEBSITE UPDATE BUTTON
     ========================================================= */

  function initialiseUpdateButton() {

    const status =
      document.getElementById(
        "websiteUpdateStatus"
      );


    if (!status) {
      return;
    }


    status.addEventListener(
      "click",
      function () {

        if (
          latestDeployment &&
          pageDeploymentVersion &&
          latestDeployment.version !==
            pageDeploymentVersion
        ) {

          showUpdate(
            latestDeployment,
            true
          );

        }

      }
    );

  }


  /* =========================================================
     CONNECTED USERS
     ========================================================= */

  function initialisePresence() {

    const browserId =
      getBrowserId();


    const tabId =
      getTabId();


    const connectionRef =
      database.ref(
        `${CONNECTED_USERS_PATH}/${browserId}/${tabId}`
      );


    const presenceRoot =
      database.ref(
        CONNECTED_USERS_PATH
      );


    /*
     * Count unique browser IDs.
     */

    presenceRoot.on(

      "value",

      function (
        snapshot
      ) {

        const count =
          snapshot.numChildren();


        setConnectedUsersDisplay(
          count,
          "online"
        );

      },

      function (
        error
      ) {

        console.error(
          "Connected users read error:",
          error
        );


        setConnectedUsersDisplay(
          0,
          "offline"
        );

      }

    );


    /*
     * Firebase connection monitor.
     */

    database
      .ref(
        ".info/connected"
      )
      .on(

        "value",

        function (
          snapshot
        ) {

          const connected =
            snapshot.val() ===
            true;


          setDatabaseStatus(
            connected
          );


          if (!connected) {

            presenceRegistered =
              false;


            setConnectedUsersDisplay(
              0,
              "offline"
            );


            return;

          }


          setConnectedUsersDisplay(
            0,
            "connecting"
          );


          /*
           * Prevent duplicate registration
           * during the same connection.
           */

          if (
            presenceRegistered
          ) {

            return;

          }


          presenceRegistered =
            true;


          /*
           * Register disconnect cleanup FIRST.
           */

          connectionRef
            .onDisconnect()
            .remove()

            .then(
              function () {

                return connectionRef.set({

                  connectedAt:
                    firebase
                      .database
                      .ServerValue
                      .TIMESTAMP

                });

              }
            )

            .catch(
              function (
                error
              ) {

                presenceRegistered =
                  false;


                console.error(
                  "Presence registration error:",
                  error
                );

              }
            );

        },

        function (
          error
        ) {

          console.error(
            "Firebase connection monitor error:",
            error
          );


          setDatabaseStatus(
            false
          );

        }

      );

  }


  /* =========================================================
     DEPLOYMENT MONITOR
     ========================================================= */

  function initialiseDeploymentMonitor() {

    const ref =
      database.ref(
        DEPLOYMENT_PATH
      );


    ref.on(

      "value",

      function (
        snapshot
      ) {

        const deployment =
          snapshot.val();


        /*
         * siteStatus may not exist yet.
         */

        if (
          !deployment ||
          !deployment.version
        ) {

          console.log(
            "Runway Slots: no deployment version is currently stored in Firebase."
          );


          setUpdateStatus(
            false
          );


          return;

        }


        latestDeployment =
          deployment;


        /*
         * First Firebase read establishes
         * this page's deployment version.
         */

        if (
          pageDeploymentVersion ===
          null
        ) {

          pageDeploymentVersion =
            deployment.version;


          setUpdateStatus(
            false
          );


          console.log(
            "Runway Slots deployment version:",
            deployment.version
          );


          return;

        }


        /*
         * Firebase changed while page remained open.
         */

        if (
          deployment.version !==
          pageDeploymentVersion
        ) {

          console.log(
            "New Runway Slots deployment detected:",
            pageDeploymentVersion,
            "→",
            deployment.version
          );


          setUpdateStatus(
            true
          );


          showUpdate(
            deployment,
            false
          );

        }

      },

      function (
        error
      ) {

        console.error(
          "Deployment monitor error:",
          error
        );

      }

    );


    /*
     * Check again whenever an old tab
     * becomes visible.
     */

    document.addEventListener(
      "visibilitychange",

      function () {

        if (
          document.hidden ||
          !pageDeploymentVersion
        ) {

          return;

        }


        ref.once(
          "value"
        )

          .then(
            function (
              snapshot
            ) {

              const deployment =
                snapshot.val();


              if (
                !deployment ||
                !deployment.version
              ) {

                return;

              }


              latestDeployment =
                deployment;


              if (
                deployment.version !==
                pageDeploymentVersion
              ) {

                setUpdateStatus(
                  true
                );


                showUpdate(
                  deployment,
                  false
                );

              }

            }
          )

          .catch(
            function (
              error
            ) {

              console.error(
                "Deployment recheck error:",
                error
              );

            }
          );

      }
    );

  }


  /* =========================================================
     FIREBASE INITIALISATION
     ========================================================= */

  function firebaseIsAvailable() {

    try {

      return !!(
        window.firebase &&
        firebase.apps &&
        firebase.apps.length > 0 &&
        typeof firebase.database ===
          "function"
      );

    } catch (_) {

      return false;

    }

  }


  function initialiseFirebase() {

    if (
      firebaseIsAvailable()
    ) {

      try {

        database =
          firebase.database();


        console.log(
          "Runway Slots infobar connected to Firebase."
        );


        initialisePresence();

        initialiseDeploymentMonitor();


        return;

      } catch (
        error
      ) {

        console.error(
          "Firebase database initialisation error:",
          error
        );

      }

    }


    /*
     * testfirebase.js may initialise Firebase
     * slightly after this script starts.
     *
     * Retry for approximately 10 seconds.
     */

    firebaseRetryCount++;


    if (
      firebaseRetryCount <=
      FIREBASE_MAX_RETRIES
    ) {

      setTimeout(
        initialiseFirebase,
        FIREBASE_RETRY_MS
      );


      return;

    }


    console.error(
      "Runway Slots infobar: Firebase was not initialised after 10 seconds."
    );


    setDatabaseStatus(
      false
    );


    setConnectedUsersDisplay(
      0,
      "offline"
    );

  }


  /* =========================================================
     BOOT
     ========================================================= */

  ready(
    function () {

      console.log(
        "Runway Slots infobar starting..."
      );


      /*
       * CLOCK
       */

      updateUtcClock();


      setInterval(
        updateUtcClock,
        1000
      );


      /*
       * Initial states
       */

      setDatabaseStatus(
        false
      );


      setConnectedUsersDisplay(
        0,
        "connecting"
      );


      /*
       * Update notification
       */

      createUpdatePopup();

      initialiseUpdateButton();


      /*
       * Auto refresh
       */

      initialiseAutoRefresh();


      /*
       * Firebase
       */

      initialiseFirebase();

    }
  );

})();