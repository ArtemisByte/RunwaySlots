/* =========================================================
   BUILD / NORMALISE GLOBAL INFOBAR
   ========================================================= */

function buildGlobalInfobar() {

  /*
   * Find existing elements from older page layouts.
   */

  let clock = document.getElementById("utcTopClock");
  let status = document.getElementById("fbStatus");
  let toggle = document.getElementById("autoRefreshToggle");


  /*
   * Find existing info bar.
   */

  let infoBar = document.querySelector(".info-bar");


  /*
   * If there isn't one, create it.
   */

  if (!infoBar) {

    infoBar = document.createElement("div");
    infoBar.className = "info-bar";
    infoBar.id = "globalInfoBar";


    /*
     * Put it directly underneath the navigation.
     */

    const nav = document.querySelector("nav");

    if (nav) {

      nav.insertAdjacentElement(
        "afterend",
        infoBar
      );

    } else {

      document.body.insertAdjacentElement(
        "afterbegin",
        infoBar
      );

    }

  }


  /*
   * Completely normalise the bar structure.
   */

  infoBar.innerHTML = "";


  /* =========================================================
     LEFT SIDE
     ========================================================= */

  const leftTools =
    document.createElement("div");

  leftTools.className =
    "left-tools";


  /* UTC CLOCK */

  if (!clock) {

    clock =
      document.createElement("div");

    clock.id =
      "utcTopClock";

  }

  clock.className =
    "utc-clock";

  leftTools.appendChild(
    clock
  );


  /* DATABASE STATUS */

  if (!status) {

    status =
      document.createElement("div");

    status.id =
      "fbStatus";

    status.innerHTML = `
      <span class="dot"></span>
      <span class="text">
        Database Offline
      </span>
    `;

  }

  status.className =
    "status-indicator";

  leftTools.appendChild(
    status
  );


  /* CONNECTED USERS */

  const connectedUsers =
    document.createElement("div");

  connectedUsers.id =
    "connectedUsersStatus";

  connectedUsers.className =
    "connected-users-status";

  connectedUsers.title =
    "Number of users currently connected to Runway Slots";

  connectedUsers.innerHTML = `
    <span class="connected-users-dot"></span>

    <span>
      Connected Users:
      <strong id="connectedUsersCount">--</strong>
    </span>
  `;

  leftTools.appendChild(
    connectedUsers
  );


  /* WEBSITE UPDATE STATUS */

  const updateStatus =
    document.createElement("button");

  updateStatus.id =
    "websiteUpdateStatus";

  updateStatus.type =
    "button";

  updateStatus.className =
    "website-update-status";

  updateStatus.textContent =
    "✓ WEBSITE UP TO DATE";

  updateStatus.title =
    "You are using the latest version of Runway Slots";


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


  leftTools.appendChild(
    updateStatus
  );


  /* =========================================================
     RIGHT SIDE
     ========================================================= */

  const rightTools =
    document.createElement("div");

  rightTools.className =
    "right-tools";


  const autoRefresh =
    document.createElement("label");

  autoRefresh.className =
    "auto-refresh";


  /*
   * Re-use the existing checkbox if present.
   */

  if (!toggle) {

    toggle =
      document.createElement("input");

    toggle.type =
      "checkbox";

    toggle.id =
      "autoRefreshToggle";

  }


  autoRefresh.appendChild(
    toggle
  );


  autoRefresh.appendChild(
    document.createTextNode(
      " Auto-refresh (15 min)"
    )
  );


  rightTools.appendChild(
    autoRefresh
  );


  /* =========================================================
     ADD BOTH SIDES
     ========================================================= */

  infoBar.appendChild(
    leftTools
  );

  infoBar.appendChild(
    rightTools
  );

}