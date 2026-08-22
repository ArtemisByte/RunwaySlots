// infobar.js
// GLOBAL RUNWAY SLOTS INFOBAR
//
// Features:
// - UTC Clock
// - Firebase Database Status
// - Connected Users
// - Website Update Detection
// - New Update Popup
// - 15 Minute Auto Refresh
//
// No FIREBASE_READY dependency required.

(function () {
  "use strict";

  /* =========================================================
     CONFIGURATION
     ========================================================= */

  const ID_CLOCK = "utcTopClock";
  const ID_STATUS = "fbStatus";
  const ID_TOGGLE = "autoRefreshToggle";

  const ID_CONNECTED_USERS = "connectedUsersStatus";
  const ID_UPDATE_STATUS = "websiteUpdateStatus";

  const REFRESH_MS = 15 * 60 * 1000;

  const CONNECTED_USERS_PATH = "connectedUsers";
  const DEPLOYMENT_PATH = "siteStatus/deployment";

  const BROWSER_ID_KEY = "runway_browser_id";
  const TAB_ID_KEY = "runway_tab_id";
  const DISMISSED_UPDATE_KEY = "runway_dismissed_update";

  let db = null;

  /*
   * This is the Firebase deployment version that was active
   * when THIS page loaded.
   *
   * If Firebase later reports a different version,
   * we know a new deployment has happened.
   */
  let pageDeploymentVersion = null;

  let latestDeployment = null;


  /* =========================================================
     DOM READY
     ========================================================= */

  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn);
    } else {
      fn();
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


  function updateUtcTopClock() {
    const el = document.getElementById(ID_CLOCK);

    if (!el) return;

    const now = new Date();

    const hh = String(
      now.getUTCHours()
    ).padStart(2, "0");

    const mm = String(
      now.getUTCMinutes()
    ).padStart(2, "0");

    const ss = String(
      now.getUTCSeconds()
    ).padStart(2, "0");

    const dd = String(
      now.getUTCDate()
    ).padStart(2, "0");

    const mon =
      MONTHS[now.getUTCMonth()];

    const yyyy =
      now.getUTCFullYear();

    el.textContent =
      `UTC: ${hh}:${mm}:${ss} • ${dd}${mon}${yyyy}`;
  }


  /* =========================================================
     FIREBASE READY CHECK
     ========================================================= */

  function firebaseReady() {
    try {
      const fbReady =
        (
          typeof window.ensureFirebaseReady === "function" &&
          window.ensureFirebaseReady()
        ) ||
        !!(
          window.firebase &&
          firebase.apps &&
          firebase.apps.length
        );

      return !!(
        fbReady &&
        firebase.database
      );

    } catch (error) {
      console.error(
        "Firebase readiness check failed:",
        error
      );

      return false;
    }
  }


  /* =========================================================
     DATABASE STATUS
     ========================================================= */

  function setDbStatus(connected) {
    const el =
      document.getElementById(ID_STATUS);

    if (!el) return;

    const dot =
      el.querySelector(".dot");

    const txt =
      el.querySelector(".text");


    if (dot) {
      dot.style.background =
        connected
          ? "#2e7d32"
          : "#c62828";
    }


    if (txt) {
      txt.textContent =
        connected
          ? "Database Online"
          : "Database Offline";
    }
  }


  /* =========================================================
     GENERATE UNIQUE ID
     ========================================================= */

  function generateId() {
    if (
      window.crypto &&
      typeof window.crypto.randomUUID === "function"
    ) {
      return window.crypto.randomUUID();
    }

    return (
      Date.now().toString(36) +
      "-" +
      Math.random()
        .toString(36)
        .substring(2, 15)
    );
  }


  function sanitizeFirebaseKey(value) {
    return String(value).replace(
      /[.#$\[\]\/]/g,
      "_"
    );
  }


  /* =========================================================
     BROWSER ID
     =========================================================
     
     localStorage means all tabs in the same browser profile
     share the same browser ID.
     
     Example:
     
     Chrome tab 1
     Chrome tab 2
     Chrome tab 3
     
     = 1 connected user
     
     ========================================================= */

  function getBrowserId() {
    let browserId = null;

    try {
      browserId =
        localStorage.getItem(
          BROWSER_ID_KEY
        );
    } catch {}


    if (!browserId) {
      browserId = generateId();

      try {
        localStorage.setItem(
          BROWSER_ID_KEY,
          browserId
        );
      } catch {}
    }


    return sanitizeFirebaseKey(
      browserId
    );
  }


  /* =========================================================
     TAB / CONNECTION ID
     =========================================================
     
     Each tab needs its own Firebase presence connection.
     
     sessionStorage means the ID belongs to this tab.
     
     ========================================================= */

  function getTabId() {
    let tabId = null;

    try {
      tabId =
        sessionStorage.getItem(
          TAB_ID_KEY
        );
    } catch {}


    if (!tabId) {
      tabId = generateId();

      try {
        sessionStorage.setItem(
          TAB_ID_KEY,
          tabId
        );
      } catch {}
    }


    return sanitizeFirebaseKey(
      tabId
    );
  }


  /* =========================================================
     CREATE CONNECTED USERS DISPLAY
     ========================================================= */

  function createConnectedUsersUI() {
    if (
      document.getElementById(
        ID_CONNECTED_USERS
      )
    ) {
      return;
    }


    const fbStatus =
      document.getElementById(
        ID_STATUS
      );


    if (!fbStatus) {
      console.warn(
        "fbStatus not found. Connected users UI cannot be inserted."
      );

      return;
    }


    const connectedUsers =
      document.createElement("div");


    connectedUsers.id =
      ID_CONNECTED_USERS;


    connectedUsers.className =
      "infobar-global-item connected-users-status";


    connectedUsers.innerHTML = `
      <span class="connected-users-icon">●</span>
      <span>
        Connected Users:
        <strong id="connectedUsersCount">--</strong>
      </span>
    `;


    fbStatus.insertAdjacentElement(
      "afterend",
      connectedUsers
    );
  }


  /* =========================================================
     CREATE WEBSITE UPDATE STATUS
     ========================================================= */

  function createUpdateStatusUI() {
    if (
      document.getElementById(
        ID_UPDATE_STATUS
      )
    ) {
      return;
    }


    const connectedUsers =
      document.getElementById(
        ID_CONNECTED_USERS
      );


    const fbStatus =
      document.getElementById(
        ID_STATUS
      );


    const insertAfter =
      connectedUsers ||
      fbStatus;


    if (!insertAfter) return;


    const updateStatus =
      document.createElement("button");


    updateStatus.id =
      ID_UPDATE_STATUS;


    updateStatus.type =
      "button";


    updateStatus.className =
      "infobar-global-item website-update-status";


    updateStatus.innerHTML =
      "✓ Website Up To Date";


    /*
     * If an update is available,
     * clicking the infobar warning opens
     * the update popup again.
     */
    updateStatus.addEventListener(
      "click",
      function () {

        if (
          latestDeployment &&
          latestDeployment.version &&
          pageDeploymentVersion &&
          latestDeployment.version !==
            pageDeploymentVersion
        ) {
          showUpdateNotification(
            latestDeployment,
            true
          );
        }
      }
    );


    insertAfter.insertAdjacentElement(
      "afterend",
      updateStatus
    );
  }


  /* =========================================================
     CONNECTED USERS PRESENCE
     ========================================================= */

  function initConnectedUsers() {
    if (!db) return;


    const browserId =
      getBrowserId();


    const tabId =
      getTabId();


    /*
     * Firebase structure:
     *
     * connectedUsers
     *   browser-123
     *     tab-1
     *     tab-2
     *
     * The browser is counted once.
     */

    const presenceRef =
      db.ref(
        `${CONNECTED_USERS_PATH}/${browserId}/${tabId}`
      );


    /*
     * Listen to unique browser IDs.
     */
    db.ref(CONNECTED_USERS_PATH)
      .on(
        "value",

        snapshot => {

          const count =
            snapshot.numChildren();


          const countElement =
            document.getElementById(
              "connectedUsersCount"
            );


          if (countElement) {
            countElement.textContent =
              String(count);
          }

        },

        error => {

          console.error(
            "Connected users read failed:",
            error
          );


          const countElement =
            document.getElementById(
              "connectedUsersCount"
            );


          if (countElement) {
            countElement.textContent =
              "--";
          }

        }
      );


    /*
     * Firebase connection listener.
     *
     * Firebase specifically recommends registering
     * onDisconnect BEFORE setting presence data.
     */

    db.ref(".info/connected")
      .on(
        "value",

        snapshot => {

          const connected =
            snapshot.val() === true;


          setDbStatus(
            connected
          );


          if (!connected) {
            return;
          }


          presenceRef
            .onDisconnect()
            .remove()

            .then(() => {

              return presenceRef.set({
                connectedAt:
                  firebase.database
                    .ServerValue
                    .TIMESTAMP
              });

            })

            .catch(error => {

              console.error(
                "Presence registration failed:",
                error
              );

            });

        },

        () => {

          setDbStatus(false);

        }
      );
  }


  /* =========================================================
     CREATE UPDATE POPUP
     ========================================================= */

  function createUpdateNotification() {
    if (
      document.getElementById(
        "runwayUpdateNotification"
      )
    ) {
      return;
    }


    const notification =
      document.createElement("div");


    notification.id =
      "runwayUpdateNotification";


    notification.className =
      "runway-update-notification";


    notification.setAttribute(
      "role",
      "dialog"
    );


    notification.setAttribute(
      "aria-modal",
      "true"
    );


    notification.setAttribute(
      "aria-labelledby",
      "runwayUpdateTitle"
    );


    notification.innerHTML = `

      <div class="runway-update-titlebar">

        <span id="runwayUpdateTitle">
          Runway Slots
        </span>

        <button
          type="button"
          id="closeRunwayUpdate"
          aria-label="Close update notification"
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
            A new version of Runway Slots
            has been deployed.
          </span>


          <small id="runwayUpdateVersion"></small>

        </div>

      </div>


      <div class="runway-update-buttons">

        <button
          type="button"
          id="refreshRunwayUpdate"
        >
          Refresh Now
        </button>


        <button
          type="button"
          id="laterRunwayUpdate"
        >
          Later
        </button>

      </div>
    `;


    document.body.appendChild(
      notification
    );


    document
      .getElementById(
        "refreshRunwayUpdate"
      )
      ?.addEventListener(
        "click",
        refreshWebsite
      );


    document
      .getElementById(
        "closeRunwayUpdate"
      )
      ?.addEventListener(
        "click",
        dismissCurrentUpdate
      );


    document
      .getElementById(
        "laterRunwayUpdate"
      )
      ?.addEventListener(
        "click",
        dismissCurrentUpdate
      );
  }


  /* =========================================================
     WEBSITE DEPLOYMENT MONITOR
     ========================================================= */

  function initDeploymentMonitor() {
    if (!db) return;


    const deploymentRef =
      db.ref(
        DEPLOYMENT_PATH
      );


    deploymentRef.on(
      "value",

      snapshot => {

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


        /*
         * First Firebase result.
         *
         * This represents the deployment that
         * existed when this browser page loaded.
         */
        if (
          pageDeploymentVersion === null
        ) {

          pageDeploymentVersion =
            deployment.version;


          setUpdateStatus(false);


          console.log(
            "Runway Slots version:",
            deployment.version
          );


          return;
        }


        /*
         * Firebase now reports a DIFFERENT
         * deployment version.
         *
         * Therefore a new website deployment
         * has happened while this page is open.
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


          setUpdateStatus(true);


          showUpdateNotification(
            deployment
          );
        }

      },

      error => {

        console.error(
          "Deployment monitor failed:",
          error
        );

      }
    );


    /*
     * When somebody returns to a tab,
     * check Firebase again.
     *
     * Useful if laptop sleeps or internet
     * was temporarily disconnected.
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


        deploymentRef
          .once("value")

          .then(snapshot => {

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

              setUpdateStatus(true);


              showUpdateNotification(
                deployment
              );

            }

          })

          .catch(error => {

            console.error(
              "Deployment re-check failed:",
              error
            );

          });

      }
    );
  }


  /* =========================================================
     UPDATE INFOBAR STATUS
     ========================================================= */

  function setUpdateStatus(
    updateAvailable
  ) {

    const status =
      document.getElementById(
        ID_UPDATE_STATUS
      );


    if (!status) return;


    if (updateAvailable) {

      status.classList.add(
        "update-available"
      );


      status.innerHTML =
        "⚠ NEW UPDATE — REFRESH";


      status.title =
        "A newer version of Runway Slots is available. Click to refresh.";

    } else {

      status.classList.remove(
        "update-available"
      );


      status.innerHTML =
        "✓ Website Up To Date";


      status.title =
        "You are using the current Runway Slots version.";

    }
  }


  /* =========================================================
     SHOW UPDATE POPUP
     ========================================================= */

  function showUpdateNotification(
    deployment,
    force = false
  ) {

    if (
      !deployment ||
      !deployment.version
    ) {
      return;
    }


    /*
     * If user already selected "Later"
     * for THIS version, don't keep reopening it.
     *
     * Clicking the infobar warning manually
     * uses force=true and opens it again.
     */

    let dismissedVersion = null;


    try {
      dismissedVersion =
        sessionStorage.getItem(
          DISMISSED_UPDATE_KEY
        );
    } catch {}


    if (
      !force &&
      dismissedVersion ===
        deployment.version
    ) {
      return;
    }


    const notification =
      document.getElementById(
        "runwayUpdateNotification"
      );


    if (!notification) return;


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
        "A new version of Runway Slots has been deployed. Refresh your browser to use the latest version.";

    }


    if (version) {

      const shortVersion =
        deployment.shortVersion ||
        String(
          deployment.version
        ).substring(0, 7);


      version.textContent =
        `Version: ${shortVersion}`;

    }


    notification.classList.add(
      "show"
    );
  }


  /* =========================================================
     DISMISS UPDATE
     ========================================================= */

  function dismissCurrentUpdate() {

    const notification =
      document.getElementById(
        "runwayUpdateNotification"
      );


    if (notification) {

      notification.classList.remove(
        "show"
      );

    }


    /*
     * Remember "Later" only for the current tab
     * and only for this particular deployment.
     */

    if (
      latestDeployment &&
      latestDeployment.version
    ) {

      try {

        sessionStorage.setItem(
          DISMISSED_UPDATE_KEY,
          latestDeployment.version
        );

      } catch {}

    }
  }


  /* =========================================================
     REFRESH WEBSITE
     ========================================================= */

  function refreshWebsite() {

    const url =
      new URL(
        window.location.href
      );


    /*
     * Remove the previous cache-busting value
     * before creating the new one.
     */

    url.searchParams.delete(
      "_runway_update"
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
     AUTO REFRESH
     ========================================================= */

  function setAutoRefresh(enabled) {

    const cb =
      document.getElementById(
        ID_TOGGLE
      );


    if (cb) {
      cb.checked =
        !!enabled;
    }


    /*
     * Ensure only one timer globally.
     */

    if (
      window.__autoRefreshTimer
    ) {

      clearInterval(
        window.__autoRefreshTimer
      );


      window.__autoRefreshTimer =
        null;
    }


    if (enabled) {

      window.__autoRefreshTimer =
        setInterval(
          () => {
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

    } catch {}
  }


  function initAutoRefresh() {

    let stored = null;


    try {

      stored =
        JSON.parse(
          localStorage.getItem(
            "autoRefreshEnabled"
          )
        );

    } catch {}


    /*
     * Default ON
     */

    const initialEnabled =
      stored === null
        ? true
        : !!stored;


    setAutoRefresh(
      initialEnabled
    );


    const cb =
      document.getElementById(
        ID_TOGGLE
      );


    if (cb) {

      cb.checked =
        initialEnabled;


      cb.addEventListener(
        "change",

        e => {
          setAutoRefresh(
            e.target.checked
          );
        }

      );
    }
  }


  /* =========================================================
     INITIALISE FIREBASE SYSTEMS
     ========================================================= */

  function initFirebaseSystems() {

    if (
      !firebaseReady()
    ) {

      setDbStatus(false);


      const countElement =
        document.getElementById(
          "connectedUsersCount"
        );


      if (countElement) {
        countElement.textContent =
          "--";
      }


      return;
    }


    try {

      db =
        firebase.database();


      initConnectedUsers();


      initDeploymentMonitor();

    } catch (error) {

      console.error(
        "Firebase infobar initialisation failed:",
        error
      );


      setDbStatus(false);

    }
  }


  /* =========================================================
     BOOT
     ========================================================= */

  ready(() => {

    /*
     * Existing features
     */

    updateUtcTopClock();


    setInterval(
      updateUtcTopClock,
      1000
    );


    /*
     * Automatically add our new global UI.
     */

    createConnectedUsersUI();

    createUpdateStatusUI();

    createUpdateNotification();


    /*
     * Firebase features.
     */

    initFirebaseSystems();


    /*
     * Existing auto-refresh.
     */

    initAutoRefresh();

  });

})();